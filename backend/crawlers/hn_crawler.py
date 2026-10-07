"""Hacker News daily topics via the official free Algolia API.

Uses only the standard library, so it always works even without pip installs.
Prints a JSON array of {title, source, url, score} to stdout.
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

API = "https://hn.algolia.com/api/v1/search"


def fetch():
    # Volume is env-tunable so "show me 50-100 topics" is a config change, not
    # a code change. Defaults pull a wide, recent, front-page-quality set.
    days = int(os.getenv("HN_DAYS", "3"))
    hits = int(os.getenv("HN_HITS", "120"))
    min_points = int(os.getenv("HN_MIN_POINTS", "10"))
    since = datetime.now(timezone.utc) - timedelta(days=days)
    params = {
        "tags": "story",
        "numericFilters": f"created_at_i>{int(since.timestamp())},points>{min_points}",
        "hitsPerPage": hits,
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(f"{API}?{query}", headers={"User-Agent": "Postly/0.1"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.load(resp)

    topics = []
    for hit in data.get("hits", []):
        topics.append(
            {
                "title": hit.get("title", "").strip(),
                "source": "hackernews",
                "url": hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID')}",
                "score": hit.get("points"),
            }
        )
    return topics


def main():
    try:
        print(json.dumps(fetch()))
    except Exception as exc:  # never break the caller
        print(json.dumps([]), file=sys.stdout)
        print(f"hn_crawler error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
