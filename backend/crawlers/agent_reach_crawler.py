"""Agent Reach channel health + extra topic sources for Postly.

Agent Reach (https://github.com/Panniantong/agent-reach) is a capability
layer that installs/selects internet-reading backends (yt-dlp, feedparser,
Jina Reader, Exa search, ...). This script does two things:

1. Runs `agent-reach doctor --json` and keeps a compact status row per
   channel so the UI can show which routes are active on this machine.
2. Fetches trending topics through the free, no-login channels:
   - daily.dev RSS   (the old GraphQL API is retired; RSS is the stable path)
   - V2EX hot topics (official public API, no key)
   - Hacker News front page via the Algolia API (agent-reach 'web' parity)

   NOTE: YouTube used to be pulled here via youtube.com/feeds/videos.xml Atom
   feeds, but that endpoint now 404s for every channel. YouTube is handled by
   the dedicated, reference-driven youtube_crawler.py (yt-dlp) instead.

Prints ONE JSON object to stdout:
  {"status": {channel: {status, message, active_backend}}, "topics": [{title, source, url, score}]}
Prints {"status": {}, "topics": []} on any failure so the app never blocks.
"""
import json
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree

YT_CHANNELS = []  # superseded by youtube_crawler.py (Atom feeds now 404); kept empty for compat.
DAILYDEV_RSS = "https://daily.dev/rss.xml"
V2EX_HOT_API = "https://www.v2ex.com/api/topics/hot.json"
HN_API = "https://hn.algolia.com/api/v1/search"
UA_HEADERS = {"User-Agent": "Postly/0.1 (agent-reach)"}
YT_FEED_NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}


def http_json(url, timeout=15):
    req = urllib.request.Request(url, headers=UA_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


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

def _entry_score(entry):
    """Best-effort popularity score from an RSS entry's media stats, if present."""
    for key in ("media_community", "community"):
        stats = entry.get(key)
        if isinstance(stats, dict):
            for field in ("views", "likes", "shares"):
                try:
                    value = int(stats.get(field) or 0)
                except (TypeError, ValueError):
                    continue
                if value:
                    return value
    return None


def fetch_rss_entries(url, limit=10):
    """Parse RSS/Atom with feedparser if present, else stdlib Atom for YouTube feeds."""
    try:
        import feedparser

        feed = feedparser.parse(url)
        out = []
        for e in feed.entries[:limit]:
            out.append(
                {
                    "title": (e.get("title") or "").strip(),
                    "url": e.get("link"),
                    "score": _entry_score(e),
                }
            )
        return [t for t in out if t["title"]]
    except ImportError:
        return fetch_atom_entries(url, limit)


def fetch_atom_entries(url, limit=10):
    """Minimal stdlib fallback for YouTube's Atom channel feeds."""
    try:
        req = urllib.request.Request(url, headers=UA_HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read()
        # Hardening: channel feeds never carry a DTD, so reject one if present
        # (guards against entity-expansion / external-entity tricks).
        if b"<!DOCTYPE" in raw[:4096]:
            raise ValueError("unexpected DTD in feed")
        root = ElementTree.fromstring(raw)
        out = []
        for entry in root.findall("a:entry", YT_FEED_NS)[:limit]:
            title = entry.findtext("a:title", "", YT_FEED_NS).strip()
            video_id = entry.findtext("yt:videoId", "", YT_FEED_NS)
            views_el = entry.find(".//yt:statistics", {"yt": "http://www.youtube.com/xml/schemas/2015"})
            out.append(
                {
                    "title": title,
                    "url": f"https://www.youtube.com/watch?v={video_id}" if video_id else None,
                    "score": int(views_el.get("views")) if views_el is not None else None,
                }
            )
        return [t for t in out if t["title"]]
    except Exception as exc:
        print(f"atom fetch error for {url}: {exc}", file=sys.stderr)
        return []


def fetch_dailydev(limit=15):
    topics = []
    for t in fetch_rss_entries(DAILYDEV_RSS, limit):
        t["source"] = "daily.dev"
        topics.append(t)
    return topics


def fetch_v2ex(limit=10):
    try:
        data = http_json(V2EX_HOT_API)
    except Exception as exc:
        print(f"v2ex error: {exc}", file=sys.stderr)
        return []
    return [
        {
            "title": (t.get("title") or "").strip(),
            "source": "v2ex",
            "url": t.get("url"),
            "score": t.get("replies"),
        }
        for t in data[:limit]
        if t.get("title")
    ]


def fetch_hn(days=2, hits=15):
    try:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        query = f"tags=story&numericFilters=created_at_i>{int(since.timestamp())},points>80&hitsPerPage={hits}"
        data = http_json(f"{HN_API}?{query}")
    except Exception as exc:
        print(f"hn(web-parity) error: {exc}", file=sys.stderr)
        return []
    return [
        {
            "title": (h.get("title") or "").strip(),
            "source": "agent-reach/web",
            "url": h.get("url") or f"https://news.ycombinator.com/item?id={h.get('objectID')}",
            "score": h.get("points"),
        }
        for h in data.get("hits", [])
        if h.get("title")
    ]


def main():
    # Electron reads our stdout as UTF-8; Windows' default codepage would
    # corrupt non-Latin titles (V2EX etc).
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    skip_doctor = "--skip-doctor" in sys.argv
    payload = {"status": {} if skip_doctor else channel_status(), "topics": []}
    try:
        for fetch in (fetch_dailydev, fetch_v2ex, fetch_hn):
            try:
                payload["topics"].extend(fetch())
            except Exception as exc:
                print(f"{fetch.__name__} error: {exc}", file=sys.stderr)
        payload["topics"].sort(key=lambda t: t.get("score") or 0, reverse=True)
        print(json.dumps(payload, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"status": {}, "topics": []}))
        print(f"agent_reach_crawler error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
