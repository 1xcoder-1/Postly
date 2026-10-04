"""LinkedIn (and any tech link) topics — Jina Reader references + a cookie feed.

PUBLIC PATH (unchanged): LinkedIn has no public anonymous feed, so the reliable
real-time path is to give it the LINKS you care about and mirror their content
into topics. Jina Reader (https://r.jina.ai/<url>) renders a public page to
clean markdown with no browser and no key. Seeded by:
  references.json -> linkedin.posts   (public post/profile/article URLs)
  LINKEDIN_REFS="https://www.linkedin.com/posts/...,https://..." (extra links)

ACCOUNT-LOGIN PATH (new): when LINKEDIN_LI_AT is set we read the logged-in
user's personalized Voyager feed directly with `requests` (no new dependency):
    GET https://www.linkedin.com/voyager/api/feed?start=0&count=<LINKEDIN_FEED_COUNT>
with a self-paired JSESSIONID/csrf-token derived from the li_at session cookie.
Each post becomes a topic (source 'linkedin/<author>'). These personalized
topics MERGE with the Jina reference topics — they never replace them.

    Env vars:
        LINKEDIN_LI_AT        li_at session cookie (bare token OR cookie-jar paste)
        LINKEDIN_FEED_COUNT   int, default 25 — max feed items per run
        MIN_SOURCES           int, default 100 — cross-platform floor (Node side)
        POSTLY_DATA_DIR       writable dir (unused here; part of the contract)

Blank / missing LINKEDIN_LI_AT skips the account branch entirely and the output
is the legacy Jina behaviour. Any auth rejection (HTTP 401/403/429 or a
challenge page) is reported on stderr and falls through to the Jina branch only.
The script always prints exactly one JSON array of {title, source, url, score}
and never raises; cookie values / secrets are never logged.
"""
import html
import json
import os
import random
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

try:
    import requests
except Exception:  # pragma: no cover - requests ships with the app runtime
    requests = None

HEADING = re.compile(r"^#{1,3}\s+(.*)")
UA_HEADERS = {"User-Agent": "Postly/0.1 (linkedin)"}
TIMEOUT = 20
MAX_TOPICS_PER_URL = 10

# Newsroom / blog pages expose a lot of UI chrome as markdown headings — nav
# items, section labels and footer links ("Blog", "Tools", "Company",
# "Compliance", "Featured articles", "Subscribe to receive notifications...",
# "Footer"). Those are NOT article headlines. Two cheap, high-precision guards
# drop them while keeping real (descriptive, multi-word) titles:
#   * MIN_HEADLINE_WORDS: a genuine article headline is rarely under 4 words.
#   * BOILERPLATE: catch-all for subscribe/newsletter/legal/nav prompts.
MIN_HEADLINE_WORDS = 4
BOILERPLATE = re.compile(
    r"""(?ix)
      \b(subscribe|newsletter|notifications?|sign\s*(?:in|up)|log\s*(?:in|out)|
          cookie\w*|privacy|terms\b|accessibility|sitemap|advertise|careers?|
          follow\s+us|get\s+started|learn\s+more|view\s+(?:all|more)|see\s+(?:all|more)|
          skip\s+to|all\s+rights\s+reserved|copyright)\b
    """
)

# Browser-like UA for the authenticated Voyager call.
CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
FEED_URL = "https://www.linkedin.com/voyager/api/feed?start=0&count={count}"
FEED_URL_ALT = (
    "https://www.linkedin.com/voyager/api/voyagerSocialFeedDash"
    "?includeHiddenFeedComments=true&start=0&count={count}"
)
_TAG = re.compile(r"<[^>]+>")
_URN_RE = re.compile(r"urn:li:(?:activity|ugcPost|share|update):[\w\-]+")


def _env_int(name, default):
    try:
        raw = str(os.getenv(name, "")).strip()
        return int(raw) if raw else default
    except (TypeError, ValueError):
        return default


MIN_SOURCES = _env_int("MIN_SOURCES", 100)
LINKEDIN_FEED_COUNT = _env_int("LINKEDIN_FEED_COUNT", 25)


def _extract_cookie(value, name):
    """Return the value of cookie `name` from a bare token OR a cookie-jar paste."""
    if not value:
        return ""
    value = value.strip()
    if "=" in value or ";" in value:  # looks like a jar -> pull out the named cookie
        for part in value.split(";"):
            part = part.strip()
            if not part or "=" not in part:
                continue
            key, _, val = part.partition("=")
            if key.strip() == name:
                return val.strip()
        return ""
    return value


def _clean(text):
    return " ".join((text or "").split())[:280]


# Jina often wraps a heading in markdown link/image syntax, e.g.
#   [Introducing X](https://...)  or  ![Image 5](https://...)
# which leaks brackets + URLs into the title. Collapse links to their text and
# drop images so the topic reads as a clean headline.
_MD_IMG = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_MD_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")


def _strip_md(text):
    if not text:
        return text
    text = _MD_IMG.sub(" ", text)
    text = _MD_LINK.sub(r"\1", text)
    text = text.replace("[", " ").replace("]", " ")
    return _clean(text)


def _finalize(topics):
    """English-filter + dedupe by url (or lowercased title) keeping higher score."""
    try:
        from lang import is_english
    except Exception:
        is_english = lambda _t: True  # noqa: E731

    best, order = {}, []
    for t in topics:
        title = (t.get("title") or "").strip()
        if not title or not is_english(title):
            continue
        url = (t.get("url") or "").strip().lower()
        key = url or ("title:" + title.lower())
        score = t.get("score")
        sval = score if isinstance(score, int) else -1
        if key in best:
            prev = best[key].get("score")
            pval = prev if isinstance(prev, int) else -1
            if sval > pval:
                best[key] = t
        else:
            best[key] = t
            order.append(key)
    return [best[k] for k in order]


# --------------------------------------------------------------------------
# PUBLIC PATH — Jina Reader references (UNCHANGED)
# --------------------------------------------------------------------------
def load_links():
    links = []
    try:
        data = json.loads((Path(__file__).with_name("references.json")).read_text(encoding="utf-8"))
        links += data.get("linkedin", {}).get("posts", []) or []
    except Exception as exc:
        print(f"references.json not read: {exc}", file=sys.stderr)
    links += [x.strip() for x in os.getenv("LINKEDIN_REFS", "").split(",") if x.strip()]
    # de-dupe, keep only http(s)
    seen, out = set(), []
    for l in links:
        if l.startswith("http") and l not in seen:
            seen.add(l)
            out.append(l)
    return out


def read_via_jina(url):
    """Return markdown text for a public URL through Jina Reader, or ''."""
    target = "https://r.jina.ai/" + url
    try:
        req = urllib.request.Request(target, headers=UA_HEADERS)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as exc:
        print(f"jina {url} error: {exc}", file=sys.stderr)
        return ""


def topics_from_markdown(markdown, url):
    from lang import is_english

    topics, seen = [], set()
    for line in markdown.splitlines():
        m = HEADING.match(line.strip())
        title = _strip_md(m.group(1)) if m else None
        if not title or title.lower() in ("title", "untitled") or title in seen:
            continue
        # Skip Jina's own header lines (Title: / URL Source: etc).
        if line.strip().lower().startswith(("title:", "url source:", "published:", "## title")):
            continue
        if not is_english(title):
            continue
        # Drop page chrome: nav / footer / section labels and subscribe prompts.
        if BOILERPLATE.search(title) or len(title.split()) < MIN_HEADLINE_WORDS:
            continue
        seen.add(title)
        topics.append({"title": title, "source": "linkedin", "url": url, "score": None})
        if len(topics) >= MAX_TOPICS_PER_URL:
            break
    return topics


def fetch():
    from lang import is_english  # noqa: F401  (import check; used per-url)
    out = []
    for url in load_links():
        markdown = read_via_jina(url)
        if markdown:
            out += topics_from_markdown(markdown, url)
    return out


# --------------------------------------------------------------------------
# ACCOUNT-LOGIN PATH — Voyager feed via li_at cookie (NEW)
# --------------------------------------------------------------------------
def _strip_htmlish(text):
    if not text:
        return ""
    text = str(text)
    text = re.sub(r"(?i)<\s*br\s*/?>", " ", text)
    text = re.sub(r"(?i)</\s*(?:p|div|li|strong|em|h\d)\s*>", " ", text)
    text = _TAG.sub(" ", text)
    return _clean(html.unescape(text))


def _text_of(node):
    """Best-effort plain string out of a commentary/text node."""
    if node is None:
        return ""
    if isinstance(node, str):
        return _strip_htmlish(node)
    if isinstance(node, dict):
        for k in ("text", "commentary", "value", "content", "title"):
            if k in node:
                got = _text_of(node[k])
                if got:
                    return got
        attrs = node.get("attributes")
        if isinstance(attrs, list):
            for a in attrs:
                got = _text_of(a)
                if got:
                    return got
    return ""


def _walk(node, out):
    if isinstance(node, dict):
        out.append(node)
        for v in node.values():
            _walk(v, out)
    elif isinstance(node, list):
        for v in node:
            _walk(v, out)


def _urn_of(entity):
    for key in ("entityUrn", "urn", "updateUrn", "id"):
        val = entity.get(key)
        if isinstance(val, str) and val:
            m = _URN_RE.search(val)
            if m:
                return m.group(0)
            if val.startswith("urn:li:"):
                return val
    return None


def _actor_name(entity, by_urn, seen=None):
    seen = seen or set()
    actor = entity.get("actor")
    if isinstance(actor, dict):
        for k in ("title", "text", "name", "displayName"):
            v = actor.get(k)
            if isinstance(v, str) and v.strip():
                return _clean(v)
        ref = actor.get("entityUrn") or actor.get("urn") or actor.get("*actor")
        if isinstance(ref, str) and ref in by_urn and ref not in seen:
            seen.add(ref)
            return _actor_name(by_urn[ref], by_urn, seen)
    elif isinstance(actor, str) and actor in by_urn and actor not in seen:
        seen.add(actor)
        return _actor_name(by_urn[actor], by_urn, seen)

    # Member-style entity fields directly on this object.
    for k in ("title", "name", "formattedName"):
        v = entity.get(k)
        if isinstance(v, str) and v.strip():
            return _clean(v)
    first, last = entity.get("firstName"), entity.get("lastName")
    if first or last:
        return _clean(f"{first or ''} {last or ''}")
    return None


def _reaction_count(entity):
    def _from_counts(c):
        if not isinstance(c, dict):
            return None
        for k in ("numLikes", "reactionsCount", "numReactions", "socialActivityCounts"):
            v = c.get(k)
            if isinstance(v, int):
                return v
        return None

    sd = entity.get("socialDetail")
    if isinstance(sd, dict):
        got = _from_counts(sd.get("totalSocialActivityCounts"))
        if got is not None:
            return got
        got = _from_counts(sd)
        if got is not None:
            return got
    got = _from_counts(entity)
    if got is not None:
        return got
    for k in ("numLikes", "reactionsCount", "likesCount", "numReactions"):
        v = entity.get(k)
        if isinstance(v, int):
            return v
    return None


def _parse_feed(data, cap):
    """Tolerant Voyager-normalized parser: pull posts out of elements/included."""
    entities = []
    _walk(data, entities)
    by_urn = {}
    for e in entities:
        for key in ("entityUrn", "urn", "id"):
            v = e.get(key)
            if isinstance(v, str) and v:
                by_urn.setdefault(v, e)

    topics, seen = [], set()
    for e in entities:
        looks_like_post = ("commentary" in e) or ("shareCommentary" in e) or ("actor" in e and "text" in e)
        if not looks_like_post:
            continue
        text = ""
        for key in ("commentary", "shareCommentary", "text"):
            if key in e:
                got = _text_of(e[key])
                if len(got) > len(text):
                    text = got
        if not text:
            continue
        author = _actor_name(e, by_urn)
        urn = _urn_of(e)
        url = f"https://www.linkedin.com/feed/update/{urn}" if urn else None
        key = url or text.lower()
        if key in seen:
            continue
        seen.add(key)
        topics.append(
            {
                "title": text,
                "source": f"linkedin/{author}" if author else "linkedin",
                "url": url,
                "score": _reaction_count(e),
            }
        )
        if len(topics) >= cap:
            break
    return topics


def _ajax_headers(li_at):
    nonce = "".join(random.choice("0123456789") for _ in range(16))
    return {
        "Cookie": f"li_at={li_at}",
        "JSESSIONID": f'"ajax:{nonce}"',
        "csrf-token": nonce,
        "User-Agent": CHROME_UA,
        "Accept": "application/vnd.linkedin.normalized+json",
    }


def _looks_challenged(resp):
    ctype = (resp.headers.get("Content-Type", "") or "").lower()
    body = (resp.text or "")[:4096].lstrip()
    return body.startswith("<") or "json" not in ctype or "challenge" in body.lower() or "authwall" in body.lower()


def cookie_fetch(li_at):
    """Personalized LinkedIn feed topics. [] on any auth rejection."""
    if requests is None:
        print("linkedin: 'requests' unavailable; skipping account branch", file=sys.stderr)
        return []

    headers = _ajax_headers(li_at)
    count = LINKEDIN_FEED_COUNT
    try:
        resp = requests.get(FEED_URL.format(count=count), headers=headers, timeout=TIMEOUT)
    except Exception as exc:
        print(f"linkedin: feed request failed: {exc}", file=sys.stderr)
        return []

    if resp.status_code == 404:
        try:
            resp = requests.get(FEED_URL_ALT.format(count=count), headers=headers, timeout=TIMEOUT)
        except Exception as exc:
            print(f"linkedin: feed (alt) request failed: {exc}", file=sys.stderr)
            return []

    code = resp.status_code
    if code in (401, 403, 429) or code != 200 or _looks_challenged(resp):
        print(f"linkedin: session rejected (HTTP {code}), skipping account branch", file=sys.stderr)
        return []

    try:
        data = resp.json()
    except Exception as exc:
        print(f"linkedin: feed response not JSON ({exc}); skipping account branch", file=sys.stderr)
        return []

    topics = _parse_feed(data, count)
    print(f"linkedin: parsed {len(topics)} feed topics (count={count})", file=sys.stderr)
    return topics


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    li_at = _extract_cookie(os.getenv("LINKEDIN_LI_AT", ""), "li_at")

    # No cookie -> legacy Jina behaviour, unchanged.
    if not li_at:
        if not load_links():
            print("no LinkedIn refs (references.json/linkedin.posts or LINKEDIN_REFS); skipping", file=sys.stderr)
            print(json.dumps([]))
            return
        try:
            print(json.dumps(fetch(), ensure_ascii=False))
        except Exception as exc:
            print(json.dumps([]))
            print(f"linkedin_crawler error: {exc}", file=sys.stderr)
        return

    # Cookie set -> personalized feed MERGED with the Jina reference topics.
    topics = []
    try:
        topics += cookie_fetch(li_at)
    except Exception as exc:
        print(f"linkedin account branch error: {exc}", file=sys.stderr)
    try:
        if load_links():
            topics += fetch()
    except Exception as exc:
        print(f"linkedin_crawler error: {exc}", file=sys.stderr)
    try:
        print(json.dumps(_finalize(topics), ensure_ascii=False))
    except Exception as exc:
        print(json.dumps([]))
        print(f"linkedin_crawler error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
