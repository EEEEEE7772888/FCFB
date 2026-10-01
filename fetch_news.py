"""
fetch_news.py
Collects the latest college football headlines and saves them to news.js
for the home screen. Each headline keeps its source and links to the full
story on that site.

Run by the GitHub job every 2 hours. To run it yourself:
    python3 fetch_news.py
"""
import html
import json
import os
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

# (source name, feed address). If one feed fails, the others still work.
FEEDS = [
    ("ESPN", "https://www.espn.com/espn/rss/ncf/news"),
    ("Google News", "https://news.google.com/rss/search?q=%22college+football%22+when:3d&hl=en-US&gl=US&ceid=US:en"),
]
NEWS_FILE = "news.js"
PLAYERS_FILE = "players.js"

# Words that mean a story is about something else (other sports, lower divisions).
SKIP_WORDS = ["high school", "basketball", "baseball", "softball", "volleyball", "soccer",
              "hockey", "lacrosse", "wrestling", "division ii", "division iii", "d-ii", "d-iii",
              "naia", "juco", "junior college", "women's"]
# Big-picture topics that are always FBS football news.
TOPIC_WORDS = ["college football playoff", "cfp", "heisman", "ap top 25", "ap poll", "coaches poll",
               "sec", "big ten", "big 12", "acc", "pac-12", "mountain west", "sun belt",
               "american athletic", "conference usa", "mac", "transfer portal", "bowl"]
KEEP = 40               # how many headlines to save
MAX_AGE_DAYS = 4        # skip anything older than this


def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; GridironSaturday/1.0; +https://github.com)",
        "Accept": "application/rss+xml, application/xml, text/xml",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        if r.status != 200:
            raise ValueError(f"status {r.status}")
        return r.read()


def clean(text):
    text = html.unescape(text or "")
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", text).strip()


def to_epoch(date_text):
    try:
        return int(parsedate_to_datetime(date_text).timestamp())
    except (TypeError, ValueError):
        return 0


def parse(name, raw):
    root = ET.fromstring(raw)
    items = []
    for it in root.iter("item"):
        title = clean(it.findtext("title"))
        link = (it.findtext("link") or "").strip()
        when = to_epoch(it.findtext("pubDate"))
        source = name
        if name == "Google News":
            src = it.find("source")
            if src is not None and clean(src.text):
                source = clean(src.text)
                # Google adds " - Source Name" to the end of each title.
                suffix = " - " + source
                if title.endswith(suffix):
                    title = title[: -len(suffix)].strip()
        if title and link.startswith("http"):
            items.append({"t": title, "u": link, "s": source, "d": when})
    return items


def load_schools():
    """FBS school names from players.js, so news can be filtered to those schools."""
    try:
        text = open(PLAYERS_FILE, encoding="utf-8").read()
        data = json.loads(text[text.index("{"):].strip().rstrip(";"))
        return sorted({t["school"] for t in data.get("teams", []) if t.get("school")}, key=len, reverse=True)
    except (OSError, ValueError, KeyError):
        return []


def mentions(title, words):
    low = title.lower()
    return [w for w in words if re.search(r"(?<![a-z])" + re.escape(w.lower()) + r"(?![a-z])", low)]


def match_schools(title, schools):
    """Schools named in a title. Longer names go first and claim their words,
    so "North Texas" doesn't also count as "Texas"."""
    low, found = title.lower(), []
    for school in schools:  # already longest first
        pat = r"(?<![a-z])" + re.escape(school.lower()) + r"(?![a-z])"
        if re.search(pat, low):
            found.append(school)
            low = re.sub(pat, " " * len(school), low)
    return found


def key(title):
    return re.sub(r"[^a-z0-9]", "", title.lower())[:60]


def main():
    schools = load_schools()
    collected, seen = [], set()
    for name, url in FEEDS:
        try:
            got = parse(name, fetch(url))
            print(f"{name}: {len(got)} headlines")
        except Exception as e:  # a blocked or broken feed shouldn't stop the others
            print(f"{name}: skipped ({e})")
            continue
        for item in got:
            title = item["t"]
            if mentions(title, SKIP_WORDS):
                continue
            found = match_schools(title, schools) if schools else []
            # ESPN's feed is already FBS college football. Other sources must
            # mention an FBS school or a big college football topic.
            if name != "ESPN" and schools and not found and not mentions(title, TOPIC_WORDS):
                continue
            if found:
                item["sc"] = found[:4]
            k = key(item["t"])
            if k and k not in seen:
                seen.add(k)
                collected.append(item)

    cutoff = time.time() - MAX_AGE_DAYS * 86400
    fresh = [i for i in collected if i["d"] == 0 or i["d"] >= cutoff]
    fresh.sort(key=lambda i: i["d"], reverse=True)
    fresh = fresh[:KEEP]

    if not fresh:
        print("No headlines found, so news.js was left as it was.")
        return

    data = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "items": fresh}
    with open(NEWS_FILE, "w", encoding="utf-8") as f:
        f.write("// Made by fetch_news.py. Headlines link to the original stories.\n")
        f.write("const NEWS = " + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";\n")
    print(f"Saved {len(fresh)} headlines to {NEWS_FILE}")


if __name__ == "__main__":
    main()
