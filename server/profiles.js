// Accounts, sessions and the credits economy (shop, loadouts, avatars,
// daily rewards, missions, match rewards). All mutations are validated here.

import { randomBytes, scrypt as scryptCb, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { LIMITS } from '../shared/config.js';
import { ITEMS, getItem, FREE_ITEMS, priceFor, featuredForDay } from '../shared/items.js';
import { WEAPONS, DEFAULT_LOADOUT } from '../shared/weapons.js';
import { DEFAULT_AVATAR, sanitizeAvatar } from '../shared/avatar.js';
import { levelFromXp, levelUpReward, DAILY_REWARDS } from '../shared/progression.js';
import { missionsForDay, missionDef } from '../shared/missions.js';
import { utcDayKey } from '../shared/math.js';

const scrypt = promisify(scryptCb);
export const STARTING_CREDITS = 1000;

export class GameError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

const NAME_RE = /^[A-Za-z0-9_]+$/;
const BLOCKED = ['admin', 'moderator', 'system', 'server', 'supershot'];

export function validateUsername(name) {
  if (typeof name !== 'string') throw new GameError('bad_username', 'Invalid username.');
  name = name.trim();
  if (name.length < LIMITS.usernameMin || name.length > LIMITS.usernameMax) {
    throw new GameError('bad_username', `Username must be ${LIMITS.usernameMin}-${LIMITS.usernameMax} characters.`);
  }
  if (!NAME_RE.test(name)) throw new GameError('bad_username', 'Use letters, numbers and underscores only.');
  if (BLOCKED.some((b) => name.toLowerCase().startsWith(b))) throw new GameError('bad_username', 'That username is reserved.');
  if (/^guest/i.test(name)) throw new GameError('bad_username', 'Usernames cannot start with "Guest".');
  return name;
}

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < LIMITS.passwordMin || pw.length > 128) {
    throw new GameError('bad_password', `Password must be at least ${LIMITS.passwordMin} characters.`);
  }
  return pw;
}

async function hashPassword(pw, salt) {
  const buf = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return buf.toString('hex');
}

const sha = (s) => createHash('sha256').update(s).digest('hex');

function defaultData() {
  return {
    inventory: [],
    loadout: { ...DEFAULT_LOADOUT },
    camos: {},
    avatar: { ...DEFAULT_AVATAR },
    stats: {
      kills: 0, deaths: 0, assists: 0, headshots: 0, wins: 0, losses: 0, matches: 0, damage: 0,
      playtime: 0, bestStreak: 0, meleeKills: 0, weaponKills: {},
    },
    daily: { last: null, streak: 0 },
    missions: { day: null, list: [] },
    settings: {},
  };
}

export class Account {
  constructor(row) {
    this.id = row.id;
    this.username = row.username;
    this.guest = !!row.guest;
    this.credits = row.credits;
    this.xp = row.xp;
    this.createdAt = row.created_at;
    let data;
    try { data = JSON.parse(row.data); } catch { data = {}; }
    const def = defaultData();
    this.data = { ...def, ...data, stats: { ...def.stats, ...(data.stats || {}) } };
    this.owned = new Set([...FREE_ITEMS, ...this.data.inventory]);
  }
  get level() { return levelFromXp(this.xp).level; }
  owns(id) { return this.owned.has(id); }
}

export class Profiles {
  constructor(db) {
    this.db = db;
    this.cache = new Map(); // id → Account (online or recently used)
    this.lbCache = new Map();
  }

  // ─────────── auth ───────────

  async register(username, password) {
    username = validateUsername(username);
    validatePassword(password);
    if (this.db.q.byName.get(username)) throw new GameError('name_taken', 'That username is already taken.');
    const salt = randomBytes(16).toString('hex');
    const hash = await hashPassword(password, salt);
    if (this.db.q.byName.get(username)) throw new GameError('name_taken', 'That username is already taken.');
    const now = Date.now();
    const info = this.db.q.insertAccount.run(username, hash, salt, 0, now, now, STARTING_CREDITS, JSON.stringify(defaultData()));
    const acc = this.get(Number(info.lastInsertRowid));
    return { account: acc, token: this.createSession(acc.id) };
  }

  async login(username, password) {
    if (typeof username !== 'string' || typeof password !== 'string') throw new GameError('bad_login', 'Invalid username or password.');
    const row = this.db.q.byName.get(username.trim());
    if (!row || !row.pass_hash) {
      await hashPassword(password, 'timing-pad'); // keep timing similar
      throw new GameError('bad_login', 'Invalid username or password.');
    }
    const hash = await hashPassword(password, row.salt);
    const a = Buffer.from(hash, 'hex'), b = Buffer.from(row.pass_hash, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new GameError('bad_login', 'Invalid username or password.');
    this.db.q.setLogin.run(Date.now(), row.id);
    const acc = this.get(row.id);
    return { account: acc, token: this.createSession(acc.id) };
  }

  createGuest() {
    let name;
    for (let i = 0; i < 50; i++) {
      name = 'Guest' + (10000 + Math.floor(Math.random() * 89999));
      if (!this.db.q.byName.get(name)) break;
    }
    const now = Date.now();
    const info = this.db.q.insertAccount.run(name, null, null, 1, now, now, STARTING_CREDITS, JSON.stringify(defaultData()));
    const acc = this.get(Number(info.lastInsertRowid));
    return { account: acc, token: this.createSession(acc.id) };
  }

  /** Converts a guest account into a full account with a chosen username + password. */
  async claim(acc, username, password) {
    if (!acc.guest) throw new GameError('not_guest', 'This account already has a password.');
    username = validateUsername(username);
    validatePassword(password);
    const existing = this.db.q.byName.get(username);
    if (existing && existing.id !== acc.id) throw new GameError('name_taken', 'That username is already taken.');
    const salt = randomBytes(16).toString('hex');
    const hash = await hashPassword(password, salt);
    this.db.q.setPassword.run(hash, salt, username, acc.id);
    acc.username = username;
    acc.guest = false;
    return acc;
  }

  createSession(accountId) {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    this.db.q.insertSession.run(sha(token), accountId, now, now);
    return token;
  }

  resume(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const row = this.db.q.sessionByHash.get(sha(token));
    if (!row) return null;
    const now = Date.now();
    if (now - row.last_used > 1000 * 60 * 60 * 24 * 60) { this.db.q.deleteSession.run(sha(token)); return null; }
    this.db.q.touchSession.run(now, sha(token));
    this.db.q.setLogin.run(now, row.account_id);
    return this.get(row.account_id);
  }

  logout(token) {
    if (typeof token === 'string') this.db.q.deleteSession.run(sha(token));
  }

  get(id) {
    let acc = this.cache.get(id);
    if (acc) return acc;
    const row = this.db.q.byId.get(id);
    if (!row) return null;
    acc = new Account(row);
    this.cache.set(id, acc);
    return acc;
  }

  findByName(name) {
    if (typeof name !== 'string') return null;
    const row = this.db.q.byName.get(name.trim());
    return row ? this.get(row.id) : null;
  }

  evict(id) {
    this.cache.delete(id);
  }

  save(acc) {
    acc.data.inventory = [...acc.owned].filter((id) => !FREE_ITEMS.includes(id));
    const s = acc.data.stats;
    this.db.q.save.run(acc.credits, acc.xp, s.kills, s.deaths, s.wins, s.matches, JSON.stringify(acc.data), acc.id);
  }

  // ─────────── profile view ───────────

  profileView(acc) {
    this.ensureMissions(acc);
    const lv = levelFromXp(acc.xp);
    const day = utcDayKey();
    const d = acc.data.daily;
    return {
      id: acc.id,
      username: acc.username,
      guest: acc.guest,
      credits: acc.credits,
      xp: acc.xp,
      level: lv.level,
      levelInto: lv.into,
      levelNeeded: lv.needed,
      inventory: [...acc.owned],
      loadout: acc.data.loadout,
      camos: acc.data.camos,
      avatar: acc.data.avatar,
      stats: acc.data.stats,
      daily: {
        canClaim: d.last !== day,
        streak: d.streak,
        nextIndex: this._nextDailyIndex(acc),
        rewards: DAILY_REWARDS,
      },
      missions: acc.data.missions.list.map((m) => {
        const def = missionDef(m.id);
        return { id: m.id, text: def.text, goal: def.goal, reward: def.reward, progress: Math.min(def.goal, m.progress), claimed: m.claimed };
      }),
      day,
      featured: featuredForDay(day).map((id) => ({ id, price: priceFor(ITEMS[id], day) })),
    };
  }

  _nextDailyIndex(acc) {
    const d = acc.data.daily;
    const today = utcDayKey();
    const yesterday = utcDayKey(new Date(Date.now() - 86400000));
    if (d.last === today) return (d.streak - 1) % DAILY_REWARDS.length;
    if (d.last === yesterday) return d.streak % DAILY_REWARDS.length;
    return 0;
  }

  // ─────────── economy ───────────

  buy(acc, itemId) {
    const item = getItem(itemId);
    if (!item) throw new GameError('no_item', 'That item does not exist.');
    if (acc.owns(itemId)) throw new GameError('owned', 'You already own this item.');
    const price = priceFor(item, utcDayKey());
    if (acc.credits < price) throw new GameError('no_credits', 'Not enough credits.');
    acc.credits -= price;
    acc.owned.add(itemId);
    this.save(acc);
    return { item: itemId, price };
  }

  setLoadout(acc, lo) {
    if (!lo || typeof lo !== 'object') throw new GameError('bad_loadout', 'Invalid loadout.');
    const next = { ...acc.data.loadout };
    for (const slot of ['primary', 'secondary', 'melee']) {
      const id = lo[slot];
      if (id === undefined) continue;
      const def = WEAPONS[id];
      if (!def || def.slot !== slot) throw new GameError('bad_loadout', 'Invalid weapon for that slot.');
      if (!acc.owns(id)) throw new GameError('not_owned', 'You do not own that weapon.');
      next[slot] = id;
    }
    acc.data.loadout = next;
    this.save(acc);
    return next;
  }

  setCamo(acc, weaponId, camoId) {
    const def = WEAPONS[weaponId];
    const camo = getItem(camoId);
    if (!def || !camo || camo.cat !== 'camo') throw new GameError('bad_camo', 'Invalid camo.');
    if (!acc.owns(camoId)) throw new GameError('not_owned', 'You do not own that camo.');
    if (camoId === 'camo_none') delete acc.data.camos[weaponId];
    else acc.data.camos[weaponId] = camoId;
    this.save(acc);
    return acc.data.camos;
  }

  setAvatar(acc, avatar) {
    acc.data.avatar = sanitizeAvatar(avatar, acc.owned);
    this.save(acc);
    return acc.data.avatar;
  }

  claimDaily(acc) {
    const today = utcDayKey();
    const d = acc.data.daily;
    if (d.last === today) throw new GameError('claimed', 'Daily reward already claimed. Come back tomorrow!');
    const idx = this._nextDailyIndex(acc);
    const reward = DAILY_REWARDS[idx];
    d.streak = idx + 1;
    d.last = today;
    acc.credits += reward;
    this.save(acc);
    return { reward, streak: d.streak };
  }

  ensureMissions(acc) {
    const today = utcDayKey();
    if (acc.data.missions.day !== today) {
      acc.data.missions = { day: today, list: missionsForDay(acc.id, today) };
      this.save(acc);
    }
  }

  claimMission(acc, missionId) {
    this.ensureMissions(acc);
    const m = acc.data.missions.list.find((x) => x.id === missionId);
    if (!m) throw new GameError('no_mission', 'Mission not found.');
    const def = missionDef(m.id);
    if (m.claimed) throw new GameError('claimed', 'Mission reward already claimed.');
    if (m.progress < def.goal) throw new GameError('incomplete', 'Mission not complete yet.');
    m.claimed = true;
    acc.credits += def.reward;
    this.save(acc);
    return { reward: def.reward };
  }

  /**
   * Applies the outcome of a match to an account.
   * r = { credits, xp, kills, deaths, assists, headshots, damage, won, completed, mode,
   *       meleeKills, bestStreak, weaponKills: {id:n}, missionStats: {stat: n}, playtime }
   */
  applyMatch(acc, r) {
    this.ensureMissions(acc);
    const s = acc.data.stats;
    s.kills += r.kills; s.deaths += r.deaths; s.assists += r.assists; s.headshots += r.headshots;
    s.damage += Math.round(r.damage); s.meleeKills += r.meleeKills; s.playtime += Math.round(r.playtime);
    s.bestStreak = Math.max(s.bestStreak, r.bestStreak);
    if (r.completed) {
      s.matches += 1;
      if (r.won) s.wins += 1; else s.losses += 1;
    }
    for (const [id, n] of Object.entries(r.weaponKills || {})) s.weaponKills[id] = (s.weaponKills[id] || 0) + n;

    // missions
    const ms = { ...(r.missionStats || {}) };
    for (const m of acc.data.missions.list) {
      const def = missionDef(m.id);
      if (!def || m.claimed) continue;
      const v = ms[def.stat] || 0;
      if (def.max) m.progress = Math.max(m.progress, v);
      else m.progress = Math.min(def.goal, m.progress + v);
    }

    // credits + xp + level ups
    const before = levelFromXp(acc.xp).level;
    acc.credits += r.credits;
    acc.xp += r.xp;
    const after = levelFromXp(acc.xp).level;
    let levelBonus = 0;
    for (let l = before + 1; l <= after; l++) levelBonus += levelUpReward(l);
    acc.credits += levelBonus;
    this.save(acc);
    return { levelBefore: before, levelAfter: after, levelBonus };
  }

  // ─────────── leaderboards ───────────

  leaderboard(board, forAcc) {
    const key = board;
    const now = Date.now();
    let cached = this.lbCache.get(key);
    if (!cached || now - cached.t > 15000) {
      const stmt = board === 'kills' ? this.db.q.topKills : board === 'wins' ? this.db.q.topWins : this.db.q.topXp;
      const rows = stmt.all(50).map((r, i) => ({
        rank: i + 1, id: r.id, name: r.username, level: levelFromXp(r.xp).level, xp: r.xp,
        kills: r.kills, deaths: r.deaths, wins: r.wins, matches: r.matches,
        kd: r.deaths ? Math.round((r.kills / r.deaths) * 100) / 100 : r.kills,
      }));
      cached = { t: now, rows };
      this.lbCache.set(key, cached);
    }
    let you = null;
    if (forAcc) {
      const s = forAcc.data.stats;
      const v = board === 'kills' ? s.kills : board === 'wins' ? s.wins : forAcc.xp;
      const stmt = board === 'kills' ? this.db.q.rankKills : board === 'wins' ? this.db.q.rankWins : this.db.q.rankXp;
      const ahead = stmt.get(v, v, forAcc.id).n;
      you = {
        rank: s.matches > 0 ? ahead + 1 : null, id: forAcc.id, name: forAcc.username, level: forAcc.level, xp: forAcc.xp,
        kills: s.kills, deaths: s.deaths, wins: s.wins, matches: s.matches,
        kd: s.deaths ? Math.round((s.kills / s.deaths) * 100) / 100 : s.kills,
      };
    }
    return { board, rows: cached.rows, you };
  }

  invalidateLeaderboards() {
    this.lbCache.clear();
  }
}
