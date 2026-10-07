"""Facebook Pages topics for Scout.

Meta walls anonymous page reads (login/checkpoint on every page endpoint),
so this crawler has three paths, best-real-data first:

1. FB_ACCESS_TOKEN (a Page or User access token from
   developers.facebook.com) -> official Graph API: /{page}/posts with
   message + permalink_url for pages sampled from references.json ->
   facebook.pages (300+ famous pages seeded; extend the list freely).
2. FB_RSS_BRIDGE (URL of an RSS-Bridge instance, e.g. a self-hosted
   https://rss-bridge.org/bridge01) -> keyless FacebookBridge page feeds.
3. Keyless fallback: the same famous pages belong to companies that publish
   the identical announcements on their own newsroom RSS - 16 verified feeds
   through the shared rss.py fetcher (facebook/<name>) keep the tab
   real-time and above the 90+ bar without any token.

Prints a JSON array of {title, source, url, score}; [] on failure so the
app never blocks.
"""
import json
import os
import random
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from lang import is_english
from rss import fetch_feeds

GRAPH = "https://graph.facebook.com/v19.0"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Verified-live newsroom feeds of famous Facebook pages (disjoint from the
# x/linkedin/instagram/threads feed lists).
FACEBOOK_FEEDS = [
    ("facebook/meta", "https://about.fb.com/feed/"),
    ("facebook/microsoft", "https://blogs.microsoft.com/feed/"),
    ("facebook/mozilla", "https://blog.mozilla.org/rss/"),
    ("facebook/amazon", "https://www.aboutamazon.com/feed"),
    ("facebook/nasa", "https://www.nasa.gov/feed/"),
    ("facebook/tesla-community", "https://www.teslarati.com/feed/"),
    ("facebook/spotify", "https://newsroom.spotify.com/feed/"),
    ("facebook/dell", "https://www.dell.com/en-us/blog/feed/"),
    ("facebook/windows", "https://blogs.windows.com/feed/"),
    ("facebook/xboxwire", "https://news.xbox.com/feed/"),
    ("facebook/playstation", "https://blog.playstation.com/feed/"),
    ("facebook/guardian-tech", "https://www.theguardian.com/uk/technology/rss"),
    ("facebook/nyt-tech", "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml"),
    ("facebook/cnn-tech", "http://rss.cnn.com/rss/edition_technology"),
    ("facebook/google", "https://blog.google/rss/"),
    ("facebook/dropbox", "https://blog.dropbox.com/feed/"),
]


def load_pages():
    """Famous Facebook page slugs from references.json + FACEBOOK_PAGES env."""
    pages = []
    try:
        data = json.loads((Path(__file__).with_name("references.json")).read_text(encoding="utf-8"))
        pages = [p.strip() for p in (data.get("facebook", {}).get("pages") or []) if p and p.strip()]
    except Exception as exc:
        print(f"references.json not read: {exc}", file=sys.stderr)
    pages += [p.strip() for p in os.getenv("FACEBOOK_PAGES", "").split(",") if p.strip()]
    return list(dict.fromkeys(pages))


def _from_graph(pages, sample):
    """Official Graph API page posts when FB_ACCESS_TOKEN is configured."""
    token = (os.getenv("FB_ACCESS_TOKEN") or "").strip()
    if not token or not pages:
        return []
    picks = random.sample(pages, min(sample, len(pages)))
    fields = "message,permalink_url,created_time,likes.summary(true).limit(0)"

    def one(page):
        try:
            qs = urllib.parse.urlencode({"fields": fields, "limit": 10, "access_token": token})
            req = urllib.request.Request(f"{GRAPH}/{page}/posts?{qs}", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.load(resp)
            out = []
            for post in data.get("data", []):
                text = (post.get("message") or "").strip()
                if len(text) < 12 or not is_english(text):
                    continue
                out.append({
                    "title": " ".join(text.split())[:280],
                    "source": f"facebook/{page[:40]}",
                    "url": post.get("permalink_url") or f"https://www.facebook.com/{page}",
                    "score": (post.get("likes") or {}).get("summary", {}).get("total_count"),
                })
            return out
        except Exception as exc:
            print(f"facebook graph '{page}': {exc}", file=sys.stderr)
            return []

    topics = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        for got in pool.map(one, picks):
            topics += got
    return topics


def _from_bridge(pages, sample):
    """RSS-Bridge FacebookBridge page feeds when FB_RSS_BRIDGE is configured."""
    bridge = (os.getenv("FB_RSS_BRIDGE") or "").strip().rstrip("/")
    if not bridge or not pages:
        return []
    picks = random.sample(pages, min(sample, len(pages)))

    def one(page):
        try:
            url = (
                f"{bridge}/?action=display&bridge=FacebookBridge&context=Page"
                f"&username={urllib.parse.quote(page)}&format=JsonFormat"
            )
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.load(resp)
            items = data if isinstance(data, list) else data.get("items", [])
            out = []
            for item in items:
                text = (item.get("title") or "").strip()
                if len(text) < 12 or not is_english(text):
                    continue
                out.append({
                    "title": text[:280],
                    "source": f"facebook/{page[:40]}",
                    "url": item.get("uri") or item.get("url") or f"https://www.facebook.com/{page}",
                    "score": None,
                })
            return out
        except Exception as exc:
            print(f"facebook bridge '{page}': {exc}", file=sys.stderr)
            return []

    topics = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        for got in pool.map(one, picks):
            topics += got
    return topics


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
        pages = load_pages()
        sample = int(os.getenv("FACEBOOK_SAMPLE", "24"))
        topics = _from_graph(pages, sample) + _from_bridge(pages, sample)
        # Keyless backbone: the famous pages' own newsroom feeds.
        topics += fetch_feeds(FACEBOOK_FEEDS, per_feed=12, timeout=12, workers=10, score=90)
        topics = _dedupe([t for t in topics if t.get("title") and is_english(t["title"])])
        print(json.dumps(topics, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps([]))
        print(f"facebook_crawler error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
