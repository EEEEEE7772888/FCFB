"""
fetch_stats.py
Downloads real box scores for each week of the season from
CollegeFootballData.com and saves them to stats.js, so real games
give real fantasy points.

Run it in the Replit Shell after each weekend of games:
    python3 fetch_stats.py

Weeks that are already finished and saved are skipped, so it only
uses a few API calls each time.
"""
import json
import os
import sys
from datetime import date

from fetch_players import SEASON, get, pick, num

LAST_WEEK = 14
STATS_FILE = "stats.js"
PREFIX = "const REAL_STATS = "

# (category, stat type) -> slot in each player's stat list
FIELD = {
    ("passing", "YDS"): 0, ("passing", "TD"): 1, ("passing", "INT"): 2,
    ("rushing", "YDS"): 3, ("rushing", "TD"): 4,
    ("receiving", "REC"): 5, ("receiving", "YDS"): 6, ("receiving", "TD"): 7,
    ("fumbles", "LOST"): 8,
    ("kicking", "FG"): 9, ("kicking", "XP"): 10,
}


def stat_value(raw):
    """Turns '12', '2/3' (made/attempted) or '--' into a number."""
    s = str(raw)
    if "/" in s:
        s = s.split("/")[0]
    return num(s)


def tidy(v):
    return int(v) if float(v).is_integer() else round(v, 1)


def load_existing():
    if not os.path.exists(STATS_FILE):
        return {}
    try:
        text = open(STATS_FILE, encoding="utf-8").read()
        start = text.index(PREFIX) + len(PREFIX)
        return json.loads(text[start:].strip().rstrip(";"))
    except (ValueError, OSError):
        return {}


def parse_week(box):
    players, dst = {}, {}
    for game in box:
        teams = pick(game, "teams", default=[]) or []
        points = {pick(t, "team", "school"): num(pick(t, "points", default=0)) for t in teams}
        for t in teams:
            team = pick(t, "team", "school")
            if not team:
                continue
            opp = next((n for n in points if n != team), None)
            sacks = ints = def_td = int_td = 0.0
            for cat in pick(t, "categories", default=[]) or []:
                cname = str(pick(cat, "name", default="")).lower()
                for typ in pick(cat, "types", default=[]) or []:
                    tname = str(pick(typ, "name", default="")).upper()
                    for a in pick(typ, "athletes", default=[]) or []:
                        val = stat_value(pick(a, "stat", default=0))
                        if cname == "defensive" and tname == "SACKS":
                            sacks += val
                        elif cname == "defensive" and tname == "TD":
                            def_td += val
                        elif cname == "interceptions" and tname == "INT":
                            ints += val
                        elif cname == "interceptions" and tname == "TD":
                            int_td += val
                        slot = FIELD.get((cname, tname))
                        aid = str(pick(a, "id", default=""))
                        if slot is None or not aid or aid.startswith("-"):
                            continue  # skip team totals
                        players.setdefault(aid, [0.0] * len(FIELD))[slot] += val
            dst[team] = [tidy(points.get(opp, 0)), tidy(sacks), tidy(ints), tidy(max(def_td, int_td))]
    return {
        "players": {pid: [tidy(v) for v in vals] for pid, vals in players.items()},
        "dst": dst,
    }


def main():
    print(f"Checking the {SEASON} schedule...")
    games = get("/games", year=SEASON, seasonType="regular")
    schedule, total, finished = {}, {}, {}
    for g in games:
        wk = int(num(pick(g, "week", default=0)))
        if wk < 1 or wk > LAST_WEEK:
            continue
        for side in ("homeTeam", "awayTeam"):
            name = pick(g, side, side.replace("Team", "_team"))
            if name:
                schedule.setdefault(wk, set()).add(name)
        total[wk] = total.get(wk, 0) + 1
        if pick(g, "completed", default=False):
            finished[wk] = finished.get(wk, 0) + 1

    # A week counts as finished when all its games are done, or when a later
    # week has games done too (so one postponed game can't hold a week up).
    last_played = max((w for w in finished if finished[w]), default=0)
    complete = sorted(w for w in total
                      if finished.get(w, 0) == total[w] or (finished.get(w, 0) and w < last_played))
    old = load_existing()
    weeks = old.get("weeks", {})
    already = set(old.get("complete", []))

    for w in range(1, LAST_WEEK + 1):
        if not finished.get(w):
            continue  # no games finished yet
        if w in already and str(w) in weeks:
            print(f"Week {w}: already saved")
            continue
        print(f"Week {w}: downloading box scores...")
        weeks[str(w)] = parse_week(get("/games/players", year=SEASON, week=w, seasonType="regular"))

    data = {
        "season": SEASON,
        "updated": date.today().isoformat(),
        "complete": complete,
        "schedule": {str(w): sorted(t) for w, t in sorted(schedule.items())},
        "weeks": weeks,
    }
    with open(STATS_FILE, "w", encoding="utf-8") as f:
        f.write(f"// Made by fetch_stats.py on {data['updated']}. Run it again after each weekend.\n")
        f.write(PREFIX + json.dumps(data, separators=(",", ":")) + ";\n")

    done = ", ".join(str(w) for w in complete) or "none yet"
    print(f"Done! Finished weeks saved: {done}")


if __name__ == "__main__":
    main()
