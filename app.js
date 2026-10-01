'use strict';
/* =========================================================
   APP — screens, events, and saving to the browser.
   ========================================================= */

const UI = {
  view: 'home', tab: 'team', dtab: 'players', leagueId: null,
  f: { pos: 'ALL', conf: 'ALL', q: '', sort: 'proj' },
  move: null, modal: null, week: null, game: null, paused: false, create: null,
  auth: { mode: 'signin', email: '', pw: '', error: '', busy: false },
  join: null, // { id, lg, teamName, busy, error }
};
let busy = false; // a save is in progress

function activeLeague() { return UI.leagueId ? Store.get(UI.leagueId) : null; }
function canAct(lg) { return !!lg && userIdx(lg) >= 0; }

/* Save a change to the open league. fn changes the newest copy and can
   return false to skip. Shows a message when done. */
function mutate(fn, okMsg) {
  const id = UI.leagueId;
  if (!id) return Promise.resolve(false);
  busy = true;
  return Store.update(id, fn).then(ok => {
    busy = false;
    if (ok && okMsg) toast(typeof okMsg === 'function' ? okMsg() : okMsg);
    render();
    return ok;
  }).catch(err => {
    busy = false;
    console.error(err);
    toast("Couldn't save that. Check your connection and try again.");
    render();
    return false;
  });
}

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
  return { name: 'Saturday League', teamName: 'My Team', size: 10, scoring: 'ppr', pointsFrom: HAS_REAL_STATS ? 'real' : 'sim', multi: false, draftType: 'live', pickSeconds: 90, confs: new Set(['SEC', 'BIG10', 'BIG12', 'ACC']) };
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
  lobby: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 11a3 3 0 1 0 0-6M18 15c2 .6 3 2.3 3 5"/></svg>',
};

/* =========================================================
   RENDER
   ========================================================= */
function render() {
  const ae = document.activeElement;
  const focusId = ae && ae.id;
  const caret = ae && typeof ae.selectionStart === 'number' ? ae.selectionStart : null;

  const bw = document.querySelector('.board-wrap');
  const boardScroll = bw ? bw.scrollLeft : 0;

  const lg = activeLeague();
  if (UI.view === 'league' && !lg) UI.view = 'home';
  const app = document.getElementById('app');
  let html;
  if (!Store.authReady) {
    html = header(null) + `<main class="main"><div class="empty-card">Loading…</div></main>`;
  } else if (Store.mode === 'cloud' && !Store.user) {
    html = header(null) + `<main class="main">${viewAuth()}</main>`;
  } else {
    html = header(UI.view === 'league' ? lg : null);
    if (UI.view === 'create') html += `<main class="main">${viewCreate()}</main>`;
    else if (UI.view === 'join') html += `<main class="main">${viewJoin()}</main>`;
    else if (UI.view === 'league') html += `<main class="main has-nav">${viewLeague(lg)}</main>` + bottomNav(lg);
    else html += `<main class="main">${viewHome()}</main>`;
  }
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
  updateClock();
}

function header(lg) {
  if (!lg) {
    return `<header class="topbar"><div class="topbar-in">
      <button class="brand" data-act="home" aria-label="Home">
        <span class="brand-mark">GS</span><span class="brand-name">Gridiron Saturday</span>
      </button></div></header>`;
  }
  const status = lg.phase === 'lobby' ? 'Lobby' : lg.phase === 'draft' ? 'Draft' : lg.phase === 'done' ? 'Final' : weekLabel(lg.week);
  return `<header class="topbar"><div class="topbar-in">
    <button class="icon-btn" data-act="home" aria-label="All leagues"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
    <div class="tb-title"><div class="tb-name">${esc(lg.name)}</div>
      <div class="tb-sub">${esc(confsLabel(lg.conferences))}, ${lg.size} teams, ${SCORING_LABEL[lg.scoring]}${usesReal(lg) ? ', real stats' : ''}</div></div>
    <span class="tb-pill">${status}</span>
  </div></header>`;
}

function bottomNav(lg) {
  const tabs = lg.phase === 'lobby'
    ? [['lobby', 'Lobby'], ['league', 'League']]
    : lg.phase === 'draft'
    ? [['draft', 'Draft'], ['league', 'League']]
    : [['team', 'My Team'], ['matchup', 'Matchup'], ['players', 'Players'], ['standings', 'Standings'], ['league', 'League']];
  return `<nav class="bottomnav">${tabs.map(([k, label]) =>
    `<button class="bn ${UI.tab === k ? 'on' : ''}" data-act="tab" data-id="${k}">${ICON[k]}<span>${label}</span></button>`).join('')}</nav>`;
}

/* ---------- Home ---------- */
function leagueStatus(lg) {
  const me = userIdx(lg);
  if (lg.phase === 'lobby') return `<span class="tag">Waiting to draft</span>`;
  if (lg.phase === 'draft') {
    return onClock(lg) === me && me >= 0
      ? `<span class="tag tag-gold">Your pick!</span>` : `<span class="tag tag-live">Drafting</span>`;
  }
  if (lg.phase === 'done') return `<span class="tag tag-gold">${isMe(lg.teams[lg.champion]) ? 'Champion' : 'Season over'}</span>`;
  return `<span class="tag">${weekLabel(lg.week)}</span>`;
}
function viewHome() {
  const cards = Store.list().map(lg => {
    const me = lg.teams[userIdx(lg)];
    const friends = humanCount(lg) - 1;
    return `<button class="league-card" data-act="open" data-id="${lg.id}">
      <div class="lc-top"><span class="lc-name">${esc(lg.name)}</span>${leagueStatus(lg)}</div>
      <div class="lc-meta">${esc(confsLabel(lg.conferences))}, ${lg.size} teams, ${SCORING_LABEL[lg.scoring]}${lg.multi ? `, ${friends} friend${friends === 1 ? '' : 's'}` : ''}</div>
      <div class="lc-me"><span>${me ? esc(me.name) : ''}</span>${me && !['lobby', 'draft'].includes(lg.phase) ? `<b>${record(me)}</b>` : ''}</div>
    </button>`;
  }).join('');
  const deviceCount = Store.deviceLeagues().length;
  return `
  <section class="hero">
    <div class="hero-field" aria-hidden="true"></div>
    <h1 class="hero-h">College fantasy football</h1>
    <p class="hero-p">Pick the conferences you care about, draft real college players, and play against friends or CPU managers.</p>
    <button class="btn btn-gold btn-lg" data-act="new">Create a league</button>
  </section>
  ${Store.error ? `<div class="banner bad" style="margin-top:14px">${esc(Store.error)}</div>` : ''}
  ${deviceCount ? `<div class="banner info" style="margin-top:14px"><span>You have ${deviceCount} league${deviceCount === 1 ? '' : 's'} saved on this device from before accounts.</span>
    <button class="btn btn-sm" data-act="import">Add to my account</button></div>` : ''}
  <h2 class="sec-title">Your leagues</h2>
  ${cards || `<div class="empty-card">No leagues yet. Create one, or open an invite link from a friend.</div>`}
  ${Store.mode === 'cloud' ? `<div class="account-row"><span class="muted small">Signed in as <b>${esc(Store.user.email || Store.displayName())}</b></span>
    <button class="link" data-act="signout">Sign out</button></div>` : ''}`;
}

/* ---------- Sign in ---------- */
function viewAuth() {
  const s = UI.auth;
  const joining = UI.join && UI.join.id;
  const up = s.mode === 'signup';
  return `
  <section class="hero auth-hero">
    <div class="hero-field" aria-hidden="true"></div>
    <h1 class="hero-h">${joining ? 'You\'re invited' : 'College fantasy football'}</h1>
    <p class="hero-p">${joining ? 'Sign in to join your friend\'s league.' : 'Sign in to keep your leagues on every device and play with friends.'}</p>
  </section>
  <div class="card auth-card">
    <button class="btn btn-block btn-lg google-btn" data-act="google" ${s.busy ? 'disabled' : ''}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" stroke="none" d="M22 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.6a4.8 4.8 0 0 1-2.1 3.1v2.6h3.4c2-1.8 3.1-4.5 3.1-7.5z"/><path fill="#34A853" stroke="none" d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.7v2.7A10 10 0 0 0 12 22z"/><path fill="#FBBC05" stroke="none" d="M6.2 13.6a6 6 0 0 1 0-3.8V7.1H2.7a10 10 0 0 0 0 9.2z"/><path fill="#EA4335" stroke="none" d="M12 6c1.5 0 2.9.5 4 1.5l3-3A10 10 0 0 0 2.7 7.1l3.5 2.7C7 7.8 9.3 6 12 6z"/></svg>
      Continue with Google</button>
    <div class="or"><span>or use email</span></div>
    <label class="field"><span>Email</span>
      <input id="a-email" class="input" type="email" autocomplete="email" data-afield="email" value="${esc(s.email)}"></label>
    <label class="field"><span>Password${up ? ' (at least 6 characters)' : ''}</span>
      <input id="a-pw" class="input" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" data-afield="pw" value="${esc(s.pw)}"></label>
    ${s.error ? `<div class="banner bad">${esc(s.error)}</div>` : ''}
    <button class="btn btn-primary btn-block btn-lg" data-act="email-auth" ${s.busy ? 'disabled' : ''}>${up ? 'Create account' : 'Sign in'}</button>
    <div class="auth-links">
      <button class="link" data-act="auth-mode">${up ? 'Have an account? Sign in' : 'New here? Create an account'}</button>
      ${up ? '' : '<button class="link" data-act="reset-pw">Forgot password?</button>'}
    </div>
  </div>`;
}
function authError(err) {
  const code = (err && err.code) || '';
  const map = {
    'auth/invalid-email': 'That email address doesn\'t look right.',
    'auth/missing-password': 'Enter your password.',
    'auth/weak-password': 'Use a password with at least 6 characters.',
    'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'No account with that email. Create one instead.',
    'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
    'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups, or use email.',
    'auth/popup-closed-by-user': '',
    'auth/cancelled-popup-request': '',
    'auth/unauthorized-domain': 'This website isn\'t on Firebase\'s approved list yet. Add it under Authentication, Settings, Authorized domains.',
    'auth/operation-not-allowed': 'That sign-in method isn\'t turned on in Firebase yet.',
    'auth/network-request-failed': 'Couldn\'t connect. Check your internet.',
  };
  return code in map ? map[code] : 'Something went wrong signing in. Try again.';
}

/* ---------- Join from an invite link ---------- */
function viewJoin() {
  const j = UI.join;
  if (!j || j.loading) return `<div class="empty-card">Opening invite…</div>`;
  if (!j.lg) {
    return `<div class="page-head"><button class="link" data-act="home">Back</button><h1>Invite</h1></div>
      <div class="empty-card">This invite link doesn't work anymore. The league may have been deleted. Ask your friend for a new link.</div>`;
  }
  const lg = j.lg;
  const owner = lg.teams.find(t => t.ownerUid === lg.commissioner);
  const openSpots = lg.teams.filter(t => !t.ownerUid).length;
  const late = lg.phase !== 'lobby';
  return `
  <div class="page-head"><button class="link" data-act="home">Cancel</button><h1>Join league</h1></div>
  <div class="card">
    <h3 class="card-h">${esc(lg.name)}</h3>
    <p class="muted">${owner ? `${esc(owner.ownerName || owner.name)} invited you. ` : ''}${esc(confsLabel(lg.conferences))}, ${lg.size} teams, ${SCORING_LABEL[lg.scoring]}${usesReal(lg) ? ', real stats' : ''}.</p>
    <p class="muted small">${lg.draftType === 'turns' ? 'Take-turns draft: pick whenever it\'s your turn.' : `Live draft with a ${lg.pickSeconds}-second pick timer.`}</p>
    ${openSpots === 0 ? `<div class="banner bad">This league is full.</div>` : `
      ${late ? `<div class="banner info"><span>This league already drafted. You'll take over a CPU team, including its players and record.</span></div>` : ''}
      <label class="field"><span>Your team name</span>
        <input id="j-team" class="input" data-jfield="teamName" maxlength="30" value="${esc(j.teamName)}"></label>
      ${j.error ? `<div class="banner bad">${esc(j.error)}</div>` : ''}
      <button class="btn btn-gold btn-lg btn-block" data-act="join" ${j.busy ? 'disabled' : ''}>Join league</button>`}
  </div>`;
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

  ${Store.mode === 'cloud' ? `<div class="card">
    <h3 class="card-h">Who's playing?</h3>
    <div class="chips">
      <button class="chip ${!c.multi ? 'on' : ''}" data-act="multi" data-id="0">Just me vs CPU</button>
      <button class="chip ${c.multi ? 'on' : ''}" data-act="multi" data-id="1">With friends</button>
    </div>
    ${c.multi ? `<p class="muted small">You'll get an invite link. Open spots become CPU teams when you start the draft.</p>
    <h3 class="card-h">Draft style</h3>
    <div class="chips">
      <button class="chip ${c.draftType === 'live' ? 'on' : ''}" data-act="dtype" data-id="live">Live draft</button>
      <button class="chip ${c.draftType === 'turns' ? 'on' : ''}" data-act="dtype" data-id="turns">Take turns</button>
    </div>
    <p class="muted small">${c.draftType === 'live'
      ? 'Everyone drafts at the same time. If the timer runs out, the best player is picked for you.'
      : 'No timer. Each person picks whenever it\'s their turn, even days apart.'}</p>
    ${c.draftType === 'live' ? `<h3 class="card-h">Time per pick</h3>
    <div class="chips">${[30, 60, 90, 120].map(s => `<button class="chip ${c.pickSeconds === s ? 'on' : ''}" data-act="ptime" data-id="${s}">${s < 120 ? s + ' sec' : '2 min'}</button>`).join('')}</div>` : ''}` : ''}
  </div>` : ''}

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
  if (lg.phase === 'lobby' && !['lobby', 'league'].includes(UI.tab)) UI.tab = 'lobby';
  if (lg.phase !== 'lobby' && UI.tab === 'lobby') UI.tab = 'draft';
  if (lg.phase === 'draft' && !['draft', 'league'].includes(UI.tab)) UI.tab = 'draft';
  if (lg.phase !== 'draft' && lg.phase !== 'lobby' && UI.tab === 'draft') UI.tab = 'team';
  switch (UI.tab) {
    case 'lobby': return viewLobby(lg);
    case 'draft': return viewDraft(lg);
    case 'matchup': return viewMatchup(lg);
    case 'players': return viewPlayers(lg);
    case 'standings': return viewStandings(lg);
    case 'league': return viewLeagueInfo(lg);
    default: return viewTeam(lg);
  }
}

/* ---------- Lobby (friends league before the draft) ---------- */
function inviteLink(lg) { return `${location.origin}${location.pathname}#join=${lg.id}`; }
function inviteCard(lg) {
  const open = lg.teams.filter(t => !t.ownerUid).length;
  if (!lg.multi || open === 0) return '';
  return `<div class="card invite">
    <h3 class="card-h">Invite friends</h3>
    <p class="muted small">${lg.phase === 'lobby' ? `${open} open spot${open === 1 ? '' : 's'}. Send this link to friends.` : 'Friends who join now take over a CPU team.'}</p>
    <div class="invite-row"><input id="invite-link" class="input" readonly value="${esc(inviteLink(lg))}">
      <button class="btn btn-primary" data-act="copy-invite">${navigator.share ? 'Share' : 'Copy'}</button></div>
  </div>`;
}
function viewLobby(lg) {
  const rows = lg.teams.map(t => `<div class="mgr">
      <span>${t.ownerUid ? esc(t.name) : '<span class="muted">Open spot</span>'}</span>
      <span class="muted small">${t.ownerUid ? esc(t.ownerName || '') + (t.ownerUid === lg.commissioner ? ' (commissioner)' : '') + (isMe(t) ? ', you' : '') : 'Becomes a CPU team'}</span>
    </div>`).join('');
  const people = humanCount(lg);
  return `
  <section class="team-head"><div><div class="th-name">Draft lobby</div>
    <div class="th-sub">${people} of ${lg.size} spots filled. ${lg.draftType === 'turns' ? 'Take-turns draft' : `Live draft, ${lg.pickSeconds} seconds per pick`}.</div></div></section>
  ${inviteCard(lg)}
  <div class="card flush"><div class="list-h">Teams</div>${rows}</div>
  ${isCommish(lg)
    ? `<button class="btn btn-gold btn-lg btn-block" data-act="start-draft">Start the draft</button>
       <p class="muted small center">Draft order is random. Make sure everyone has joined first.</p>`
    : `<div class="banner info"><span>Waiting for the commissioner to start the draft.${lg.draftType === 'live' ? ' Keep this page open so you don\'t miss your picks.' : ''}</span></div>`}`;
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

  const solo = !lg.multi;
  const onTeam = lg.teams[ti];
  const myTeam = lg.teams[me];
  const who = mine ? "You're on the clock"
    : isHuman(onTeam) ? `${esc(onTeam.ownerName || onTeam.name)} is picking` : `${esc(onTeam.name)} is picking`;
  const clock = `<section class="clock ${mine ? 'mine' : ''}">
    <div class="clock-top"><span>Round ${info.round} of ${DRAFT_ROUNDS}</span><span>Pick ${info.overall} of ${totalPicks(lg)}</span></div>
    <div class="clock-team">${who}</div>
    <div class="clock-sub">${mine ? 'Choose a player below.' : until > 0 ? `Your next pick is in ${until}.` : ''}
      ${lg.pickSeconds ? `<span class="pick-timer" id="pick-timer"></span>` : ''}</div>
    <div class="clock-actions">
      ${solo
        ? (mine
          ? `<button class="btn btn-gold" data-act="autopick">Auto-pick for me</button>`
          : `<button class="btn btn-ghost-light" data-act="sim">Skip to my pick</button>
             <button class="btn btn-ghost-light" data-act="pause">${UI.paused ? 'Resume' : 'Pause'}</button>`)
          + `<button class="btn btn-ghost-light" data-act="autodraft">Auto-draft the rest</button>`
        : (mine ? `<button class="btn btn-gold" data-act="autopick">Auto-pick for me</button>` : '')
          + (myTeam ? `<button class="btn btn-ghost-light" data-act="toggle-auto">Auto-draft for me: ${myTeam.autoDraft ? 'On' : 'Off'}</button>` : '')}
    </div>
    ${!solo && myTeam && myTeam.autoDraft ? `<div class="clock-last">Auto-draft is on. Your picks are made for you, even when you're away.</div>` : ''}
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
  const cols = lg.teams.map(t => `<th class="${isMe(t) ? 'me' : ''}">${esc(t.name)}</th>`).join('');
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
  ${done ? `<div class="banner gold">${isMe(lg.teams[lg.champion]) ? 'You won the championship.' : `${esc(lg.teams[lg.champion].name)} won the championship.`} Numbers below are season totals.</div>` : ''}
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
    top = `<div class="banner gold">${isMe(champ) ? 'You are the league champion.' : `${esc(champ.name)} won the championship.`}</div>`;
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
  const rows = st.map((t, i) => `<tr class="${isMe(t) ? 'me' : ''} ${i === PLAYOFF_TEAMS - 1 ? 'cut' : ''}">
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
      ${lg.phase !== 'lobby' && me >= 0 ? `<dt>Your draft slot</dt><dd>${ordinal(me + 1)}</dd>` : ''}
      ${lg.multi ? `<dt>Draft</dt><dd>${lg.draftType === 'turns' ? 'Take turns' : `Live, ${lg.pickSeconds} sec per pick`}</dd>` : ''}
      <dt>Season</dt><dd>${REG_WEEKS} weeks, ${PLAYOFF_TEAMS}-team playoff</dd>
    </dl>
    <div class="conf-pills">${lg.conferences.map(id => {
      const c = CONF_MAP.get(id);
      return `<span class="cpill"><i style="background:${c.color}"></i>${esc(c.name)}</span>`;
    }).join('')}</div>
  </div>
  <h2 class="sec-title">Managers</h2>
  <div class="card flush">${lg.teams.map(t => `<div class="mgr"><span>${t.open ? '<span class="muted">Open spot</span>' : esc(t.name)}</span><span class="muted small">${
    isMe(t) ? 'You' : t.ownerUid ? esc(t.ownerName || 'Friend') : t.open ? '' : 'CPU'}${t.ownerUid && t.ownerUid === lg.commissioner ? ' (commissioner)' : ''}</span></div>`).join('')}</div>
  ${lg.phase !== 'lobby' ? inviteCard(lg) : ''}
  ${myPicks.length ? `<h2 class="sec-title">Your draft picks</h2><div class="card flush">${myPicks.map(({ pk, n }) => {
    const p = PMAP.get(pk.pid), inf = pickInfo(n, lg.size);
    return `<div class="prow"><div class="rank">R${inf.round}</div>${pmain(p)}<div class="pnum"><b>${inf.overall}</b><small>overall</small></div></div>`;
  }).join('')}</div>` : ''}
  ${isCommish(lg)
    ? `<button class="btn btn-danger btn-block" data-act="delete">Delete league</button>`
    : `<button class="btn btn-danger btn-block" data-act="leave">Leave league</button>`}`;
}

/* ---------- Modals ---------- */
function viewModal(lg) {
  const m = UI.modal;
  let inner = '';
  if (m.type === 'player' && lg) inner = playerModal(lg, PMAP.get(m.id));
  else if (m.type === 'drop' && lg) inner = dropModal(lg, PMAP.get(m.id));
  else if (m.type === 'delete') {
    inner = `<h3 class="m-h">Delete this league?</h3><p class="muted">This removes the league and all of its results${lg && lg.multi ? ' for everyone in it' : ''}.</p>
      <div class="m-actions"><button class="btn" data-act="close-modal">Keep league</button><button class="btn btn-danger" data-act="confirm-delete">Delete league</button></div>`;
  } else if (m.type === 'leave') {
    inner = `<h3 class="m-h">Leave this league?</h3><p class="muted">A CPU manager takes over your team. You can rejoin later with an invite link if a spot is open.</p>
      <div class="m-actions"><button class="btn" data-act="close-modal">Stay</button><button class="btn btn-danger" data-act="confirm-leave">Leave league</button></div>`;
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
/* Draft automation. Every quarter second, the open league checks whether
   a pick is due: a CPU team, a team with auto-draft on, or a live-draft
   timer that ran out. Every friend's browser runs this, but each pick is
   saved only if the draft hasn't moved on, so it never picks twice. */
const CPU_DELAY_SOLO = 450;
const CPU_DELAY_MULTI = 1500;
let draftWorking = false;

function draftDueIn(lg) {
  if (!lg || lg.phase !== 'draft') return null;
  const ti = onClock(lg);
  if (ti < 0) return null;
  const t = lg.teams[ti];
  const elapsed = Date.now() - (lg.pickStartedAt || 0);
  if (!isHuman(t) || t.autoDraft) return (lg.multi ? CPU_DELAY_MULTI : CPU_DELAY_SOLO) - elapsed;
  if (lg.pickSeconds) return lg.pickSeconds * 1000 - elapsed;
  return null; // take-turns draft: wait for the person
}

function draftTick() {
  const lg = activeLeague();
  if (!lg || UI.view !== 'league' || lg.phase !== 'draft' || draftWorking || busy) return;
  if (!lg.multi && (UI.paused || UI.modal || UI.tab !== 'draft')) return;
  const due = draftDueIn(lg);
  if (due === null || due > 0) return;
  const n = lg.picks.length;
  draftWorking = true;
  const wasMine = onClock(lg) === userIdx(lg);
  Store.update(lg.id, fresh => {
    if (fresh.phase !== 'draft' || fresh.picks.length !== n) return false;
    const fdue = draftDueIn(fresh);
    if (fdue === null || fdue > 0) return false;
    return makePick(fresh, cpuChoice(fresh, onClock(fresh)));
  }).then(ok => {
    draftWorking = false;
    if (ok && wasMine && lg.multi) toast('Time ran out, so the best available player was picked for you.');
    afterPick();
  }).catch(err => { draftWorking = false; console.error(err); });
}

function updateClock() {
  const el = document.getElementById('pick-timer');
  const lg = activeLeague();
  if (!el || !lg || lg.phase !== 'draft' || !lg.pickSeconds) return;
  const t = lg.teams[onClock(lg)];
  if (!t || !isHuman(t) || t.autoDraft) { el.textContent = ''; return; }
  const left = Math.max(0, Math.ceil((lg.pickSeconds * 1000 - (Date.now() - lg.pickStartedAt)) / 1000));
  el.textContent = ` ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left`;
  el.classList.toggle('low', left <= 10);
}

let lastPhase = {};
function afterPick() {
  const lg = activeLeague();
  if (lg && lastPhase[lg.id] === 'draft' && lg.phase !== 'draft' && UI.tab === 'draft') {
    UI.tab = 'team';
    toast('Draft complete. Your lineup is set for Week 1.');
  }
  if (lg) lastPhase[lg.id] = lg.phase;
  render();
}

/* =========================================================
   EVENTS
   ========================================================= */
const actions = {
  noop() {},
  home() {
    UI.view = 'home'; UI.modal = null; UI.move = null; UI.leagueId = null; UI.join = null;
    render(); window.scrollTo(0, 0);
  },
  new() { UI.create = newCreateState(); UI.view = 'create'; render(); window.scrollTo(0, 0); },
  open(id) {
    const lg = Store.get(id);
    if (!lg) return;
    UI.leagueId = id;
    UI.view = 'league';
    UI.tab = lg.phase === 'lobby' ? 'lobby' : lg.phase === 'draft' ? 'draft' : 'team';
    UI.week = null; UI.game = null; UI.move = null; UI.paused = false; resetFilters();
    lastPhase[id] = lg.phase;
    render(); window.scrollTo(0, 0);
  },

  /* ----- Sign in ----- */
  google() {
    UI.auth.error = ''; UI.auth.busy = true; render();
    Store.signInGoogle().catch(err => { UI.auth.error = authError(err); })
      .finally(() => { UI.auth.busy = false; render(); });
  },
  'email-auth'() {
    const s = UI.auth;
    s.error = ''; s.busy = true; render();
    const p = s.mode === 'signup' ? Store.signUpEmail(s.email.trim(), s.pw) : Store.signInEmail(s.email.trim(), s.pw);
    p.then(() => { s.pw = ''; }).catch(err => { s.error = authError(err); })
      .finally(() => { s.busy = false; render(); });
  },
  'auth-mode'() { UI.auth.mode = UI.auth.mode === 'signup' ? 'signin' : 'signup'; UI.auth.error = ''; render(); },
  'reset-pw'() {
    const email = UI.auth.email.trim();
    if (!email) { UI.auth.error = 'Type your email above first, then tap Forgot password.'; render(); return; }
    Store.resetPassword(email)
      .then(() => toast('Check your email for a link to reset your password.'))
      .catch(err => { UI.auth.error = authError(err); render(); });
  },
  signout() { UI.leagueId = null; UI.view = 'home'; Store.signOut(); },
  import() {
    Store.importDeviceLeagues().then(n => toast(`Added ${n} league${n === 1 ? '' : 's'} to your account.`))
      .catch(err => { console.error(err); toast("Couldn't move those leagues. Try again."); });
  },

  /* ----- Create ----- */
  multi(id) { UI.create.multi = id === '1'; render(); },
  dtype(id) { UI.create.draftType = id; render(); },
  ptime(id) { UI.create.pickSeconds = +id; render(); },
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
      ownerUid: ME_UID, ownerName: Store.displayName(),
      multi: Store.mode === 'cloud' && c.multi, draftType: c.draftType, pickSeconds: c.pickSeconds,
    });
    if (busy) return;
    busy = true;
    Store.create(lg).then(() => {
      busy = false;
      UI.leagueId = lg.id;
      UI.view = 'league'; UI.tab = lg.phase === 'lobby' ? 'lobby' : 'draft'; UI.dtab = 'players'; UI.paused = false; resetFilters();
      render(); window.scrollTo(0, 0);
    }).catch(err => { busy = false; console.error(err); toast("Couldn't create the league. Check your connection."); });
  },

  /* ----- Friends ----- */
  'copy-invite'() {
    const lg = activeLeague();
    const link = inviteLink(lg);
    if (navigator.share) {
      navigator.share({ title: lg.name, text: `Join my college fantasy football league, ${lg.name}!`, url: link }).catch(() => {});
      return;
    }
    const done = () => toast('Invite link copied. Paste it to your friends.');
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => selectInvite());
    else selectInvite();
  },
  join() {
    const j = UI.join;
    if (!j || !j.lg || j.busy) return;
    j.busy = true; j.error = ''; render();
    const name = (j.teamName || '').trim() || Store.displayName() + "'s Team";
    Store.update(j.id, lg => joinLeague(lg, ME_UID, Store.displayName(), name) === 'joined')
      .then(ok => {
        j.busy = false;
        const lg = Store.get(j.id);
        if (!ok && !(lg && userIdx(lg) >= 0)) { j.error = 'That league filled up before you joined.'; render(); return; }
        toast(`You joined ${j.lg.name}!`);
        UI.join = null;
        waitForLeague(j.id);
      })
      .catch(err => { console.error(err); j.busy = false; j.error = "Couldn't join. Check your connection and try again."; render(); });
  },
  'start-draft'() { mutate(lg => isCommish(lg) && startDraft(lg), 'The draft has started!').then(() => { UI.tab = 'draft'; render(); }); },
  'toggle-auto'() {
    mutate(lg => { const t = lg.teams[userIdx(lg)]; if (!t) return false; t.autoDraft = !t.autoDraft; });
  },
  leave() { UI.modal = { type: 'leave' }; render(); },
  'confirm-leave'() {
    const id = UI.leagueId;
    UI.modal = null; UI.leagueId = null; UI.view = 'home';
    Store.update(id, lg => { if (isCommish(lg)) return false; leaveLeague(lg, ME_UID); })
      .then(() => toast('You left the league. A CPU manager took over your team.'))
      .catch(() => toast("Couldn't leave the league. Try again."));
    render();
  },

  /* ----- Draft ----- */
  tab(id) { UI.tab = id; UI.move = null; UI.week = null; UI.game = null; UI.f.q = ''; render(); window.scrollTo(0, 0); },
  dtab(id) { UI.dtab = id; render(); },
  fpos(id) { UI.f.pos = id; render(); },
  draft(id) {
    const p = PMAP.get(id);
    UI.modal = null;
    mutate(lg => onClock(lg) === userIdx(lg) && makePick(lg, id), `You drafted ${p.name}.`).then(afterPick);
  },
  autopick() {
    mutate(lg => {
      const me = userIdx(lg);
      return onClock(lg) === me && makePick(lg, cpuChoice(lg, me));
    }, 'Picked the best available player for you.').then(afterPick);
  },
  sim() {
    UI.paused = false;
    mutate(lg => {
      if (lg.multi) return false;
      const me = userIdx(lg);
      let n = 0;
      while (lg.phase === 'draft' && onClock(lg) !== me) { makePick(lg, cpuChoice(lg, onClock(lg))); n++; }
      return n > 0;
    }).then(afterPick);
  },
  pause() { UI.paused = !UI.paused; render(); },
  autodraft() {
    mutate(lg => {
      if (lg.multi) return false;
      while (lg.phase === 'draft') { if (!makePick(lg, cpuChoice(lg, onClock(lg)))) break; }
    }).then(afterPick);
  },

  /* ----- Team ----- */
  player(id) { UI.modal = { type: 'player', id }; render(); },
  'close-modal'() { UI.modal = null; render(); },
  move(id) { UI.move = id; render(); },
  'move-cancel'() { UI.move = null; render(); },
  'move-to'(id) {
    const mv = UI.move;
    UI.move = null;
    mutate(lg => { const t = lg.teams[userIdx(lg)]; if (!t) return false; doMove(t, mv, id); });
  },
  autoset() {
    UI.move = null;
    mutate(lg => { const t = lg.teams[userIdx(lg)]; if (!t) return false; autoLineup(lg, t, lg.week); },
      'Lineup set to your best projected starters.');
  },
  add(id) {
    const lg = activeLeague();
    const t = lg.teams[userIdx(lg)];
    if (!t || ownerMap(lg).has(id)) return;
    if (rosterOf(t).length >= ROSTER_MAX) { UI.modal = { type: 'drop', id }; render(); return; }
    UI.modal = null;
    mutate(fresh => {
      const ft = fresh.teams[userIdx(fresh)];
      if (!ft || ownerMap(fresh).has(id) || rosterOf(ft).length >= ROSTER_MAX) return false;
      ft.bench.push(id);
    }, `Added ${PMAP.get(id).name} to your bench.`);
  },
  drop(id) {
    UI.modal = null;
    mutate(lg => { const t = lg.teams[userIdx(lg)]; if (!t || !rosterOf(t).includes(id)) return false; removeFromRoster(t, id); },
      `Dropped ${PMAP.get(id).name}.`);
  },
  swapdrop(id) {
    const add = UI.modal.id;
    UI.modal = null;
    mutate(lg => {
      const t = lg.teams[userIdx(lg)];
      if (!t || ownerMap(lg).has(add) || !rosterOf(t).includes(id)) return false;
      // New player takes the dropped player's spot if eligible, else the bench.
      const si = t.starters.findIndex(s => s.pid === id);
      removeFromRoster(t, id);
      if (si >= 0 && ELIG[t.starters[si].slot].includes(PMAP.get(add).pos)) t.starters[si].pid = add;
      else t.bench.push(add);
    }, `Added ${PMAP.get(add).name}, dropped ${PMAP.get(id).name}.`);
  },

  /* ----- Season ----- */
  play() {
    const w = activeLeague().week;
    let result = null;
    mutate(lg => {
      if (lg.week !== w) return false;
      result = playWeek(lg);
      return !!result;
    }).then(ok => {
      UI.week = w; UI.game = null;
      if (!ok) { toast(`${weekLabel(w)} unlocks after the real games are finished.`); render(); return; }
      const lg = activeLeague();
      const me = userIdx(lg);
      const g = result && result.find(x => x.a === me || x.b === me);
      if (g) {
        const mine = g.a === me ? g.as : g.bs, theirs = g.a === me ? g.bs : g.as;
        toast(`${weekLabel(w)}: you ${g.winner === me ? 'won' : g.winner == null ? 'tied' : 'lost'} ${fmt(mine)} to ${fmt(theirs)}.`);
      } else toast(`${weekLabel(w)} is in the books.`);
      render(); window.scrollTo(0, 0);
    });
  },
  catchup() {
    let n = 0, last = activeLeague().week;
    mutate(lg => {
      n = 0;
      while (lg.phase !== 'done' && weekReady(lg, lg.week)) {
        last = lg.week;
        if (!playWeek(lg)) break;
        n++;
      }
      return n > 0;
    }).then(() => {
      UI.week = last; UI.game = null;
      const lg = activeLeague();
      const me = lg && lg.teams[userIdx(lg)];
      toast(`Scored ${n} week${n === 1 ? '' : 's'}.${me ? ` You're ${record(me)}.` : ''}`);
      render(); window.scrollTo(0, 0);
    });
  },
  week(id) { UI.week = +id; UI.game = null; render(); },
  game(id) { UI.game = +id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },

  /* ----- League ----- */
  delete() { UI.modal = { type: 'delete' }; render(); },
  'confirm-delete'() {
    const id = UI.leagueId;
    UI.modal = null; UI.leagueId = null; UI.view = 'home';
    POOL_CACHE.delete(id); RANK_CACHE.delete(id);
    Store.remove(id).then(() => toast('League deleted.')).catch(() => toast("Couldn't delete the league. Try again."));
    render();
  },
};
function selectInvite() {
  const el = document.getElementById('invite-link');
  if (el) { el.focus(); el.select(); toast('Press Ctrl+C to copy the link.'); }
}
function fixSize() {
  const c = UI.create;
  const ids = [...c.confs];
  if (sizeAllowed(ids, c.size)) return;
  const ok = LEAGUE_SIZES.filter(s => sizeAllowed(ids, s));
  if (ok.length) c.size = ok[ok.length - 1];
}
/* After joining, the league shows up in "my leagues" a moment later. */
function waitForLeague(id, tries = 0) {
  if (Store.get(id)) { actions.open(id); return; }
  if (tries > 40) { UI.view = 'home'; render(); return; }
  setTimeout(() => waitForLeague(id, tries + 1), 150);
}

/* ---------- Invite links (#join=LEAGUEID) ---------- */
function readInvite() {
  const m = location.hash.match(/^#join=([A-Za-z0-9]+)/);
  if (!m) return;
  UI.join = { id: m[1], lg: null, loading: true, teamName: '', busy: false, error: '' };
  history.replaceState(null, '', location.pathname + location.search);
  openInvite();
}
function openInvite() {
  const j = UI.join;
  if (!j || !Store.authReady) return;
  if (Store.mode === 'cloud' && !Store.user) { render(); return; } // sign in first
  if (Store.get(j.id)) { UI.join = null; actions.open(j.id); return; } // already a member
  UI.view = 'join';
  j.loading = true; render();
  Store.fetchOne(j.id).then(lg => {
    j.loading = false; j.lg = lg;
    if (lg && !j.teamName) j.teamName = Store.displayName() + "'s Team";
    render();
  }).catch(err => {
    console.error(err);
    j.loading = false; j.lg = null; render();
  });
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
  if (!el.dataset) return;
  if (el.dataset.field && UI.create) { UI.create[el.dataset.field] = el.value; return; }
  if (el.dataset.afield) { UI.auth[el.dataset.afield] = el.value; return; }
  if (el.dataset.jfield && UI.join) { UI.join[el.dataset.jfield] = el.value; return; }
  if (el.id === 'q') { UI.f.q = el.value; refreshList(); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'fconf') { UI.f.conf = el.value; refreshList(); }
  if (el.id === 'fsort') { UI.f.sort = el.value; refreshList(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && UI.modal) { UI.modal = null; render(); }
  if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.afield) actions['email-auth']();
});
window.addEventListener('hashchange', readInvite);

/* ---------- Boot ---------- */
(function boot() {
  let wasSignedIn = null;
  Store.onChange = () => {
    const signedIn = !!Store.user;
    if (UI.join && wasSignedIn !== signedIn) { wasSignedIn = signedIn; openInvite(); return; }
    wasSignedIn = signedIn;
    const lg = activeLeague();
    if (lg) {
      if (lastPhase[lg.id] === 'lobby' && lg.phase === 'draft' && UI.tab === 'lobby') { UI.tab = 'draft'; toast('The draft has started!'); }
      if (lastPhase[lg.id] === 'draft' && lg.phase !== 'draft' && UI.tab === 'draft') { UI.tab = 'team'; toast('Draft complete. Your lineup is set for Week 1.'); }
      lastPhase[lg.id] = lg.phase;
    }
    render();
  };
  Store.init();
  readInvite();
  render();
  setInterval(() => { draftTick(); updateClock(); }, 250);
})();
