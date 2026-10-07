"""Shared keyless RSS/Atom fetcher for the crawlers.

RSS feeds are the reliable real-time backbone of the keyless crawl: no
accounts, no API keys, and none of Jina's anonymous rate limits. Every feed
below the crawlers is a real public feed, so titles/links are genuine live
articles, never fabricated.

    from rss import fetch_feeds
    topics = fetch_feeds([(source, url), ...], per_feed=6, score=140)

Uses feedparser when installed (robust RSS + Atom) and falls back to a small
regex parser otherwise, so the app still runs with zero pip packages. Never
raises — a broken feed just contributes nothing.
"""
import html as _html
import re
import sys
from concurrent.futures import ThreadPoolExecutor

try:
    import requests
except Exception:  # pragma: no cover - requests ships with the app runtime
    requests = None

# Browser-like UA: some feeds reject bot-ish UAs outright.
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Nav/footer junk that leaks into some feeds.
_BOILERPLATE = re.compile(
    r"(?i)\b(subscribe|sign\s*in|sign\s*up|log\s*in|cookie\w*|privacy|"
    r"terms\b|skip\s*to\s*content|advertisement|newsletter\s*archive)\b"
)


def _clean(text, limit=280):
    return " ".join((text or "").split())[:limit]


def _strip_html(text):
    text = re.sub(r"<[^>]+>", " ", text or "")
    return _clean(_html.unescape(text))


def _regex_parse(content, per_feed):
    """RSS <item> / Atom <entry> extraction without feedparser."""
    out = []
    chunks = re.findall(r"<item>(.*?)</item>", content, re.DOTALL)
    if not chunks:
        chunks = re.findall(r"<entry>(.*?)</entry>", content, re.DOTALL)
    for chunk in chunks:
        tm = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", chunk, re.DOTALL)
        if not tm:
            continue
        title = _strip_html(tm.group(1))
        lm = re.search(r'<link[^>]*href="([^"]+)"', chunk) or re.search(
            r"<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</link>", chunk, re.DOTALL
        )
        url = (lm.group(1).strip() if lm else "") or ""
        out.append({"title": title, "url": url})
        if len(out) >= per_feed:
            break
    return out


def _feedparser_parse(content, per_feed):
    import feedparser  # local import: optional dependency

    d = feedparser.parse(content)
    out = []
    for e in d.entries[:per_feed]:
        out.append(
            {
                "title": _clean(getattr(e, "title", "")),
                "url": (getattr(e, "link", "") or "").strip(),
            }
        )
    return out


def _fetch_one(item, per_feed, timeout):
    source, url = item
    if requests is None:
        return []
    try:
        resp = requests.get(url, headers={"User-Agent": _UA}, timeout=timeout)
    except Exception as exc:
        print(f"rss {url} error: {exc}", file=sys.stderr)
        return []
    if resp.status_code != 200 or not resp.content:
        print(f"rss {url} HTTP {resp.status_code}", file=sys.stderr)
        return []
    try:
        items = _feedparser_parse(resp.content, per_feed)
    except Exception:
        items = _regex_parse(resp.content.decode("utf-8", errors="replace"), per_feed)

    topics = []
    for it in items:
        title = _strip_html(it.get("title", ""))
        link = (it.get("url") or "").strip()
        if (
            not title
            or len(title) < 6
            or len(title.split()) < 2
            or _BOILERPLATE.search(title)
            or (link and not link.startswith("http"))
        ):
            continue
        topics.append({"title": title, "source": source, "url": link or None, "score": None})
    return topics


def fetch_feeds(feeds, per_feed=6, timeout=12, workers=10, score=100):
    """Fetch all feeds in parallel -> deduped [{title, source, url, score}]."""
    if not feeds:
        return []
    raw = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for group in pool.map(lambda f: _fetch_one(f, per_feed, timeout), feeds):
            raw += group

    seen, out = set(), []
    for t in raw:
        title = t["title"]
        key = title.lower()
        url = (t.get("url") or "").strip().lower()
        if key in seen or (url and url in seen):
            continue
        seen.add(key)
        if url:
            seen.add(url)
        out.append({"title": title, "source": t["source"], "url": t["url"], "score": score})
    return out
