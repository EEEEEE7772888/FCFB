'use strict';
/* =========================================================
   ENGINE — pure game logic (no DOM). Leagues, draft AI,
   lineups, weekly scoring, standings and playoffs.
   ========================================================= */

const STARTERS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DST'];
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
const ROSTER_MAX = 15;
const DRAFT_ROUNDS = 15;
const REG_WEEKS = 12;
const PLAYOFF_TEAMS = 4;
const FINAL_WEEK = REG_WEEKS + 2; // semifinal + championship
const LEAGUE_SIZES = [4, 6, 8, 10, 12];
const ELIG = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'], K: ['K'], DST: ['DST'],
  BN: ['QB', 'RB', 'WR', 'TE', 'K', 'DST'],
};
const REC_W = { ppr: 1, half: 0.5, std: 0 };
const SCORING_LABEL = { ppr: 'PPR', half: 'Half PPR', std: 'Standard' };
const CPU_TEAM_NAMES = ['Tailgate Titans', 'Heisman Hopefuls', 'Saturday Night Lights', 'Option Offense',
  'Red Zone Rebels', 'Hail Mary Heroes', 'Blitz Brigade', 'Pylon Punishers', 'Pick Six Posse',
  'Fourth and Forever', 'Bowl Eligible', 'Walk-On Wonders', 'Rivalry Week', 'Two-Point Tries'];

const PLAYERS = generatePlayers();
const PMAP = new Map(PLAYERS.map(p => [p.id, p]));
const CONF_MAP = new Map(CONFERENCES.map(c => [c.id, c]));

/* ---------- Real weekly stats (from stats.js) ---------- */
const HAS_REAL_STATS = typeof REAL_STATS !== 'undefined' && !!REAL_STATS && !!REAL_STATS.weeks &&
  typeof HAS_REAL_DATA !== 'undefined' && HAS_REAL_DATA;
const REAL_PLAYED = new Map(); // week -> schools that had a game
if (HAS_REAL_STATS && REAL_STATS.schedule) {
  for (const [w, teams] of Object.entries(REAL_STATS.schedule)) REAL_PLAYED.set(+w, new Set(teams));
}
function usesReal(lg) { return !!lg && lg.pointsFrom === 'real' && HAS_REAL_STATS; }
function weekReady(lg, w) {
  return !usesReal(lg) || (REAL_STATS.complete || []).includes(w);
}
function latestRealWeek() {
  const c = HAS_REAL_STATS ? (REAL_STATS.complete || []) : [];
  return c.length ? Math.max(...c) : 0;
}

/* ---------- Small utils ---------- */
const round1 = n => Math.round(n * 10) / 10;
const uid = () => Math.random().toString(36).slice(2, 10);
function shuffle(arr, r) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------- Pool & validation ---------- */
function poolStats(confIds) {
  const set = new Set(confIds);
  let schools = 0, players = 0;
  for (const id of confIds) { const c = CONF_MAP.get(id); if (c) schools += c.teams.length; }
  for (const p of PLAYERS) if (set.has(p.conf)) players++;
  return { schools, players };
}
// A league size works only if there are enough players to fill every
// roster (with a cushion for free agents) and one kicker/defense per team.
function sizeAllowed(confIds, size) {
  const s = poolStats(confIds);
  return s.schools >= size && s.players >= size * ROSTER_MAX * 1.15;
}

const POOL_CACHE = new Map();
function leaguePool(lg) {
  if (!POOL_CACHE.has(lg.id)) {
    const set = new Set(lg.conferences);
    POOL_CACHE.set(lg.id, PLAYERS.filter(p => set.has(p.conf)));
  }
  return POOL_CACHE.get(lg.id);
}

/* ---------- Projections & values ---------- */
function projPts(p, scoring) { return p.base + p.rec * REC_W[scoring]; }
function isBye(p, week) {
  const played = REAL_PLAYED.get(week);
  if (played) return !played.has(p.team);
  return week <= REG_WEEKS && p.bye === week;
}
function weekProj(lg, p, week) { return isBye(p, week) ? 0 : projPts(p, lg.scoring); }

function computeRepl(pool, size, scoring) {
  const SHARE = { QB: 1, RB: 2.5, WR: 2.5, TE: 1.1, K: 1, DST: 1 };
  const repl = {};
  for (const pos of POSITIONS) {
    const list = pool.filter(p => p.pos === pos).map(p => projPts(p, scoring)).sort((a, b) => b - a);
    const idx = Math.min(list.length - 1, Math.max(0, Math.round(size * SHARE[pos])));
    repl[pos] = list.length ? list[idx] : 0;
  }
  return repl;
}
function value(lg, p) { return projPts(p, lg.scoring) - lg.repl[p.pos]; }

const RANK_CACHE = new Map();
function rankedPool(lg) {
  if (!RANK_CACHE.has(lg.id)) {
    const sorted = leaguePool(lg).slice().sort((a, b) => value(lg, b) - value(lg, a));
    const ranks = new Map(sorted.map((p, i) => [p.id, i + 1]));
    RANK_CACHE.set(lg.id, { sorted, ranks });
  }
  return RANK_CACHE.get(lg.id);
}
function rankOf(lg, pid) { return rankedPool(lg).ranks.get(pid); }

/* ---------- Rosters ---------- */
function rosterOf(team) {
  return team.starters.filter(s => s.pid).map(s => s.pid).concat(team.bench);
}
function ownerMap(lg) {
  const m = new Map();
  lg.teams.forEach((t, i) => rosterOf(t).forEach(pid => m.set(pid, i)));
  return m;
}
function availablePlayers(lg) {
  const owned = ownerMap(lg);
  return rankedPool(lg).sorted.filter(p => !owned.has(p.id));
}
const FILL_ORDER = [...STARTERS.keys()].sort((a, b) => (STARTERS[a] === 'FLEX') - (STARTERS[b] === 'FLEX'));
function addToRoster(team, pid) {
  const p = PMAP.get(pid);
  for (const i of FILL_ORDER) {
    if (!team.starters[i].pid && ELIG[STARTERS[i]].includes(p.pos)) { team.starters[i].pid = pid; return; }
  }
  team.bench.push(pid);
}
function removeFromRoster(team, pid) {
  team.starters.forEach(s => { if (s.pid === pid) s.pid = null; });
  team.bench = team.bench.filter(x => x !== pid);
}
function autoLineup(lg, team, week) {
  const players = rosterOf(team).map(id => PMAP.get(id))
    .sort((a, b) => weekProj(lg, b, week) - weekProj(lg, a, week));
  const used = new Set();
  team.starters = STARTERS.map(s => ({ slot: s, pid: null }));
  for (const i of FILL_ORDER) {
    const p = players.find(x => !used.has(x.id) && ELIG[STARTERS[i]].includes(x.pos));
    if (p) { team.starters[i].pid = p.id; used.add(p.id); }
  }
  team.bench = players.filter(p => !used.has(p.id)).map(p => p.id);
}

/* ---------- League creation ---------- */
function makeSchedule(n, weeks, r) {
  const arr = shuffle([...Array(n).keys()], r);
  const rounds = [];
  for (let k = 0; k < n - 1; k++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      pairs.push(k % 2 ? [arr[n - 1 - i], arr[i]] : [arr[i], arr[n - 1 - i]]);
    }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop()); // circle method: fix first, rotate the rest
  }
  const out = [];
  for (let w = 0; w < weeks; w++) out.push(rounds[w % rounds.length]);
  return out;
}

function createLeague({ name, teamName, size, scoring, conferences, pointsFrom }) {
  const seed = uid() + Date.now().toString(36);
  const r = rngFor(seed, 'setup');
  const names = shuffle(CPU_TEAM_NAMES.slice(), r);
  const userSlot = Math.floor(r() * size); // your draft position
  const teams = [];
  let ni = 0;
  for (let i = 0; i < size; i++) {
    const isUser = i === userSlot;
    teams.push({
      id: i, name: isUser ? teamName : names[ni++], isUser,
      starters: STARTERS.map(s => ({ slot: s, pid: null })), bench: [],
      w: 0, l: 0, t: 0, pf: 0, pa: 0,
    });
  }
  const lg = {
    id: uid(), seed, name, size, scoring, conferences: conferences.slice(),
    created: Date.now(), phase: 'draft', week: 1, teams, picks: [],
    schedule: makeSchedule(size, REG_WEEKS, r), results: {}, seeds: null, champion: null,
    pointsFrom: pointsFrom === 'real' && HAS_REAL_STATS ? 'real' : 'sim',
  };
  lg.repl = computeRepl(leaguePool(lg), size, scoring);
  return lg;
}

/* ---------- Draft ---------- */
function totalPicks(lg) { return lg.size * DRAFT_ROUNDS; }
function teamAtPick(n, size) {
  const r = Math.floor(n / size), i = n % size;
  return r % 2 === 0 ? i : size - 1 - i; // snake
}
function onClock(lg) {
  const n = lg.picks.length;
  return n >= totalPicks(lg) ? -1 : teamAtPick(n, lg.size);
}
function pickInfo(n, size) { return { round: Math.floor(n / size) + 1, pick: (n % size) + 1, overall: n + 1 }; }
function userIdx(lg) { return lg.teams.findIndex(t => t.isUser); }
function picksUntilUser(lg) {
  const me = userIdx(lg);
  for (let n = lg.picks.length; n < totalPicks(lg); n++) {
    if (teamAtPick(n, lg.size) === me) return n - lg.picks.length;
  }
  return -1;
}
function makePick(lg, pid) {
  const ti = onClock(lg);
  if (ti < 0 || !pid || ownerMap(lg).has(pid)) return false;
  lg.picks.push({ ti, pid });
  addToRoster(lg.teams[ti], pid);
  if (lg.picks.length >= totalPicks(lg)) finishDraft(lg);
  return true;
}
function finishDraft(lg) {
  lg.phase = 'season';
  lg.week = 1;
  lg.teams.forEach(t => autoLineup(lg, t, 1));
}
// Draft AI: best value available, nudged toward open starting spots,
// with kickers/defenses saved for the last rounds.
function cpuChoice(lg, ti) {
  const team = lg.teams[ti];
  const avail = availablePlayers(lg);
  const roster = rosterOf(team).map(id => PMAP.get(id));
  const cnt = {};
  roster.forEach(p => { cnt[p.pos] = (cnt[p.pos] || 0) + 1; });
  const c = pos => cnt[pos] || 0;
  const NEED = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 };
  const CAP = { QB: 3, RB: 6, WR: 7, TE: 3, K: 1, DST: 1 };
  const round = Math.floor(lg.picks.length / lg.size) + 1;
  const picksLeft = DRAFT_ROUNDS - roster.length;
  const unmet = POSITIONS.reduce((s, pos) => s + Math.max(0, NEED[pos] - c(pos)), 0);

  let cands = avail.filter(p => c(p.pos) < CAP[p.pos]);
  if (picksLeft <= unmet) {
    const must = cands.filter(p => c(p.pos) < NEED[p.pos]);
    if (must.length) cands = must;
  } else if (round <= DRAFT_ROUNDS - 4) {
    const noKD = cands.filter(p => p.pos !== 'K' && p.pos !== 'DST');
    if (noKD.length) cands = noKD;
  }
  if (!cands.length) cands = avail;
  const r = rngFor(lg.seed, 'pick', lg.picks.length);
  let best = null, bs = -Infinity;
  for (const p of cands.slice(0, 80)) {
    let s = value(lg, p) + (r() - 0.5) * 3.5;
    if (c(p.pos) < NEED[p.pos]) s += 1.5;
    if ((p.pos === 'QB' || p.pos === 'TE') && c(p.pos) >= 1 && round < 10) s -= 5;
    if (s > bs) { bs = s; best = p; }
  }
  return best ? best.id : null;
}

/* ---------- Weekly scoring ---------- */
/* Real points: [passYds, passTD, INT, rushYds, rushTD, rec, recYds, recTD, fumblesLost, FG, XP]
   Defense: [pointsAllowed, sacks, INT, defensiveTD] */
function realLine(p, week) {
  const wk = HAS_REAL_STATS && REAL_STATS.weeks[week];
  if (!wk) return null;
  if (p.pos === 'DST') return (wk.dst && wk.dst[p.team]) || null;
  return (wk.players && wk.players[String(p.id).slice(1)]) || null;
}
function dstAllowedPts(pa) {
  return pa === 0 ? 10 : pa <= 6 ? 7 : pa <= 13 ? 4 : pa <= 20 ? 1 : pa <= 27 ? 0 : pa <= 34 ? -1 : -4;
}
function realPts(lg, p, week) {
  const s = realLine(p, week);
  if (!s) return 0;
  if (p.pos === 'DST') {
    const [pa, sacks, ints, td] = s;
    return round1(dstAllowedPts(pa) + sacks + ints * 2 + td * 6);
  }
  const [py, ptd, int, ry, rtd, rec, recy, rectd, fl, fgm, xpm] = s;
  return round1(py / 25 + ptd * 4 - int * 2 + ry / 10 + rtd * 6 + recy / 10 + rectd * 6
    - fl * 2 + fgm * 3 + xpm + rec * REC_W[lg.scoring]);
}
function realStatLine(p, week) {
  const s = realLine(p, week);
  if (!s) return 'No stats';
  if (p.pos === 'DST') return `${s[0]} pts allowed, ${s[1]} sacks, ${s[2]} INT${s[3] ? `, ${s[3]} TD` : ''}`;
  const [py, ptd, int, ry, rtd, rec, recy, rectd, , fgm, xpm] = s;
  if (p.pos === 'QB') return `${py} pass yds, ${ptd} TD, ${int} INT, ${ry} rush yds`;
  if (p.pos === 'RB') return `${ry} rush yds, ${rtd + rectd} TD, ${rec} rec, ${recy} rec yds`;
  if (p.pos === 'K') return `${fgm} FG, ${xpm} XP`;
  return `${rec} rec, ${recy} yds, ${rectd} TD`;
}

function weekPts(lg, p, week) {
  if (isBye(p, week)) return 0;
  if (usesReal(lg)) return realPts(lg, p, week);
  const r = rngFor(lg.seed, p.id, week);
  const x = r();
  let f;
  if (p.pos === 'K' || p.pos === 'DST') f = 0.35 + r() * 1.3;
  else if (x < 0.12) f = 0.15 + r() * 0.4;      // off day
  else if (x > 0.88) f = 1.4 + r() * 0.9;       // breakout game
  else f = 0.65 + r() * 0.7;
  let pts = projPts(p, lg.scoring) * f;
  if (p.pos === 'DST' && r() < 0.12) pts -= 3 + r() * 3; // got torched
  return round1(pts);
}
// A believable (not exact) box-score line for flavor.
function statLine(lg, p, week, pts) {
  if (isBye(p, week)) return 'Bye week';
  if (usesReal(lg)) return realStatLine(p, week);
  const r = rngFor(lg.seed, p.id, week, 'stat');
  const ratio = pts / Math.max(1, projPts(p, lg.scoring));
  if (p.pos === 'QB') {
    const td = Math.max(0, Math.floor(pts / 7.5));
    const ry = Math.round(r() * Math.min(70, Math.max(0, pts) * 3));
    const py = Math.max(0, Math.round((pts - td * 4 - ry / 10) * 25));
    return `${py} pass yds, ${td} TD, ${ry} rush yds`;
  }
  if (p.pos === 'RB' || p.pos === 'WR' || p.pos === 'TE') {
    const rec = Math.max(0, Math.round(p.rec * ratio * (0.7 + r() * 0.6)));
    const rest = pts - rec * REC_W[lg.scoring];
    const td = Math.max(0, Math.floor(rest / 13));
    const yds = Math.max(0, Math.round((rest - td * 6) * 10));
    return p.pos === 'RB' ? `${yds} yds, ${td} TD, ${rec} rec` : `${rec} rec, ${yds} yds, ${td} TD`;
  }
  if (p.pos === 'K') {
    const fg = Math.max(0, Math.floor(pts / 3.6));
    const xp = Math.max(0, Math.round(pts - fg * 3));
    return `${fg} FG, ${xp} XP`;
  }
  return `${Math.floor(r() * 5)} sacks, ${Math.floor(r() * 3)} INT`;
}

/* ---------- Season ---------- */
function gamesForWeek(lg, w) {
  if (w <= REG_WEEKS) return lg.schedule[w - 1] || [];
  if (!lg.seeds) return [];
  const s = lg.seeds;
  if (w === REG_WEEKS + 1) return [[s[0], s[3]], [s[1], s[2]]];
  if (w === REG_WEEKS + 2) {
    const semis = lg.results[REG_WEEKS + 1];
    return semis ? [[semis[0].winner, semis[1].winner]] : [];
  }
  return [];
}
function scoreTeam(lg, ti, w) {
  const lines = lg.teams[ti].starters.map(s => ({
    slot: s.slot, pid: s.pid, pts: s.pid ? weekPts(lg, PMAP.get(s.pid), w) : 0,
  }));
  return { lines, total: round1(lines.reduce((a, l) => a + l.pts, 0)) };
}
function standings(lg) {
  return lg.teams.slice().sort((a, b) => ((b.w + b.t * 0.5) - (a.w + a.t * 0.5)) || (b.pf - a.pf));
}
function playWeek(lg) {
  if (lg.phase === 'draft' || lg.phase === 'done') return null;
  const w = lg.week;
  if (!weekReady(lg, w)) return null;
  lg.teams.forEach(t => { if (!t.isUser) autoLineup(lg, t, w); });
  const games = gamesForWeek(lg, w);
  lg.results[w] = games.map(([a, b]) => {
    const A = scoreTeam(lg, a, w), B = scoreTeam(lg, b, w);
    let winner = A.total > B.total ? a : B.total > A.total ? b : null;
    if (w > REG_WEEKS && winner === null) winner = lg.seeds.indexOf(a) < lg.seeds.indexOf(b) ? a : b;
    return { a, b, as: A.total, bs: B.total, al: A.lines, bl: B.lines, winner };
  });
  if (w <= REG_WEEKS) {
    for (const g of lg.results[w]) {
      const ta = lg.teams[g.a], tb = lg.teams[g.b];
      ta.pf = round1(ta.pf + g.as); ta.pa = round1(ta.pa + g.bs);
      tb.pf = round1(tb.pf + g.bs); tb.pa = round1(tb.pa + g.as);
      if (g.winner === g.a) { ta.w++; tb.l++; }
      else if (g.winner === g.b) { tb.w++; ta.l++; }
      else { ta.t++; tb.t++; }
    }
  }
  if (w === REG_WEEKS) {
    lg.seeds = standings(lg).slice(0, PLAYOFF_TEAMS).map(t => t.id);
    lg.phase = 'playoffs';
  }
  if (w === FINAL_WEEK) {
    lg.champion = lg.results[w][0].winner;
    lg.phase = 'done';
  } else {
    lg.week = w + 1;
  }
  return lg.results[w];
}
function lastPlayedWeek(lg) {
  const ks = Object.keys(lg.results).map(Number);
  return ks.length ? Math.max(...ks) : 0;
}
function seasonPts(lg, p) {
  let s = 0;
  const last = lastPlayedWeek(lg);
  for (let w = 1; w <= last; w++) s += weekPts(lg, p, w);
  return round1(s);
}
function weekLabel(w) {
  if (w <= REG_WEEKS) return 'Week ' + w;
  return w === REG_WEEKS + 1 ? 'Semifinals' : 'Championship';
}
