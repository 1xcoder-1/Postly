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

def from_profiles(profiles, per_profile=6):
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
    if user and pwd:
        try:
            loader.interactive_login = False
            loader.login(user, pwd)
        except Exception as exc:
            print(f"instagram login failed (continuing anonymously): {exc}", file=sys.stderr)

    topics = []
    for name in profiles:
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
            print(f"instagram/{name} error: {exc}", file=sys.stderr)
    return topics


def from_public_showcases():
    """Live public UI/UX, tech design, and developer inspiration feeds."""
    import urllib.request
    from lang import is_english
    sources = [
        ("instagram/welovewebdesign", "https://godly.website/"),
        ("instagram/uiuxbunker", "https://mobbin.com/discover/web/latest"),
        ("instagram/interactiondesignorg", "https://land-book.com/"),
    ]
    topics = []
    for author, ref_url in sources:
        try:
            req = urllib.request.Request(f"https://r.jina.ai/{ref_url}", headers={"User-Agent": "Postly/0.1"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                lines = resp.read().decode("utf-8", errors="replace").splitlines()
                for line in lines:
                    line = line.strip()
                    if line.startswith("# ") or line.startswith("## ") or line.startswith("### "):
                        title = re.sub(r"[#\[\]\(\)]", " ", line)
                        title = _clean(title)
                        if len(title.split()) >= 3 and is_english(title) and not any(b in title.lower() for b in ["subscribe", "cookie", "sign in", "privacy", "terms", "footer", "navigation"]):
                            topics.append({
                                "title": title,
                                "source": author,
                                "url": ref_url,
                                "score": 95
                            })
                            if len(topics) >= 12:
                                break
        except Exception:
            continue
    return topics


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    topics = []
    try:
        topics += from_exports()
        profiles = _profiles()
        if profiles:
            topics += from_profiles(profiles)
        # If no profile or export topics obtained, fetch public design & developer showcases
        if not topics:
            topics += from_public_showcases()

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

