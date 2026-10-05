"""English-only text filter shared by the crawlers.

The user wants every suggested topic in English. Their own data (and many
reference channels) mix in Arabic/Urdu, Devanagari (Hindi), CJK, Cyrillic, etc.,
plus romanized Hinglish ("Pura physics ku ignore kia..."). We drop anything that
isn't clean English:

  1. reject if the text uses a non-Latin script at all;
  2. reject romanized Hindi/Urdu via a small high-frequency token blocklist;
  3. otherwise keep it.

`is_english` is intentionally conservative on script detection (deterministic)
and light-touch on the romanized blocklist, so legit English tech titles —
which are overwhelmingly Latin-script — always survive.
"""
import re

# Ranges we treat as "definitely not English": Arabic, Hebrew, Devanagari,
# CJK, Hangul, Kana, Thai, Cyrillic, Greek. Latin-1 supplements (é, ü, ñ) are
# allowed on purpose (brand names, transliteration).
_NON_LATIN = re.compile(
    "["
    "\u0590-\u05ff"   # Hebrew
    "\u0600-\u06ff"   # Arabic
    "\u0900-\u097f"   # Devanagari
    "\u0e00-\u0e7f"   # Thai
    "\u0400-\u04ff"   # Cyrillic
    "\u0370-\u03ff"   # Greek
    "\u3040-\u30ff"   # Kana
    "\u4e00-\u9fff"   # CJK ideographs
    "\uac00-\ud7af"   # Hangul
    "]"
)

# Very common romanized Hindi/Urdu function words. Two or more hits -> not English.
_ROMANIZED = {
    "hai", "hain", "nahi", "nhi", "kya", "kyu", "kyonki", "kyunki", "aur",
    "kro", "kar", "kia", "kiya", "rha", "rhi", "rhai", "raha", "rahi",
    "hu", "hota", "hoti", "bohat", "bahut", "zyada", "thora", "apna",
    "tum", "aap", "hamara", "mera", "teri", "wala", "wali", "se", "ko",
}

_WORD = re.compile(r"[a-z']+")

# Tutorial/how-to/course style titles. Beginner learn-to-code spam (e.g. "day 1
# python crash course for absolute beginners") is filtered, while legitimate
# engineering roadmaps, architectures, and deep dives are preserved.
_TUTORIAL = re.compile(
    r"""(?ix)
      \bcrash\s+course\b | \bbootcamp\b
    | \bfor\s+beginners?\b | \bbeginners?\b | \blec?t?ure\b | \blesson\b
    | \bday\s*\d+\b | \bday\s+one\b
    | \bpart\s*\d+\b | \bep(?:isode)?\.?\s*\d+\b
    | \bin\s+one\s+video\b | \bin\s+\d+\s*(?:minutes?|hours?|days?)\b
    | \blearn\s+(?:to\s+)?(?:python|javascript|java|c\+\+|golang|go|rust|react|html|css|sql
        |node(?:\.?js)?|next(?:\.?js)?|typescript|django|flask|spring|docker|kubernetes|aws
        |machine\s+learning|deep\s+learning|dsa|data\s+structures)\b
    | \bportfolio\s+(?:project|website)\b
    | \d+\s+projects?\b | \binterview\s+questions\b | \bcertification\b
    """
)


def is_tutorialish(text: str) -> bool:
    """True if the title looks like a how-to/course/beginner tutorial (not news)."""
    return bool(text) and bool(_TUTORIAL.search(text))


def is_english(text: str) -> bool:
    if not text:
        return False
    if _NON_LATIN.search(text):
        return False
    words = _WORD.findall(text.lower())
    if not words:
        # Nothing but numbers/emoji/symbols — keep only if there was real text.
        return bool(re.search(r"[A-Za-z\u00c0-\u024f]", text))
    romanized = sum(1 for w in words if w in _ROMANIZED)
    return romanized < 2
