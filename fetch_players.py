"""
fetch_players.py
Pulls real FBS teams, rosters, and this season's stats from
CollegeFootballData.com and writes them to players.js for the app.

How to run (in the Replit Shell):
    python3 fetch_players.py

Needs a free API key saved in Replit Secrets as CFBD_API_KEY.
Uses about 4 API calls each time you run it.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

SEASON = 2026
API = "https://api.collegefootballdata.com"

# CFBD conference names -> the app's conference ids
CONF_IDS = {
    "SEC": "SEC",
    "Big Ten": "BIG10",
    "Big 12": "BIG12",
    "ACC": "ACC",
    "American Athletic": "AAC",
    "American": "AAC",
    "Mountain West": "MWC",
    "Pac-12": "PAC12",
    "Sun Belt": "SBC",
    "Mid-American": "MAC",
    "Conference USA": "CUSA",
    "FBS Independents": "IND",
}
FANTASY_POS = {"QB": "QB", "RB": "RB", "FB": "RB", "WR": "WR", "TE": "TE", "PK": "K", "K": "K"}
CLASS_YEAR = {1: "FR", 2: "SO", 3: "JR", 4: "SR", 5: "SR"}


def get(path, **params):
    key = os.environ.get("CFBD_API_KEY", "").strip()
    if not key:
        sys.exit("No API key found. Add a Secret named CFBD_API_KEY in Replit (Tools > Secrets), then run this again.")
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            sys.exit("The API key was rejected. Check that the CFBD_API_KEY secret matches the key from your email.")
        if e.code == 429:
            sys.exit("Too many requests to the API. Wait a while and try again.")
        sys.exit(f"The API returned error {e.code} for {path}.")
    except urllib.error.URLError as e:
        sys.exit(f"Couldn't reach the API ({e.reason}). Check your internet connection.")


def pick(d, *names, default=None):
    """Read a field that might be camelCase or snake_case."""
    for n in names:
        if n in d and d[n] is not None:
            return d[n]
    return default


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def build(teams_raw, roster_raw, stats_raw, games_raw):
    # ----- Teams -----
    teams, team_conf = [], {}
    for t in teams_raw:
        school = pick(t, "school")
        conf = CONF_IDS.get(pick(t, "conference", default=""))
        if not school or not conf:
            continue
        color = pick(t, "color", default="") or ""
        teams.append({"school": school, "conf": conf, "color": color if color.startswith("#") else ""})
        team_conf[school] = conf

    # ----- Games played and bye weeks -----
    played = {s: 0 for s in team_conf}
    weeks = {s: set() for s in team_conf}
    for g in games_raw:
        home = pick(g, "homeTeam", "home_team")
        away = pick(g, "awayTeam", "away_team")
        wk = int(num(pick(g, "week", default=0)))
        done = bool(pick(g, "completed", default=False))
        for s in (home, away):
            if s in team_conf:
                weeks[s].add(wk)
                if done:
                    played[s] += 1
    byes = {}
    for s in team_conf:
        byes[s] = next((w for w in range(3, 13) if w not in weeks[s]), 0)

    # ----- Season stat totals per player -----
    totals = {}
    for row in stats_raw:
        pid = str(pick(row, "playerId", "player_id", default=""))
        if not pid:
            continue
        cat = str(pick(row, "category", default="")).lower()
        stype = str(pick(row, "statType", "stat_type", default="")).upper()
        totals.setdefault(pid, {})[f"{cat}.{stype}"] = num(pick(row, "stat", default=0))

    def fantasy(s):
        g = lambda k: s.get(k, 0.0)
        base = (g("passing.YDS") / 25 + g("passing.TD") * 4 - g("passing.INT") * 2
                + g("rushing.YDS") / 10 + g("rushing.TD") * 6
                + g("receiving.YDS") / 10 + g("receiving.TD") * 6
                - g("fumbles.LOST") * 2
                + g("kicking.FGM") * 3 + g("kicking.XPM"))
        return base, g("receiving.REC")

    # ----- Roster -> players -----
    players = []
    for p in roster_raw:
        team = pick(p, "team")
        pos = FANTASY_POS.get(str(pick(p, "position", default="")).upper())
        if team not in team_conf or not pos:
            continue
        pid = str(pick(p, "id", default=""))
        stats = totals.get(pid)
        if not stats:
            continue  # only players who have recorded stats this season
        base, rec = fantasy(stats)
        gp = max(1, played.get(team, 0))
        first = str(pick(p, "firstName", "first_name", default="")).strip()
        last = str(pick(p, "lastName", "last_name", default="")).strip()
        name = f"{first} {last}".strip()
        if not name:
            continue
        players.append({
            "id": "r" + pid,
            "name": name,
            "pos": pos,
            "team": team,
            "conf": team_conf[team],
            "bye": byes.get(team, 0),
            "year": CLASS_YEAR.get(int(num(pick(p, "year", default=0))), ""),
            "num": pick(p, "jersey", default="") or "",
            "base": round(max(0.0, base) / gp, 2),
            "rec": round(rec / gp, 2),
        })
    return teams, players


def main():
    print(f"Getting {SEASON} FBS teams...")
    teams_raw = get("/teams/fbs", year=SEASON)
    print("Getting rosters (this one can take a minute)...")
    roster_raw = get("/roster", year=SEASON)
    print("Getting season stats...")
    stats_raw = get("/stats/player/season", year=SEASON)
    print("Getting the schedule...")
    games_raw = get("/games", year=SEASON, seasonType="regular")

    teams, players = build(teams_raw, roster_raw, stats_raw, games_raw)
    if not teams or not players:
        sys.exit(f"Got {len(teams)} teams and {len(players)} players, which is too few. Nothing was saved.")

    data = {"season": SEASON, "updated": date.today().isoformat(), "teams": teams, "players": players}
    with open("players.js", "w", encoding="utf-8") as f:
        f.write(f"// Made by fetch_players.py on {data['updated']}. Run it again to refresh.\n")
        f.write("const REAL_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n")

    by_pos = {}
    for p in players:
        by_pos[p["pos"]] = by_pos.get(p["pos"], 0) + 1
    print(f"Done! Saved {len(players)} players from {len(teams)} schools to players.js")
    print("By position:", ", ".join(f"{k} {v}" for k, v in sorted(by_pos.items())))


if __name__ == "__main__":
    main()
