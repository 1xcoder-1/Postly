"""Reference-driven YouTube topics via yt-dlp — live, not hard-coded.

WHY THIS EXISTS
  The old path (youtube.com/feeds/videos.xml?channel_id=...) now returns 404 for
  every channel, so YouTube contributed nothing relevant. yt-dlp still works and
  can read a channel's live uploads. This crawler turns the creator/tech
  references into fresh, English topic suggestions.

HOW IT IS SEEDED (live scrape, config-driven)
  references.json  ->  youtube.videos   (reference video IDs/URLs: the WHOLE
                                          channel behind each is pulled live)
                       youtube.channels (channel names / @handles / channel URLs)
  Env overrides (comma-separated, take priority when set):
      YT_REFS="https://youtu.be/ID,@handle,Some Channel Name,https://youtube.com/@x/videos"
      YT_CHANNELS="freeCodeCamp,@Telusko"

  Every result is real data fetched from YouTube right now. Editing the
  references changes WHO is scraped, never fabricates content.

Behaviour / safety
  - yt-dlp absent or no network  -> prints [] (app keeps running).
  - Hard time budget (default 60s); on overrun it prints what it collected.
  - English-only (lang.is_english) so Hinglish/other-language titles drop out.

Prints a JSON array of {title, source, url, score}. score = view count.
"""
import json
import os
import random
import re
import subprocess
import sys
import time
from pathlib import Path

def _envi(name, default):
    """int env that tolerates empty/blank values (an empty `YT_PER_CHANNEL=` in
    .env would otherwise crash int('') and make the whole crawler return [])."""
    raw = str(os.getenv(name, "")).strip()
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


def _envf(name, default):
    raw = str(os.getenv(name, "")).strip()
    try:
        return float(raw) if raw else default
    except ValueError:
        return default


PER_CHANNEL = _envi("YT_PER_CHANNEL", 6)
MAX_VIDEO_CHANNELS = _envi("YT_MAX_CHANNELS", 6)
# Channel fetches run in parallel waves so a long seed list still fits the
# time budget (5 workers x ~8s/call ~= 35-45 channels per refresh).
YT_WORKERS = _envi("YT_WORKERS", 5)
YT_WAVE = _envi("YT_WAVE", 9)
# Keep the internal budget comfortably below the Node-side kill timeout
# (crawlerService gives this crawler 150s). Worst case ~= BUDGET_S + CALL_TIMEOUT,
# so 55 + 40 = 95s finishes well before 150s and the whole refresh stays snappy.
BUDGET_S = _envf("YT_BUDGET_SECONDS", 75)
CALL_TIMEOUT = 40
SEP = "\t"
FIELDS = ["id", "title", "view_count", "channel", "channel_id"]

VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def _clean(text):
    return " ".join((text or "").split())[:280]


def load_refs():
    videos, channels, priority = [], [], []
    try:
        data = json.loads((Path(__file__).with_name("references.json")).read_text(encoding="utf-8"))
        yt = data.get("youtube", {})
        videos = yt.get("videos", []) or []
        channels = yt.get("channels", []) or []
        priority = yt.get("priority_channels", []) or []
    except Exception as exc:  # missing/broken file just means "no seed"
        print(f"references.json not read: {exc}", file=sys.stderr)

    env_refs = [x.strip() for x in os.getenv("YT_REFS", "").split(",") if x.strip()]
    env_channels = [x.strip() for x in os.getenv("YT_CHANNELS", "").split(",") if x.strip()]
    if env_refs:
        videos = env_refs  # explicit refs win entirely
    channels = list(dict.fromkeys(channels + env_channels))
    return videos, channels, priority


def _channel_topics(terms):
    """Fetch several channel terms in parallel; returns their topics."""
    from concurrent.futures import ThreadPoolExecutor

    def one(term):
        url = channel_url_for(term)
        entries = yt_flat(url, PER_CHANNEL) if url else yt_flat(f"ytsearch{PER_CHANNEL}:{term}", PER_CHANNEL)
        return _to_topics(entries, fallback_name=term)

    with ThreadPoolExecutor(max_workers=YT_WORKERS) as ex:
        return [t for group in ex.map(one, terms) for t in group]


def yt_flat(url, limit):
    """Return list of dicts for a channel/search URL's entries, or [] on any error."""
    # One --print with tab-joined fields; we split each output line on the tab.
    cmd = [
        "yt-dlp", "--flat-playlist", "--playlist-end", str(limit), "--no-warnings",
        "--print", SEP.join("%(" + f + ")s" for f in FIELDS), url,
    ]
    try:
        raw = subprocess.run(cmd, capture_output=True, text=True, timeout=CALL_TIMEOUT,
                             encoding="utf-8", errors="replace")
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f"yt-dlp error ({url}): {exc}", file=sys.stderr)
        return []
    out = []
    for line in (raw.stdout or "").splitlines():
        parts = line.split(SEP)
        if len(parts) < 3:
            continue
        out.append(dict(zip(FIELDS, parts)))
    return out


def resolve_channel(video_url):
    """(channel_name, channel_id) for a single video URL."""
    cmd = ["yt-dlp", "--flat-playlist", "--playlist-end", "1", "--no-warnings",
           "--print", "%(channel)s" + SEP + "%(channel_id)s", video_url]
    try:
        raw = subprocess.run(cmd, capture_output=True, text=True, timeout=CALL_TIMEOUT,
                             encoding="utf-8", errors="replace")
        line = (raw.stdout or "").strip().splitlines()
        if line and SEP in line[0]:
            name, cid = line[0].split(SEP, 1)
            return name.strip(), cid.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    return None, None


def as_video_url(item):
    """Turn a reference entry into something yt-dlp understands."""
    if item.startswith("http"):
        return item
    if VIDEO_ID.match(item):
        return f"https://www.youtube.com/watch?v={item}"
    return item  # bare name/handle -> treated as a search term by caller


def channel_url_for(term):
    """Normalize a channel term to a URL, or None if it needs a search."""
    if term.startswith("http"):
        return term if term.rstrip("/").endswith("/videos") else term.rstrip("/") + "/videos"
    if term.startswith("@"):
        return f"https://www.youtube.com/{term}/videos"
    return None


def _to_topics(entries, fallback_name="youtube"):
    from lang import is_english, is_tutorialish

    topics, seen = [], set()
    for e in entries:
        title = _clean(e.get("title"))
        vid = (e.get("id") or "").strip()
        # Skip non-English AND beginner/tutorial-style titles (the user wants
        # tech/AI industry news, not "Python tutorial / day 1 / build a web app").
        if not title or not vid or vid in seen or not is_english(title) or is_tutorialish(title):
            continue
        seen.add(vid)
        raw_channel = _clean(e.get("channel"))
        # yt-dlp flat-playlist often returns the literal "NA" for channel on
        # /videos entries; fall back to the requested handle/name term.
        channel = raw_channel if raw_channel and raw_channel.upper() != "NA" else fallback_name
        views = e.get("view_count")
        score = None
        if views and views.isdigit():
            score = int(views)
        topics.append(
            {
                "title": title,
                "source": f"youtube/{channel[:40]}",
                "url": f"https://www.youtube.com/watch?v={vid}",
                "score": score,
            }
        )
    return topics


def fetch():
    start = time.monotonic()
    videos, channels, priority = load_refs()
    # Creator-first ordering: youtube.priority_channels (the user's own channel
    # list) is fetched at the START of every refresh; the rest of the pool only
    # fills the budget left over. Without this, a random shuffle over 120+
    # channels lets big pre-existing seeds crowd the requested creators out —
    # a sequential budget only fits ~15 channels per run.
    pset = {c.strip().lower().lstrip("@") for c in priority}
    pri = [c for c in channels if c.strip().lower().lstrip("@") in pset]
    rest = [c for c in channels if c.strip().lower().lstrip("@") not in pset]
    random.shuffle(pri)
    random.shuffle(rest)
    ordered = pri + rest
    all_topics = []
    seen_channels = set()

    # 1) Named channels / handles / URLs — parallel waves, priority first.
    for i in range(0, len(ordered), YT_WAVE):
        if time.monotonic() - start > BUDGET_S:
            break
        all_topics += _channel_topics(ordered[i:i + YT_WAVE])

    # 2) Reference videos -> scrape their whole channel live (dedup by channel).
    resolved = 0
    for item in videos:
        if resolved >= MAX_VIDEO_CHANNELS or time.monotonic() - start > BUDGET_S:
            break
        vurl = as_video_url(item)
        if not vurl.startswith("http"):
            continue
        name, cid = resolve_channel(vurl)
        if not cid or cid in seen_channels:
            continue
        seen_channels.add(cid)
        resolved += 1
        entries = yt_flat(f"https://www.youtube.com/channel/{cid}/videos", PER_CHANNEL)
        all_topics += _to_topics(entries, fallback_name=name or "youtube")

    # Dedup by url, keep the higher-view copy.
    by_url = {}
    for t in all_topics:
        prev = by_url.get(t["url"])
        if not prev or (t["score"] or 0) > (prev["score"] or 0):
            by_url[t["url"]] = t
    return list(by_url.values())


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        which = subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True, timeout=15)
        if which.returncode != 0:
            raise OSError("yt-dlp not usable")
    except (OSError, subprocess.TimeoutExpired):
        print("yt-dlp not installed: pip install yt-dlp", file=sys.stderr)
        print(json.dumps([]))
        return
    try:
        print(json.dumps(fetch(), ensure_ascii=False))
    except Exception as exc:
        print(json.dumps([]))
        print(f"youtube_crawler error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
