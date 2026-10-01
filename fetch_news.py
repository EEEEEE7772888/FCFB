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


def key(title):
    return re.sub(r"[^a-z0-9]", "", title.lower())[:60]


def main():
    collected, seen = [], set()
    for name, url in FEEDS:
        try:
            got = parse(name, fetch(url))
            print(f"{name}: {len(got)} headlines")
        except Exception as e:  # a blocked or broken feed shouldn't stop the others
            print(f"{name}: skipped ({e})")
            continue
        for item in got:
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
