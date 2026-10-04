"""General web / news / daily.dev scraping via Crawl4AI (OPTIONAL, dormant by default).

Crawl4AI turns any web page into clean, LLM-ready markdown using a headless
browser. It is the intended deep-scraping path for daily.dev and tech news sites
(the old daily.dev GraphQL `posts` query is retired).

  pip install "crawl4ai>=0.4"
  crawl4ai-setup            # one-time: installs the browser runtime

Opt-in only — it stays dormant unless you list URLs:
  CRAWL4AI_URLS=https://news.ycombinator.com,https://daily.dev

For each page we keep the page title plus any markdown headings (## ...) as
candidate topics. Any error (not installed, no browser, network) -> that page is
skipped; the script always prints a valid JSON array and never raises.

Prints a JSON array of {title, source, url, score}. score is None for web pages
(no reliable engagement number); the Node side ranks web items by relevance.
"""
import asyncio
import json
import os
import re
import sys
from urllib.parse import urlparse

HEADING = re.compile(r"^#{1,3}\s+(.*)")


def _clean(text):
    return " ".join((text or "").split())[:280]


def _source_of(url):
    return (urlparse(url).hostname or "web").replace("www.", "")


async def _crawl(url):
    from crawl4ai import AsyncWebCrawler

    topics = []
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url=url)
        title = _clean((getattr(result, "metadata", None) or {}).get("title") or _source_of(url))
        if title:
            topics.append({"title": title, "source": _source_of(url), "url": url, "score": None})
        markdown = getattr(result, "markdown", "") or ""
        seen = {title}
        for line in markdown.splitlines():
            m = HEADING.match(line.strip())
            if not m:
                continue
            heading = _clean(m.group(1))
            if heading and heading.lower() != "title" and heading not in seen:
                seen.add(heading)
                topics.append({"title": heading, "source": _source_of(url), "url": url, "score": None})
            if len(topics) >= 12:
                break
    return topics


async def _collect(urls):
    try:
        import crawl4ai  # noqa: F401  (import check only; heavy import guarded)
    except ImportError:
        print("crawl4ai not installed: pip install crawl4ai && crawl4ai-setup", file=sys.stderr)
        return []

    topics = []
    for url in urls:
        try:
            topics.extend(await _crawl(url))
        except Exception as exc:
            print(f"crawl4ai {url} error: {exc}", file=sys.stderr)
    return topics


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    urls = [u.strip() for u in os.getenv("CRAWL4AI_URLS", "").split(",") if u.strip().startswith("http")]
    if not urls:
        print("CRAWL4AI_URLS not set; skipping web crawler", file=sys.stderr)
        print(json.dumps([]))
        return
    try:
        print(json.dumps(asyncio.run(_collect(urls)), ensure_ascii=False))
    except Exception as exc:
        print(json.dumps([]))
        print(f"web_crawler error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
