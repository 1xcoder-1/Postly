"""Bluesky topics via the public AT Protocol API — no key, no account needed.

Seeded by references.json -> bsky.authors, extended by env (comma-separated,
take priority when set):
    BLUESKY_AUTHORS="openai.com,vercel.com"         # handles to read

Uses only the standard library and the anonymous public endpoint
(public.api.bsky.app), so it works out of the box. Only app.bsky.feed.getAuthorFeed
is available anonymously now — searchPosts returns 403 without a session and
unspecced.getPopular was retired (501), so the seed is a wide author list and
the fetches run in parallel. Best-effort: an unknown handle is simply skipped,
and the whole source degrades to [] so the app never blocks.

Prints a JSON array of {title, source, url, score}. score = like count.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HOST = "https://public.api.bsky.app"
UA = "Postly/0.1"
PER_AUTHOR = int(os.getenv("BSKY_PER_AUTHOR", "30"))
MIN_LIKES = int(os.getenv("BSKY_MIN_LIKES", "2"))


def _get(path, params):
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{HOST}{path}?{qs}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)


def load_config():
    """authors from references.json merged with env overrides."""
    authors = []
    try:
        data = json.loads((Path(__file__).with_name("references.json")).read_text(encoding="utf-8"))
        b = data.get("bsky", {})
        authors = [a.strip() for a in (b.get("authors") or []) if a and a.strip()]
    except Exception as exc:  # missing/broken file just means "no seed"
        print(f"references.json not read: {exc}", file=sys.stderr)
    authors += [a.strip() for a in os.getenv("BLUESKY_AUTHORS", "").split(",") if a.strip()]
    return list(dict.fromkeys(authors))


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
    authors = load_config()
    if not authors:
        print("no bluesky refs (references.json/bsky or BLUESKY_AUTHORS); skipping", file=sys.stderr)
        return []

    topics, seen = [], set()

    def add(topic):
        if topic and topic["url"] not in seen:
            seen.add(topic["url"])
            topics.append(topic)

    def author_feed(actor):
        try:
            return _get("/xrpc/app.bsky.feed.getAuthorFeed", {"actor": actor, "limit": PER_AUTHOR})
        except Exception as exc:
            print(f"bluesky author '{actor}' failed: {exc}", file=sys.stderr)
            return {}

    # Anonymous access is author-feeds only (searchPosts = 403), so the seed
    # list is wide and the reads run in parallel to stay under the timeout.
    with ThreadPoolExecutor(max_workers=6) as pool:
        for data in pool.map(author_feed, authors):
            for item in data.get("feed", []):
                post = item.get("post") or {}
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
