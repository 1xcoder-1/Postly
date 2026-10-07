"""Agent Reach channel health + extra topic sources for Scout.

Agent Reach (https://github.com/Panniantong/agent-reach) is a capability
layer that installs/selects internet-reading backends (yt-dlp, feedparser,
Jina Reader, Exa search, ...). This script does two things:

1. Runs `agent-reach doctor --json` and keeps a compact status row per
   channel so the UI can show which routes are active on this machine.
2. Fetches 90+ topics for the Agent Reach tab via free, no-login channels
   that NO other crawler uses, so the tab stays duplicate-free:
   - Show HN via the Algolia API (project launches — a different set than
     hn_crawler.py's front page)
   - Product Hunt, Techmeme, Phoronix, InfoQ, DevClass, LWN, OMG! Ubuntu,
     It's FOSS, The New Stack, Daring Fireball, HackerNoon (public RSS via
     the shared rss.py fetcher)
   - daily.dev public RSS (the feed carries ~1100 entries; newest 120 kept)

   Retired paths: V2EX (mostly Chinese titles — dropped by the app-wide
   English filter) and the HN front page (duplicated hn_crawler.py).

Prints ONE JSON object to stdout:
  {"status": {channel: {status, message, active_backend}}, "topics": [{title, source, url, score}]}
Prints {"status": {}, "topics": []} on any failure so the app never blocks.
"""
import json
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from rss import fetch_feeds

DAILYDEV_RSS = "https://daily.dev/rss.xml"
SHOW_HN_API = "https://hn.algolia.com/api/v1/search"
UA_HEADERS = {"User-Agent": "Postly/0.1 (agent-reach)"}

# RSS feeds unique to this tab (never reused by the x/linkedin/instagram lists).
AGENT_REACH_FEEDS = [
    ("agent-reach/producthunt", "https://www.producthunt.com/feed"),
    ("agent-reach/techmeme", "https://www.techmeme.com/feed.xml"),
    ("agent-reach/phoronix", "https://www.phoronix.com/rss.php"),
    ("agent-reach/infoq", "https://feed.infoq.com/"),
    ("agent-reach/devclass", "https://devclass.com/feed/"),
    ("agent-reach/lwn", "https://lwn.net/headlines/rss"),
    ("agent-reach/omgubuntu", "https://www.omgubuntu.co.uk/feed"),
    ("agent-reach/itsfoss", "https://itsfoss.com/rss/"),
    ("agent-reach/thenewstack", "https://thenewstack.io/feed/"),
    ("agent-reach/daringfireball", "https://daringfireball.net/feeds/main"),
    ("agent-reach/hackernoon", "https://hackernoon.com/feed"),
]


# ---------------------------------------------------------------- doctor ----

def channel_status():
    """Compact `agent-reach doctor --json` output; {} when the CLI is absent."""
    try:
        raw = subprocess.run(
            ["agent-reach", "doctor", "--json"],
            capture_output=True, text=True, timeout=180, encoding="utf-8", errors="replace",
        )
        start = raw.stdout.find("{")
        if start < 0:
            return {}
        data = json.loads(raw.stdout[start:])
        return {
            name: {
                "status": info.get("status", "off"),
                "message": (info.get("message") or "").splitlines()[0][:160] if info.get("message") else "",
                "active_backend": info.get("active_backend"),
            }
            for name, info in data.items()
            if isinstance(info, dict)
        }
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        print(f"agent-reach doctor unavailable: {exc}", file=sys.stderr)
        return {}


# ---------------------------------------------------------------- topics ----

def fetch_show_hn(days=5, hits=100):
    """Project launches from Show HN — a different set than hn_crawler's front page."""
    try:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        query = (
            f"tags=show_hn&hitsPerPage={hits}"
            f"&numericFilters=created_at_i>{int(since.timestamp())},points>3"
        )
        req = urllib.request.Request(f"{SHOW_HN_API}?{query}", headers=UA_HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.load(resp)
        return [
            {
                "title": (h.get("title") or "").strip(),
                "source": "agent-reach/show-hn",
                "url": h.get("url") or f"https://news.ycombinator.com/item?id={h.get('objectID')}",
                "score": h.get("points"),
            }
            for h in data.get("hits", [])
            if (h.get("title") or "").strip()
        ]
    except Exception as exc:
        print(f"show-hn error: {exc}", file=sys.stderr)
        return []


def fetch_dailydev(limit=120):
    """daily.dev's public RSS is huge (~1100 entries) — take the newest slice."""
    try:
        return fetch_feeds([("daily.dev", DAILYDEV_RSS)], per_feed=limit, timeout=20, workers=2, score=10)
    except Exception as exc:
        print(f"daily.dev error: {exc}", file=sys.stderr)
        return []


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
    # Electron reads our stdout as UTF-8; Windows' default codepage would
    # corrupt non-Latin titles.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    skip_doctor = "--skip-doctor" in sys.argv
    payload = {"status": {} if skip_doctor else channel_status(), "topics": []}
    try:
        topics = []
        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = [
                pool.submit(fetch_feeds, AGENT_REACH_FEEDS, 12, 15, 10, 10),
                pool.submit(fetch_show_hn),
                pool.submit(fetch_dailydev),
            ]
            for fut in futures:
                try:
                    topics += fut.result(timeout=45)
                except Exception as exc:
                    print(f"agent-reach source error: {exc}", file=sys.stderr)
        payload["topics"] = sorted(
            _dedupe(topics), key=lambda t: t.get("score") or 0, reverse=True
        )
        print(json.dumps(payload, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"status": {}, "topics": []}))
        print(f"agent_reach_crawler error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
