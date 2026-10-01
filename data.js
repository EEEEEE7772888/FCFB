'use strict';
/* =========================================================
   DATA — conferences, schools, and a generated player pool.
   Conference lineups reflect the 2026 season as best known;
   edit the `teams` arrays to update them.
   Players are fictional, generated from a fixed seed so every
   visit produces the same pool.
   ========================================================= */

/* ---------- Seeded random helpers ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngFor(...parts) { return mulberry32(hashStr(parts.join('|'))); }

/* ---------- Conferences ---------- */
const CONFERENCES = [
  { id: 'SEC', name: 'SEC', short: 'SEC', group: 'Power 4', color: '#2b59c3', strength: 1.08,
    teams: ['Alabama', 'Arkansas', 'Auburn', 'Florida', 'Georgia', 'Kentucky', 'LSU', 'Mississippi State', 'Missouri', 'Oklahoma', 'Ole Miss', 'South Carolina', 'Tennessee', 'Texas', 'Texas A&M', 'Vanderbilt'] },
  { id: 'BIG10', name: 'Big Ten', short: 'Big Ten', group: 'Power 4', color: '#0f766e', strength: 1.06,
    teams: ['Illinois', 'Indiana', 'Iowa', 'Maryland', 'Michigan', 'Michigan State', 'Minnesota', 'Nebraska', 'Northwestern', 'Ohio State', 'Oregon', 'Penn State', 'Purdue', 'Rutgers', 'UCLA', 'USC', 'Washington', 'Wisconsin'] },
  { id: 'BIG12', name: 'Big 12', short: 'Big 12', group: 'Power 4', color: '#c2410c', strength: 1.0,
    teams: ['Arizona', 'Arizona State', 'Baylor', 'BYU', 'Cincinnati', 'Colorado', 'Houston', 'Iowa State', 'Kansas', 'Kansas State', 'Oklahoma State', 'TCU', 'Texas Tech', 'UCF', 'Utah', 'West Virginia'] },
  { id: 'ACC', name: 'ACC', short: 'ACC', group: 'Power 4', color: '#7c3aed', strength: 0.98,
    teams: ['Boston College', 'California', 'Clemson', 'Duke', 'Florida State', 'Georgia Tech', 'Louisville', 'Miami', 'NC State', 'North Carolina', 'Pittsburgh', 'SMU', 'Stanford', 'Syracuse', 'Virginia', 'Virginia Tech', 'Wake Forest'] },
  { id: 'AAC', name: 'American', short: 'American', group: 'Group of 6', color: '#be123c', strength: 0.92,
    teams: ['Army', 'Charlotte', 'East Carolina', 'Florida Atlantic', 'Memphis', 'Navy', 'North Texas', 'Rice', 'South Florida', 'Temple', 'Tulane', 'Tulsa', 'UAB', 'UTSA'] },
  { id: 'MWC', name: 'Mountain West', short: 'Mtn West', group: 'Group of 6', color: '#64748b', strength: 0.88,
    teams: ['Air Force', 'Hawaii', 'Nevada', 'New Mexico', 'Northern Illinois', 'San Jose State', 'UNLV', 'UTEP', 'Wyoming'] },
  { id: 'PAC12', name: 'Pac-12', short: 'Pac-12', group: 'Group of 6', color: '#0891b2', strength: 0.9,
    teams: ['Boise State', 'Colorado State', 'Fresno State', 'Oregon State', 'San Diego State', 'Texas State', 'Utah State', 'Washington State'] },
  { id: 'SBC', name: 'Sun Belt', short: 'Sun Belt', group: 'Group of 6', color: '#ca8a04', strength: 0.9,
    teams: ['Appalachian State', 'Arkansas State', 'Coastal Carolina', 'Georgia Southern', 'Georgia State', 'James Madison', 'Louisiana', 'Louisiana Tech', 'Marshall', 'Old Dominion', 'South Alabama', 'Southern Miss', 'Troy', 'UL Monroe'] },
  { id: 'MAC', name: 'MAC', short: 'MAC', group: 'Group of 6', color: '#15803d', strength: 0.84,
    teams: ['Akron', 'Ball State', 'Bowling Green', 'Buffalo', 'Central Michigan', 'Eastern Michigan', 'Kent State', 'Miami (OH)', 'Ohio', 'Sacramento State', 'Toledo', 'UMass', 'Western Michigan'] },
  { id: 'CUSA', name: 'Conference USA', short: 'C-USA', group: 'Group of 6', color: '#db2777', strength: 0.85,
    teams: ['Delaware', 'FIU', 'Jacksonville State', 'Kennesaw State', 'Liberty', 'Middle Tennessee', 'Missouri State', 'New Mexico State', 'Sam Houston', 'Western Kentucky'] },
  { id: 'IND', name: 'Independents', short: 'Indep.', group: 'Independent', color: '#475569', strength: 1.0,
    teams: ['Notre Dame', 'UConn'] },
];
const CONF_GROUPS = ['Power 4', 'Group of 6', 'Independent'];

/* ---------- Depth chart template (per school) ----------
   base = non-reception fantasy points per game
   rec  = receptions per game (worth 1 / 0.5 / 0 depending on scoring) */
const ROLE_TEMPLATE = {
  QB:  [{ base: 19 }, { base: 4.5 }],
  RB:  [{ base: 11, rec: 2.4 }, { base: 6.5, rec: 1.4 }, { base: 3, rec: 0.6 }],
  WR:  [{ base: 9, rec: 5.6 }, { base: 6.8, rec: 4.3 }, { base: 4.5, rec: 3 }, { base: 2.4, rec: 1.7 }, { base: 1.2, rec: 0.8 }],
  TE:  [{ base: 4.8, rec: 3.2 }, { base: 1.6, rec: 1 }],
  K:   [{ base: 7.8 }],
  DST: [{ base: 6.8 }],
};
const PLAYERS_PER_TEAM = Object.values(ROLE_TEMPLATE).reduce((s, r) => s + r.length, 0);

const FIRST_NAMES = ['Jalen', 'Marcus', 'Tyler', 'Caleb', 'Darius', 'Brandon', 'Jaylen', 'Cameron', 'Isaiah', 'Malik',
  'Trey', 'Devin', 'Jordan', 'Austin', 'Xavier', 'Carson', 'Kendrick', 'Elijah', 'Micah', 'Jaxon',
  'Quinn', 'Drew', 'Bryce', 'Tavion', 'Kaden', 'Ryder', 'Chase', 'Nico', 'Terrance', 'Andre',
  'Jamal', 'Keon', 'Landon', 'Mason', 'Dillon', 'Reggie', 'Tyson', 'Brady', 'Cole', 'Garrett',
  'Hunter', 'Jace', 'Luke', 'Owen', 'Preston', 'Rashad', 'Solomon', 'Tobias', 'Vincent', 'Wes',
  'Xander', 'Amari', 'Bo', 'Cade', 'Dante', 'Emmanuel', 'Fabian', 'Gavin', 'Hayden', 'Jonah',
  'Kobe', 'Lamar', 'Marquise', 'Nate', 'Omar', 'Percy', 'Roman', 'Silas', 'Trevon', 'Ty'];
const LAST_NAMES = ['Johnson', 'Williams', 'Brooks', 'Carter', 'Davis', 'Ellis', 'Foster', 'Green', 'Harris', 'Irving',
  'Jackson', 'King', 'Lewis', 'Mitchell', 'Nelson', 'Owens', 'Parker', 'Reed', 'Simmons', 'Thomas',
  'Tucker', 'Walker', 'Young', 'Bennett', 'Coleman', 'Dawson', 'Fletcher', 'Grant', 'Hayes', 'Jenkins',
  'Kelly', 'Lawson', 'Maddox', 'Norris', 'Patterson', 'Quarles', 'Rivers', 'Sanders', 'Tate', 'Underwood',
  'Vaughn', 'Wallace', 'Whitaker', 'Bishop', 'Crawford', 'Dixon', 'Everett', 'Franklin', 'Gibson', 'Holloway',
  'Ingram', 'Jefferson', 'Knox', 'Lockett', 'Monroe', 'Newsome', 'Oliver', 'Pryor', 'Redmond', 'Sutton',
  'Townsend', 'Upshaw', 'Vance', 'Warren', 'Barnes', 'Cooper', 'Drake', 'Fields', 'Hughes', 'Lyons',
  'Marsh', 'Nash', 'Pierce', 'Rhodes', 'Shaw', 'Stokes', 'Terrell', 'Webb', 'Wilder', 'Boone',
  'Calloway', 'Dunn', 'Frost', 'Hale', 'Keller', 'Mercer', 'Pruitt', 'Sloan', 'Tillman', 'Wade'];

/* ---------- Made-up player generator (used when players.js is missing) ---------- */
function generateFakePlayers() {
  const rng = mulberry32(20260901);
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const years = ['FR', 'SO', 'JR', 'SR'];
  const usedNames = new Set();
  const newName = () => {
    let nm;
    do { nm = pick(FIRST_NAMES) + ' ' + pick(LAST_NAMES); } while (usedNames.has(nm));
    usedNames.add(nm);
    return nm;
  };
  const players = [];
  let n = 0;
  for (const conf of CONFERENCES) {
    for (const team of conf.teams) {
      const teamFactor = conf.strength * (0.78 + rng() * 0.44);
      const bye = 3 + Math.floor(rng() * 9); // weeks 3–11
      for (const [pos, roles] of Object.entries(ROLE_TEMPLATE)) {
        roles.forEach((role, i) => {
          const v = 0.82 + rng() * 0.36;
          const isD = pos === 'DST';
          players.push({
            id: 'p' + (n++),
            name: isD ? team + ' D/ST' : newName(),
            pos, team, conf: conf.id, bye, depth: i + 1,
            year: isD ? '' : pick(years),
            num: isD ? '' : 1 + Math.floor(rng() * 99),
            base: +(role.base * teamFactor * v).toFixed(2),
            rec: +((role.rec || 0) * teamFactor * v).toFixed(2),
          });
        });
      }
    }
  }
  return players;
}

/* =========================================================
   REAL PLAYERS — used when players.js (made by
   fetch_players.py) is loaded before this file.
   ========================================================= */
const HAS_REAL_DATA = typeof REAL_DATA !== 'undefined' && REAL_DATA && Array.isArray(REAL_DATA.players);

if (HAS_REAL_DATA) {
  // Rebuild each conference's school list from the real data.
  for (const conf of CONFERENCES) {
    conf.teams = REAL_DATA.teams.filter(t => t.conf === conf.id).map(t => t.school).sort();
  }
  // Hide conferences that came back empty.
  const kept = CONFERENCES.filter(c => c.teams.length > 0);
  CONFERENCES.splice(0, CONFERENCES.length, ...kept);

  // Leagues drafted with the made-up players can't load real ones,
  // so clear them once when switching over.
  try {
    if (localStorage.getItem('gs-player-source') !== 'real') {
      localStorage.removeItem('gridiron-saturday-v1');
      localStorage.setItem('gs-player-source', 'real');
    }
  } catch (e) { /* storage unavailable */ }
}

function generatePlayers() {
  if (!HAS_REAL_DATA) return generateFakePlayers();
  const players = REAL_DATA.players.map(p => ({
    id: p.id, name: p.name, pos: p.pos, team: p.team, conf: p.conf,
    bye: p.bye || 0, depth: 1, year: p.year || '', num: p.num || '',
    base: +p.base || 0, rec: +p.rec || 0,
  }));
  // One defense per school. Real defensive stats can come later;
  // for now its projection is based on conference strength.
  const byes = {};
  players.forEach(p => { byes[p.team] = p.bye; });
  for (const conf of CONFERENCES) {
    for (const team of conf.teams) {
      players.push({
        id: 'dst-' + team, name: team + ' D/ST', pos: 'DST', team, conf: conf.id,
        bye: byes[team] || 0, depth: 1, year: '', num: '',
        base: +(6.8 * conf.strength).toFixed(2), rec: 0,
      });
    }
  }
  return players;
}
