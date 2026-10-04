"""Bluesky topics via the public AT Protocol API — no key, no account needed.

Seeded by references.json -> bsky.authors / bsky.queries, extended by env
(comma-separated, take priority when set):
    BLUESKY_AUTHORS="openai.com,tsmc.bsky.social"   # handles to read
    BLUESKY_QUERIES="AI agents, developer tools"    # search terms

Uses only the standard library and the anonymous public endpoint
(public.api.bsky.app), so it works out of the box. Best-effort: an unknown
handle or a failed query is simply skipped, and the whole source degrades to
[] so the app never blocks.

Prints a JSON array of {title, source, url, score}. score = like count.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

HOST = "https://public.api.bsky.app"
UA = "Postly/0.1"
PER_AUTHOR = int(os.getenv("BSKY_PER_AUTHOR", "15"))
PER_QUERY = int(os.getenv("BSKY_PER_QUERY", "20"))
MIN_LIKES = int(os.getenv("BSKY_MIN_LIKES", "2"))


def _get(path, params):
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{HOST}{path}?{qs}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)


def load_config():
    """(authors, queries) from references.json merged with env overrides."""
    authors, queries = [], []
    try:
        data = json.loads((Path(__file__).with_name("references.json")).read_text(encoding="utf-8"))
        b = data.get("bsky", {})
        authors = [a.strip() for a in (b.get("authors") or []) if a and a.strip()]
        queries = [q.strip() for q in (b.get("queries") or []) if q and q.strip()]
    except Exception as exc:  # missing/broken file just means "no seed"
        print(f"references.json not read: {exc}", file=sys.stderr)
    authors += [a.strip() for a in os.getenv("BLUESKY_AUTHORS", "").split(",") if a.strip()]
    queries += [q.strip() for q in os.getenv("BLUESKY_QUERIES", "").split(",") if q.strip()]
    return list(dict.fromkeys(authors)), list(dict.fromkeys(queries))


def _clean(text):
    return " ".join((text or "").split())[:280]


def _from_post(post):
    if not post:
        return None
    # Skip posts the network labelled (spam/NSFW/etc.) — keeps suggestions clean.
    if (post.get("author") or {}).get("labels") or post.get("labels"):
        return None
    handle = (post.get("author") or {}).get("handle") or "bluesky"
    text = _clean((post.get("record") or {}).get("text"))
    if not text:
        return None
    cid = post.get("cid") or ""
    url = f"https://bsky.app/profile/{handle}/post/{cid}" if cid else f"https://bsky.app/profile/{handle}"
    return {
        "title": text,
        "source": f"bluesky/{handle[:40]}",
        "url": url,
        "score": post.get("likeCount") or 0,
    }


def fetch():
    authors, queries = load_config()
    if not authors and not queries:
        print("no bluesky refs (references.json/bsky or BLUESKY_AUTHORS/QUERIES); skipping", file=sys.stderr)
        return []

    topics, seen = [], set()

    def add(topic):
        if topic and topic["url"] not in seen:
            seen.add(topic["url"])
            topics.append(topic)

    # 1) Recent posts from each famous handle.
    for actor in authors:
        try:
            data = _get("/xrpc/app.bsky.feed.getAuthorFeed", {"actor": actor, "limit": PER_AUTHOR})
        except Exception as exc:
            print(f"bluesky author '{actor}' failed: {exc}", file=sys.stderr)
            continue
        for item in data.get("feed", []):
            add(_from_post(item.get("post")))

    # 2) Latest search hits for each query (the reliable, handle-agnostic path).
    for query in queries:
        try:
            data = _get("/xrpc/app.bsky.feed.searchPosts", {"q": query, "limit": PER_QUERY, "sort": "latest"})
        except Exception as exc:
            print(f"bluesky query '{query}' failed: {exc}", file=sys.stderr)
            continue
        for post in data.get("posts", []):
            if (post.get("likeCount") or 0) < MIN_LIKES:
                continue
            add(_from_post(post))

    return topics


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        print(json.dumps(fetch(), ensure_ascii=False))
    except Exception as exc:
        print(json.dumps([]))
        print(f"bsky_crawler error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
