import html
import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

try:
    from lang import is_english
except Exception:
    is_english = lambda _t: True

SEARCH_API = "https://api.github.com/search/repositories"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Postly/0.1"

# GitHub's search API rejects queries with more than five AND/OR/NOT
# operators (HTTP 422 above that), so each theme ships as small batches
# of at most five OR-joined terms instead of one mega-query.
LIVE_SEARCH_QUERIES = [
    ("github/system-design", "system design OR architecture OR comparison OR benchmark OR \"vs\" in:name,description"),
    ("github/system-design-2", "\"graphql vs grpc\" OR \"kafka vs rabbitmq\" OR \"postgres vs mongo\" OR \"system design interview\" in:name,description"),
    ("github/agents", "\"ai agent\" OR \"model context protocol\" OR \"mcp server\" OR langgraph OR crewai in:name,description"),
    ("github/agents-2", "autogen OR agno OR openhands OR smolagents OR \"agent skills\" in:name,description"),
    ("github/open-source", "\"open-source alternative\" OR \"self-hosted\" OR \"alternative to\" OR supabase OR ollama in:name,description"),
    ("github/open-source-2", "dify OR rustdesk OR immich OR \"open source alternative\" in:name,description"),
    ("github/ui-kits", "\"ui components\" OR \"component library\" OR \"design system\" OR shadcn OR tailwind in:name,description"),
    ("github/ui-kits-2", "\"magic ui\" OR aceternity OR daisyui OR radix in:name,description"),
    ("github/resources", "\"free for dev\" OR \"developer tools\" OR \"developer fonts\" OR \"awesome-ai\" OR \"prompt engineering\" in:name,description"),
    ("github/frameworks", "\"next.js 15\" OR \"react 19\" OR svelte OR astro OR hono in:name,description"),
    ("github/frameworks-2", "elysia OR drizzle OR trpc OR deepseek in:name,description"),
]



TRENDING_URLS = [
    # Language-specific trending only: the overall page is a subset of these,
    # so including it just burns a request on URL-duplicate repos.
    ("github/python", "https://github.com/trending/python?since=daily"),
    ("github/typescript", "https://github.com/trending/typescript?since=daily"),
    ("github/javascript", "https://github.com/trending/javascript?since=daily"),
    ("github/rust", "https://github.com/trending/rust?since=daily"),
    ("github/go", "https://github.com/trending/go?since=daily"),
    ("github/java", "https://github.com/trending/java?since=daily"),
    ("github/c", "https://github.com/trending/c?since=daily"),
    ("github/cpp", "https://github.com/trending/c++?since=daily"),
    ("github/kotlin", "https://github.com/trending/kotlin?since=daily"),
]


def _get_headers() -> dict:
    headers = {
        "User-Agent": UA,
        "Accept": "application/vnd.github.v3+json"
    }
    token = (os.getenv("GITHUB_TOKEN") or "").strip()
    if token:
        if token.startswith(("ghp_", "github_pat_", "gho_")):
            headers["Authorization"] = f"Bearer {token}"
        else:
            headers["Cookie"] = f"user_session={token}"
    return headers


def _trending_page(tag: str, url: str, headers: dict) -> list:
    """One trending page -> topics. CJK-heavy pages lose rows to the English
    filter, which is why several language pages are fetched in parallel."""
    out = []
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw_html = resp.read().decode("utf-8", errors="replace")
            articles = re.findall(r'<article class="Box-row">(.*?)</article>', raw_html, re.DOTALL)
            for a in articles:
                repo_m = re.search(r'href="/([^"]+/[^"]+)"', a)
                desc_m = re.search(r'<p class="col-9[^"]*"[^>]*>(.*?)</p>', a, re.DOTALL)
                stars_m = re.search(r'(\d[\d,]*)\s+stars today', a)
                total_stars_m = re.search(r'href="/[^"]+/[^"]+/stargazers"[^>]*>\s*([0-9,]+)', a)

                repo = repo_m.group(1).strip() if repo_m else ""
                if not repo or repo.startswith("sponsors/"):
                    continue
                desc = html.unescape(re.sub(r'<[^>]+>', '', desc_m.group(1))).strip() if desc_m else ""
                if desc and not is_english(desc):
                    continue

                stars = 0
                if stars_m:
                    stars = int(stars_m.group(1).replace(",", ""))
                elif total_stars_m:
                    stars = int(total_stars_m.group(1).replace(",", ""))

                title = f"{repo}: {desc}" if desc else f"GitHub Viral: {repo}"
                title = " ".join(title.split())[:240]

                out.append({
                    "title": title,
                    "source": tag,
                    "url": f"https://github.com/{repo}",
                    "score": stars
                })
    except Exception as exc:
        print(f"github_crawler trending error ({tag}): {exc}", file=sys.stderr)
    return out


def _fetch_trending_html() -> list:
    """Scrapes GitHub's live trending pages for viral repositories (zero rate limits)."""
    headers = {"User-Agent": UA}
    topics = []
    with ThreadPoolExecutor(max_workers=5) as pool:
        for page in pool.map(lambda p: _trending_page(*p, headers), TRENDING_URLS):
            topics += page
    return topics


def _fetch_user_starred() -> list:
    """Fetches user's personalized starred repositories live when GITHUB_TOKEN is configured."""
    token = (os.getenv("GITHUB_TOKEN") or "").strip()
    if not token:
        return []
    topics = []
    try:
        req = urllib.request.Request("https://api.github.com/user/starred?per_page=15&sort=created&direction=desc", headers=_get_headers())
        with urllib.request.urlopen(req, timeout=12) as resp:
            items = json.load(resp)
            for item in items:
                name = item.get("full_name") or item.get("name") or ""
                desc = (item.get("description") or "").strip()
                stars = item.get("stargazers_count", 0)
                html_url = item.get("html_url") or ""
                if name:
                    title = f"[Starred] {name}: {desc}" if desc else f"GitHub Starred: {name}"
                    topics.append({
                        "title": " ".join(title.split())[:240],
                        "source": "github/starred",
                        "url": html_url,
                        "score": stars
                    })
    except Exception as exc:
        print(f"github_crawler live starred error: {exc}", file=sys.stderr)
    return topics


def _fetch_live_query(source_tag: str, q: str, per_page: int = 10) -> list:
    """Queries GitHub search API live for top starred, recently active repos."""
    topics = []
    since_date = (datetime.now(timezone.utc) - timedelta(days=120)).strftime("%Y-%m-%d")
    full_query = f"{q} pushed:>{since_date} stars:>40"
    params = {
        "q": full_query,
        "sort": "stars",
        "order": "desc",
        "per_page": per_page
    }
    url = f"{SEARCH_API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers=_get_headers())

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.load(resp)
            items = data.get("items", [])
            for item in items:
                name = item.get("full_name") or item.get("name") or ""
                desc = (item.get("description") or "").strip()
                stars = item.get("stargazers_count", 0)
                html_url = item.get("html_url") or ""

                if not name or not is_english(desc or name):
                    continue

                if desc:
                    title = f"{name}: {desc}"
                else:
                    title = f"GitHub Trending: {name}"

                title = " ".join(title.split())[:240]

                topics.append({
                    "title": title,
                    "source": source_tag,
                    "url": html_url,
                    "score": stars
                })
    except Exception as exc:
        print(f"github_crawler live query error ({source_tag}): {exc}", file=sys.stderr)

    return topics


def fetch_all() -> list:
    """Collects 100% live GitHub trending repositories, comparisons, and personalized starred repos."""
    results = []
    seen_urls = set()

    # 1. Live personal starred repos (if user is authenticated)
    for t in _fetch_user_starred():
        u = (t.get("url") or "").lower()
        if u and u not in seen_urls:
            seen_urls.add(u)
            results.append(t)

    # 2. Live GitHub Trending pages (AI agents, dev tools, web dev)
    for t in _fetch_trending_html():
        u = (t.get("url") or "").lower()
        if u and u not in seen_urls:
            seen_urls.add(u)
            results.append(t)

    limit = int(os.getenv("GITHUB_TOPICS_LIMIT", "120"))
    if len(results) >= limit:
        return results[:limit]

    # Live search API top-up: trending pages alone hover near 80-100 unique
    # English repos, so top up toward the limit whenever we're short.
    for source_tag, query_str in LIVE_SEARCH_QUERIES:
        if len(results) >= limit:
            break
        items = _fetch_live_query(source_tag, query_str, per_page=15)
        for item in items:
            u = (item.get("url") or "").lower()
            if u and u not in seen_urls:
                seen_urls.add(u)
                results.append(item)
        # Unauthenticated search budget is ~10 queries/min — pace the top-up.
        time.sleep(2.0)

    return results[:limit]



def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        topics = fetch_all()
        print(json.dumps(topics, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps([]), file=sys.stdout)
        print(f"github_crawler main error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()

