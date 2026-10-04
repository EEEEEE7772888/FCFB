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
  ltab: 'standings', trade: null, chat: { id: null, msgs: [], unsub: null, draft: '' },
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
  document.body.classList.add('saving');
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

/* ---------- Avatars ----------
   Player icons use the school's color with the jersey number;
   team icons use initials with a color picked from the name. */
const SCHOOL_COLOR = new Map(
  (typeof REAL_DATA !== 'undefined' && REAL_DATA && REAL_DATA.teams ? REAL_DATA.teams : [])
    .filter(t => t.color).map(t => [t.school, t.color]));
function isLight(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170;
}
function schoolColor(p) {
  const c = SCHOOL_COLOR.get(p.team);
  if (c && /^#[0-9a-f]{6}$/i.test(c)) return c;
  const conf = CONF_MAP.get(p.conf);
  return conf ? conf.color : '#3a414b';
}
function playerAvatar(p, size = '') {
  const bg = schoolColor(p);
  const label = p.pos === 'DST' ? 'D' : (p.num !== '' && p.num != null ? p.num : p.name.split(' ').map(s => s[0]).join('').slice(0, 2));
  return `<span class="av ${size}" style="background:${bg};color:${isLight(bg) ? '#111' : '#fff'}">${esc(String(label))}</span>`;
}
const TEAM_HUES = [212, 4, 145, 268, 32, 188, 330, 96, 48, 240, 0, 170];
const TEAM_EMOJIS = ['🏈', '🦅', '🐻', '🐯', '🦬', '🐊', '🐺', '🦁', '🐂', '🐎', '⚡', '🔥', '💀', '👑', '🌪️', '🚀'];
function teamHue(t) {
  if (t && Number.isFinite(t.color)) return t.color;
  const name = (t && t.name) || '?';
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TEAM_HUES[h % TEAM_HUES.length];
}
function teamAvatar(t, size = '') {
  const name = (t && t.name) || '?';
  const initials = name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
  const inner = t && t.emoji ? `<span class="av-emoji">${t.emoji}</span>` : esc(initials);
  return `<span class="av team ${size}" style="background:hsl(${teamHue(t)} 55% 38%)">${inner}</span>`;
}

/* ---------- Icons ---------- */
const ICON = {
  team: '<svg viewBox="0 0 24 24"><path d="M6 4l3-1h6l3 1 3 4-3 2v10H6V10L3 8z"/></svg>',
  matchup: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14M7 10h2M15 10h2M7 14h2M15 14h2"/></svg>',
  players: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
  standings: '<svg viewBox="0 0 24 24"><path d="M5 20V11M12 20V5M19 20v-6"/></svg>',
  league: '<svg viewBox="0 0 24 24"><path d="M5 3v18M5 4h12l-2 4 2 4H5"/></svg>',
  draft: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
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
  if (!navigator.onLine) {
    html = html.replace('</header>', `</header><div class="offline">You're offline. Things will update when you reconnect.</div>`);
  }
  app.innerHTML = html;
  document.body.classList.toggle('saving', busy);
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
  watchChat(UI.view === 'league' ? lg : null);
  updateTitle();
  if (UI.view === 'league' && UI.tab === 'chat') scrollChat();
}

function header(lg) {
  if (!lg) {
    return `<header class="topbar"><div class="topbar-in">
      <button class="brand" data-act="home" aria-label="Home">
        <img class="brand-logo" src="logo.svg?v=2" alt=""><span class="brand-name">FCFB</span>
      </button>
      ${Store.mode === 'cloud' && Store.user ? `<button class="tb-account" data-act="account" aria-label="Account">${esc((Store.displayName()[0] || '?').toUpperCase())}</button>` : ''}
    </div></header>`;
  }
  const status = lg.phase === 'lobby' ? 'Lobby' : lg.phase === 'draft' ? 'Draft' : lg.phase === 'done' ? 'Final' : weekLabel(lg.week);
  return `<header class="topbar"><div class="topbar-in">
    <button class="icon-btn" data-act="home" aria-label="All leagues"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
    <div class="tb-title"><div class="tb-name">${esc(lg.name)}</div>
      <div class="tb-sub">${esc(confsLabel(lg.conferences))} · ${lg.size} teams · ${SCORING_LABEL[lg.scoring]}</div></div>
    <span class="tb-pill">${status}</span>
  </div></header>`;
}

function bottomNav(lg) {
  const chat = lg.multi ? [['chat', 'Chat']] : [];
  const tabs = lg.phase === 'lobby'
    ? [['lobby', 'Lobby'], ...chat, ['league', 'League']]
    : lg.phase === 'draft'
    ? [['draft', 'Draft'], ...chat, ['league', 'League']]
    : [['team', 'My Team'], ['matchup', 'Matchup'], ['players', 'Players'], ['league', 'League'], ...chat];
  const badge = k => {
    const n = k === 'chat' ? unreadCount(lg) : k === 'league' ? incomingTrades(lg).length : 0;
    return n ? `<i class="bn-badge">${n > 9 ? '9+' : n}</i>` : '';
  };
  return `<nav class="bottomnav">${tabs.map(([k, label]) =>
    `<button class="bn ${UI.tab === k ? 'on' : ''}" data-act="tab" data-id="${k}">${ICON[k]}${badge(k)}<span>${label}</span></button>`).join('')}</nav>`;
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
    const rank = me && !['lobby', 'draft'].includes(lg.phase) ? standings(lg).findIndex(x => x.id === me.id) + 1 : 0;
    return `<button class="league-card" data-act="open" data-id="${lg.id}">
      ${teamAvatar(me, 'lg')}
      <span class="lc-body">
        <span class="lc-name">${me ? esc(me.name) : esc(lg.name)}</span>
        <span class="lc-meta">${esc(lg.name)} · ${lg.size} teams${lg.multi ? ` · ${friends} friend${friends === 1 ? '' : 's'}` : ''}</span>
        <span class="lc-status">${leagueStatus(lg)}</span>
      </span>
      ${rank ? `<span class="lc-rec"><b>${record(me)}</b><small>${ordinal(rank)}</small></span>` : ''}
      <svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
    </button>`;
  }).join('');
  const deviceCount = Store.deviceLeagues().length;
  return `
  <div class="page-title"><h1>Leagues</h1>
    <button class="btn btn-primary btn-sm" data-act="new"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>New league</button></div>
  ${Store.error ? `<div class="banner bad" style="margin-top:14px">${esc(Store.error)}</div>` : ''}
  ${deviceCount ? `<div class="banner info" style="margin-top:14px"><span>You have ${deviceCount} league${deviceCount === 1 ? '' : 's'} saved on this device from before accounts.</span>
    <button class="btn btn-sm" data-act="import">Add to my account</button></div>` : ''}
  ${!Store.loaded ? `<div class="list-card">${[0, 1].map(() => `<div class="league-card skel"><span class="sk sk-av"></span><span class="lc-body"><span class="sk sk-line"></span><span class="sk sk-line short"></span></span></div>`).join('')}</div>`
    : cards ? `<div class="list-card">${cards}</div>` : `<div class="empty-card">
    <img class="brand-logo big" src="logo.svg?v=2" alt="FCFB logo">
    <h3>Start your first league</h3>
    <p>Pick your conferences, draft real college players, and play against friends or CPU managers.</p>
    <button class="btn btn-primary btn-lg" data-act="new">Create a league</button></div>`}
  ${newsSection()}
  <button class="help-link" data-act="help"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/></svg>How to play FCFB</button>
  ${Store.mode === 'cloud' ? `<div class="account-row"><span class="muted small">Signed in as <b>${esc(Store.user.email || Store.displayName())}</b></span>
    <button class="link" data-act="signout">Sign out</button></div>` : ''}`;
}

/* ---------- News ---------- */
function timeAgo(sec) {
  if (!sec) return '';
  const m = Math.max(1, Math.round((Date.now() / 1000 - sec) / 60));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
// Names of players on your teams, to tag headlines about them.
function myPlayerNames() {
  const names = new Set();
  for (const lg of Store.list()) {
    const t = lg.teams[userIdx(lg)];
    if (!t) continue;
    for (const pid of rosterOf(t)) {
      const p = PMAP.get(pid);
      if (p && p.pos !== 'DST' && p.name.length > 6) names.add(p.name.toLowerCase());
    }
  }
  return [...names];
}
function mySchools() {
  const set = new Set();
  for (const lg of Store.list()) {
    const t = lg.teams[userIdx(lg)];
    if (t) rosterOf(t).forEach(pid => { const p = PMAP.get(pid); if (p) set.add(p.team); });
  }
  return set;
}
function playerNews(p) {
  if (typeof NEWS === 'undefined' || !NEWS || !Array.isArray(NEWS.items) || p.pos === 'DST') return [];
  const name = p.name.toLowerCase();
  return NEWS.items.filter(n => n.t.toLowerCase().includes(name)).slice(0, 3);
}
function newsSection() {
  if (typeof NEWS === 'undefined' || !NEWS || !Array.isArray(NEWS.items) || !NEWS.items.length) return '';
  const mine = myPlayerNames();
  const schools = mySchools();
  const all = NEWS.items.map(n => {
    const low = n.t.toLowerCase();
    const school = (n.sc || []).find(s => schools.has(s)) || '';
    return Object.assign({}, n, { mine: mine.some(name => low.includes(name)), school });
  });
  // Your players first, then schools your players are from, then newest.
  const rankOf = n => (n.mine ? 2 : 0) + (n.school ? 1 : 0);
  all.sort((x, y) => (rankOf(y) - rankOf(x)) || (y.d - x.d));
  const shown = all.slice(0, UI.newsAll ? 30 : 6);
  const rows = shown.map(n => `<a class="news-row" href="${esc(n.u)}" target="_blank" rel="noopener noreferrer">
      <span class="news-t">${esc(n.t)}</span>
      <span class="news-m">${n.mine ? '<span class="news-tag">Your player</span>' : n.school ? `<span class="news-tag alt">${esc(n.school)}</span>` : ''}<b>${esc(n.s)}</b>${n.d ? ` · ${timeAgo(n.d)}` : ''}</span>
    </a>`).join('');
  return `<div class="sec-row"><h2 class="sec-title">College football news</h2>
      ${NEWS.updated ? `<span class="muted small">Updated ${timeAgo(Date.parse(NEWS.updated) / 1000)}</span>` : ''}</div>
    <div class="list-card news">${rows}
      ${all.length > 6 ? `<button class="news-more" data-act="news-more">${UI.newsAll ? 'Show less' : 'More headlines'}</button>` : ''}</div>
    <p class="muted small news-credit">Headlines come from ESPN and other news sites. Tap one to read the full story there.</p>`;
}

/* ---------- Sign in ---------- */
function viewAuth() {
  const s = UI.auth;
  const joining = UI.join && UI.join.id;
  const up = s.mode === 'signup';
  return `
  <section class="auth-hero">
    <img class="brand-logo big" src="logo.svg?v=2" alt="FCFB logo">
    <h1>${joining ? 'You\'re invited' : 'FCFB'}</h1>
    <p>${joining ? 'Sign in to join your friend\'s league.' : 'College fantasy football. Sign in to keep your leagues on every device and play with friends.'}</p>
  </section>
  <div class="card auth-card">
    <button class="btn btn-block btn-lg google-btn" data-act="google" ${s.busy ? 'disabled' : ''}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" stroke="none" d="M22 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.6a4.8 4.8 0 0 1-2.1 3.1v2.6h3.4c2-1.8 3.1-4.5 3.1-7.5z"/><path fill="#34A853" stroke="none" d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.7v2.7A10 10 0 0 0 12 22z"/><path fill="#FBBC05" stroke="none" d="M6.2 13.6a6 6 0 0 1 0-3.8V7.1H2.7a10 10 0 0 0 0 9.2z"/><path fill="#EA4335" stroke="none" d="M12 6c1.5 0 2.9.5 4 1.5l3-3A10 10 0 0 0 2.7 7.1l3.5 2.7C7 7.8 9.3 6 12 6z"/></svg>
      Continue with Google</button>
    ${typeof APP_CONFIG !== 'undefined' && APP_CONFIG.appleSignIn ? `<button class="btn btn-block btn-lg apple-btn" data-act="apple" ${s.busy ? 'disabled' : ''}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="none" d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.75.73 1.05 1.6 2.24 2.73 2.2 1.1-.05 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.3-.88-2.32-3.5zM14.2 6.13c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.68-.92 2.67.97.08 1.96-.49 2.56-1.22z"/></svg>
      Continue with Apple</button>` : ''}
    <div class="or"><span>or use email</span></div>
    <label class="field"><span>Email</span>
      <input id="a-email" class="input" type="email" autocomplete="email" data-afield="email" value="${esc(s.email)}"></label>
    <label class="field"><span>Password${up ? ' (at least 6 characters)' : ''}</span>
      <input id="a-pw" class="input" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" data-afield="pw" value="${esc(s.pw)}"></label>
    ${s.error ? `<div class="banner bad">${esc(s.error)}</div>` : ''}
    <button class="btn btn-primary btn-block btn-lg" data-act="email-auth" ${s.busy ? 'disabled' : ''}>${up ? 'Create account' : 'Sign in'}</button>
    <p class="legal-line">By continuing, you agree to the <a href="terms.html" target="_blank" rel="noopener">Terms of Use</a>, including no tolerance for abusive or objectionable content, and the <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</p>
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
    'auth/native-missing': 'This sign-in option needs the latest FCFB app. Use email for now.',
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
  if (lg.phase === 'lobby' && !['lobby', 'league', 'chat'].includes(UI.tab)) UI.tab = 'lobby';
  if (lg.phase !== 'lobby' && UI.tab === 'lobby') UI.tab = 'draft';
  if (lg.phase === 'draft' && !['draft', 'league', 'chat'].includes(UI.tab)) UI.tab = 'draft';
  if (lg.phase !== 'draft' && lg.phase !== 'lobby' && UI.tab === 'draft') UI.tab = 'team';
  switch (UI.tab) {
    case 'lobby': return viewLobby(lg);
    case 'draft': return viewDraft(lg);
    case 'matchup': return viewMatchup(lg);
    case 'players': return viewPlayers(lg);
    case 'standings': UI.tab = 'league'; UI.ltab = 'standings'; return viewLeagueHub(lg);
    case 'league': return viewLeagueHub(lg);
    case 'chat': return viewChat(lg);
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
      <button class="btn btn-primary" data-act="copy-invite">${Native.canShare() ? 'Share' : 'Copy'}</button></div>
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
    ${playerAvatar(p)}
    <span class="ptext"><span class="pname">${esc(p.pos === 'DST' ? p.team + ' D/ST' : p.name)}${injBadge(activeLeague(), p.id)}${trendBadge(activeLeague(), p)}</span>
    <span class="pmeta">${posBadge(p.pos)}<span class="ellip">${esc(p.team)}${extra}</span></span></span>
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
function moveTargets(t, mv, locked = () => false) {
  const T = new Set();
  const fromS = mv[0] === 'S' ? +mv.slice(1) : null;
  const fromPid = fromS !== null ? t.starters[fromS].pid : mv.slice(1);
  const fromSlot = fromS !== null ? t.starters[fromS].slot : 'BN';
  const fp = fromPid && PMAP.get(fromPid);
  t.starters.forEach((s, i) => {
    const k = 'S' + i;
    if (k === mv) return;
    if (locked(s.pid)) return;
    const op = s.pid && PMAP.get(s.pid);
    const okOut = !op || ELIG[fromSlot].includes(op.pos);
    if (fp && ELIG[s.slot].includes(fp.pos) && okOut) T.add(k);
    if (!fp && op && okOut) T.add(k);
  });
  if (fromS !== null) {
    t.bench.forEach(pid => { if (!locked(pid) && ELIG[fromSlot].includes(PMAP.get(pid).pos)) T.add('B' + pid); });
  }
  return T;
}
/* Best projected lineup, but players whose games are over stay where they are. */
function autoLineupUnlocked(lg, t, w) {
  const locked = pid => isLocked(lg, pid);
  const keepStart = new Set(t.starters.filter(s => locked(s.pid)).map(s => s.pid));
  const keepBench = t.bench.filter(locked);
  const free = rosterOf(t).filter(pid => !locked(pid)).map(id => PMAP.get(id))
    .sort((x, y) => weekProj(lg, y, w) - weekProj(lg, x, w));
  const used = new Set();
  const order = [...STARTERS.keys()].sort((x, y) => (STARTERS[x] === 'FLEX') - (STARTERS[y] === 'FLEX'));
  const next = t.starters.map(s => ({ slot: s.slot, pid: keepStart.has(s.pid) ? s.pid : null }));
  for (const i of order) {
    if (next[i].pid) continue;
    const p = free.find(x => !used.has(x.id) && ELIG[next[i].slot].includes(x.pos));
    if (p) { next[i].pid = p.id; used.add(p.id); }
  }
  t.starters = next;
  t.bench = keepBench.concat(free.filter(p => !used.has(p.id)).map(p => p.id));
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
  const targets = mv ? moveTargets(t, mv, pid => isLocked(lg, pid)) : null;

  const problems = t.starters.filter(s => !s.pid || isBye(PMAP.get(s.pid), w));
  const projTotal = t.starters.reduce((a, s) => a + (s.pid ? weekProj(lg, PMAP.get(s.pid), w) : 0), 0);

  const row = (key, slot, pid) => {
    const p = pid && PMAP.get(pid);
    const isSel = mv === key;
    const isT = targets && targets.has(key);
    const bye = p && !done && isBye(p, w);
    let btn = '';
    const locked = isLocked(lg, pid);
    if (!done && locked && !mv) btn = `<span class="mv locked" title="His game is over, so he's locked for this week"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>`;
    else if (!done) {
      if (mv) btn = isSel ? `<button class="mv on" data-act="move-cancel" aria-label="Cancel move">Cancel</button>`
        : isT ? `<button class="mv here" data-act="move-to" data-id="${key}">Here</button>` : `<span class="mv ghost"></span>`;
      else btn = `<button class="mv" data-act="move" data-id="${key}">Move</button>`;
    }
    const lastPts = p && lastW ? `, last ${fmt(weekPts(lg, p, lastW))}` : '';
    const num = !p ? '' : done ? `<b>${fmt(seasonPts(lg, p))}</b><small>season</small>`
      : bye ? `<b class="bye">Bye</b><small>wk ${w}</small>`
      : gameDone(lg, p, w) ? `<b>${fmt(weekPts(lg, p, w))}</b><small>pts</small>`
      : `<b>${fmt(weekProj(lg, p, w))}</b><small>proj</small>`;
    return `<div class="lrow ${isSel ? 'sel' : ''} ${mv && !isSel && !isT ? 'dim' : ''} ${slot !== 'BN' && (bye || !p || injuryOf(lg, pid) === 'O') ? 'warn' : ''}">
      <div class="slot">${posLabel(slot)}</div>
      ${p ? pmain(p, `${p.bye ? `, bye ${p.bye}` : ''}${lastPts}`) : '<div class="pmain empty">Empty</div>'}
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
    ${teamAvatar(t, 'xl')}
    <div class="th-body"><div class="th-name">${esc(t.name)}</div>
      <div class="th-sub">${record(t)} · ${ordinal(rank)} place · ${fmt(t.pf)} PF</div></div>
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
/* A player's real game for week w is finished (real-stats leagues only).
   Finished players show real points and are locked in your lineup. */
function gameDone(lg, p, w) {
  if (!usesReal(lg) || !p) return false;
  const wk = REAL_STATS.weeks[w];
  return !!(wk && wk.dst && wk.dst[p.team] !== undefined);
}
function isLocked(lg, pid) {
  return !!pid && lg.phase !== 'done' && gameDone(lg, PMAP.get(pid), lg.week);
}
function liveGame(lg, a, b, w) {
  const f = ti => {
    const lines = lg.teams[ti].starters.map(s => {
      const p = s.pid && PMAP.get(s.pid);
      const done = gameDone(lg, p, w);
      return { slot: s.slot, pid: s.pid, done, pts: !p ? 0 : done ? weekPts(lg, p, w) : weekProj(lg, p, w) };
    });
    return { lines, total: round1(lines.reduce((x, l) => x + l.pts, 0)) };
  };
  const A = f(a), B = f(b);
  const live = A.lines.concat(B.lines).some(l => l.done);
  return { a, b, as: A.total, bs: B.total, al: A.lines, bl: B.lines, winner: null, live };
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
  const myGame = played ? games.find(x => x.a === me || x.b === me) : null;
  if (myGame && !(lg.phase === 'done' && w === FINAL_WEEK)) {
    const mine = myGame.a === me ? myGame.as : myGame.bs, theirs = myGame.a === me ? myGame.bs : myGame.as;
    const won = myGame.winner === me, tied = myGame.winner == null;
    const opp = lg.teams[myGame.a === me ? myGame.b : myGame.a];
    top += `<div class="result ${won ? 'won' : tied ? 'tied' : 'lost'}">
      <b>${won ? 'Victory!' : tied ? 'Tie game' : 'Tough loss'}</b>
      <span>${fmt(mine)} to ${fmt(theirs)} against ${esc(opp.name)}</span></div>`;
    setTimeout(() => celebrate(lg, w, won, mine, theirs), 50);
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
    const real = played || line.done;
    const meta = real ? statLine(lg, p, w, line.pts) : bye ? 'Bye week' : `${posLabel(p.pos)}, ${p.team}`;
    return `<div class="mside ${side} ${bye ? 'bye' : ''}">
      ${playerAvatar(p, 'sm')}<button class="mp" data-act="player" data-id="${p.id}"><span class="mp-name">${esc(shortName(p))}${injBadge(lg, p.id)}</span><span class="mp-meta">${esc(meta)}</span></button>
      <div class="mp-pts ${real ? '' : 'proj'}">${bye ? '—' : fmt(line.pts)}</div></div>`;
  };
  const rows = al.map((l, i) => `<div class="mrow">${cell(l, 'l')}<div class="mslot">${posLabel(l.slot)}</div>${cell(bl[i], 'r')}</div>`).join('');
  // Win chance from the projected gap (only before the week is scored).
  const pa = played ? null : 1 / (1 + Math.exp(-(as - bs) / 14));
  const side = (t, s, win, right) => `<div class="sbg-team ${right ? 'r' : ''} ${win ? 'win' : ''}">
      ${teamAvatar(t, 'lg')}
      <div class="sbg-name">${esc(t.name)}</div>
      <div class="sbg-rec">${record(t)}${isMe(t) ? ' · You' : ''}</div>
      <div class="sbg-score">${fmt(s)}</div>
    </div>`;
  return `<section class="scorebug">
    <div class="sbg-top">${side(ta, as, aWin, false)}
      <div class="sbg-mid"><span>${weekLabel(w)}</span><b>${played ? 'Final' : g.live ? 'In progress' : 'Projected'}</b></div>
      ${side(tb, bs, bWin, true)}</div>
    ${pa === null ? '' : `<div class="wp"><div class="wp-bar"><i style="width:${Math.round(pa * 100)}%"></i></div>
      <div class="wp-labels"><span>${Math.round(pa * 100)}%</span><span>Win probability</span><span>${100 - Math.round(pa * 100)}%</span></div></div>`}
  </section>
  <div class="card flush match">${rows}</div>`;
}

/* ---------- Players (free agents) ---------- */
function viewPlayers(lg) {
  const t = lg.teams[userIdx(lg)];
  return `<div class="page-row"><h2 class="sec-title flat">Free agents</h2><span class="muted small">Your roster ${rosterOf(t).length}/${ROSTER_MAX}</span></div>
    ${claimsCard(lg)}
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
  const claimed = new Set(myClaims(lg).map(c => c.add));
  if (!shown.length) return `<div class="empty-card">No free agents match those filters.</div>`;
  return shown.map(p => `<div class="prow">
    ${pmain(p, `, ${esc(confShort(p.conf))}${p.bye ? `, bye ${p.bye}` : ''}`)}
    ${hasPts ? `<div class="pnum"><b>${fmt(seasonPts(lg, p))}</b><small>season</small></div>` : ''}
    <div class="pnum"><b>${fmt(projPts(p, lg.scoring))}</b><small>proj</small></div>
    ${waiversOn(lg)
      ? (claimed.has(p.id) ? `<button class="btn btn-sm" data-act="claim-cancel" data-id="${p.id}">Claimed</button>`
        : `<button class="btn btn-sm btn-primary" data-act="add" data-id="${p.id}" ${done ? 'disabled' : ''} aria-label="Claim ${esc(p.name)}">Claim</button>`)
      : `<button class="btn btn-sm btn-primary" data-act="add" data-id="${p.id}" ${done ? 'disabled' : ''} aria-label="Add ${esc(p.name)}">Add</button>`}
  </div>`).join('') + (list.length > 100 ? `<p class="muted small center">Showing 100 of ${list.length}. Search or filter to narrow it down.</p>` : '');
}

/* ---------- Standings ---------- */
function viewStandings(lg) {
  const st = standings(lg);
  const rows = st.map((t, i) => `<tr class="${isMe(t) ? 'me' : ''} ${i === PLAYOFF_TEAMS - 1 ? 'cut' : ''}">
    <td class="num">${i + 1}</td><td class="tname"><span class="tcell">${teamAvatar(t, 'sm')}<span>${esc(t.name)}</span></span></td><td class="num">${record(t)}</td>
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
  const mine = lg.teams[me];
  const ed = editState(lg);
  return `${mine ? `<h2 class="sec-title">Your team</h2>
  <div class="card team-edit">
    <div class="te-preview">${teamAvatar({ name: ed.teamName || mine.name, color: ed.color, emoji: ed.emoji }, 'xl')}
      <label class="field"><span>Team name</span><input id="e-team" class="input" maxlength="30" data-efield="teamName" value="${esc(ed.teamName)}"></label></div>
    <div class="te-label">Color</div>
    <div class="swatches">${TEAM_HUES.map(h => `<button class="swatch ${ed.color === h ? 'on' : ''}" style="background:hsl(${h} 55% 38%)" data-act="team-color" data-id="${h}" aria-label="Color"></button>`).join('')}</div>
    <div class="te-label">Icon</div>
    <div class="emoji-grid"><button class="emoji ${!ed.emoji ? 'on' : ''}" data-act="team-emoji" data-id="">Aa</button>${TEAM_EMOJIS.map(e => `<button class="emoji ${ed.emoji === e ? 'on' : ''}" data-act="team-emoji" data-id="${e}">${e}</button>`).join('')}</div>
    <button class="btn btn-primary btn-block" data-act="save-team">Save team</button>
  </div>` : ''}
  ${isCommish(lg) ? `<h2 class="sec-title">League name</h2>
  <div class="card"><div class="invite-row"><input id="e-league" class="input" maxlength="40" data-efield="leagueName" value="${esc(ed.leagueName)}">
    <button class="btn btn-primary" data-act="save-league">Save</button></div></div>` : ''}
  <h2 class="sec-title">League settings</h2>
  <div class="card">
    <dl class="kv">
      <dt>League</dt><dd>${esc(lg.name)}</dd>
      <dt>Teams</dt><dd>${lg.size}</dd>
      <dt>Scoring</dt><dd>${SCORING_LABEL[lg.scoring]}</dd>
      <dt>Points from</dt><dd>${usesReal(lg) ? 'Real games' : 'Simulated'}</dd>
      ${lg.phase !== 'lobby' && me >= 0 ? `<dt>Your draft slot</dt><dd>${ordinal(me + 1)}</dd>` : ''}
      ${lg.multi ? `<dt>Draft</dt><dd>${lg.draftType === 'turns' ? 'Take turns' : `Live, ${lg.pickSeconds} sec per pick`}</dd>` : ''}
      ${lg.multi ? `<dt>Waivers</dt><dd>${lg.waivers ? 'On, daily at 4 AM ET' : 'Off, adds are instant'}${isCommish(lg) ? ` <button class="link" data-act="toggle-waivers">${lg.waivers ? 'Turn off' : 'Turn on'}</button>` : ''}</dd>` : ''}
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

// What you're typing in the team editor, kept until you save.
function editState(lg) {
  const t = lg.teams[userIdx(lg)];
  if (!UI.edit || UI.edit.id !== lg.id) {
    UI.edit = {
      id: lg.id, teamName: t ? t.name : '', color: t && Number.isFinite(t.color) ? t.color : (t ? teamHue(t) : 0),
      emoji: (t && t.emoji) || '', leagueName: lg.name,
    };
  }
  return UI.edit;
}

/* ---------- League hub: standings, trades, settings ---------- */
function viewLeagueHub(lg) {
  const season = !['lobby', 'draft'].includes(lg.phase);
  if (!season) return viewLeagueInfo(lg);
  const tabs = [['standings', 'Standings'], ['trades', 'Trades'], ['settings', 'Settings']];
  const n = incomingTrades(lg).length;
  const sub = `<div class="subtabs hub">${tabs.map(([k, l]) =>
    `<button class="st ${UI.ltab === k ? 'on' : ''}" data-act="ltab" data-id="${k}">${l}${k === 'trades' && n ? ` <i class="st-badge">${n}</i>` : ''}</button>`).join('')}</div>`;
  const body = UI.ltab === 'trades' ? viewTrades(lg) : UI.ltab === 'settings' ? viewLeagueInfo(lg) : viewStandings(lg);
  return sub + body;
}

/* ---------- Trades ---------- */
function incomingTrades(lg) {
  const me = userIdx(lg);
  return (lg.trades || []).filter(t => t.status === 'pending' && t.to === me);
}
function tradeSide(ids) {
  return ids.length ? ids.map(pid => {
    const p = PMAP.get(pid);
    return p ? `<div class="tr-p">${playerAvatar(p, 'sm')}<span><b>${esc(p.name)}</b><small>${posLabel(p.pos)}, ${esc(p.team)}</small></span></div>` : '';
  }).join('') : '<div class="tr-p muted small">Nothing</div>';
}
function tradeCard(lg, t) {
  const me = userIdx(lg);
  const A = lg.teams[t.from], B = lg.teams[t.to];
  const status = { pending: 'Waiting for an answer', accepted: 'Accepted', declined: 'Declined', canceled: 'Canceled' }[t.status];
  let actions = '';
  if (t.status === 'pending' && t.to === me) {
    actions = `<div class="tr-actions"><button class="btn btn-sm" data-act="trade-no" data-id="${t.id}">Decline</button>
      <button class="btn btn-sm btn-primary" data-act="trade-yes" data-id="${t.id}">Accept</button></div>`;
  } else if (t.status === 'pending' && t.from === me) {
    actions = `<div class="tr-actions"><button class="btn btn-sm" data-act="trade-cancel" data-id="${t.id}">Cancel offer</button></div>`;
  }
  return `<div class="trade ${t.status}">
    <div class="tr-head"><span>${esc(A.name)} <span class="muted">offers</span> ${esc(B.name)}</span><span class="tr-status">${status}</span></div>
    <div class="tr-cols">
      <div><div class="tr-label">${t.from === me ? 'You give' : t.to === me ? 'You get' : esc(A.name) + ' gives'}</div>${tradeSide(t.give)}</div>
      <div><div class="tr-label">${t.from === me ? 'You get' : t.to === me ? 'You give' : esc(A.name) + ' gets'}</div>${tradeSide(t.get)}</div>
    </div>${actions}</div>`;
}
function viewTrades(lg) {
  const me = userIdx(lg);
  const trades = (lg.trades || []).slice().reverse();
  const open = trades.filter(t => t.status === 'pending' && (t.to === me || t.from === me));
  const done = trades.filter(t => t.status !== 'pending').slice(0, 12);
  const canTrade = lg.phase !== 'done' && me >= 0;
  return `${canTrade ? `<button class="btn btn-primary btn-block" data-act="trade-new">Propose a trade</button>` : ''}
    <h2 class="sec-title">Open offers</h2>
    ${open.length ? open.map(t => tradeCard(lg, t)).join('') : `<div class="empty-card small">No open offers. ${lg.multi ? 'Friends can send you offers too.' : 'CPU managers answer right away.'}</div>`}
    ${done.length ? `<h2 class="sec-title">Recent trades</h2>${done.map(t => tradeCard(lg, t)).join('')}` : ''}`;
}
function tradeModal(lg) {
  const s = UI.trade;
  const me = userIdx(lg);
  const others = lg.teams.filter(t => t.id !== me);
  const partner = s.to != null ? lg.teams[s.to] : null;
  const pick = (team, chosen, act) => rosterOf(team).map(pid => PMAP.get(pid))
    .sort((x, y) => POS_ORDER[x.pos] - POS_ORDER[y.pos] || projPts(y, lg.scoring) - projPts(x, lg.scoring))
    .map(p => {
      const lockedP = isLocked(lg, p.id);
      return `<button class="pick-row ${chosen.includes(p.id) ? 'on' : ''}" data-act="${act}" data-id="${p.id}" ${lockedP ? 'disabled' : ''}>
        ${playerAvatar(p, 'sm')}<span class="ptext"><span class="pname">${esc(p.name)}${injBadge(lg, p.id)}</span><span class="pmeta">${posBadge(p.pos)}<span>${esc(p.team)}${lockedP ? ', locked' : ''}</span></span></span>
        <b>${fmt(projPts(p, lg.scoring))}</b><span class="tick"></span></button>`;
    }).join('');
  const problem = partner ? tradeProblem(lg, me, s.to, s.give, s.get) : '';
  return `<h3 class="m-h">Propose a trade</h3>
    <div class="chips scroll inmodal">${others.map(t => `<button class="chip ${s.to === t.id ? 'on' : ''}" data-act="trade-to" data-id="${t.id}">${esc(t.name)}${isHuman(t) ? '' : ' (CPU)'}</button>`).join('')}</div>
    ${partner ? `
      <div class="tr-label">You give</div><div class="m-list">${pick(lg.teams[me], s.give, 'trade-give')}</div>
      <div class="tr-label">You get from ${esc(partner.name)}</div><div class="m-list">${pick(partner, s.get, 'trade-get')}</div>
      ${problem && (s.give.length || s.get.length) ? `<div class="banner bad" style="margin-top:12px">${esc(problem)}</div>` : ''}
      <button class="btn btn-primary btn-block btn-lg" data-act="trade-send" ${problem ? 'disabled' : ''}>${isHuman(partner) ? 'Send offer' : 'Send to CPU'}</button>
      ${isHuman(partner) ? '' : '<p class="muted small center">CPU managers accept trades that help their team.</p>'}`
    : '<p class="muted">Pick a team to trade with.</p>'}`;
}

/* ---------- Waivers ---------- */
function waiversOn(lg) { return !!(lg && lg.multi && lg.waivers && ['season', 'playoffs'].includes(lg.phase)); }
function myClaims(lg) { const me = userIdx(lg); return (lg.claims || []).filter(c => c.ti === me); }
function waiverTimeText(lg) {
  const d = new Date(lg.waiverNext);
  return d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
function claimsCard(lg) {
  if (!waiversOn(lg)) return '';
  const claims = myClaims(lg);
  const order = waiverOrder(lg);
  const pos = order.indexOf(userIdx(lg)) + 1;
  const log = (lg.waiverLog || []).filter(r => r.ok).slice(-5).reverse();
  return `<div class="card waivers">
    <div class="wv-head"><b>Waivers</b><span class="muted small">Next run ${esc(waiverTimeText(lg))} · You pick ${ordinal(pos)}</span></div>
    ${claims.length ? claims.map(c => {
      const p = PMAP.get(c.add), d = c.drop && PMAP.get(c.drop);
      return `<div class="claim">${playerAvatar(p, 'sm')}<span class="ptext"><span class="pname">${esc(p.name)}</span>
        <span class="pmeta">${d ? `Drop ${esc(d.name)}` : 'No drop needed'}</span></span>
        <button class="btn btn-sm" data-act="claim-cancel" data-id="${c.add}">Cancel</button></div>`;
    }).join('') : '<p class="muted small">Tap Claim on a free agent. Claims run once a day, and the team lowest in the standings gets first choice.</p>'}
    ${log.length ? `<div class="wv-log">${log.map(r => `<span>${esc(lg.teams[r.ti].name)} added ${esc(PMAP.get(r.add).name)}</span>`).join('')}</div>` : ''}
  </div>`;
}

/* ---------- Injury tags ---------- */
function injBadge(lg, pid) {
  const inj = injuryOf(lg, pid);
  return inj ? ` <span class="inj inj-${inj}" title="${INJ_LABEL[inj]}">${inj}</span>` : '';
}

/* ---------- Chat ---------- */
const SEEN_KEY = 'fcfb-chat-seen';
// "Read up to" times are saved per person, so two accounts on one computer don't mix.
function seenKey() { return SEEN_KEY + ':' + ME_UID; }
function chatSeen(id) { try { return JSON.parse(localStorage.getItem(seenKey()) || '{}')[id] || 0; } catch (e) { return 0; } }
function markChatSeen(id, at) {
  try { const m = JSON.parse(localStorage.getItem(seenKey()) || '{}'); m[id] = at; localStorage.setItem(seenKey(), JSON.stringify(m)); } catch (e) { /* ignore */ }
}
function unreadCount(lg) {
  const c = UI.chat;
  if (!lg || c.id !== lg.id || !c.msgs) return 0;
  const seen = chatSeen(lg.id);
  return visibleMsgs().filter(m => m.at > seen && m.uid !== ME_UID).length;
}
function watchChat(lg) {
  const c = UI.chat;
  const want = lg && lg.multi && Store.mode === 'cloud' ? lg.id : null;
  if (c.id === want) return;
  if (c.unsub) c.unsub();
  c.id = want; c.msgs = []; c.unsub = null;
  if (!want) return;
  let first = true;
  c.unsub = Store.listenChat(want, msgs => {
    if (!msgs) return;
    const prevLast = c.msgs.length ? c.msgs[c.msgs.length - 1].at : 0;
    c.msgs = msgs;
    const newest = msgs[msgs.length - 1];
    if (!first && newest && newest.at > prevLast && newest.uid !== ME_UID && !isBlocked(newest.uid)) {
      alertUser(`${newest.name}: ${maskText(newest.text)}`, `chat-${newest.id}`);
    }
    first = false;
    if (UI.tab === 'chat' && newest) markChatSeen(want, newest.at);
    if (UI.tab === 'chat') renderChatOnly(); else render();
  });
}
/* ---------- Chat safety ----------
   Severe words (slurs, telling someone to hurt themselves) can't be sent.
   Ordinary swear words get hidden with dots. */
const SEVERE_WORDS = [/n+[i1!]+g+(?:a|er|uh)/i, /\bf+[a@4]+g+(?:[o0]+t+)?s?\b/i, /\bk+y+s+\b/i, /k+i+l+l+\s*(?:your|ur|yo)\s*self/i,
  /\br+[e3]+t+[a@]+r+d/i, /\bch[i1]nks?\b/i, /\bsp[i1]cs?\b/i, /\bk[i1]kes?\b/i, /\btr[a@]nn(?:y|ies)\b/i];
const MILD_WORDS = [/f+u+c+k+\w*/gi, /\bsh+[i1]+t+\w*/gi, /\bb[i1]+t+c+h+\w*/gi, /a+s+s+h+o+l+e+s?/gi, /\bd[i1]+c+k+(?:s|head|heads)?\b/gi,
  /c+u+n+t+\w*/gi, /\bwh[o0]+r+e+s?\b/gi, /\bs+l+u+t+s?\b/gi, /\bpuss(?:y|ies)\b/gi, /\bbastards?\b/gi, /\bdumb\s*ass\b/gi, /\bmotherf\w*/gi];
function isSevere(text) { return SEVERE_WORDS.some(r => r.test(text)); }
function maskText(text) {
  let out = text;
  for (const r of MILD_WORDS) out = out.replace(r, w => w[0] + '•'.repeat(Math.max(1, w.length - 1)));
  for (const r of SEVERE_WORDS) out = out.replace(new RegExp(r.source, 'gi'), w => '•'.repeat(w.length));
  return out;
}
const HIDDEN_KEY = 'fcfb-hidden-msgs';
function hiddenMsgs() { try { return JSON.parse(localStorage.getItem(HIDDEN_KEY + ':' + ME_UID) || '[]'); } catch (e) { return []; } }
function hideMsg(id) {
  try { const l = hiddenMsgs(); l.push(id); localStorage.setItem(HIDDEN_KEY + ':' + ME_UID, JSON.stringify(l.slice(-300))); } catch (e) { /* ignore */ }
}
function isBlocked(uid) { return (Store.blocked || []).some(b => b.uid === uid); }
function visibleMsgs() {
  const hidden = new Set(hiddenMsgs());
  return (UI.chat.msgs || []).filter(m => !hidden.has(m.id) && !isBlocked(m.uid));
}

function chatMessages(lg) {
  const c = UI.chat;
  const msgs = visibleMsgs();
  if (!msgs.length) return `<div class="chat-empty">No messages yet. Start the trash talk.<br><small>Keep it fun. Tap any message to report it or block someone.</small></div>`;
  let lastDay = '';
  return msgs.map(m => {
    const mine = m.uid === ME_UID;
    const d = new Date(m.at);
    const day = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const sep = day !== lastDay ? `<div class="chat-day">${day}</div>` : '';
    lastDay = day;
    return `${sep}<div class="msg ${mine ? 'mine' : ''}">
      ${mine ? '' : `<div class="msg-name">${esc(m.name || 'Friend')}</div>`}
      <button class="bubble" data-act="msg" data-id="${esc(m.id)}">${esc(maskText(m.text))}</button>
      <div class="msg-time">${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div></div>`;
  }).join('');
}
function viewChat(lg) {
  if (!lg.multi || Store.mode !== 'cloud') return `<div class="empty-card">Chat is for leagues with friends.</div>`;
  return `<div class="chat" id="chat-list">${chatMessages(lg)}</div>
    <div class="chat-bar"><input id="chat-input" class="input" placeholder="Message ${esc(lg.name)}" maxlength="500" autocomplete="off" value="${esc(UI.chat.draft)}">
      <button class="btn btn-primary" data-act="chat-send" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2-7z"/></svg></button></div>`;
}
function renderChatOnly() {
  const el = document.getElementById('chat-list');
  if (!el) { render(); return; }
  const lg = activeLeague();
  el.innerHTML = chatMessages(lg);
  scrollChat();
  const nav = document.querySelector('.bottomnav');
  if (nav) nav.outerHTML = bottomNav(lg);
}
function scrollChat() {
  if (UI.tab === 'chat') window.scrollTo(0, document.body.scrollHeight);
}

/* ---------- Alerts ----------
   While the app is open (even in another tab): a count in the tab title and,
   if you allow it, a pop-up notification. */
const alerted = new Set();
function alertUser(text, key) {
  if (alerted.has(key)) return;
  alerted.add(key);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification('FCFB', { body: text, icon: 'logo-192.png?v=2', tag: key }); } catch (e) { /* ignore */ }
  }
}
function pendingAlerts() {
  let n = 0;
  for (const lg of Store.list()) {
    const me = userIdx(lg);
    if (me < 0) continue;
    if (lg.phase === 'draft' && onClock(lg) === me) {
      n++; alertUser(`It's your pick in ${lg.name}!`, `pick-${lg.id}-${lg.picks.length}`);
    }
    for (const t of incomingTrades(lg)) {
      n++; alertUser(`${lg.teams[t.from].name} sent you a trade offer in ${lg.name}.`, `trade-${t.id}`);
    }
  }
  n += unreadCount(activeLeague());
  return n;
}
function updateTitle() {
  const n = Store.authReady ? pendingAlerts() : 0;
  document.title = n ? `(${n}) FCFB` : 'FCFB';
}

/* ---------- How to play ---------- */
function helpModal() {
  const sec = (icon, title, body) => `<div class="help-sec"><div class="help-ic">${icon}</div><div><b>${title}</b><p>${body}</p></div></div>`;
  return `<h3 class="m-h">How to play FCFB</h3>
    <p class="muted">College fantasy football with real players and real stats.</p>
    ${sec('🏈', 'Draft your team', 'Each team drafts 15 players: QB, 2 RB, 2 WR, TE, FLEX (RB, WR, or TE), K, D/ST, and 6 bench spots. Only players from your league\'s conferences are in the pool.')}
    ${sec('📋', 'Set your lineup', 'On My Team, tap Move, then Here to swap players. Watch for byes and injury tags (Q, D, O). Auto-set lineup picks your best projected starters.')}
    ${sec('🔒', 'Locks', 'Once a player\'s real game is over, he\'s locked in place for that week, so nobody can swap in a big score after the fact.')}
    ${sec('📈', 'Scoring', 'Catches, yards, and touchdowns score points. In PPR, a catch is 1 point (half in Half PPR). Every 10 rushing or receiving yards is 1 point, 25 passing yards is 1 point, a rushing or receiving TD is 6, a passing TD is 4, and an interception or lost fumble is -2. Kickers get 3 per field goal and 1 per extra point. Defenses score for sacks, interceptions, touchdowns, and low points allowed.')}
    ${sec('🗓️', 'Weeks', 'A week scores itself once its real games are finished, usually by Sunday. During the week, finished games show real points (PTS) and the rest show projections (PROJ).')}
    ${sec('🔁', 'Trades', 'In League, then Trades, propose a swap. Friends accept or decline. CPU teams answer right away and only take fair deals.')}
    ${sec('📝', 'Waivers', 'In friend leagues, adding a free agent is a claim. Claims run daily at 4 AM Eastern, and the team lowest in the standings gets first choice.')}
    ${sec('🏆', 'Playoffs', 'After Week 12, the top 4 teams play a semifinal and a championship.')}
    ${sec('🛡️', 'Play nice', 'Chat is for friendly trash talk. Tap any message to report it or block someone. Abusive messages can get you removed.')}
    <p class="muted small center"><a class="link" href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a> · <a class="link" href="terms.html" target="_blank" rel="noopener">Terms of Use</a>${supportEmail() ? ` · <a class="link" href="mailto:${esc(supportEmail())}">Support</a>` : ''}</p>
    <button class="btn btn-primary btn-block" data-act="close-modal">Got it</button>`;
}
function supportEmail() { return (typeof APP_CONFIG !== 'undefined' && APP_CONFIG && APP_CONFIG.supportEmail) || ''; }
function maybeShowHelp() {
  const key = 'fcfb-help-seen:' + ME_UID;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch (e) { return; }
  UI.modal = { type: 'help' };
}

/* ---------- Trends & charts ---------- */
// Up arrow if a player beat his projection by a lot in his last two games; down if he fell well short.
function trendOf(lg, p) {
  if (!lg || p.pos === 'DST' || p.pos === 'K') return '';
  const last = lastPlayedWeek(lg);
  const pts = [];
  for (let w = last; w >= 1 && pts.length < 2; w--) if (!isBye(p, w)) pts.push(weekPts(lg, p, w));
  if (pts.length < 2) return '';
  const avg = (pts[0] + pts[1]) / 2, proj = projPts(p, lg.scoring);
  if (proj < 3) return '';
  if (avg >= proj * 1.3) return 'up';
  if (avg <= proj * 0.6) return 'down';
  return '';
}
function trendBadge(lg, p) {
  const t = trendOf(lg, p);
  return t ? `<span class="trend ${t}" title="${t === 'up' ? 'Hot: beating his projection lately' : 'Cold: below his projection lately'}">${t === 'up' ? '▲' : '▼'}</span>` : '';
}
function pointsChart(lg, p) {
  const last = lastPlayedWeek(lg);
  if (!last) return '';
  const weeks = [];
  for (let w = 1; w <= last; w++) weeks.push({ w, bye: isBye(p, w), pts: isBye(p, w) ? 0 : weekPts(lg, p, w) });
  const proj = projPts(p, lg.scoring);
  const max = Math.max(proj * 1.2, ...weeks.map(x => x.pts), 1);
  const W = 320, H = 110, pad = 18, bw = Math.min(30, (W - 10) / weeks.length - 6);
  const step = (W - 10) / weeks.length;
  const y = v => H - pad - (Math.max(0, v) / max) * (H - pad - 14);
  const bars = weeks.map((x, i) => {
    const cx = 5 + step * i + step / 2;
    const top = y(x.pts);
    return `${x.bye ? `<text x="${cx}" y="${H - pad - 4}" class="ch-bye">BYE</text>`
      : `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${H - pad - top}" rx="4" class="${x.pts >= proj ? 'ch-good' : 'ch-bar'}"/>
         <text x="${cx}" y="${top - 4}" class="ch-val">${Math.round(x.pts)}</text>`}
      <text x="${cx}" y="${H - 4}" class="ch-wk">${x.w <= REG_WEEKS ? x.w : x.w === REG_WEEKS + 1 ? 'SF' : 'F'}</text>`;
  }).join('');
  return `<div class="chart"><div class="chart-h"><b>Points by week</b><span><i class="ch-key"></i>Projection ${fmt(proj)}</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Fantasy points by week">
      <line x1="0" x2="${W}" y1="${y(proj)}" y2="${y(proj)}" class="ch-proj"/>${bars}</svg></div>`;
}

/* ---------- Win celebration ---------- */
function celebrate(lg, w, won, mine, theirs) {
  const key = `fcfb-cele:${ME_UID}:${lg.id}:${w}`;
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) { return; }
  if (!won) return;
  Native.success();
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#f6bd3a', '#3d8bff', '#2fd27a', '#ff5d5d', '#c08cff', '#ffffff'];
  for (let i = 0; i < 70; i++) {
    const s = document.createElement('i');
    s.style.left = Math.random() * 100 + '%';
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = (Math.random() * 0.6) + 's';
    s.style.animationDuration = (1.8 + Math.random() * 1.4) + 's';
    s.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3800);
}

/* ---------- Modals ---------- */
function viewModal(lg) {
  const m = UI.modal;
  let inner = '';
  if (m.type === 'player' && lg) inner = playerModal(lg, PMAP.get(m.id));
  else if (m.type === 'trade' && lg) inner = tradeModal(lg);
  else if (m.type === 'help') inner = helpModal();
  else if (m.type === 'drop' && lg) inner = dropModal(lg, PMAP.get(m.id));
  else if (m.type === 'delete') {
    inner = `<h3 class="m-h">Delete this league?</h3><p class="muted">This removes the league and all of its results${lg && lg.multi ? ' for everyone in it' : ''}.</p>
      <div class="m-actions"><button class="btn" data-act="close-modal">Keep league</button><button class="btn btn-danger" data-act="confirm-delete">Delete league</button></div>`;
  } else if (m.type === 'account') {
    const canNotify = 'Notification' in window;
    const notifyOn = canNotify && Notification.permission === 'granted';
    const support = supportEmail();
    const blocked = Store.blocked || [];
    inner = `<h3 class="m-h">Account</h3><p class="muted">Signed in as <b>${esc(Store.user ? (Store.user.email || 'Apple ID') : '')}</b></p>
      <label class="field"><span>Your name (friends see this)</span>
        <div class="invite-row"><input id="acct-name" class="input" maxlength="24" data-afield2="name" value="${esc(UI.acctName != null ? UI.acctName : Store.displayName())}">
        <button class="btn btn-primary" data-act="save-name">Save</button></div></label>
      ${canNotify ? `<div class="banner info"><span>${notifyOn ? 'Alerts are on. You\'ll get a pop-up for your draft picks, trade offers, and chat while FCFB is open.' : 'Get a pop-up when it\'s your pick, someone sends a trade, or a friend chats, while FCFB is open in a tab.'}</span>
        ${notifyOn ? '' : '<button class="btn btn-sm btn-primary" data-act="alerts-on">Turn on</button>'}</div>` : ''}
      ${blocked.length ? `<div class="tr-label">Blocked people</div><div class="m-list">${blocked.map(b => `<div class="mgr"><span>${esc(b.name || 'Player')}</span><button class="btn btn-sm" data-act="unblock" data-id="${esc(b.uid)}">Unblock</button></div>`).join('')}</div>` : ''}
      <div class="acct-links">
        <button class="link" data-act="help">How to play</button>
        <a class="link" href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>
        <a class="link" href="terms.html" target="_blank" rel="noopener">Terms of Use</a>
        ${support ? `<a class="link" href="mailto:${esc(support)}?subject=FCFB%20support">Contact support</a>` : ''}
      </div>
      <div class="m-actions"><button class="btn" data-act="signout">Sign out</button><button class="btn btn-danger" data-act="delete-account">Delete account</button></div>`;
  } else if (m.type === 'delete-account') {
    const recent = Store.signedInRecently();
    inner = `<h3 class="m-h">Delete your account?</h3>
      <p class="muted">This permanently deletes your FCFB account and your chat messages, and removes you from every league. CPU managers take over your teams. If you're a commissioner, another member becomes commissioner. Leagues with only you in them are deleted.</p>
      ${recent ? `<div class="m-actions"><button class="btn" data-act="close-modal">Keep account</button>
        <button class="btn btn-danger" data-act="confirm-delete-account" ${UI.deleting ? 'disabled' : ''}>${UI.deleting ? 'Deleting…' : 'Delete forever'}</button></div>`
      : `<div class="banner info"><span>For your security, sign in again first. Then come back here and tap Delete account.</span></div>
        <div class="m-actions"><button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="reauth">Sign in again</button></div>`}`;
  } else if (m.type === 'msg') {
    const msg = (UI.chat.msgs || []).find(x => x.id === m.id);
    const lgc = activeLeague();
    if (!msg) { inner = '<p class="muted">That message is gone.</p>'; }
    else {
      const mine = msg.uid === ME_UID;
      const canDelete = mine || (lgc && isCommish(lgc));
      inner = `<h3 class="m-h">${mine ? 'Your message' : esc(msg.name || 'Message')}</h3>
        <div class="bubble quoted">${esc(maskText(msg.text))}</div>
        <div class="msg-actions">
          ${mine ? '' : `<button class="btn btn-block" data-act="report-msg" data-id="${esc(msg.id)}">Report message</button>
            <button class="btn btn-block" data-act="block-user" data-id="${esc(msg.id)}">Block ${esc(msg.name || 'this person')}</button>`}
          ${canDelete ? `<button class="btn btn-block btn-danger" data-act="delete-msg" data-id="${esc(msg.id)}">Delete message${!mine ? ' (commissioner)' : ''}</button>` : ''}
        </div>`;
    }
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
    else if (me >= 0) action = `<button class="btn btn-primary btn-block" data-act="trade-for" data-id="${p.id}">Propose a trade for him</button>`;
    if (owner == null && waiversOn(lg)) action = `<button class="btn btn-primary btn-block" data-act="add" data-id="${p.id}">Put in a waiver claim</button>`;
  }
  const inj = injuryOf(lg, p.id);
  const injTools = isCommish(lg) && lg.phase !== 'done' && p.pos !== 'DST' ? `<div class="inj-tools"><span class="muted small">Injury status (commissioner)</span>
      <div class="chips">${[['', 'Healthy'], ['Q', 'Q'], ['D', 'D'], ['O', 'Out']].map(([k, l]) =>
        `<button class="chip ${inj === k ? 'on' : ''}" data-act="set-inj" data-id="${p.id}:${k}">${l}</button>`).join('')}</div></div>` : '';
  return `<div class="pm-head" style="--conf:${conf.color}">
      ${playerAvatar(p, 'xl')}
      <div><div class="pm-name">${esc(p.name)}${injBadge(lg, p.id)}${trendBadge(lg, p)}</div>
        <div class="pm-meta">${posBadge(p.pos)} ${esc(p.team)}, ${esc(conf.name)}${p.year ? `, ${p.year}` : ''}</div></div>
    </div>
    <div class="pm-stats">
      <div><b>${fmt(projPts(p, lg.scoring))}</b><small>Proj per game</small></div>
      <div><b>${last ? fmt(seasonPts(lg, p)) : '—'}</b><small>Season pts</small></div>
      <div><b>${rankOf(lg, p.id) || '—'}</b><small>League rank</small></div>
      <div><b>${p.bye ? 'Wk ' + p.bye : 'None'}</b><small>Bye</small></div>
    </div>
    <p class="muted small">${owner == null ? 'Free agent' : owner === me ? 'On your team' : `On ${esc(lg.teams[owner].name)}`}${inj ? ` · <b class="inj-text inj-${inj}">${INJ_LABEL[inj]}</b>` : ''}</p>
    ${injTools}
    ${pointsChart(lg, p)}
    ${(() => { const news = playerNews(p); return news.length ? `<div class="pm-news"><div class="tr-label">In the news</div>${news.map(n => `<a class="news-row" href="${esc(n.u)}" target="_blank" rel="noopener noreferrer"><span class="news-t">${esc(n.t)}</span><span class="news-m"><b>${esc(n.s)}</b>${n.d ? ` · ${timeAgo(n.d)}` : ''}</span></a>`).join('')}</div>` : ''; })()}
    ${log ? `<div class="table-wrap"><table class="glog"><thead><tr><th>Wk</th><th>Line</th><th class="num">Pts</th></tr></thead><tbody>${log}</tbody></table></div>` : ''}
    ${action}`;
}
function dropModal(lg, add) {
  const t = lg.teams[userIdx(lg)];
  const rows = rosterOf(t).map(pid => PMAP.get(pid))
    .sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos])
    .map(p => `<div class="prow">${pmain(p)}<div class="pnum"><b>${fmt(projPts(p, lg.scoring))}</b><small>proj</small></div>
      <button class="btn btn-sm btn-danger" data-act="swapdrop" data-id="${p.id}">Drop</button></div>`).join('');
  const claim = UI.modal && UI.modal.claim;
  return `<h3 class="m-h">Roster full</h3><p class="muted">${claim ? 'Pick who to drop if your claim for' : 'Drop a player to add'} <b>${esc(add.name)}</b> (${posLabel(add.pos)}, ${esc(add.team)})${claim ? ' goes through' : ''}.</p>
    <div class="m-list">${rows}</div>`;
}

/* =========================================================
   CPU draft pacing
   ========================================================= */
/* Auto-scoring. When real games for a week are finished, the first person
   in the league to open the app scores it (only one save ever counts). */
const scoreTried = new Map();
function autoScore() {
  if (busy) return;
  for (const lg of Store.list()) {
    if (lg.multi && lg.waivers && ['season', 'playoffs'].includes(lg.phase) && userIdx(lg) >= 0 && Date.now() >= lg.waiverNext) {
      const key = 'wv:' + lg.id + ':' + lg.waiverNext;
      if (!scoreTried.has(key)) {
        scoreTried.set(key, Date.now());
        const due = lg.waiverNext;
        let added = 0;
        Store.update(lg.id, fresh => {
          if (fresh.waiverNext !== due) return false;
          added = processWaivers(fresh);
          return true;
        }).then(ok => { if (ok && added) toast(`${lg.name}: waivers ran, ${added} player${added === 1 ? '' : 's'} added.`); })
          .catch(err => console.error(err));
      }
    }
    if (!usesReal(lg) || !['season', 'playoffs'].includes(lg.phase) || userIdx(lg) < 0) continue;
    if (!weekReady(lg, lg.week)) continue;
    const key = lg.id + ':' + lg.week;
    if (Date.now() - (scoreTried.get(key) || 0) < 60000) continue;
    scoreTried.set(key, Date.now());
    const startWeek = lg.week;
    let n = 0;
    Store.update(lg.id, fresh => {
      n = 0;
      if (fresh.week !== startWeek) return false;
      while (['season', 'playoffs'].includes(fresh.phase) && weekReady(fresh, fresh.week)) {
        if (!playWeek(fresh)) break;
        n++;
      }
      return n > 0;
    }).then(ok => {
      if (ok && n) toast(`${lg.name}: ${n === 1 ? weekLabel(startWeek) + ' is' : n + ' weeks are'} final.`);
    }).catch(err => console.error(err));
  }
}

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
    UI.week = null; UI.game = null; UI.move = null; UI.paused = false; UI.edit = null; resetFilters();
    lastPhase[id] = lg.phase;
    maybeShowHelp();
    render(); window.scrollTo(0, 0);
  },

  /* ----- Sign in ----- */
  apple() {
    UI.auth.error = ''; UI.auth.busy = true; render();
    Store.signInApple().catch(err => { UI.auth.error = authError(err); })
      .finally(() => { UI.auth.busy = false; render(); });
  },
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
  account() { UI.acctName = null; UI.modal = { type: 'account' }; render(); },
  'news-more'() { UI.newsAll = !UI.newsAll; render(); },

  /* ----- Account ----- */
  'save-name'() {
    const name = (UI.acctName != null ? UI.acctName : Store.displayName()).trim().slice(0, 24);
    if (!name) { toast('Type a name first.'); return; }
    if (isSevere(name) || maskText(name) !== name) { toast('Pick a different name.'); return; }
    Store.setDisplayName(name).then(async () => {
      UI.acctName = null;
      // Show the new name in every league you're in.
      for (const lg of Store.list()) {
        await Store.update(lg.id, fresh => {
          const t = fresh.teams.find(x => x.ownerUid === ME_UID);
          if (!t || t.ownerName === name) return false;
          t.ownerName = name;
        }).catch(() => {});
      }
      toast('Name saved.');
    }).catch(() => toast("Couldn't save your name. Try again."));
  },
  unblock(uidToFree) {
    Store.saveBlocked((Store.blocked || []).filter(b => b.uid !== uidToFree)).then(() => toast('Unblocked.'));
  },
  'delete-account'() { UI.modal = { type: 'delete-account' }; render(); },
  reauth() { UI.modal = null; Store.signOut(); toast('Sign in again, then open your account to delete it.'); },
  'confirm-delete-account'() {
    if (UI.deleting) return;
    UI.deleting = true; render();
    Store.deleteAccount().then(() => {
      UI.deleting = false; UI.modal = null; UI.leagueId = null; UI.view = 'home';
      toast('Your account was deleted.');
      render();
    }).catch(err => {
      console.error(err);
      UI.deleting = false;
      if (err && err.code === 'auth/requires-recent-login') {
        UI.modal = null; Store.signOut(); toast('For your security, sign in again, then delete your account.');
      } else {
        toast("Something went wrong deleting your account. Try again, or contact support.");
      }
      render();
    });
  },

  /* ----- Chat safety ----- */
  msg(id) { UI.modal = { type: 'msg', id }; render(); },
  'report-msg'(id) {
    const msg = (UI.chat.msgs || []).find(x => x.id === id);
    const lg = activeLeague();
    if (!msg || !lg) return;
    UI.modal = null;
    hideMsg(id);
    Store.report({ type: 'chat', leagueId: lg.id, leagueName: lg.name, messageId: id, text: msg.text.slice(0, 500), reportedUid: msg.uid, reportedName: msg.name || '' })
      .then(() => toast('Thanks for reporting. The message is hidden for you, and it will be reviewed.'))
      .catch(() => toast("Couldn't send the report. Try again."));
    render();
  },
  'block-user'(id) {
    const msg = (UI.chat.msgs || []).find(x => x.id === id);
    if (!msg) return;
    UI.modal = null;
    const list = (Store.blocked || []).filter(b => b.uid !== msg.uid).concat([{ uid: msg.uid, name: msg.name || 'Player' }]);
    Store.saveBlocked(list).then(() => toast(`Blocked ${msg.name || 'that person'}. You won't see their messages. Unblock anytime in your account.`))
      .catch(() => toast("Couldn't block right now. Try again."));
    render();
  },
  'delete-msg'(id) {
    const lg = activeLeague();
    UI.modal = null;
    Store.deleteChatMessage(lg.id, id).then(() => toast('Message deleted.')).catch(() => toast("Couldn't delete that message."));
    render();
  },
  help() { UI.modal = { type: 'help' }; render(); },
  'team-color'(id) { const lg = activeLeague(); editState(lg).color = +id; render(); },
  'team-emoji'(id) { const lg = activeLeague(); editState(lg).emoji = id; render(); },
  'save-team'() {
    const ed = UI.edit;
    const name = (ed.teamName || '').trim().slice(0, 30);
    if (!name) { toast('Give your team a name first.'); return; }
    mutate(lg => {
      const t = lg.teams[userIdx(lg)];
      if (!t) return false;
      t.name = name; t.color = ed.color; t.emoji = ed.emoji || '';
    }, 'Team saved.');
  },
  'save-league'() {
    const name = (UI.edit.leagueName || '').trim().slice(0, 40);
    if (!name) { toast('Give your league a name first.'); return; }
    mutate(lg => { if (!isCommish(lg)) return false; lg.name = name; }, 'League renamed.');
  },
  signout() { UI.modal = null; UI.leagueId = null; UI.view = 'home'; Store.signOut(); },
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
      UI.view = 'league'; UI.tab = lg.phase === 'lobby' ? 'lobby' : 'draft'; UI.dtab = 'players'; UI.paused = false; UI.edit = null; resetFilters();
      maybeShowHelp();
      render(); window.scrollTo(0, 0);
    }).catch(err => { busy = false; console.error(err); toast("Couldn't create the league. Check your connection."); });
  },

  /* ----- Friends ----- */
  'copy-invite'() {
    const lg = activeLeague();
    const link = inviteLink(lg);
    if (Native.canShare()) {
      Native.share({ title: lg.name, text: `Join my college fantasy football league, ${lg.name}!`, url: link }).catch(() => {});
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
  tab(id) {
    UI.tab = id; UI.move = null; UI.week = null; UI.game = null; UI.f.q = '';
    if (id === 'chat' && UI.chat.msgs.length) markChatSeen(UI.leagueId, UI.chat.msgs[UI.chat.msgs.length - 1].at);
    render();
    if (id === 'chat') scrollChat(); else window.scrollTo(0, 0);
  },
  dtab(id) { UI.dtab = id; render(); },
  fpos(id) { UI.f.pos = id; render(); },
  draft(id) {
    Native.tap('MEDIUM');
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
    Native.tap('LIGHT');
    const mv = UI.move;
    UI.move = null;
    mutate(lg => {
      const t = lg.teams[userIdx(lg)];
      if (!t) return false;
      const pidOf = k => k === 'BENCH' ? null : k[0] === 'S' ? t.starters[+k.slice(1)].pid : k.slice(1);
      if (isLocked(lg, pidOf(mv)) || isLocked(lg, pidOf(id))) return false;
      doMove(t, mv, id);
    });
  },
  autoset() {
    UI.move = null;
    mutate(lg => { const t = lg.teams[userIdx(lg)]; if (!t) return false; autoLineupUnlocked(lg, t, lg.week); },
      'Lineup set to your best projected starters.');
  },
  add(id) {
    Native.tap('LIGHT');
    const lg = activeLeague();
    const t = lg.teams[userIdx(lg)];
    if (!t || ownerMap(lg).has(id)) return;
    const claim = waiversOn(lg);
    if (rosterOf(t).length >= ROSTER_MAX) { UI.modal = { type: 'drop', id, claim }; render(); return; }
    UI.modal = null;
    if (claim) {
      mutate(fresh => {
        const me = userIdx(fresh);
        if (me < 0 || ownerMap(fresh).has(id) || fresh.claims.some(c => c.ti === me && c.add === id)) return false;
        fresh.claims.push({ ti: me, add: id, drop: null, at: Date.now() });
      }, `Claim for ${PMAP.get(id).name} is in. Waivers run ${waiverTimeText(lg)}.`);
      return;
    }
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
    const claim = UI.modal.claim;
    UI.modal = null;
    if (claim) {
      mutate(lg => {
        const me = userIdx(lg);
        if (me < 0 || ownerMap(lg).has(add)) return false;
        lg.claims = lg.claims.filter(c => !(c.ti === me && c.add === add));
        lg.claims.push({ ti: me, add, drop: id, at: Date.now() });
      }, `Claim for ${PMAP.get(add).name} is in. If it goes through, ${PMAP.get(id).name} gets dropped.`);
      return;
    }
    mutate(lg => {
      const t = lg.teams[userIdx(lg)];
      if (!t || ownerMap(lg).has(add) || !rosterOf(t).includes(id)) return false;
      // New player takes the dropped player's spot if eligible, else the bench.
      const si = t.starters.findIndex(s => s.pid === id);
      removeFromRoster(t, id);
      if (si >= 0 && !isLocked(lg, add) && ELIG[t.starters[si].slot].includes(PMAP.get(add).pos)) t.starters[si].pid = add;
      else t.bench.push(add);
    }, `Added ${PMAP.get(add).name}, dropped ${PMAP.get(id).name}.`);
  },

  'claim-cancel'(id) {
    mutate(lg => {
      const me = userIdx(lg);
      const before = lg.claims.length;
      lg.claims = lg.claims.filter(c => !(c.ti === me && c.add === id));
      return lg.claims.length !== before;
    }, 'Claim canceled.');
  },

  /* ----- Trades ----- */
  ltab(id) { UI.ltab = id; render(); },
  'trade-new'() { UI.trade = { to: null, give: [], get: [] }; UI.modal = { type: 'trade' }; render(); },
  'trade-for'(pid) {
    const lg = activeLeague();
    const owner = ownerMap(lg).get(pid);
    UI.trade = { to: owner, give: [], get: [pid] };
    UI.modal = { type: 'trade' }; render();
  },
  'trade-to'(id) { UI.trade = { to: +id, give: UI.trade.give, get: [] }; render(); },
  'trade-give'(pid) { const s = UI.trade.give; s.includes(pid) ? s.splice(s.indexOf(pid), 1) : s.push(pid); render(); },
  'trade-get'(pid) { const s = UI.trade.get; s.includes(pid) ? s.splice(s.indexOf(pid), 1) : s.push(pid); render(); },
  'trade-send'() {
    Native.tap('MEDIUM');
    const s = UI.trade;
    let result = null;
    UI.modal = null;
    mutate(lg => {
      result = proposeTrade(lg, userIdx(lg), s.to, s.give, s.get);
      return !result.error;
    }).then(ok => {
      UI.tab = 'league'; UI.ltab = 'trades';
      if (!ok) toast(result && result.error ? result.error : "Couldn't send that offer.");
      else if (result.trade.status === 'accepted') toast('Trade accepted! The players are on your bench.');
      else if (result.trade.status === 'declined') toast('The CPU manager turned it down. Try offering more.');
      else toast('Offer sent. They can accept it from their Trades tab.');
      render();
    });
  },
  'trade-yes'(id) {
    Native.success();
    let problem = '';
    mutate(lg => { problem = answerTrade(lg, id, true); return true; })
      .then(() => toast(problem || 'Trade accepted! New players are on your bench.'));
  },
  'trade-no'(id) { mutate(lg => answerTrade(lg, id, false) === '', 'Offer declined.'); },
  'trade-cancel'(id) {
    mutate(lg => {
      const t = lg.trades.find(x => x.id === id);
      if (!t || t.status !== 'pending' || t.from !== userIdx(lg)) return false;
      t.status = 'canceled'; t.doneAt = Date.now();
    }, 'Offer canceled.');
  },

  /* ----- Commissioner tools ----- */
  'set-inj'(val) {
    const [pid, k] = val.split(':');
    mutate(lg => {
      if (!isCommish(lg)) return false;
      if (k) lg.injuries[pid] = k; else delete lg.injuries[pid];
    }, k ? `Marked ${PMAP.get(pid).name} as ${INJ_LABEL[k].toLowerCase()}.` : `${PMAP.get(pid).name} is healthy.`);
  },
  'toggle-waivers'() {
    mutate(lg => { if (!isCommish(lg)) return false; lg.waivers = !lg.waivers; if (!lg.waivers) lg.claims = []; });
  },

  /* ----- Chat & alerts ----- */
  'chat-send'() {
    const lg = activeLeague();
    const text = UI.chat.draft.trim();
    if (!lg || !text) return;
    if (isSevere(text)) { toast("That message breaks the chat rules, so it wasn't sent."); return; }
    UI.chat.draft = '';
    const input = document.getElementById('chat-input');
    if (input) { input.value = ''; input.focus(); }
    Store.sendChat(lg.id, text).catch(err => { console.error(err); toast("Couldn't send. Check your connection."); });
  },
  'alerts-on'() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(p => {
      toast(p === 'granted' ? 'Alerts are on.' : 'Alerts are blocked. You can allow them in your browser settings.');
      render();
    });
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
  if (el.id === 'chat-input') { UI.chat.draft = el.value; }
  if (el.dataset.efield && UI.edit) { UI.edit[el.dataset.efield] = el.value; }
  if (el.dataset.afield2 === 'name') { UI.acctName = el.value; }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'fconf') { UI.f.conf = el.value; refreshList(); }
  if (el.id === 'fsort') { UI.f.sort = el.value; refreshList(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && UI.modal) { UI.modal = null; render(); }
  if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.afield) actions['email-auth']();
  if (e.key === 'Enter' && e.target && e.target.id === 'chat-input') { e.preventDefault(); actions['chat-send'](); }
});
window.addEventListener('hashchange', readInvite);
window.addEventListener('online', () => { toast('Back online.'); render(); });
window.addEventListener('offline', () => render());

/* ---------- Make sure the styles loaded ----------
   If a phone failed to download style.css (or kept a bad copy), fetch it
   again so the app never shows up unstyled. */
function stylesLoaded() {
  return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() !== '';
}
function ensureStyles(attempt = 0) {
  if (stylesLoaded() || attempt > 3) return;
  const old = document.querySelector('link[rel="stylesheet"][href^="style.css"]');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'style.css?retry=' + Date.now();
  link.onload = () => { if (old) old.remove(); };
  document.head.appendChild(link);
  setTimeout(() => ensureStyles(attempt + 1), 2500);
}

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
    setTimeout(autoScore, 500);
  };
  ensureStyles();
  setTimeout(ensureStyles, 1500);
  Native.setup();
  Store.init();
  readInvite();
  render();
  setInterval(() => { draftTick(); updateClock(); }, 250);
  setInterval(autoScore, 15000);
  setTimeout(autoScore, 1200);
})();
