# Gridiron Saturday

College fantasy football. Pick your conferences, draft real players, and score points from real games.

This site updates itself every day: GitHub downloads the latest rosters and box scores from CollegeFootballData.com and republishes the site.

- `index.html`, `style.css`, `data.js`, `engine.js`, `app.js`: the app
- `fetch_players.py`: downloads real players and projections into `players.js`
- `fetch_stats.py`: downloads weekly box scores into `stats.js`
- `.github/workflows/update.yml`: the daily automatic update

Leagues are saved in each person's browser.
