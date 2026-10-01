# Gridiron Saturday

College fantasy football. Pick your conferences, draft real players, and score points from real games.

This site updates itself every day: GitHub downloads the latest rosters and box scores from CollegeFootballData.com and republishes the site.

- `index.html`, `style.css`, `data.js`, `engine.js`, `app.js`: the app
- `fetch_players.py`: downloads real players and projections into `players.js`
- `fetch_stats.py`: downloads weekly box scores into `stats.js`
- `.github/workflows/update.yml`: the daily automatic update

- `store.js`: saves leagues online with Firebase (or on the device if Firebase isn't set up)
- `firebase-config.js`: your Firebase project's settings
- `firestore.rules`: the database security rules (paste these into Firebase)

Sign in with Google or email to keep leagues on every device. Create a league "with friends" to get an invite link. Drafts can be live (with a pick timer) or take turns.
