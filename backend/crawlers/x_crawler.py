"""X / Twitter tech topics via twscrape — famous accounts + queries, live.

Seeded by references.json -> x.accounts / x.queries (edit there), extended by
env (comma-separated, take priority when set):
    X_ACCOUNTS="karpathy,OpenAI,Vercel"     # latest posts from these handles
    X_QUERIES="AI agents, developer tools"  # search terms

ACCOUNT-LOGIN (personalized) BRANCH
    When the user connects an X account, the Node side exports the session
    cookies as env vars:
        X_AUTH_TOKEN   the auth_token cookie (bare token OR full cookie-jar)
        X_CT0          the ct0 cookie        (bare token OR full cookie-jar)
    With BOTH set we register a twscrape account from those cookies into a
    pool DB under POSTLY_DATA_DIR (never the cwd-relative accounts.db — the
    crawler's cwd is backend/crawlers and packaged builds are read-only) and
    then expand the source list with the accounts we now can reach. Blank /
    missing cookies skip this branch entirely: existing behaviour is unchanged
    and the script still prints [].

twscrape scrapes X without the paid API. It NEVER raises to the caller: any
error is swallowed to stderr and [] is printed, so Postly keeps working with
zero X credentials.

Prints a JSON array of {title, source, url, score}. Diagnostics go to stderr
ONLY. Cookie values / secrets are never logged.
"""
import asyncio
import json
import os
import random
import re
import sys
from pathlib import Path

UA = "Postly/0.1"
PER_ACCOUNT = int(os.getenv("X_PER_ACCOUNT", "8"))
PER_QUERY = int(os.getenv("X_PER_QUERY", "12"))


def _env_int(name, default):
    try:
        raw = str(os.getenv(name, "")).strip()
        return int(raw) if raw else default
    except (TypeError, ValueError):
        return default


# Cross-platform discovery floor (int, default 100) — enforced by the Node side
# across all crawlers; read here so the contract env surface is consistent.
MIN_SOURCES = _env_int("MIN_SOURCES", 100)
# Hard cap on how many source handles we fetch when connected.
X_MAX_ACCOUNTS = _env_int("X_MAX_ACCOUNTS", 60)
# For-you home timeline page size (only used when API.timeline exists).
X_TIMELINE_LIMIT = 25

SCRIPT_DIR = str(Path(__file__).resolve().parent)
# Writable data dir for the twscrape pool DB; fall back to the script dir.
DATA_DIR = os.getenv("POSTLY_DATA_DIR") or SCRIPT_DIR


def _extract_cookie(value, name):
    """Return the value of cookie `name`.

    Tolerates both a bare token ("abc123") and a full cookie-jar paste
    ("auth_token=abc; ct0=xyz; ..."): if the value looks like a jar (it
    contains '=' or ';') we parse it and pull out the named cookie, otherwise
    we treat the whole value as the token. Returns '' when not found.
    """
    if not value:
        return ""
    value = value.strip()
    if "=" in value or ";" in value:
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


def _attr(obj, *names):
    """Attribute-or-key access that works for twscrape objects AND plain dicts."""
    for n in names:
        if isinstance(obj, dict):
            val = obj.get(n)
        else:
            val = getattr(obj, n, None)
        if val not in (None, ""):
            return val
    return None


def load_config():
    """(accounts, queries, priority) from references.json merged with env."""
    accounts, queries, priority = [], [], []
    try:
        data = json.loads((Path(__file__).with_name("references.json")).read_text(encoding="utf-8"))
        x = data.get("x", {})
        accounts = [a.strip().lstrip("@") for a in (x.get("accounts") or []) if a and a.strip()]
        queries = [q.strip() for q in (x.get("queries") or []) if q and q.strip()]
        priority = [a.strip().lstrip("@") for a in (x.get("priority_accounts") or []) if a and a.strip()]
    except Exception as exc:  # missing/broken file just means "no seed"
        print(f"references.json not read: {exc}", file=sys.stderr)
    accounts += [a.strip().lstrip("@") for a in os.getenv("X_ACCOUNTS", "").split(",") if a.strip()]
    queries += [q.strip() for q in os.getenv("X_QUERIES", "").split(",") if q.strip()]
    return (list(dict.fromkeys(accounts)), list(dict.fromkeys(queries)),
            list(dict.fromkeys(priority)))


def _load_verticals():
    """Top-level references.json 'verticals' seeds (AI/industry discovery)."""
    try:
        data = json.loads((Path(__file__).with_name("references.json")).read_text(encoding="utf-8"))
        return [str(v).strip() for v in (data.get("verticals") or []) if str(v).strip()]
    except Exception:
        return []


def _to_topic(tweet, fallback_user=None):
    """Map a twscrape Tweet (object) — or a plain dict — to a topic record."""
    text = _clean(_attr(tweet, "rawContent", "raw_text", "text", "full_text"))
    if not text:
        return None

    author = None
    user = _attr(tweet, "user")
    if user is not None:
        author = _attr(user, "username", "screen_name")
    author = author or fallback_user

    tid = _attr(tweet, "id_str") or _attr(tweet, "id")
    url = _attr(tweet, "url")
    if not url and author and tid:
        url = f"https://x.com/{author}/status/{tid}"

    score = _attr(tweet, "likeCount", "like_count", "favorite_count")
    try:
        score = int(score) if score is not None else 0
    except (TypeError, ValueError):
        score = 0

    return {
        "title": text,
        "source": f"x/{author}" if author else "x",
        "url": url or None,
        "score": score,
    }


def _finalize(topics):
    """English-filter + dedupe by url (or lowercased title) keeping higher score."""
    try:
        from lang import is_english
    except Exception:
        is_english = lambda _t: True  # noqa: E731  (filter unavailable -> keep all)

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


async def _resolve_uid(api, handle):
    """handle -> numeric uid (twscrape 0.20.1 user_tweets() needs an int uid)."""
    try:
        user = await api.user_by_login(handle)
    except Exception as exc:
        print(f"twscrape user_by_login '{handle}' failed: {exc}", file=sys.stderr)
        return None
    return getattr(user, "id", None) if user else None


async def _following_handles(api):
    """Best-effort logged-in following list (usernames).

    twscrape 0.20.1 exposes following(uid: int) but the cookie-registered
    Account carries no numeric uid and there is no whoami/user_by_login(self)
    to resolve the logged-in user's uid, so this capability is not reachable
    from a cookie-only login. We skip it gracefully rather than hard-fail.
    """
    if not callable(getattr(api, "following", None)):
        print("x: following() unavailable in this twscrape build; skipping following-list expansion", file=sys.stderr)
        return []
    print(
        "x: following-list expansion skipped (twscrape 0.20.1 following() needs a numeric uid; "
        "logged-in uid not resolvable from a cookie-only login)",
        file=sys.stderr,
    )
    return []


def _dedupe_cap(handles, cap, connected, priority=()):
    """Case-insensitive dedupe; when capping, priority handles are always kept
    and only the remainder is sampled down."""
    pset = {p.lower() for p in priority}
    seen, pri, rest = set(), [], []
    for h in handles:
        k = h.lower()
        if k in seen:
            continue
        seen.add(k)
        (pri if k in pset else rest).append(h)
    if connected and len(pri) + len(rest) > cap:
        keep = pri[:cap]
        slots = cap - len(keep)
        tail = rest if slots >= len(rest) else random.sample(rest, slots)
        print(f"x: kept {len(keep)} priority + sampled {len(tail)} of {len(rest)} "
              f"others (X_MAX_ACCOUNTS={cap})", file=sys.stderr)
        return keep + tail
    return pri + rest


# Keyless live feed: the AI labs, dev-tool makers, builders and tech news from
# the reference ecosystem, mirrored through their PUBLIC RSS feeds. Keyless,
# no rate limits, real article titles — verified live one by one.
X_FEEDS = [
    ("x/OpenAI", "https://openai.com/news/rss.xml"),
    ("x/GoogleDeepMind", "https://deepmind.google/blog/rss.xml"),
    ("x/GoogleAI", "https://blog.google/technology/ai/rss/"),
    ("x/Microsoft", "https://www.microsoft.com/en-us/research/feed/"),
    ("x/nvidia", "https://blogs.nvidia.com/feed/"),
    ("x/huggingface", "https://huggingface.co/blog/feed.xml"),
    ("x/mistral_ai", "https://mistral.ai/rss.xml"),
    ("x/hardmaru", "https://sakana.ai/feed.xml"),
    ("x/PyTorch", "https://pytorch.org/blog/feed.xml"),
    ("x/Vercel", "https://vercel.com/atom"),
    ("x/cloudflare", "https://blog.cloudflare.com/rss/"),
    ("x/supabase", "https://supabase.com/blog/rss.xml"),
    ("x/posthog", "https://posthog.com/rss.xml"),
    ("x/ollama", "https://ollama.com/blog/rss.xml"),
    ("x/n8n_io", "https://blog.n8n.io/rss/"),
    ("x/github", "https://github.blog/feed/"),
    ("x/e2b", "https://e2b.dev/rss.xml"),
    ("x/reactjs", "https://react.dev/rss.xml"),
    ("x/nodejs", "https://nodejs.org/en/feed/blog.xml"),
    ("x/rustlang", "https://blog.rust-lang.org/feed.xml"),
    ("x/golang", "https://go.dev/blog/feed.atom"),
    ("x/typescript", "https://devblogs.microsoft.com/typescript/feed/"),
    ("x/chromedev", "https://developer.chrome.com/blog/feed.xml"),
    ("x/webdev", "https://web.dev/feed.xml"),
    ("x/sveltejs", "https://svelte.dev/blog/rss.xml"),
    ("x/bunproject", "https://bun.sh/rss.xml"),
    ("x/prisma", "https://www.prisma.io/blog/rss.xml"),
    ("x/docker", "https://www.docker.com/blog/feed/"),
    ("x/kubernetes", "https://kubernetes.io/feed.xml"),
    ("x/jetbrains", "https://blog.jetbrains.com/feed/"),
    ("x/kagi", "https://blog.kagi.com/rss.xml"),
    ("x/karpathy", "https://karpathy.bearblog.dev/feed/"),
    ("x/piyushgarg_dev", "https://blog.piyushgarg.dev/rss.xml"),
    ("x/simonw", "https://simonwillison.net/atom/everything/"),
    ("x/lilianweng", "https://lilianweng.github.io/index.xml"),
    ("x/huyenchip", "https://huyenchip.com/feed.xml"),
    ("x/eugeneyan", "https://eugeneyan.com/rss/"),
    ("x/dhh", "https://world.hey.com/dhh/feed.atom"),
    ("x/cassidoo", "https://cassidoo.co/rss.xml"),
    ("x/stratechery", "https://stratechery.com/feed/"),
    ("x/interconnects", "https://www.interconnects.ai/feed"),
    ("x/latentspace", "https://www.latent.space/feed"),
    ("x/importai", "https://importai.substack.com/feed"),
    ("x/techcrunch", "https://techcrunch.com/feed/"),
    ("x/verge", "https://www.theverge.com/rss/index.xml"),
    ("x/arstechnica", "https://feeds.arstechnica.com/arstechnica/index"),
    ("x/wired", "https://www.wired.com/feed/rss"),
    ("x/mittr", "https://www.technologyreview.com/feed/"),
]

# Sources WITHOUT a public RSS feed get a small Jina-mirrored bonus (capped —
# Jina's anonymous tier is rate-limited, so this list stays tiny).
JINA_BONUS = [
    ("x/AnthropicAI", "https://www.anthropic.com/news"),
    ("x/cursor_ai", "https://cursor.com/blog"),
    ("x/LangChainAI", "https://blog.langchain.dev/"),
    ("x/calcom", "https://cal.com/blog"),
    ("x/levelsio", "https://levels.io/"),
    ("x/steipete", "https://steipete.me/"),
]


def _jina_topics(item):
    """Mirror one page via Jina Reader; ARTICLE LINKS ([Title](url)) are titles."""
    import urllib.request

    handle, blog_url = item
    try:
        req = urllib.request.Request(f"https://r.jina.ai/{blog_url}", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20) as resp:
            lines = resp.read().decode("utf-8", errors="replace").splitlines()
    except Exception as exc:
        print(f"x public {blog_url} error: {exc}", file=sys.stderr)
        return []
    host = blog_url.split("/")[2]
    out, seen = [], set()
    for line in lines:
        for m in re.finditer(r"\[([^\]]{12,})\]\((https?://[^)\s]+)\)", line):
            title, link = m.group(1), m.group(2)
            # Same-site article links only (drop nav/home/external).
            if f"//{host}/" not in link:
                continue
            path = link.split(host, 1)[1]
            if not path or path in ("/", ""):
                continue
            title = re.sub(r"!\[[^\]]*\]", "", title)  # image alt text
            title = _clean(title)
            low = title.lower()
            if (
                not title
                or title in seen
                or len(title.split()) < 4
                or any(b in low for b in ["subscribe", "cookie", "terms", "privacy", "sign in", "read more"])
            ):
                continue
            seen.add(title)
            out.append({
                "title": title,
                "source": handle,
                "url": link,
                "score": 150,
            })
            break  # one headline per link line is enough
        if len(out) >= 6:
            break
    return out


async def _collect():
    accounts, queries, priority = load_config()

    # --- account-login (cookie) detection --------------------------------
    auth_token = _extract_cookie(os.getenv("X_AUTH_TOKEN", ""), "auth_token")
    ct0 = _extract_cookie(os.getenv("X_CT0", ""), "ct0")
    connected = bool(auth_token and ct0)

    if not connected:
        # Keyless live feed: RSS-first. X_FEEDS covers every AI lab, dev-tool
        # maker, builder and tech-news source that publishes a public feed —
        # keyless, no rate limits, real article titles, fetched in parallel.
        print("x: no account cookie (X_AUTH_TOKEN/X_CT0); using live RSS tech feeds", file=sys.stderr)
        from rss import fetch_feeds

        public_topics = fetch_feeds(X_FEEDS, per_feed=5, timeout=12, workers=10, score=140)

        # The few sources WITHOUT a public RSS feed get a small Jina-mirrored
        # bonus — only when the RSS run came up short, keeping us far away from
        # Jina's anonymous rate limits.
        if len(public_topics) < 90:
            try:
                from concurrent.futures import ThreadPoolExecutor

                with ThreadPoolExecutor(max_workers=6) as pool:
                    for group in pool.map(_jina_topics, JINA_BONUS):
                        public_topics += group
            except Exception as exc:
                print(f"x public jina bonus error: {exc}", file=sys.stderr)
        return _finalize(public_topics)


    try:
        from twscrape import API, AccountsPool
    except ImportError:
        print("twscrape not installed: pip install twscrape", file=sys.stderr)
        return []

    # --- cookie injection into an ABSOLUTE pool DB (never cwd-relative) ----
    db_file = os.path.join(DATA_DIR, "x-accounts.db")
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        # wait_timeout=0 -> if the single account is momentarily locked /
        # rate-limited, get_for_queue_or_wait gives up immediately (returns
        # None) instead of falling into twscrape's legacy unbounded sleep loop.
        # Keeps a bad/rate-limited cookie from ever hanging the crawler.
        pool = AccountsPool(db_file=db_file, wait_timeout=0)
        # add_account_cookies(username: str, cookies: str) — cookies is a Cookie
        # header string; it raises ValueError unless auth_token AND ct0 present.
        await pool.add_account_cookies("postly-x", f"auth_token={auth_token}; ct0={ct0}")
    except Exception as exc:
        print(f"x: cookie account registration failed: {exc}", file=sys.stderr)
        return []

    api = API(pool=pool)

    # FIX: twscrape 0.20.1 removed the old API-level account getter; the
    # account list lives on the pool. (api.pool is the AccountsPool we built.)
    try:
        creds = await api.pool.get_all()
    except Exception as exc:
        print(f"twscrape has no usable accounts ({exc}); run `twscrape add_accounts`", file=sys.stderr)
        return []
    if not creds:
        print("twscrape: no accounts configured; run `twscrape add_accounts`", file=sys.stderr)
        return []

    # --- source expansion (connected) ------------------------------------
    # references.json x.accounts ∪ X_ACCOUNTS env (merged by load_config)
    # ∪ logged-in following list, then dedupe + cap at X_MAX_ACCOUNTS.
    handles = list(accounts)
    handles += await _following_handles(api)
    handles = _dedupe_cap(handles, X_MAX_ACCOUNTS, connected=True, priority=priority)

    # Personalized queries: seed queries ∪ verticals from references.json so a
    # connected refresh discovers fresh AI/industry topics across verticals.
    query_list = list(dict.fromkeys(list(queries) + _load_verticals()))

    topics = []

    # 1) Latest posts from each source handle (resolve handle -> uid first).
    #    twscrape 0.20.1 user_tweets()/search() are async GENERATORS: consume
    #    them with `async for` (awaiting them raises TypeError).
    for handle in handles:
        uid = await _resolve_uid(api, handle)
        if uid is None:
            continue
        try:
            async for tweet in api.user_tweets(uid, limit=PER_ACCOUNT):
                topic = _to_topic(tweet, fallback_user=handle)
                if topic:
                    topics.append(topic)
        except Exception as exc:
            print(f"twscrape user_tweets '{handle}' failed: {exc}", file=sys.stderr)
            continue

    # 2) Search results for each query.
    for query in query_list:
        try:
            async for tweet in api.search(query, limit=PER_QUERY):
                topic = _to_topic(tweet)
                if topic:
                    topics.append(topic)
        except Exception as exc:
            print(f"twscrape search '{query}' failed: {exc}", file=sys.stderr)
            continue

    # 3) For-you home timeline (only if this twscrape build exposes it; it is an
    #    async generator too). twscrape 0.20.1 has no API.timeline -> skip.
    if callable(getattr(api, "timeline", None)):
        try:
            async for tweet in api.timeline(limit=X_TIMELINE_LIMIT):
                topic = _to_topic(tweet)
                if topic:
                    topics.append(topic)
        except Exception as exc:
            print(f"twscrape timeline failed: {exc}", file=sys.stderr)
    else:
        print("x: home timeline skipped (API.timeline missing in twscrape 0.20.1)", file=sys.stderr)

    return _finalize(topics)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        print(json.dumps(asyncio.run(_collect()), ensure_ascii=False))
    except Exception as exc:
        print(json.dumps([]))
        print(f"x_crawler error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
