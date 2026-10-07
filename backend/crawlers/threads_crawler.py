"""Threads (Meta) topics for Scout.

Keyless reality (verified 2026-10): threads.net serves anonymous GETs the
283KB app shell with NO post data; the data-rich state (embedded post JSON
with "user_id"/captions) is only served intermittently, and api/graphql
needs a session. The crawler therefore:

1. Samples ~24 famous Threads users per refresh (references.json ->
   threads.users — 120+ seeded) and parses whatever data-rich profile state
   it happens to receive. Costs <=24 cheap requests, yields REAL Threads
   posts whenever Meta serves the state, prints nothing otherwise.
2. Tops up from 21 verified tech-creator media feeds through the shared
   rss.py fetcher (labeled threads/<name>) so the tab always clears 90+
   real-time topics.

Env: THREADS_SAMPLE (default 24), THREADS_FEED_LIMIT (default 120).

Prints a JSON array of {title, source, url, score}; [] on failure so the
app never blocks.
"""
import json
import os
import random
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from lang import is_english
from rss import fetch_feeds

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
APP_ID = "23996118479900873"  # public web client id; unlocks richer HTML states
CAPTION_RE = re.compile(r'"caption":\{"text":"((?:[^"\\]|\\.)+)"')
CODE_RE = re.compile(r'"code":"([A-Za-z0-9_-]{8,})"')

# Verified-live creator/tech-media feeds (disjoint from x/linkedin/ig lists).
THREADS_FEEDS = [
    ("threads/platformer", "https://platformer.news/feed"),
    ("threads/404media", "https://www.404media.co/rss"),
    ("threads/engadget", "https://www.engadget.com/rss.xml"),
    ("threads/gizmodo", "https://gizmodo.com/feed"),
    ("threads/mashable", "https://mashable.com/feed"),
    ("threads/thenextweb", "https://thenextweb.com/feed"),
    ("threads/restofworld", "https://restofworld.org/feed/"),
    ("threads/zdnet", "https://www.zdnet.com/rss.xml"),
    ("threads/slashdot", "https://slashdot.org/index.rss"),
    ("threads/lifehacker", "https://lifehacker.com/feed/rss"),
    ("threads/pcgamer", "https://www.pcgamer.com/rss/"),
    ("threads/techradar", "https://www.techradar.com/feeds.xml"),
    ("threads/bgr", "https://bgr.com/feed/"),
    ("threads/androidauthority", "https://www.androidauthority.com/feed/"),
    ("threads/9to5google", "https://9to5google.com/feed/"),
    ("threads/9to5mac", "https://9to5mac.com/feed/"),
    ("threads/xda", "https://www.xda-developers.com/feed/"),
    ("threads/androidpolice", "https://www.androidpolice.com/feed/"),
    ("threads/makeuseof", "https://www.makeuseof.com/feed/"),
    ("threads/ign", "https://feeds.ign.com/ign/news"),
    ("threads/arstechnica-gadgets", "https://feeds.arstechnica.com/arstechnica/gadgets"),
]


def load_users():
    """Famous Threads handles from references.json + THREADS_USERS env."""
    users = []
    try:
        data = json.loads((Path(__file__).with_name("references.json")).read_text(encoding="utf-8"))
        users = [u.strip().lstrip("@") for u in (data.get("threads", {}).get("users") or []) if u and u.strip()]
    except Exception as exc:
        print(f"references.json not read: {exc}", file=sys.stderr)
    users += [u.strip().lstrip("@") for u in os.getenv("THREADS_USERS", "").split(",") if u.strip()]
    return list(dict.fromkeys(users))


def _unescape(s):
    try:
        return json.loads(f'"{s}"')
    except Exception:
        return s


def _profile_topics(handle):
    """Parse post captions out of a data-rich profile state (best effort).

    Meta serves the 283KB app shell most of the time; when it does serve the
    preloaded state, captions + post codes can be lifted straight from it.
    """
    try:
        req = urllib.request.Request(
            f"https://www.threads.net/@{handle}",
            headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", "X-IG-App-ID": APP_ID},
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = resp.read().decode("utf-8", "replace")
        if '"user_id"' not in raw or len(raw) < 400_000:
            return []
        captions = [_unescape(c).strip() for c in CAPTION_RE.findall(raw)]
        codes = CODE_RE.findall(raw)
        out = []
        for i, text in enumerate(captions):
            if len(text) < 12 or not is_english(text):
                continue
            code = codes[i] if i < len(codes) else None
            out.append({
                "title": " ".join(text.split())[:280],
                "source": f"threads/{handle[:40]}",
                "url": f"https://www.threads.net/@{handle}/post/{code}" if code else f"https://www.threads.net/@{handle}",
                "score": None,
            })
        return out
    except Exception as exc:
        print(f"threads/@{handle}: {exc}", file=sys.stderr)
        return []


def from_profiles(users, sample, deadline_s=14):
    """Sample famous users; parse any data-rich state. Cheap, zero-junk."""
    import time

    picks = random.sample(users, min(sample, len(users)))
    deadline = time.monotonic() + deadline_s
    out = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(_profile_topics, h) for h in picks]
        for fut in futures:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                out += fut.result(timeout=remaining)
            except Exception:
                pass
    return out


def _dedupe(topics):
    seen, unique = set(), []
    for t in topics:
        key = (t.get("url") or "").lower() or ("title:" + (t.get("title") or "").lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(t)
    return unique


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        topics = []
        try:
            users = load_users()
            if users:
                topics += from_profiles(users, int(os.getenv("THREADS_SAMPLE", "24")))
        except Exception as exc:
            print(f"threads profiles error: {exc}", file=sys.stderr)
        topics += fetch_feeds(THREADS_FEEDS, per_feed=10, timeout=12, workers=10, score=120)
        topics = _dedupe([t for t in topics if t.get("title") and is_english(t["title"])])
        print(json.dumps(topics, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps([]))
        print(f"threads_crawler error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
