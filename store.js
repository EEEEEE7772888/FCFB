'use strict';
/* =========================================================
   STORE — where leagues are saved.
   Cloud mode (Firebase): leagues live online, shared with friends,
   and follow your account. Local mode: leagues stay in this browser.
   Cloud mode turns on when firebase-config.js is filled in.
   ========================================================= */

const LOCAL_KEY = 'gridiron-saturday-v1';
const CLOUD_READY = typeof firebase !== 'undefined' && typeof firebaseConfig !== 'undefined' &&
  !!firebaseConfig && !!firebaseConfig.apiKey && !String(firebaseConfig.apiKey).includes('PASTE');

const Store = {
  mode: CLOUD_READY ? 'cloud' : 'local',
  leagues: new Map(),
  user: null,          // signed-in Firebase user (cloud mode)
  authReady: !CLOUD_READY,
  error: '',
  loaded: false,       // first list of leagues has arrived
  onChange: () => {},
  _unsub: null,

  /* ---------- Setup ---------- */
  init() {
    if (this.mode === 'local') {
      ME_UID = 'local';
      this.loaded = true;
      this._loadLocal();
      return;
    }
    firebase.initializeApp(firebaseConfig);
    this.auth = firebase.auth();
    this.db = firebase.firestore();
    this.auth.onAuthStateChanged(user => {
      this.user = user;
      this.authReady = true;
      if (this._unsub) { this._unsub(); this._unsub = null; }
      this.leagues.clear();
      this.loaded = false;
      if (user) {
        ME_UID = user.uid;
        this._listen();
        this.loadProfile();
      } else {
        ME_UID = 'signed-out';
        this.blocked = [];
      }
      this.onChange();
    });
  },

  displayName() {
    const u = this.user;
    if (!u) return 'Me';
    return u.displayName || (u.email ? u.email.split('@')[0] : 'Player');
  },

  /* ---------- Auth ---------- */
  signInGoogle() {
    return this.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  },
  signInApple() {
    const provider = new firebase.auth.OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    return this.auth.signInWithPopup(provider);
  },
  setDisplayName(name) {
    return this.user.updateProfile({ displayName: name }).then(() => this.onChange());
  },
  // Firebase only lets you delete an account soon after signing in.
  signedInRecently() {
    const t = this.user && this.user.metadata && Date.parse(this.user.metadata.lastSignInTime);
    return !!t && Date.now() - t < 4 * 60 * 1000;
  },
  signInEmail(email, pw) { return this.auth.signInWithEmailAndPassword(email, pw); },
  signUpEmail(email, pw) { return this.auth.createUserWithEmailAndPassword(email, pw); },
  resetPassword(email) { return this.auth.sendPasswordResetEmail(email); },
  signOut() { return this.auth.signOut(); },

  /* ---------- Reading ---------- */
  list() {
    return [...this.leagues.values()].sort((a, b) => (b.created || 0) - (a.created || 0));
  },
  get(id) { return this.leagues.get(id) || null; },

  async fetchOne(id) {
    if (this.mode === 'local') return this.get(id);
    const snap = await this.db.collection('leagues').doc(id).get();
    return snap.exists ? this._unwrap(snap.data()) : null;
  },

  /* ---------- Writing ----------
     update(id, fn): fn gets the newest copy of the league and changes it.
     Return false from fn to cancel (nothing changed). Resolves true if saved. */
  async create(lg) {
    if (this.mode === 'local') {
      this.leagues.set(lg.id, lg); this._saveLocal(); this.onChange(); return true;
    }
    await this.db.collection('leagues').doc(lg.id).set(this._wrap(lg));
    return true;
  },

  async update(id, fn) {
    if (this.mode === 'local') {
      const lg = this.leagues.get(id);
      if (!lg || fn(lg) === false) return false;
      this._saveLocal(); this.onChange(); return true;
    }
    const ref = this.db.collection('leagues').doc(id);
    return this.db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const lg = this._unwrap(snap.data());
      if (fn(lg) === false) return false;
      tx.set(ref, this._wrap(lg));
      return true;
    });
  },

  async remove(id) {
    if (this.mode === 'local') {
      this.leagues.delete(id); this._saveLocal(); this.onChange(); return;
    }
    await this.db.collection('leagues').doc(id).delete();
  },

  /* ---------- League chat (friend leagues, cloud only) ----------
     Messages live in leagues/{id}/messages so the league itself stays small. */
  listenChat(leagueId, cb) {
    if (this.mode !== 'cloud') { cb([]); return () => {}; }
    return this.db.collection('leagues').doc(leagueId).collection('messages')
      .orderBy('at', 'desc').limit(80)
      .onSnapshot(snap => {
        const msgs = [];
        snap.forEach(d => msgs.push(Object.assign({ id: d.id }, d.data())));
        cb(msgs.reverse());
      }, err => { console.error(err); cb(null); });
  },
  sendChat(leagueId, text) {
    const clean = String(text || '').trim().slice(0, 500);
    if (!clean || this.mode !== 'cloud') return Promise.resolve(false);
    return this.db.collection('leagues').doc(leagueId).collection('messages').add({
      uid: ME_UID, name: this.displayName(), text: clean, at: Date.now(),
    }).then(() => true);
  },

  deleteChatMessage(leagueId, messageId) {
    return this.db.collection('leagues').doc(leagueId).collection('messages').doc(messageId).delete();
  },
  async deleteMyMessages(leagueId) {
    if (this.mode !== 'cloud') return;
    const snap = await this.db.collection('leagues').doc(leagueId).collection('messages').where('uid', '==', ME_UID).get();
    const jobs = [];
    snap.forEach(d => jobs.push(this.deleteChatMessage(leagueId, d.id)));
    await Promise.all(jobs);
  },
  report(info) {
    return this.db.collection('reports').add(Object.assign({ reporter: ME_UID, at: Date.now() }, info));
  },

  /* ---------- Your private settings (blocked people) ---------- */
  blocked: [],
  loadProfile() {
    if (this.mode !== 'cloud' || !this.user) return Promise.resolve();
    return this.db.collection('users').doc(ME_UID).get().then(snap => {
      const d = snap.exists ? snap.data() : {};
      this.blocked = Array.isArray(d.blocked) ? d.blocked : [];
      this.onChange();
    }).catch(err => console.error(err));
  },
  saveBlocked(list) {
    this.blocked = list.slice(0, 200);
    this.onChange();
    return this.db.collection('users').doc(ME_UID).set({ blocked: this.blocked });
  },
  async deleteAccount() {
    const uid = ME_UID;
    for (const lg of this.list()) {
      try { await this.deleteMyMessages(lg.id); } catch (e) { console.error(e); }
      if (lg.commissioner === uid && lg.memberUids.length <= 1) { await this.remove(lg.id); continue; }
      await this.update(lg.id, fresh => {
        if (fresh.commissioner === uid) fresh.commissioner = fresh.memberUids.find(u => u !== uid) || uid;
        leaveLeague(fresh, uid);
      });
    }
    try { await this.db.collection('users').doc(uid).delete(); } catch (e) { console.error(e); }
    await this.user.delete();
    try {
      Object.keys(localStorage).filter(k => k.includes(uid)).forEach(k => localStorage.removeItem(k));
    } catch (e) { /* ignore */ }
  },

  /* Leagues saved in this browser before accounts existed. */
  deviceLeagues() {
    if (this.mode === 'local') return [];
    try {
      const d = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
      return d && Array.isArray(d.leagues) ? d.leagues : [];
    } catch (e) { return []; }
  },
  async importDeviceLeagues() {
    const old = this.deviceLeagues();
    for (const lg of old) {
      for (const t of lg.teams) if (t.isUser || t.ownerUid === 'local') { t.ownerUid = ME_UID; t.ownerName = this.displayName(); delete t.isUser; }
      lg.memberUids = [ME_UID]; lg.commissioner = ME_UID;
      await this.create(normalizeLeague(lg));
    }
    try { localStorage.removeItem(LOCAL_KEY); } catch (e) { /* ignore */ }
    return old.length;
  },

  /* ---------- Internals ---------- */
  _wrap(lg) {
    // The whole league is saved as text; the outside fields are for
    // looking up "my leagues" and for the security rules.
    return {
      data: JSON.stringify(lg),
      name: lg.name,
      commissioner: lg.commissioner,
      memberUids: lg.memberUids,
      updatedAt: Date.now(),
    };
  },
  _unwrap(doc) { return normalizeLeague(JSON.parse(doc.data)); },

  _listen() {
    this._unsub = this.db.collection('leagues')
      .where('memberUids', 'array-contains', ME_UID)
      .onSnapshot(snap => {
        this.error = '';
        this.loaded = true;
        this.leagues.clear();
        snap.forEach(d => {
          try { this.leagues.set(d.id, this._unwrap(d.data())); } catch (e) { /* skip broken */ }
        });
        this.onChange();
      }, err => {
        this.loaded = true;
        this.error = err && err.code === 'permission-denied'
          ? 'The database blocked this request. Check the Firestore rules.'
          : "Couldn't reach the database. Check your connection.";
        this.onChange();
      });
  },

  _loadLocal() {
    try {
      const d = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
      if (d && Array.isArray(d.leagues)) d.leagues.forEach(lg => this.leagues.set(lg.id, normalizeLeague(lg)));
    } catch (e) { /* storage unavailable */ }
  },
  _saveLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ leagues: [...this.leagues.values()] })); } catch (e) { /* ignore */ }
  },
};
