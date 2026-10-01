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
  onChange: () => {},
  _unsub: null,

  /* ---------- Setup ---------- */
  init() {
    if (this.mode === 'local') {
      ME_UID = 'local';
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
      if (user) {
        ME_UID = user.uid;
        this._listen();
      } else {
        ME_UID = 'signed-out';
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
        this.leagues.clear();
        snap.forEach(d => {
          try { this.leagues.set(d.id, this._unwrap(d.data())); } catch (e) { /* skip broken */ }
        });
        this.onChange();
      }, err => {
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
