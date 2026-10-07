"""Dev-news topics via dev.to RSS/Atom feeds.

daily.dev retired its public `posts` GraphQL query (it now returns 0), so this
file was repointed to dev.to, which has a free, key-less Atom feed. The module
name is kept for wiring stability, but the source label is "dev.to".

Volume is env-tunable so "show me 50-100 topics" is a config change:
    DEVTO_MAX=60                          # total items to collect
    DEVTO_TAGS=ai,programming,webdev      # tags to spread across (comma list)

Standard library only; degrades to [] on any error so the app never blocks.
Prints a JSON array of {title, source, url, score}.
"""
import json
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET

FEED = "https://dev.to/feed"
UA = "Postly/0.1"
DEFAULT_TAGS = [
    "ai", "programming", "webdev", "javascript", "typescript", "rust",
    "devops", "machinelearning", "startup", "security", "go", "react",
]


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = resp.read(2_000_000)  # cap so a hostile feed can't exhaust memory
    # A legitimate dev.to Atom feed never declares DTDs or entities; reject any
    # that do to neutralize XXE / entity-expansion (billion-laughs) payloads.
    lowered = data.lower()
    if b"<!doctype" in lowered or b"<!entity" in lowered:
        raise ValueError("feed declares DTD/entities; refusing to parse")
    return data


def _title(item):
    el = item.find("title")
    return " ".join((el.text or "").split()) if el is not None and el.text else ""


def _link(item):
    el = item.find("link")
    return (el.text or "").strip() if el is not None else ""


def fetch():
    limit = int(os.getenv("DEVTO_MAX", "120"))
    tags = [t.strip() for t in os.getenv("DEVTO_TAGS", ",".join(DEFAULT_TAGS)).split(",") if t.strip()]
    urls = [FEED] + [f"{FEED}?tag={t}" for t in tags]

    topics, seen = [], set()
    for url in urls:
        if len(topics) >= limit:
            break
        try:
            root = ET.fromstring(_get(url))
        except Exception as exc:  # one bad feed must not kill the whole source
            print(f"dev.to feed failed ({url}): {exc}", file=sys.stderr)
            continue
        for item in root.findall("channel/item"):
            title, link = _title(item), _link(item)
            if not title or not link or link in seen:
                continue
            seen.add(link)
            topics.append({"title": title[:280], "source": "dev.to", "url": link, "score": 0})
            if len(topics) >= limit:
                break
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
        print(f"devto_crawler error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
