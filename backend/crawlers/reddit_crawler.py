"""Reddit daily topics via PRAW, plus an account-login (cookie) branch.

PUBLIC PATH (unchanged): PRAW client-credentials.
    Requires:  pip install praw
    Env vars:  REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT

ACCOUNT-LOGIN PATH (new): when REDDIT_COOKIE is set we talk to reddit.com
directly with `requests` (NO new pip dependency, no PRAW needed) using the
token_v2 session cookie. It adds the logged-in user's subscribed subreddits and
auto-discovers more subs across the AI/industry verticals in references.json,
then reads each sub's hot page plus the personalized front page. These
personalized topics MERGE with the public PRAW results (never replace them).

    Env vars:
        REDDIT_COOKIE   token_v2 JWT (bare token OR full cookie-jar paste)
        REDDIT_SUBREDDITS  extra comma-separated subs to seed discovery
        REDDIT_MAX_SUBS     int, default 60 — cap on discovered subreddits
        MIN_SOURCES         int, default 100 — cross-platform floor (Node side)
        POSTLY_DATA_DIR     writable dir (unused here; part of the contract)
        REDDIT_USER_AGENT   UA string, default 'Postly/0.1 (by /u/postly)'

Blank / missing REDDIT_COOKIE skips the account branch entirely and the output
is byte-for-byte the legacy PRAW behaviour. Any auth failure (HTTP 401/403) is
reported on stderr and falls through to the public path. The script always
prints exactly one JSON array of {title, source, url, score} and never raises;
cookie values / secrets are never logged.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    import requests
except Exception:  # pragma: no cover - requests ships with the app runtime
    requests = None

DEFAULT_SUBS = "artificial,machinelearning,programming"
BASE_URL = "https://www.reddit.com"
REQUEST_PAUSE = 0.7  # politeness sleep between requests (~0.5-1s)
HTTP_TIMEOUT = 20


def _env_int(name, default):
    try:
        raw = str(os.getenv(name, "")).strip()
        return int(raw) if raw else default
    except (TypeError, ValueError):
        return default


MIN_SOURCES = _env_int("MIN_SOURCES", 100)
REDDIT_MAX_SUBS = _env_int("REDDIT_MAX_SUBS", 60)


def _extract_cookie(value, name):
    """Return the value of cookie `name` from a bare token OR a cookie-jar paste."""
    if not value:
        return ""
    value = value.strip()
    if "=" in value or ";" in value:  # looks like a jar -> pull out the named cookie
        for part in value.split(";"):
            part = part.strip()
            if not part or "=" not in part:
                continue
            key, _, val = part.partition("=")
            if key.strip() == name:
                return val.strip()
        return ""
    return value


def _clean(text):
    return " ".join((text or "").split())[:280]


def _split_csv(val):
    return [s.strip() for s in (val or "").split(",") if s.strip()]


def _load_verticals():
    """Top-level references.json 'verticals' seeds (AI/industry discovery)."""
    try:
        data = json.loads((Path(__file__).with_name("references.json")).read_text(encoding="utf-8"))
        return [str(v).strip() for v in (data.get("verticals") or []) if str(v).strip()]
    except Exception as exc:
        print(f"references.json not read: {exc}", file=sys.stderr)
        return []


def _finalize(topics):
    """English-filter + dedupe by url (or lowercased title) keeping higher score."""
    try:
        from lang import is_english
    except Exception:
        is_english = lambda _t: True  # noqa: E731

    best, order = {}, []
    for t in topics:
        title = (t.get("title") or "").strip()
        if not title or not is_english(title):
            continue
        url = (t.get("url") or "").strip().lower()
        key = url or ("title:" + title.lower())
        score = t.get("score")
        sval = score if isinstance(score, int) else -1
        if key in best:
            prev = best[key].get("score")
            pval = prev if isinstance(prev, int) else -1
            if sval > pval:
                best[key] = t
        else:
            best[key] = t
            order.append(key)
    return [best[k] for k in order]


# --------------------------------------------------------------------------
# PUBLIC PATH — PRAW client-credentials (UNCHANGED)
# --------------------------------------------------------------------------
def fetch(subreddits, limit=15):
    try:
        import praw
    except ImportError:
        print("praw not installed: pip install praw", file=sys.stderr)
        return []

    client_id = os.getenv("REDDIT_CLIENT_ID")
    client_secret = os.getenv("REDDIT_CLIENT_SECRET")
    user_agent = os.getenv("REDDIT_USER_AGENT", "Postly/0.1")
    if not (client_id and client_secret):
        print("REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set", file=sys.stderr)
        return []

    reddit = praw.Reddit(client_id=client_id, client_secret=client_secret, user_agent=user_agent)
    topics = []
    for sub in subreddits.split(","):
        try:
            for post in reddit.subreddit(sub.strip()).hot(limit=limit):
                if getattr(post, "stickied", False):
                    continue
                topics.append(
                    {
                        "title": post.title.strip(),
                        "source": f"reddit/{sub}",
                        "url": f"https://reddit.com{post.permalink}",
                        "score": post.score,
                    }
                )
        except Exception as exc:
            print(f"reddit/{sub} error: {exc}", file=sys.stderr)
    topics.sort(key=lambda t: t["score"] or 0, reverse=True)
    return topics[: limit * 3]


# --------------------------------------------------------------------------
# ACCOUNT-LOGIN PATH — token_v2 cookie via requests (NEW)
# --------------------------------------------------------------------------
def _session(token):
    sess = requests.Session()
    ua = os.getenv("REDDIT_USER_AGENT") or "Postly/0.1 (by /u/postly)"
    sess.headers.update(
        {
            "User-Agent": ua,
            "Cookie": f"token_v2={token}",
            "Accept": "application/json",
        }
    )
    return sess


def _get(sess, path, params=None):
    """GET -> (status_code, json_or_None). status 0 == transport error. Never raises."""
    url = path if path.startswith("http") else BASE_URL + path
    try:
        resp = sess.get(url, params=params, timeout=HTTP_TIMEOUT)
    except Exception as exc:
        print(f"reddit request {path} failed: {exc}", file=sys.stderr)
        return 0, None
    code = getattr(resp, "status_code", 0)
    if code in (401, 403):
        return code, None
    try:
        return code, resp.json()
    except Exception:
        return code, None


def _children_to_topics(data, fallback_sub):
    """Map a reddit listing JSON's children to topic records (skip stickied)."""
    out = []
    if not isinstance(data, dict):
        return out
    children = ((data.get("data") or {}).get("children")) or []
    for child in children:
        d = (child or {}).get("data") or {}
        if d.get("stickied"):
            continue
        title = _clean(d.get("title"))
        if not title:
            continue
        sub = d.get("subreddit") or fallback_sub
        permalink = d.get("permalink") or ""
        url = (BASE_URL + permalink) if permalink else None
        score = d.get("ups")
        try:
            score = int(score) if score is not None else None
        except (TypeError, ValueError):
            score = None
        out.append(
            {
                "title": title,
                "source": f"reddit/{sub}" if sub else "reddit",
                "url": url,
                "score": score,
            }
        )
    return out


def _dedup(names):
    """Case-insensitive order-preserving dedupe, dropping empties."""
    seen, out = set(), []
    for n in names:
        n = (n or "").strip()
        if not n:
            continue
        k = n.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(n)
    return out


def cookie_fetch(argv_subs):
    """Personalized reddit topics via the token_v2 cookie. [] on any auth failure."""
    if requests is None:
        print("reddit: 'requests' unavailable; skipping account branch", file=sys.stderr)
        return []

    token = _extract_cookie(os.getenv("REDDIT_COOKIE", ""), "token_v2")
    if not token:
        print("reddit: REDDIT_COOKIE has no token_v2 value; skipping account branch", file=sys.stderr)
        return []

    sess = _session(token)

    # --- source discovery -------------------------------------------------
    subs = []
    subs += _split_csv(DEFAULT_SUBS)          # base list
    subs += _split_csv(argv_subs)             # --subreddits argv
    subs += _split_csv(os.getenv("REDDIT_SUBREDDITS", ""))  # env seeds

    # subscribed subs (also doubles as the auth probe)
    code, data = _get(sess, "/subreddits/mine.json", {"limit": "100"})
    if code in (401, 403):
        print(f"reddit: cookie expired or blocked (HTTP {code}), skipping account branch", file=sys.stderr)
        return []
    subs += [((c or {}).get("data") or {}).get("display_name") for c in (((data or {}).get("data") or {}).get("children") or [])] if data else []
    time.sleep(REQUEST_PAUSE)

    # vertical discovery from references.json
    for vertical in _load_verticals():
        if len(_dedup(subs)) >= REDDIT_MAX_SUBS:
            break
        code, data = _get(sess, "/subreddits/search.json", {"q": vertical, "limit": "10"})
        if code in (401, 403):
            print(f"reddit: cookie expired or blocked (HTTP {code}), skipping account branch", file=sys.stderr)
            return []
        if data:
            subs += [((c or {}).get("data") or {}).get("display_name") for c in (((data or {}).get("data") or {}).get("children") or [])]
        time.sleep(REQUEST_PAUSE)

    discovered = _dedup(subs)
    total_discovered = len(discovered)
    capped = discovered[:REDDIT_MAX_SUBS]
    if total_discovered > len(capped):
        print(
            f"reddit: {total_discovered} subs discovered, capped to {REDDIT_MAX_SUBS} by REDDIT_MAX_SUBS",
            file=sys.stderr,
        )
    else:
        print(f"reddit: {total_discovered} subs discovered (cap {REDDIT_MAX_SUBS})", file=sys.stderr)
    if not capped:
        return []

    # --- fetch ------------------------------------------------------------
    topics = []
    for sub in capped:
        code, data = _get(sess, f"/r/{sub}/hot.json", {"limit": "10"})
        if code in (401, 403):
            print(f"reddit: cookie expired or blocked (HTTP {code}), skipping account branch", file=sys.stderr)
            break
        topics += _children_to_topics(data, sub)
        time.sleep(REQUEST_PAUSE)

    # personalized front page
    code, data = _get(sess, "/home.json", {"limit": "25"})
    if code not in (401, 403):
        topics += _children_to_topics(data, None)
    else:
        print(f"reddit: cookie expired or blocked (HTTP {code}) on home feed", file=sys.stderr)

    return topics


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--subreddits", default=DEFAULT_SUBS)
    args = parser.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    # No cookie -> legacy behaviour, byte-for-byte identical to before.
    if not os.getenv("REDDIT_COOKIE"):
        try:
            print(json.dumps(fetch(args.subreddits)))
        except Exception as exc:
            print(json.dumps([]))
            print(f"reddit_crawler error: {exc}", file=sys.stderr)
        return

    # Cookie set -> personalized branch MERGED with the public PRAW path.
    topics = []
    try:
        topics += cookie_fetch(args.subreddits)
    except Exception as exc:
        print(f"reddit account branch error: {exc}", file=sys.stderr)
    try:
        topics += fetch(args.subreddits)
    except Exception as exc:
        print(f"reddit_crawler error: {exc}", file=sys.stderr)
    try:
        print(json.dumps(_finalize(topics), ensure_ascii=False))
    except Exception as exc:
        print(json.dumps([]))
        print(f"reddit_crawler error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
