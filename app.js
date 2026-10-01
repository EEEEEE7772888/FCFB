'use strict';
/* =========================================================
   APP — screens, events, and saving to the browser.
   ========================================================= */

const STORE_KEY = 'gridiron-saturday-v1';
let DB = loadDB();
const UI = {
  view: 'home', tab: 'team', dtab: 'players',
  f: { pos: 'ALL', conf: 'ALL', q: '', sort: 'proj' },
  move: null, modal: null, week: null, game: null, paused: false, create: null,
};
let draftTimer = null;

function loadDB() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.leagues)) return d;
    }
  } catch (e) { /* storage unavailable */ }
  return { leagues: [], activeId: null };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) { /* ignore */ }
}
function activeLeague() { return DB.leagues.find(l => l.id === DB.activeId) || null; }

/* ---------- Formatting helpers ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (Math.round(n * 10) / 10).toFixed(1);
const posLabel = pos => (pos === 'DST' ? 'D/ST' : pos);
function shortName(p) {
  if (p.pos === 'DST') return p.team + ' D/ST';
  const [f, ...rest] = p.name.split(' ');
  return f[0] + '. ' + rest.join(' ');
}
function confShort(id) { return CONF_MAP.get(id).short; }
function posBadge(pos) { return `<span class="pos pos-${pos}">${posLabel(pos)}</span>`; }
function record(t) { return `${t.w}-${t.l}${t.t ? '-' + t.t : ''}`; }
function confsLabel(ids) {
  if (ids.length === CONFERENCES.length) return 'All conferences';
  const p4 = CONFERENCES.filter(c => c.group === 'Power 4').map(c => c.id);
  if (ids.length === p4.length && p4.every(id => ids.includes(id))) return 'Power 4';
  if (ids.length <= 3) return ids.map(confShort).join(', ');
  return ids.length + ' conferences';
}
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}
function newCreateState() {
  return { name: 'Saturday League', teamName: 'My Team', size: 10, scoring: 'ppr', pointsFrom: HAS_REAL_STATS ? 'real' : 'sim', confs: new Set(['SEC', 'BIG10', 'BIG12', 'ACC']) };
}
function resetFilters() { UI.f = { pos: 'ALL', conf: 'ALL', q: '', sort: 'proj' }; }

/* ---------- Icons ---------- */
const ICON = {
  team: '<svg viewBox="0 0 24 24"><path d="M6 4l3-1h6l3 1 3 4-3 2v10H6V10L3 8z"/></svg>',
  matchup: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14M7 10h2M15 10h2M7 14h2M15 14h2"/></svg>',
  players: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
  standings: '<svg viewBox="0 0 24 24"><path d="M5 20V11M12 20V5M19 20v-6"/></svg>',
  league: '<svg viewBox="0 0 24 24"><path d="M5 3v18M5 4h12l-2 4 2 4H5"/></svg>',
  draft: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
};

/* =========================================================
   RENDER
   ========================================================= */
function render() {
  clearTimeout(draftTimer);
  const ae = document.activeElement;
  const focusId = ae && ae.id;
  const caret = ae && typeof ae.selectionStart === 'number' ? ae.selectionStart : null;

  const bw = document.querySelector('.board-wrap');
  const boardScroll = bw ? bw.scrollLeft : 0;

  const lg = activeLeague();
  if (UI.view === 'league' && !lg) UI.view = 'home';
  const app = document.getElementById('app');
  let html = header(UI.view === 'league' ? lg : null);
  if (UI.view === 'create') html += `<main class="main">${viewCreate()}</main>`;
  else if (UI.view === 'league') html += `<main class="main has-nav">${viewLeague(lg)}</main>` + bottomNav(lg);
  else html += `<main class="main">${viewHome()}</main>`;
  app.innerHTML = html;
  document.getElementById('modal-root').innerHTML = UI.modal ? viewModal(lg) : '';

  const bw2 = document.querySelector('.board-wrap');
  if (bw2 && boardScroll) bw2.scrollLeft = boardScroll;
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus({ preventScroll: true });
      if (caret !== null) { try { el.setSelectionRange(caret, caret); } catch (e) { /* ignore */ } }
    }
  }
  scheduleCpu(lg);
}

function header(lg) {
  if (!lg) {
    return `<header class="topbar"><div class="topbar-in">
      <button class="brand" data-act="home" aria-label="Home">
        <span class="brand-mark">GS</span><span class="brand-name">Gridiron Saturday</span>
      </button></div></header>`;
  }
  const status = lg.phase === 'draft' ? 'Draft' : lg.phase === 'done' ? 'Final' : weekLabel(lg.week);
  return `<header class="topbar"><div class="topbar-in">
    <button class="icon-btn" data-act="home" aria-label="All leagues"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
    <div class="tb-title"><div class="tb-name">${esc(lg.name)}</div>
      <div class="tb-sub">${esc(confsLabel(lg.conferences))}, ${lg.size} teams, ${SCORING_LABEL[lg.scoring]}${usesReal(lg) ? ', real stats' : ''}</div></div>
    <span class="tb-pill">${status}</span>
  </div></header>`;
}

function bottomNav(lg) {
  const tabs = lg.phase === 'draft'
    ? [['draft', 'Draft'], ['league', 'League']]
    : [['team', 'My Team'], ['matchup', 'Matchup'], ['players', 'Players'], ['standings', 'Standings'], ['league', 'League']];
  return `<nav class="bottomnav">${tabs.map(([k, label]) =>
    `<button class="bn ${UI.tab === k ? 'on' : ''}" data-act="tab" data-id="${k}">${ICON[k]}<span>${label}</span></button>`).join('')}</nav>`;
}

/* ---------- Home ---------- */
function viewHome() {
  const cards = DB.leagues.map(lg => {
    const me = lg.teams.find(t => t.isUser);
    let status;
    if (lg.phase === 'draft') status = `<span class="tag tag-live">Drafting</span>`;
    else if (lg.phase === 'done') status = `<span class="tag tag-gold">${lg.teams[lg.champion].isUser ? 'Champion' : 'Season over'}</span>`;
    else status = `<span class="tag">${weekLabel(lg.week)}</span>`;
    return `<button class="league-card" data-act="open" data-id="${lg.id}">
      <div class="lc-top"><span class="lc-name">${esc(lg.name)}</span>${status}</div>
      <div class="lc-meta">${esc(confsLabel(lg.conferences))}, ${lg.size} teams, ${SCORING_LABEL[lg.scoring]}</div>
      <div class="lc-me"><span>${esc(me.name)}</span>${lg.phase !== 'draft' ? `<b>${record(me)}</b>` : ''}</div>
    </button>`;
  }).join('');
  return `
  <section class="hero">
    <div class="hero-field" aria-hidden="true"></div>
    <h1 class="hero-h">College fantasy football</h1>
    <p class="hero-p">Pick the conferences you care about, draft players from those schools, and play a full season against CPU managers.</p>
    <button class="btn btn-gold btn-lg" data-act="new">Create a league</button>
  </section>
  <h2 class="sec-title">Your leagues</h2>
  ${cards || `<div class="empty-card">No leagues yet. Create one to start drafting.</div>`}`;
}

/* ---------- Create league ---------- */
function viewCreate() {
  const c = UI.create;
  const ids = [...c.confs];
  const stats = poolStats(ids);
  const allowed = LEAGUE_SIZES.filter(s => sizeAllowed(ids, s));
  const valid = ids.length > 0 && sizeAllowed(ids, c.size);
  const groups = CONF_GROUPS.map(g => {
    const confs = CONFERENCES.filter(x => x.group === g);
    return `<div class="conf-group"><div class="cg-title">${g}</div><div class="conf-grid">
      ${confs.map(x => `<button class="conf-tile ${c.confs.has(x.id) ? 'on' : ''}" data-act="toggle-conf" data-id="${x.id}" aria-pressed="${c.confs.has(x.id)}">
        <span class="ct-stripe" style="background:${x.color}"></span>
        <span class="ct-name">${esc(x.name)}</span>
        <span class="ct-sub">${x.teams.length} schools</span>
        <span class="ct-check" aria-hidden="true"></span>
      </button>`).join('')}
    </div></div>`;
  }).join('');
  const schoolList = ids.length ? CONFERENCES.filter(x => c.confs.has(x.id)).map(x =>
    `<div class="sl-conf"><b>${esc(x.name)}</b><span>${x.teams.map(esc).join(', ')}</span></div>`).join('') : '';
  let err = '';
  if (!ids.length) err = 'Pick at least one conference.';
  else if (!allowed.length) err = `Those conferences only have ${stats.schools} schools, which isn't enough to fill a league. Add another conference.`;

  return `
  <div class="page-head"><button class="link" data-act="home">Cancel</button><h1>New league</h1></div>

  <div class="card form">
    <label class="field"><span>League name</span>
      <input id="c-name" class="input" data-field="name" maxlength="40" value="${esc(c.name)}"></label>
    <label class="field"><span>Your team name</span>
      <input id="c-team" class="input" data-field="teamName" maxlength="30" value="${esc(c.teamName)}"></label>
  </div>

  <div class="card">
    <h3 class="card-h">Conferences</h3>
    <p class="muted">Your league only includes players from the conferences you pick.</p>
    <div class="chips">
      <button class="chip" data-act="conf-preset" data-id="all">All</button>
      <button class="chip" data-act="conf-preset" data-id="p4">Power 4</button>
      <button class="chip" data-act="conf-preset" data-id="g6">Group of 6</button>
      <button class="chip" data-act="conf-preset" data-id="none">Clear</button>
    </div>
    ${groups}
    <div class="pool-sum"><span><b>${ids.length}</b> ${ids.length === 1 ? 'conference' : 'conferences'}</span><span><b>${stats.schools}</b> schools</span><span><b>${stats.players.toLocaleString()}</b> players</span></div>
    ${schoolList ? `<details class="schools"><summary>See schools in your league</summary>${schoolList}</details>` : ''}
  </div>

  <div class="card">
    <h3 class="card-h">League size</h3>
    <div class="chips">${LEAGUE_SIZES.map(s => `<button class="chip ${c.size === s ? 'on' : ''}" data-act="size" data-id="${s}" ${allowed.includes(s) ? '' : 'disabled'}>${s} teams</button>`).join('')}</div>
    ${ids.length && allowed.length && allowed.length < LEAGUE_SIZES.length ? `<p class="muted small">Bigger leagues need more conferences to fill every roster.</p>` : ''}
    <h3 class="card-h">Scoring</h3>
    <div class="chips">${Object.entries(SCORING_LABEL).map(([k, v]) => `<button class="chip ${c.scoring === k ? 'on' : ''}" data-act="scoring" data-id="${k}">${v}</button>`).join('')}</div>
    ${HAS_REAL_STATS ? `<h3 class="card-h">Points come from</h3>
    <div class="chips">
      <button class="chip ${c.pointsFrom === 'real' ? 'on' : ''}" data-act="points" data-id="real">Real games</button>
      <button class="chip ${c.pointsFrom === 'sim' ? 'on' : ''}" data-act="points" data-id="sim">Simulated</button>
    </div>
    <p class="muted small">${c.pointsFrom === 'real'
      ? `League weeks match the real college schedule. Weeks that already happened score right away; future weeks unlock after the games. Real stats saved through Week ${latestRealWeek() || 0}.`
      : 'Points are made up each week, so you can play a whole season right now.'}</p>` : ''}
    <h3 class="card-h">Format</h3>
    <ul class="fmt-list">
      <li>Starters: QB, 2 RB, 2 WR, TE, FLEX (RB/WR/TE), K, D/ST, plus 6 bench</li>
      <li>15-round snake draft, draft order is random</li>
      <li>12-week season, then a 4-team playoff</li>
    </ul>
  </div>

  ${err ? `<div class="banner bad">${err}</div>` : ''}
  <button class="btn btn-gold btn-lg btn-block" data-act="create" ${valid ? '' : 'disabled'}>Create league and draft</button>`;
}

/* ---------- League shell ---------- */
function viewLeague(lg) {
  if (lg.phase === 'draft' && !['draft', 'league'].includes(UI.tab)) UI.tab = 'draft';
  if (lg.phase !== 'draft' && UI.tab === 'draft') UI.tab = 'team';
  switch (UI.tab) {
    case 'draft': return viewDraft(lg);
    case 'matchup': return viewMatchup(lg);
    case 'players': return viewPlayers(lg);
    case 'standings': return viewStandings(lg);
    case 'league': return viewLeagueInfo(lg);
    default: return viewTeam(lg);
  }
}

/* ---------- Shared player pieces ---------- */
function pmain(p, extra = '') {
  return `<button class="pmain" data-act="player" data-id="${p.id}">
    <span class="pname">${esc(p.name)}</span>
    <span class="pmeta">${posBadge(p.pos)}<span class="ellip">${esc(p.team)}${extra}</span></span>
  </button>`;
}
function filterBar(lg, withSort) {
  const confs = lg.conferences;
  return `<div class="filters">
    <div class="chips scroll">${['ALL', ...POSITIONS].map(p => `<button class="chip ${UI.f.pos === p ? 'on' : ''}" data-act="fpos" data-id="${p}">${p === 'ALL' ? 'All' : posLabel(p)}</button>`).join('')}</div>
    <div class="frow">
      <input id="q" class="input" type="search" placeholder="Search name or school" value="${esc(UI.f.q)}" autocomplete="off">
      ${confs.length > 1 ? `<select id="fconf" class="input select" aria-label="Conference">
        <option value="ALL">All conf.</option>
        ${confs.map(c => `<option value="${c}" ${UI.f.conf === c ? 'selected' : ''}>${esc(confShort(c))}</option>`).join('')}
      </select>` : ''}
      ${withSort ? `<select id="fsort" class="input select" aria-label="Sort">
        <option value="proj" ${UI.f.sort === 'proj' ? 'selected' : ''}>Projected</option>
        <option value="total" ${UI.f.sort === 'total' ? 'selected' : ''}>Season pts</option>
      </select>` : ''}
    </div>
  </div>`;
}
function applyFilters(list) {
  const q = UI.f.q.trim().toLowerCase();
  return list.filter(p =>
    (UI.f.pos === 'ALL' || p.pos === UI.f.pos) &&
    (UI.f.conf === 'ALL' || p.conf === UI.f.conf) &&
    (!q || p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)));
}
function refreshList() {
  const lg = activeLeague();
  const el = document.getElementById('plist');
  if (!lg || !el) return;
  el.innerHTML = UI.tab === 'draft' ? draftList(lg) : faList(lg);
}

/* ---------- Draft room ---------- */
function viewDraft(lg) {
  const me = userIdx(lg);
  const ti = onClock(lg);
  const info = pickInfo(lg.picks.length, lg.size);
  const mine = ti === me;
  const until = picksUntilUser(lg);
  const last = lg.picks[lg.picks.length - 1];
  const lastP = last && PMAP.get(last.pid);
  const lastInfo = last && pickInfo(lg.picks.length - 1, lg.size);

  const clock = `<section class="clock ${mine ? 'mine' : ''}">
    <div class="clock-top"><span>Round ${info.round} of ${DRAFT_ROUNDS}</span><span>Pick ${info.overall} of ${totalPicks(lg)}</span></div>
    <div class="clock-team">${mine ? "You're on the clock" : esc(lg.teams[ti].name) + ' is picking'}</div>
    <div class="clock-sub">${mine ? 'Choose a player below.' : until > 0 ? `Your next pick is in ${until}.` : ''}</div>
    <div class="clock-actions">
      ${mine
        ? `<button class="btn btn-gold" data-act="autopick">Auto-pick for me</button>`
        : `<button class="btn btn-ghost-light" data-act="sim">Skip to my pick</button>
           <button class="btn btn-ghost-light" data-act="pause">${UI.paused ? 'Resume' : 'Pause'}</button>`}
      <button class="btn btn-ghost-light" data-act="autodraft">Auto-draft the rest</button>
    </div>
    ${lastP ? `<div class="clock-last">Last pick, R${lastInfo.round} P${lastInfo.pick}: <b>${esc(lg.teams[last.ti].name)}</b> took ${esc(lastP.name)} (${posLabel(lastP.pos)}, ${esc(lastP.team)})</div>` : ''}
  </section>`;

  const sub = `<div class="subtabs">
    ${[['players', 'Players'], ['board', 'Draft board'], ['roster', 'My roster']].map(([k, l]) =>
      `<button class="st ${UI.dtab === k ? 'on' : ''}" data-act="dtab" data-id="${k}">${l}</button>`).join('')}
  </div>`;

  let body;
  if (UI.dtab === 'board') body = draftBoard(lg);
  else if (UI.dtab === 'roster') body = rosterReadOnly(lg, lg.teams[me]);
  else body = filterBar(lg, false) + `<div id="plist" class="plist">${draftList(lg)}</div>`;
  return clock + sub + body;
}
function draftList(lg) {
  const mine = onClock(lg) === userIdx(lg);
  const all = applyFilters(availablePlayers(lg));
  const list = all.slice(0, 150);
  if (!list.length) return `<div class="empty-card">No available players match those filters.</div>`;
  return list.map(p => `<div class="prow">
    <div class="rank">${rankOf(lg, p.id)}</div>
    ${pmain(p, `, ${esc(confShort(p.conf))}`)}
    <div class="pnum"><b>${fmt(projPts(p, lg.scoring))}</b><small>proj</small></div>
    <button class="btn btn-sm btn-primary" data-act="draft" data-id="${p.id}" ${mine ? '' : 'disabled'}>Draft</button>
  </div>`).join('') + (all.length > 150 ? `<p class="muted small center">Showing the top 150. Search or filter to find others.</p>` : '');
}
function draftBoard(lg) {
  const cols = lg.teams.map(t => `<th class="${t.isUser ? 'me' : ''}">${esc(t.name)}</th>`).join('');
  const cur = lg.picks.length;
  let rows = '';
  for (let r = 0; r < DRAFT_ROUNDS; r++) {
    let cells = '';
    for (let i = 0; i < lg.size; i++) {
      const n = r * lg.size + (r % 2 === 0 ? i : lg.size - 1 - i);
      const pk = lg.picks[n];
      if (pk) {
        const p = PMAP.get(pk.pid);
        cells += `<td><button class="bcell bc-${p.pos}" data-act="player" data-id="${p.id}"><b>${esc(shortName(p))}</b><span>${posLabel(p.pos)}, ${esc(p.team)}</span></button></td>`;
      } else {
        cells += `<td>${n === cur ? '<div class="bcell now">On the clock</div>' : ''}</td>`;
      }
    }
    rows += `<tr><th class="rd">${r + 1}</th>${cells}</tr>`;
  }
  return `<div class="board-wrap"><table class="board"><thead><tr><th class="rd">Rd</th>${cols}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function rosterReadOnly(lg, t) {
  const rows = t.starters.map(s => {
    const p = s.pid && PMAP.get(s.pid);
    return `<div class="lrow"><div class="slot">${posLabel(s.slot)}</div>
      ${p ? pmain(p) : '<div class="pmain empty">Empty</div>'}
      <div class="pnum">${p ? `<b>${fmt(projPts(p, lg.scoring))}</b><small>proj</small>` : ''}</div></div>`;
  }).join('');
  const bench = t.bench.map(pid => {
    const p = PMAP.get(pid);
    return `<div class="lrow"><div class="slot">BN</div>${pmain(p)}<div class="pnum"><b>${fmt(projPts(p, lg.scoring))}</b><small>proj</small></div></div>`;
  }).join('');
  return `<div class="card flush"><div class="list-h">Starters</div>${rows}
    <div class="list-h">Bench</div>${bench || '<div class="lrow"><div class="pmain empty">No bench players yet</div></div>'}</div>`;
}

/* ---------- My Team ---------- */
function moveTargets(t, mv) {
  const T = new Set();
  const fromS = mv[0] === 'S' ? +mv.slice(1) : null;
  const fromPid = fromS !== null ? t.starters[fromS].pid : mv.slice(1);
  const fromSlot = fromS !== null ? t.starters[fromS].slot : 'BN';
  const fp = fromPid && PMAP.get(fromPid);
  t.starters.forEach((s, i) => {
    const k = 'S' + i;
    if (k === mv) return;
    const op = s.pid && PMAP.get(s.pid);
    const okOut = !op || ELIG[fromSlot].includes(op.pos);
    if (fp && ELIG[s.slot].includes(fp.pos) && okOut) T.add(k);
    if (!fp && op && okOut) T.add(k);
  });
  if (fromS !== null) {
    t.bench.forEach(pid => { if (ELIG[fromSlot].includes(PMAP.get(pid).pos)) T.add('B' + pid); });
  }
  return T;
}
function doMove(t, mv, target) {
  const fromS = mv[0] === 'S' ? +mv.slice(1) : null;
  const fromPid = fromS !== null ? t.starters[fromS].pid : mv.slice(1);
  if (target === 'BENCH') {
    t.starters[fromS].pid = null;
    t.bench.push(fromPid);
    return;
  }
  if (target[0] === 'S') {
    const j = +target.slice(1);
    const occ = t.starters[j].pid;
    if (fromS !== null) {
      t.starters[j].pid = fromPid;
      t.starters[fromS].pid = occ;
    } else {
      t.starters[j].pid = fromPid;
      t.bench = t.bench.filter(x => x !== fromPid);
      if (occ) t.bench.push(occ);
    }
  } else {
    const q = target.slice(1);
    t.bench = t.bench.filter(x => x !== q);
    if (fromPid) t.bench.push(fromPid);
    t.starters[fromS].pid = q;
  }
}
const POS_ORDER = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DST: 5 };

function viewTeam(lg) {
  const me = userIdx(lg);
  const t = lg.teams[me];
  const w = lg.week;
  const done = lg.phase === 'done';
  const lastW = lastPlayedWeek(lg);
  const rank = standings(lg).findIndex(x => x.id === t.id) + 1;
  const mv = UI.move;
  const targets = mv ? moveTargets(t, mv) : null;

  const problems = t.starters.filter(s => !s.pid || isBye(PMAP.get(s.pid), w));
  const projTotal = t.starters.reduce((a, s) => a + (s.pid ? weekProj(lg, PMAP.get(s.pid), w) : 0), 0);

  const row = (key, slot, pid) => {
    const p = pid && PMAP.get(pid);
    const isSel = mv === key;
    const isT = targets && targets.has(key);
    const bye = p && !done && isBye(p, w);
    let btn = '';
    if (!done) {
      if (mv) btn = isSel ? `<button class="mv on" data-act="move-cancel" aria-label="Cancel move">Cancel</button>`
        : isT ? `<button class="mv here" data-act="move-to" data-id="${key}">Here</button>` : `<span class="mv ghost"></span>`;
      else btn = `<button class="mv" data-act="move" data-id="${key}">Move</button>`;
    }
    const lastPts = p && lastW ? `, last ${fmt(weekPts(lg, p, lastW))}` : '';
    const num = !p ? '' : done ? `<b>${fmt(seasonPts(lg, p))}</b><small>season</small>`
      : bye ? `<b class="bye">Bye</b><small>wk ${w}</small>` : `<b>${fmt(weekProj(lg, p, w))}</b><small>proj</small>`;
    return `<div class="lrow ${isSel ? 'sel' : ''} ${mv && !isSel && !isT ? 'dim' : ''} ${bye || (!p && slot !== 'BN') ? 'warn' : ''}">
      <div class="slot">${posLabel(slot)}</div>
      ${p ? pmain(p, `, bye ${p.bye}${lastPts}`) : '<div class="pmain empty">Empty</div>'}
      <div class="pnum">${num}</div>${btn}</div>`;
  };

  const starters = t.starters.map((s, i) => row('S' + i, s.slot, s.pid)).join('');
  const benchSorted = t.bench.slice().sort((a, b) => {
    const pa = PMAP.get(a), pb = PMAP.get(b);
    return POS_ORDER[pa.pos] - POS_ORDER[pb.pos] || projPts(pb, lg.scoring) - projPts(pa, lg.scoring);
  });
  const bench = benchSorted.map(pid => row('B' + pid, 'BN', pid)).join('');
  const roster = rosterOf(t).length;

  let banner = '';
  if (mv) {
    const fromPid = mv[0] === 'S' ? t.starters[+mv.slice(1)].pid : mv.slice(1);
    const fp = fromPid && PMAP.get(fromPid);
    banner = `<div class="banner info"><span>${fp ? `Moving <b>${esc(fp.name)}</b>. Tap Here on a spot.` : 'Tap Here on the player to fill this spot.'}${targets.size ? '' : ' No valid spots.'}</span>
      ${fp && mv[0] === 'S' ? `<button class="btn btn-sm" data-act="move-to" data-id="BENCH">To bench</button>` : ''}</div>`;
  } else if (!done && problems.length) {
    banner = `<div class="banner warn"><span>${problems.length} starting spot${problems.length > 1 ? 's are' : ' is'} empty or on a bye this week.</span>
      <button class="btn btn-sm" data-act="autoset">Fix lineup</button></div>`;
  }

  return `
  <section class="team-head">
    <div><div class="th-name">${esc(t.name)}</div>
      <div class="th-sub">${record(t)}, ${ordinal(rank)} place, ${fmt(t.pf)} pts for</div></div>
    ${done ? '' : `<div class="th-proj"><b>${fmt(projTotal)}</b><small>${weekLabel(w)} proj</small></div>`}
  </section>
  ${done ? `<div class="banner gold">${lg.teams[lg.champion].isUser ? 'You won the championship.' : `${esc(lg.teams[lg.champion].name)} won the championship.`} Numbers below are season totals.</div>` : ''}
  ${banner}
  <div class="card flush">
    <div class="list-h"><span>Starters</span>${!done && !mv ? `<button class="link" data-act="autoset">Auto-set lineup</button>` : ''}</div>
    ${starters}
    <div class="list-h"><span>Bench</span><span class="muted small">${roster}/${ROSTER_MAX} players</span></div>
    ${bench || `<div class="lrow"><div class="pmain empty">Bench is empty. Add players from the Players tab.</div></div>`}
  </div>`;
}
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ---------- Matchup ---------- */
function liveGame(lg, a, b, w) {
  const f = ti => {
    const lines = lg.teams[ti].starters.map(s => ({ slot: s.slot, pid: s.pid, pts: s.pid ? weekProj(lg, PMAP.get(s.pid), w) : 0 }));
    return { lines, total: round1(lines.reduce((x, l) => x + l.pts, 0)) };
  };
  const A = f(a), B = f(b);
  return { a, b, as: A.total, bs: B.total, al: A.lines, bl: B.lines, winner: null };
}
function viewMatchup(lg) {
  const me = userIdx(lg);
  const maxW = lg.week;
  const w = UI.week && UI.week <= maxW ? UI.week : maxW;
  const played = !!lg.results[w];
  const games = played ? lg.results[w] : gamesForWeek(lg, w).map(([a, b]) => liveGame(lg, a, b, w));
  let gi = UI.game != null && games[UI.game] ? UI.game : games.findIndex(g => g.a === me || g.b === me);
  const inWeek = games.some(g => g.a === me || g.b === me);
  if (gi < 0) gi = 0;
  const g = games[gi];

  const chips = [];
  for (let k = 1; k <= maxW; k++) {
    const label = k <= REG_WEEKS ? 'Wk ' + k : k === REG_WEEKS + 1 ? 'Semis' : 'Final';
    chips.push(`<button class="chip ${k === w ? 'on' : ''}" data-act="week" data-id="${k}">${label}</button>`);
  }
  const canPlay = !played && w === lg.week && lg.phase !== 'done';
  const ready = weekReady(lg, w);
  let readyCount = 0;
  if (canPlay && usesReal(lg)) {
    for (let k = lg.week; k <= FINAL_WEEK && weekReady(lg, k); k++) readyCount++;
  }

  let top = '';
  if (lg.phase === 'done' && w === FINAL_WEEK) {
    const champ = lg.teams[lg.champion];
    top = `<div class="banner gold">${champ.isUser ? 'You are the league champion.' : `${esc(champ.name)} won the championship.`}</div>`;
  } else if (!inWeek && w > REG_WEEKS) {
    top = `<div class="banner info"><span>Your season is over. You can still watch the playoffs.</span></div>`;
  }

  return `
  <div class="chips scroll weeks">${chips.join('')}</div>
  ${top}
  ${g ? matchCard(lg, g, w, played, me) : `<div class="empty-card">No games scheduled.</div>`}
  ${canPlay && ready ? `<button class="btn btn-gold btn-lg btn-block" data-act="play">${usesReal(lg) ? 'Score' : 'Play'} ${weekLabel(w)}</button>
    <p class="muted small center">${usesReal(lg) ? 'Scores every matchup with real stats from that week.' : 'Simulates every game this week.'} Set your lineup first.</p>` : ''}
  ${readyCount > 1 ? `<button class="btn btn-block" data-act="catchup">Score all ${readyCount} finished weeks</button>
    <p class="muted small center">Uses your current lineup for each week.</p>` : ''}
  ${canPlay && !ready ? `<div class="banner info"><span>${weekLabel(w)} scores unlock after the real games${w > REG_WEEKS ? ` (college Week ${w})` : ''} are finished. Stats update automatically, so check back after the weekend. You can still set your lineup.</span></div>` : ''}
  ${played && w < lg.week ? `<button class="btn btn-block" data-act="week" data-id="${lg.week}">Go to ${weekLabel(lg.week)}</button>` : ''}
  ${games.length > 1 ? `<h2 class="sec-title">Scoreboard</h2><div class="scoreboard">${games.map((x, i) => sbCard(lg, x, i, i === gi, played)).join('')}</div>` : ''}`;
}
function sbCard(lg, g, i, on, played) {
  const line = (ti, s, won) => `<div class="sb-row ${won ? 'won' : ''}"><span>${esc(lg.teams[ti].name)}</span><b>${fmt(s)}</b></div>`;
  return `<button class="sb ${on ? 'on' : ''}" data-act="game" data-id="${i}">
    ${line(g.a, g.as, played && g.winner === g.a)}${line(g.b, g.bs, played && g.winner === g.b)}
    <small>${played ? 'Final' : 'Projected'}</small></button>`;
}
function matchCard(lg, g, w, played, me) {
  let a = g.a, b = g.b, as = g.as, bs = g.bs, al = g.al, bl = g.bl;
  if (b === me) { [a, b] = [b, a]; [as, bs] = [bs, as]; [al, bl] = [bl, al]; }
  const ta = lg.teams[a], tb = lg.teams[b];
  const aWin = played && g.winner === a, bWin = played && g.winner === b;
  const cell = (line, side) => {
    const p = line.pid && PMAP.get(line.pid);
    if (!p) return `<div class="mside ${side}"><div class="mp"><span class="mp-name empty">Empty</span></div><div class="mp-pts">0.0</div></div>`;
    const bye = isBye(p, w);
    const meta = played ? statLine(lg, p, w, line.pts) : bye ? 'Bye week' : `${posLabel(p.pos)}, ${p.team}`;
    return `<div class="mside ${side} ${bye ? 'bye' : ''}">
      <button class="mp" data-act="player" data-id="${p.id}"><span class="mp-name">${esc(shortName(p))}</span><span class="mp-meta">${esc(meta)}</span></button>
      <div class="mp-pts ${played ? '' : 'proj'}">${bye ? '—' : fmt(line.pts)}</div></div>`;
  };
  const rows = al.map((l, i) => `<div class="mrow">${cell(l, 'l')}<div class="mslot">${posLabel(l.slot)}</div>${cell(bl[i], 'r')}</div>`).join('');
  return `<section class="scorebug">
    <div class="sbg-team ${aWin ? 'win' : ''}"><div class="sbg-name">${esc(ta.name)}</div><div class="sbg-rec">${record(ta)}</div><div class="sbg-score">${fmt(as)}</div></div>
    <div class="sbg-mid"><span>${weekLabel(w)}</span><b>${played ? 'Final' : 'Projected'}</b></div>
    <div class="sbg-team r ${bWin ? 'win' : ''}"><div class="sbg-name">${esc(tb.name)}</div><div class="sbg-rec">${record(tb)}</div><div class="sbg-score">${fmt(bs)}</div></div>
  </section>
  <div class="card flush match">${rows}</div>`;
}

/* ---------- Players (free agents) ---------- */
function viewPlayers(lg) {
  const t = lg.teams[userIdx(lg)];
  return `<div class="page-row"><h2 class="sec-title flat">Free agents</h2><span class="muted small">Your roster ${rosterOf(t).length}/${ROSTER_MAX}</span></div>
    ${filterBar(lg, true)}
    <div id="plist" class="plist">${faList(lg)}</div>`;
}
function faList(lg) {
  const done = lg.phase === 'done';
  let list = applyFilters(availablePlayers(lg));
  const hasPts = lastPlayedWeek(lg) > 0;
  if (UI.f.sort === 'total' && hasPts) {
    const tot = new Map(list.map(p => [p.id, seasonPts(lg, p)]));
    list = list.sort((a, b) => tot.get(b.id) - tot.get(a.id));
  } else {
    list = list.sort((a, b) => projPts(b, lg.scoring) - projPts(a, lg.scoring));
  }
  const shown = list.slice(0, 100);
  if (!shown.length) return `<div class="empty-card">No free agents match those filters.</div>`;
  return shown.map(p => `<div class="prow">
    ${pmain(p, `, ${esc(confShort(p.conf))}, bye ${p.bye}`)}
    ${hasPts ? `<div class="pnum"><b>${fmt(seasonPts(lg, p))}</b><small>season</small></div>` : ''}
    <div class="pnum"><b>${fmt(projPts(p, lg.scoring))}</b><small>proj</small></div>
    <button class="btn btn-sm btn-primary" data-act="add" data-id="${p.id}" ${done ? 'disabled' : ''} aria-label="Add ${esc(p.name)}">Add</button>
  </div>`).join('') + (list.length > 100 ? `<p class="muted small center">Showing 100 of ${list.length}. Search or filter to narrow it down.</p>` : '');
}

/* ---------- Standings ---------- */
function viewStandings(lg) {
  const st = standings(lg);
  const rows = st.map((t, i) => `<tr class="${t.isUser ? 'me' : ''} ${i === PLAYOFF_TEAMS - 1 ? 'cut' : ''}">
    <td class="num">${i + 1}</td><td class="tname">${esc(t.name)}</td><td class="num">${record(t)}</td>
    <td class="num">${fmt(t.pf)}</td><td class="num">${fmt(t.pa)}</td></tr>`).join('');
  let bracket = '';
  if (lg.seeds) {
    const semis = lg.results[REG_WEEKS + 1];
    const fin = lg.results[FINAL_WEEK];
    const seedOf = ti => lg.seeds.indexOf(ti) + 1;
    const game = (a, b, res) => {
      const r = res ? res.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a)) : null;
      const sc = ti => r ? fmt(r.a === ti ? r.as : r.bs) : '';
      const line = ti => ti == null ? `<div class="bk-row tbd"><span>TBD</span></div>`
        : `<div class="bk-row ${r && r.winner === ti ? 'won' : ''}"><span><i>${seedOf(ti)}</i>${esc(lg.teams[ti].name)}</span><b>${sc(ti)}</b></div>`;
      return `<div class="bk-game">${line(a)}${line(b)}</div>`;
    };
    const s = lg.seeds;
    const f = semis ? [semis[0].winner, semis[1].winner] : [null, null];
    bracket = `<h2 class="sec-title">Playoffs</h2>
    <div class="bracket">
      <div class="bk-col"><div class="bk-h">Semifinals</div>${game(s[0], s[3], semis)}${game(s[1], s[2], semis)}</div>
      <div class="bk-col"><div class="bk-h">Championship</div>${game(f[0], f[1], fin)}
        ${lg.champion != null ? `<div class="bk-champ">Champion: <b>${esc(lg.teams[lg.champion].name)}</b></div>` : ''}</div>
    </div>`;
  }
  return `<h2 class="sec-title">Standings</h2>
  <div class="card flush"><div class="table-wrap"><table class="stand">
    <thead><tr><th class="num">#</th><th>Team</th><th class="num">W-L</th><th class="num">PF</th><th class="num">PA</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>
  <p class="muted small">Top ${PLAYOFF_TEAMS} make the playoffs after Week ${REG_WEEKS}. Ties in record are broken by points for.</p>
  ${bracket}`;
}

/* ---------- League info ---------- */
function viewLeagueInfo(lg) {
  const me = userIdx(lg);
  const myPicks = lg.picks.map((pk, n) => ({ pk, n })).filter(x => x.pk.ti === me);
  return `<h2 class="sec-title">League settings</h2>
  <div class="card">
    <dl class="kv">
      <dt>League</dt><dd>${esc(lg.name)}</dd>
      <dt>Teams</dt><dd>${lg.size}</dd>
      <dt>Scoring</dt><dd>${SCORING_LABEL[lg.scoring]}</dd>
      <dt>Points from</dt><dd>${usesReal(lg) ? 'Real games' : 'Simulated'}</dd>
      <dt>Your draft slot</dt><dd>${ordinal(me + 1)}</dd>
      <dt>Season</dt><dd>${REG_WEEKS} weeks, ${PLAYOFF_TEAMS}-team playoff</dd>
    </dl>
    <div class="conf-pills">${lg.conferences.map(id => {
      const c = CONF_MAP.get(id);
      return `<span class="cpill"><i style="background:${c.color}"></i>${esc(c.name)}</span>`;
    }).join('')}</div>
  </div>
  <h2 class="sec-title">Managers</h2>
  <div class="card flush">${lg.teams.map(t => `<div class="mgr"><span>${esc(t.name)}</span><span class="muted small">${t.isUser ? 'You' : 'CPU'}</span></div>`).join('')}</div>
  ${myPicks.length ? `<h2 class="sec-title">Your draft picks</h2><div class="card flush">${myPicks.map(({ pk, n }) => {
    const p = PMAP.get(pk.pid), inf = pickInfo(n, lg.size);
    return `<div class="prow"><div class="rank">R${inf.round}</div>${pmain(p)}<div class="pnum"><b>${inf.overall}</b><small>overall</small></div></div>`;
  }).join('')}</div>` : ''}
  <button class="btn btn-danger btn-block" data-act="delete">Delete league</button>`;
}

/* ---------- Modals ---------- */
function viewModal(lg) {
  const m = UI.modal;
  let inner = '';
  if (m.type === 'player' && lg) inner = playerModal(lg, PMAP.get(m.id));
  else if (m.type === 'drop' && lg) inner = dropModal(lg, PMAP.get(m.id));
  else if (m.type === 'delete') {
    inner = `<h3 class="m-h">Delete this league?</h3><p class="muted">This removes the league and all of its results from this device.</p>
      <div class="m-actions"><button class="btn" data-act="close-modal">Keep league</button><button class="btn btn-danger" data-act="confirm-delete">Delete league</button></div>`;
  }
  return `<div class="backdrop" data-act="close-modal"><div class="modal" role="dialog" aria-modal="true" data-act="noop">
    <button class="m-close" data-act="close-modal" aria-label="Close">×</button>${inner}</div></div>`;
}
function playerModal(lg, p) {
  const owner = ownerMap(lg).get(p.id);
  const me = userIdx(lg);
  const conf = CONF_MAP.get(p.conf);
  const last = lastPlayedWeek(lg);
  let log = '';
  for (let w = 1; w <= last; w++) {
    const pts = weekPts(lg, p, w);
    log += `<tr><td>${w <= REG_WEEKS ? w : w === REG_WEEKS + 1 ? 'SF' : 'F'}</td><td class="ellip">${esc(statLine(lg, p, w, pts))}</td><td class="num"><b>${isBye(p, w) ? '—' : fmt(pts)}</b></td></tr>`;
  }
  let action = '';
  if (lg.phase === 'draft') {
    if (owner == null && onClock(lg) === me) action = `<button class="btn btn-primary btn-block" data-act="draft" data-id="${p.id}">Draft ${esc(p.name)}</button>`;
  } else if (lg.phase !== 'done') {
    if (owner == null) action = `<button class="btn btn-primary btn-block" data-act="add" data-id="${p.id}">Add to my team</button>`;
    else if (owner === me) action = `<button class="btn btn-danger btn-block" data-act="drop" data-id="${p.id}">Drop from my team</button>`;
  }
  return `<div class="pm-head" style="--conf:${conf.color}">
      <div class="pm-num">${p.pos === 'DST' ? 'D' : p.num}</div>
      <div><div class="pm-name">${esc(p.name)}</div>
        <div class="pm-meta">${posBadge(p.pos)} ${esc(p.team)}, ${esc(conf.name)}${p.year ? `, ${p.year}` : ''}</div></div>
    </div>
    <div class="pm-stats">
      <div><b>${fmt(projPts(p, lg.scoring))}</b><small>Proj per game</small></div>
      <div><b>${last ? fmt(seasonPts(lg, p)) : '—'}</b><small>Season pts</small></div>
      <div><b>${rankOf(lg, p.id) || '—'}</b><small>League rank</small></div>
      <div><b>Wk ${p.bye}</b><small>Bye</small></div>
    </div>
    <p class="muted small">${owner == null ? 'Free agent' : owner === me ? 'On your team' : `On ${esc(lg.teams[owner].name)}`}</p>
    ${log ? `<div class="table-wrap"><table class="glog"><thead><tr><th>Wk</th><th>Line</th><th class="num">Pts</th></tr></thead><tbody>${log}</tbody></table></div>` : ''}
    ${action}`;
}
function dropModal(lg, add) {
  const t = lg.teams[userIdx(lg)];
  const rows = rosterOf(t).map(pid => PMAP.get(pid))
    .sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos])
    .map(p => `<div class="prow">${pmain(p)}<div class="pnum"><b>${fmt(projPts(p, lg.scoring))}</b><small>proj</small></div>
      <button class="btn btn-sm btn-danger" data-act="swapdrop" data-id="${p.id}">Drop</button></div>`).join('');
  return `<h3 class="m-h">Roster full</h3><p class="muted">Drop a player to add <b>${esc(add.name)}</b> (${posLabel(add.pos)}, ${esc(add.team)}).</p>
    <div class="m-list">${rows}</div>`;
}

/* =========================================================
   CPU draft pacing
   ========================================================= */
function scheduleCpu(lg) {
  if (!lg || UI.view !== 'league' || lg.phase !== 'draft' || UI.tab !== 'draft' || UI.paused || UI.modal) return;
  const ti = onClock(lg);
  if (ti < 0 || lg.teams[ti].isUser) return;
  draftTimer = setTimeout(() => {
    makePick(lg, cpuChoice(lg, ti));
    afterPick(lg);
  }, 450);
}
function afterPick(lg) {
  save();
  if (lg.phase !== 'draft') {
    UI.tab = 'team';
    toast('Draft complete. Your lineup is set for Week 1.');
  }
  render();
}

/* =========================================================
   EVENTS
   ========================================================= */
const actions = {
  noop() {},
  home() { UI.view = 'home'; UI.modal = null; UI.move = null; DB.activeId = null; save(); render(); window.scrollTo(0, 0); },
  new() { UI.create = newCreateState(); UI.view = 'create'; render(); window.scrollTo(0, 0); },
  open(id) {
    DB.activeId = id; save();
    const lg = activeLeague();
    UI.view = 'league'; UI.tab = lg.phase === 'draft' ? 'draft' : 'team';
    UI.week = null; UI.game = null; UI.move = null; UI.paused = false; resetFilters();
    render(); window.scrollTo(0, 0);
  },
  'toggle-conf'(id) {
    const c = UI.create;
    c.confs.has(id) ? c.confs.delete(id) : c.confs.add(id);
    fixSize(); render();
  },
  'conf-preset'(id) {
    const c = UI.create;
    if (id === 'all') c.confs = new Set(CONFERENCES.map(x => x.id));
    else if (id === 'p4') c.confs = new Set(CONFERENCES.filter(x => x.group === 'Power 4').map(x => x.id));
    else if (id === 'g6') c.confs = new Set(CONFERENCES.filter(x => x.group === 'Group of 6').map(x => x.id));
    else c.confs = new Set();
    fixSize(); render();
  },
  size(id) { UI.create.size = +id; render(); },
  scoring(id) { UI.create.scoring = id; render(); },
  points(id) { UI.create.pointsFrom = id; render(); },
  create() {
    const c = UI.create;
    const ids = CONFERENCES.map(x => x.id).filter(id => c.confs.has(id));
    if (!ids.length || !sizeAllowed(ids, c.size)) return;
    const lg = createLeague({
      name: c.name.trim() || 'Saturday League', teamName: c.teamName.trim() || 'My Team',
      size: c.size, scoring: c.scoring, conferences: ids, pointsFrom: c.pointsFrom,
    });
    DB.leagues.unshift(lg); DB.activeId = lg.id; save();
    UI.view = 'league'; UI.tab = 'draft'; UI.dtab = 'players'; UI.paused = false; resetFilters();
    render(); window.scrollTo(0, 0);
  },
  tab(id) { UI.tab = id; UI.move = null; UI.week = null; UI.game = null; UI.f.q = ''; render(); window.scrollTo(0, 0); },
  dtab(id) { UI.dtab = id; render(); },
  fpos(id) { UI.f.pos = id; render(); },
  draft(id) {
    const lg = activeLeague();
    if (onClock(lg) !== userIdx(lg)) return;
    const p = PMAP.get(id);
    if (makePick(lg, id)) { UI.modal = null; toast(`You drafted ${p.name}.`); afterPick(lg); }
  },
  autopick() {
    const lg = activeLeague();
    const me = userIdx(lg);
    if (onClock(lg) !== me) return;
    const pid = cpuChoice(lg, me);
    if (makePick(lg, pid)) { toast(`Auto-picked ${PMAP.get(pid).name}.`); afterPick(lg); }
  },
  sim() {
    const lg = activeLeague();
    const me = userIdx(lg);
    while (lg.phase === 'draft' && onClock(lg) !== me) makePick(lg, cpuChoice(lg, onClock(lg)));
    UI.paused = false; afterPick(lg);
  },
  pause() { UI.paused = !UI.paused; render(); },
  autodraft() {
    const lg = activeLeague();
    while (lg.phase === 'draft') {
      if (!makePick(lg, cpuChoice(lg, onClock(lg)))) break;
    }
    afterPick(lg);
  },
  player(id) { UI.modal = { type: 'player', id }; render(); },
  'close-modal'() { UI.modal = null; render(); },
  move(id) { UI.move = id; render(); },
  'move-cancel'() { UI.move = null; render(); },
  'move-to'(id) {
    const lg = activeLeague();
    doMove(lg.teams[userIdx(lg)], UI.move, id);
    UI.move = null; save(); render();
  },
  autoset() {
    const lg = activeLeague();
    autoLineup(lg, lg.teams[userIdx(lg)], lg.week);
    UI.move = null; save(); toast('Lineup set to your best projected starters.'); render();
  },
  play() {
    const lg = activeLeague();
    const w = lg.week;
    const res = playWeek(lg);
    if (!res) { toast(`${weekLabel(w)} unlocks after the real games are finished.`); render(); return; }
    save();
    UI.week = w; UI.game = null;
    const me = userIdx(lg);
    const g = res && res.find(x => x.a === me || x.b === me);
    if (g) {
      const mine = g.a === me ? g.as : g.bs, theirs = g.a === me ? g.bs : g.as;
      toast(`${weekLabel(w)}: you ${g.winner === me ? 'won' : g.winner == null ? 'tied' : 'lost'} ${fmt(mine)} to ${fmt(theirs)}.`);
    } else toast(`${weekLabel(w)} is in the books.`);
    render(); window.scrollTo(0, 0);
  },
  catchup() {
    const lg = activeLeague();
    let n = 0, last = lg.week;
    while (lg.phase !== 'done' && weekReady(lg, lg.week)) {
      last = lg.week;
      if (!playWeek(lg)) break;
      n++;
    }
    save();
    UI.week = last; UI.game = null;
    const me = lg.teams[userIdx(lg)];
    toast(`Scored ${n} week${n === 1 ? '' : 's'}. You're ${record(me)}.`);
    render(); window.scrollTo(0, 0);
  },
  week(id) { UI.week = +id; UI.game = null; render(); },
  game(id) { UI.game = +id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  add(id) {
    const lg = activeLeague();
    const t = lg.teams[userIdx(lg)];
    if (ownerMap(lg).has(id)) return;
    if (rosterOf(t).length >= ROSTER_MAX) { UI.modal = { type: 'drop', id }; render(); return; }
    t.bench.push(id); save();
    UI.modal = null; toast(`Added ${PMAP.get(id).name} to your bench.`); render();
  },
  drop(id) {
    const lg = activeLeague();
    removeFromRoster(lg.teams[userIdx(lg)], id); save();
    UI.modal = null; toast(`Dropped ${PMAP.get(id).name}.`); render();
  },
  swapdrop(id) {
    const lg = activeLeague();
    const t = lg.teams[userIdx(lg)];
    const add = UI.modal.id;
    // New player takes the dropped player's spot if eligible, else the bench.
    const si = t.starters.findIndex(s => s.pid === id);
    removeFromRoster(t, id);
    if (si >= 0 && ELIG[t.starters[si].slot].includes(PMAP.get(add).pos)) t.starters[si].pid = add;
    else t.bench.push(add);
    save(); UI.modal = null;
    toast(`Added ${PMAP.get(add).name}, dropped ${PMAP.get(id).name}.`); render();
  },
  delete() { UI.modal = { type: 'delete' }; render(); },
  'confirm-delete'() {
    const id = DB.activeId;
    DB.leagues = DB.leagues.filter(l => l.id !== id);
    POOL_CACHE.delete(id); RANK_CACHE.delete(id);
    DB.activeId = null; UI.modal = null; UI.view = 'home'; save();
    toast('League deleted.'); render();
  },
};
function fixSize() {
  const c = UI.create;
  const ids = [...c.confs];
  if (sizeAllowed(ids, c.size)) return;
  const ok = LEAGUE_SIZES.filter(s => sizeAllowed(ids, s));
  if (ok.length) c.size = ok[ok.length - 1];
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  if (el.dataset.act === 'noop') { e.stopPropagation(); return; }
  fn(el.dataset.id);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset && el.dataset.field && UI.create) { UI.create[el.dataset.field] = el.value; return; }
  if (el.id === 'q') { UI.f.q = el.value; refreshList(); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'fconf') { UI.f.conf = el.value; refreshList(); }
  if (el.id === 'fsort') { UI.f.sort = el.value; refreshList(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && UI.modal) { UI.modal = null; render(); }
});

/* ---------- Boot ---------- */
(function boot() {
  const lg = activeLeague();
  if (lg) { UI.view = 'league'; UI.tab = lg.phase === 'draft' ? 'draft' : 'team'; }
  render();
})();
