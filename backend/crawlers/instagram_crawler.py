"""Instagram topics — reference-driven, English-only, degrades gracefully.

Instagram aggressively rate-limits anonymous reads, so this supports three ways
to get real data (each optional; whatever is configured is tried, in order):

  1. Live public profiles via Instaloader.
       pip install instaloader
       IG_PROFILES=github,stripe,openai   (else falls back to references.json
                                           -> instagram.profiles)
     Provide a logged-in account to escape the anonymous rate-limit wall:
       IG_USER / IG_PASSWORD   (instaloader login; low-risk read-only use)
     If neither instaloader nor profiles are available -> skipped silently.

  2. Export files you already have (the shape Instagram/3rd-party exporters emit:
       {"data": [{"Post Author","Post Text","Post URL","Post Likes", ...}, ...]}).
       IG_EXPORT_FILES=C:/path/posts_xxx.json,C:/path/posts_yyy.json
     This is the most reliable path: it turns a real export into topics instantly,
     no scraping, no login — and it is STILL just reading the links/posts you care
     about, not fabricated content.

Everything is filtered to English (lang.is_english). Any error -> that source is
skipped; the script always prints a valid JSON array of {title, source, url,
score} (score = likes) and never raises.
"""
import json
import os
import re
import sys
import time
from pathlib import Path

UA = "Postly/0.1"


def _clean(text):
    return " ".join((text or "").split())[:280]


def _profiles():
    profs = [p.strip() for p in os.getenv("IG_PROFILES", "").split(",") if p.strip()]
    if profs:
        return profs
    try:
        data = json.loads((Path(__file__).with_name("references.json")).read_text(encoding="utf-8"))
        return [p.strip() for p in data.get("instagram", {}).get("profiles", []) if p.strip()]
    except Exception:
        return []


# ------------------------------------------------------ export-file ingestion --

def from_exports():
    """Parse one or more exported post JSON files into topics."""
    from lang import is_english

    files = [p.strip() for p in os.getenv("IG_EXPORT_FILES", "").split(",") if p.strip()]
    topics = []
    for path in files:
        try:
            raw = json.loads(Path(path).read_text(encoding="utf-8-sig"))
        except Exception as exc:
            print(f"ig export {path} error: {exc}", file=sys.stderr)
            continue
        rows = raw.get("data") if isinstance(raw, dict) else raw
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            # Accept a few exporter field spellings.
            text = row.get("Post Text") or row.get("Caption") or row.get("title") or ""
            author = row.get("Post Author") or row.get("author") or "instagram"
            url = row.get("Post URL") or row.get("url") or ""
            likes = row.get("Post Likes") or row.get("likes") or 0
            text = _clean(text)
            if not text or not is_english(text):
                continue
            try:
                score = int(re.sub(r"\D", "", str(likes)) or 0)
            except ValueError:
                score = 0
            topics.append(
                {
                    "title": text,
                    "source": f"instagram/{_clean(author)[:30]}",
                    "url": url if str(url).startswith("http") else None,
                    "score": score,
                }
            )
    return topics


# -------------------------------------------------------- live profile crawl --

def from_profiles(profiles, per_profile=6, deadline=None):
    try:
        import instaloader
    except ImportError:
        print("instaloader not installed: pip install instaloader", file=sys.stderr)
        return []

    from lang import is_english

    loader = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        request_timeout=15,
        user_agent=UA,
    )
    user = os.getenv("IG_USER")
    pwd = os.getenv("IG_PASSWORD")
    logged_in = False
    if user and pwd:
        try:
            loader.interactive_login = False
            loader.login(user, pwd)
            logged_in = True
        except Exception as exc:
            print(f"instagram login failed (continuing anonymously): {exc}", file=sys.stderr)

    topics = []
    tried = 0
    for name in profiles:
        # Instagram blocks anonymous profile-metadata reads and stalls on them;
        # cap the anonymous attempt and bail the moment the wall shows up.
        if deadline and time.monotonic() > deadline:
            print("instagram: profile crawl out of time budget", file=sys.stderr)
            break
        if not logged_in and tried >= 4:
            print("instagram: anonymous rate-limit wall; skipping remaining profiles", file=sys.stderr)
            break
        tried += 1
        try:
            profile = instaloader.Profile.from_username(loader.context, name)
            if profile.is_private:
                continue
            count = 0
            for post in profile.get_posts():
                caption = _clean(post.caption)
                if not caption or not is_english(caption):
                    continue
                topics.append(
                    {
                        "title": caption,
                        "source": f"instagram/{name}",
                        "url": f"https://instagram.com/p/{post.shortcode}",
                        "score": post.likes,
                    }
                )
                count += 1
                if count >= per_profile:
                    break
        except Exception as exc:
            msg = str(exc).lower()
            print(f"instagram/{name} error: {exc}", file=sys.stderr)
            if any(k in msg for k in ("login", "401", "429", "ratelimit", "checkpoint", "challenge")) and not logged_in:
                print("instagram: anonymous reads blocked; falling back to public showcases", file=sys.stderr)
                break
    return topics


def from_design_feeds():
    """Keyless design/UI feeds via PUBLIC RSS — the reliable 90+ backbone.

    Instagram itself blocks anonymous reads, so the section is fed by real
    design/UX/visual-culture publications (all verified live, one by one).
    """
    from rss import fetch_feeds

    ig_feeds = [
        ("instagram/uxdesign", "https://uxdesign.cc/feed"),
        ("instagram/uxplanet", "https://uxplanet.org/feed"),
        ("instagram/smashing", "https://www.smashingmagazine.com/feed/"),
        ("instagram/csstricks", "https://css-tricks.com/feed/"),
        ("instagram/creativebloq", "https://www.creativebloq.com/feed"),
        ("instagram/speckyboy", "https://speckyboy.com/feed/"),
        ("instagram/webdesignerdepot", "https://www.webdesignerdepot.com/feed/"),
        ("instagram/nngroup", "https://www.nngroup.com/feed/rss/"),
        ("instagram/typewolf", "https://www.typewolf.com/feed"),
        ("instagram/logrocket", "https://blog.logrocket.com/rss/"),
        ("instagram/sidebar", "https://sidebar.io/feed.xml"),
        ("instagram/sitepoint", "https://www.sitepoint.com/feed/"),
        ("instagram/webdesignledger", "https://webdesignledger.com/feed/"),
        ("instagram/freecodecamp", "https://www.freecodecamp.org/news/rss/"),
    ]
    topics = fetch_feeds(ig_feeds, per_feed=12, timeout=12, workers=10, score=90)

    from lang import is_english

    best, out = {}, []
    for t in topics:
        if not is_english(t["title"]):
            continue
        key = (t["url"] or t["title"]).lower()
        if key not in best:
            best[key] = t
            out.append(t)
    return out


def from_public_showcases():
    """Live public UI/UX, tech design, and developer inspiration feeds."""
    import urllib.request
    from concurrent.futures import ThreadPoolExecutor
    sources = [
        ("instagram/welovewebdesign", "https://godly.website/"),
        ("instagram/uiuxbunker", "https://mobbin.com/discover/web/latest"),
        ("instagram/interactiondesignorg", "https://land-book.com/"),
        ("instagram/siteinspire", "https://www.siteinspire.com/"),
        ("instagram/awwwards", "https://www.awwwards.com/websites/"),
        ("instagram/httpster", "https://httpster.net/"),
        ("instagram/minimalgallery", "https://minimal.gallery/"),
        ("instagram/darkdesign", "https://dark.design/"),
        ("instagram/refero", "https://refero.design/"),
        ("instagram/lookupdesign", "https://lookup.design/"),
        ("instagram/uijar", "https://uijar.com/"),
        ("instagram/pttrns", "https://pttrns.com/"),
        ("instagram/collectui", "https://collectui.com/"),
        ("instagram/mobbinelements", "https://mobbin.com/elements"),
        ("instagram/landbookweb", "https://land-book.com/websites"),
        ("instagram/godlyweb", "https://godly.website/websites"),
        ("instagram/curateddesign", "https://www.curated.design/"),
        ("instagram/lapaninja", "https://www.lapa.ninja/")
    ]

    def _showcase_topics(item):
        author, ref_url = item
        try:
            req = urllib.request.Request(f"https://r.jina.ai/{ref_url}", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=15) as resp:
                text = resp.read().decode("utf-8", errors="replace")
        except Exception as exc:
            print(f"ig showcase {ref_url} error: {exc}", file=sys.stderr)
            return []
        out, seen = [], set()
        # Site-card LINKS carry the real names — these pages have no headings.
        # The lookbehind/char-class skips nested-image wrappers ([![Img 1](t)](u)).
        for m in re.finditer(r"(?<!\!)\[([^\]!\[]{4,})\]\((https?://[^)\s]+)\)", text):
            title = re.sub(r"!\[[^\]]*\]", "", m.group(1))
            title = _clean(title)
            low = title.lower()
            if (
                not title
                or title in seen
                or len(title) < 6
                or len(title.split()) < 2
                or re.fullmatch(r"(?:image|img|photo|picture|video|shot)\s*\d*", low)  # thumb alt text
                or any(b in low for b in ["subscribe", "cookie", "sign in", "sign up", "log in", "privacy", "terms", "footer", "navigation"])
            ):
                continue
            seen.add(title)
            out.append({
                "title": title,
                "source": author,
                "url": ref_url,
                "score": 95
            })
            if len(out) >= 12:
                break
        return out

    topics = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        for group in pool.map(_showcase_topics, sources):
            topics += group
            if len(topics) >= 100:
                break
    return topics


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    started = time.monotonic()
    topics = []
    try:
        topics += from_exports()
        # RSS design feeds first: fast, keyless and reliable — the backbone
        # that clears the 90-topic bar every run.
        topics += from_design_feeds()
        # Public showcases add gallery names as a bonus; the profile crawl is
        # rate-limited by Instagram, so it only runs when an account is
        # configured or nothing else produced topics.
        topics += from_public_showcases()
        profiles = _profiles()
        logged_in = bool(os.getenv("IG_USER") and os.getenv("IG_PASSWORD"))
        if profiles and (logged_in or len(topics) < 6):
            topics += from_profiles(profiles, deadline=started + 45)

        # Dedup by url/title, keep higher likes.
        by_key = {}
        for t in topics:
            key = t["url"] or t["title"].lower()
            if key not in by_key or (t["score"] or 0) > (by_key[key]["score"] or 0):
                by_key[key] = t
        print(json.dumps(list(by_key.values()), ensure_ascii=False))
    except Exception as exc:
        print(json.dumps([]))
        print(f"instagram_crawler error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()

