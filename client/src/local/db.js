// In-browser replacement for server/db.js (same prepared-statement interface), kept in
// localStorage so the offline build remembers your credits, unlocks and stats.
const KEY = 'supershot.local.db.v1';
const lower = (s) => String(s).toLowerCase();

export class DB {
  constructor() {
    // inside the worker the page hands over the saved data and stores what we send back
    this.env = globalThis.__SUPERSHOT_DB__ || null;
    let d = null;
    try { d = JSON.parse((this.env ? this.env.init : localStorage.getItem(KEY)) || 'null'); } catch { d = null; }
    this.d = d && d.accounts ? d : { nextId: 1, accounts: [], sessions: [], friends: [] };
    const D = this.d;
    const acc = (id) => D.accounts.find((a) => a.id === id);
    const touch = () => this._persist();
    const ranked = () => D.accounts.filter((a) => a.matches > 0);
    const pick = (a) => ({ id: a.id, username: a.username, xp: a.xp, kills: a.kills, deaths: a.deaths, wins: a.wins, matches: a.matches });
    const top = (k) => ({ all: (limit) => ranked().sort((a, b) => b[k] - a[k] || a.id - b.id).slice(0, limit).map(pick) });
    const rank = (k) => ({ get: (v, _v, id) => ({ n: ranked().filter((a) => a[k] > v || (a[k] === v && a.id < id)).length }) });
    const unique = (name, id) => { if (D.accounts.some((a) => a.id !== id && lower(a.username) === lower(name))) throw new Error('UNIQUE constraint failed: accounts.username'); };
    this.q = {
      insertAccount: { run: (username, pass_hash, salt, guest, created_at, last_login, credits, data) => {
        unique(username);
        const id = D.nextId++;
        D.accounts.push({ id, username, pass_hash, salt, guest, created_at, last_login, credits, xp: 0, kills: 0, deaths: 0, wins: 0, matches: 0, data });
        touch();
        return { lastInsertRowid: id, changes: 1 };
      } },
      byId: { get: (id) => { const a = acc(Number(id)); return a ? { ...a } : undefined; } },
      byName: { get: (name) => { const a = D.accounts.find((x) => lower(x.username) === lower(name)); return a ? { ...a } : undefined; } },
      save: { run: (credits, xp, kills, deaths, wins, matches, data, id) => { const a = acc(Number(id)); if (a) Object.assign(a, { credits, xp, kills, deaths, wins, matches, data }); touch(); return { changes: a ? 1 : 0 }; } },
      setLogin: { run: (t, id) => { const a = acc(Number(id)); if (a) a.last_login = t; touch(); } },
      setPassword: { run: (pass_hash, salt, username, id) => { unique(username, Number(id)); const a = acc(Number(id)); if (a) Object.assign(a, { pass_hash, salt, username, guest: 0 }); touch(); } },
      insertSession: { run: (token_hash, account_id, created_at, last_used) => { D.sessions.push({ token_hash, account_id, created_at, last_used }); touch(); } },
      sessionByHash: { get: (h) => { const s = D.sessions.find((x) => x.token_hash === h); return s ? { ...s } : undefined; } },
      touchSession: { run: (t, h) => { const s = D.sessions.find((x) => x.token_hash === h); if (s) s.last_used = t; touch(); } },
      deleteSession: { run: (h) => { D.sessions = D.sessions.filter((x) => x.token_hash !== h); touch(); } },
      pruneSessions: { run: (t) => { D.sessions = D.sessions.filter((x) => x.last_used >= t); touch(); } },
      friendRow: { get: (a, b) => { const f = D.friends.find((x) => x.a === a && x.b === b); return f ? { ...f } : undefined; } },
      friendInsert: { run: (a, b, status, created_at) => { D.friends = D.friends.filter((x) => !(x.a === a && x.b === b)); D.friends.push({ a, b, status, created_at }); touch(); } },
      friendDelete: { run: (a, b, b2, a2) => { D.friends = D.friends.filter((x) => !((x.a === a && x.b === b) || (x.a === b2 && x.b === a2))); touch(); } },
      friendsOf: { all: (id) => D.friends.filter((f) => f.a === id || f.b === id).map((f) => {
        const o = acc(f.a === id ? f.b : f.a);
        return o ? { a: f.a, b: f.b, status: f.status, other_id: o.id, username: o.username, xp: o.xp, data: o.data } : null;
      }).filter(Boolean) },
      friendCount: { get: (a) => ({ n: D.friends.filter((f) => (f.a === a || f.b === a) && f.status === 'accepted').length }) },
      topXp: top('xp'), topKills: top('kills'), topWins: top('wins'),
      rankXp: rank('xp'), rankKills: rank('kills'), rankWins: rank('wins'),
      insertMatch: { run: () => ({ changes: 1 }) },
      countAccounts: { get: () => ({ n: D.accounts.length }) },
    };
    if (!this.env) { try { addEventListener('pagehide', () => this._flush()); } catch { /* no window */ } }
  }

  _persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this._flush(), 250);
  }

  _flush() {
    const json = JSON.stringify(this.d);
    if (this.env) { this.env.save(json); return; }
    try { localStorage.setItem(KEY, json); } catch { /* storage unavailable */ }
  }

  tx(fn) { return fn(); }
  close() { this._flush(); }
}
