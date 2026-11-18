// Authoritative match simulation. Runs at TICK_RATE, processes client input
// commands, performs lag-compensated hit detection, manages scoring,
// respawns, bots and end-of-match rewards.

import { TICK_DT, SNAPSHOT_EVERY, MODES, MATCH, PLAYER, NO_TEAM, MAX_REWIND_MS } from '../shared/config.js';
import { getMap } from '../shared/maps/index.js';
import { CollisionWorld, eyeHeight, stepProjectile } from '../shared/physics.js';
import { createPlayerState, respawnState, simulateTick, shotDirections, shotSeed, currentDef } from '../shared/sim.js';
import { WEAPONS, falloff } from '../shared/weapons.js';
import { rayPlayer, HIT_HEAD, HIT_LIMB } from '../shared/hitbox.js';
import { Writer, encodeSnapshot, encodeShots, RF } from '../shared/protocol.js';
import { dirFromAngles } from '../shared/math.js';
import { weaponMissionStats } from '../shared/missions.js';
import { computeMatchRewards } from '../shared/progression.js';
import { randomAvatar } from '../shared/avatar.js';
import { mulberry32 } from '../shared/rng.js';
import { getNav } from './nav.js';
import { BotBrain, BOT_NAMES, randomBotLoadout } from './bots.js';

const TICK_MS = 1000 / 60;
const HIST = 40;
const PHASE_CODE = { countdown: 0, live: 1, ended: 2 };

export class Match {
  constructor(opts) {
    this.id = opts.id;
    this.modeId = opts.mode;
    this.mode = MODES[opts.mode];
    this.teams = this.mode.teams;
    this.map = getMap(opts.mapId);
    this.world = new CollisionWorld(this.map.boxes);
    this.nav = getNav(this.map);
    this.isPrivate = !!opts.isPrivate;
    this.code = opts.code || null;
    this.settings = {
      timeLimit: opts.timeLimit || this.mode.timeLimit,
      scoreLimit: opts.scoreLimit || this.mode.scoreLimit,
      maxPlayers: opts.maxPlayers || this.mode.maxPlayers,
      bots: opts.bots ?? null, // null = auto-fill to maxPlayers
      botDifficulty: opts.botDifficulty || 'easy', // quick play: forgiving bots
    };
    this.players = new Map();
    this.nextPid = 1;
    this.tick = 0;
    this.time = 0;
    this.phase = 'countdown';
    this.phaseEnd = MATCH.countdown * 1000;
    this.teamScores = [0, 0];
    this.projectiles = [];
    this.nextProj = 1;
    this.pendingShots = [];
    this.firstBlood = false;
    this.closed = false;
    this.writer = new Writer(8192);
    this.rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
    this.botNameIdx = Math.floor(this.rng() * BOT_NAMES.length);
    this.onEnd = opts.onEnd || (() => {});
    this.onClose = opts.onClose || (() => {});
    this.lastScoreSend = 0;
    this.scoreDirty = true;
    this.announced = {};
    this.createdAt = Date.now();
  }

  // ───────────────────────── roster ─────────────────────────

  get humans() { return [...this.players.values()].filter((p) => !p.bot); }
  get bots() { return [...this.players.values()].filter((p) => p.bot); }

  teamCounts() {
    const c = [0, 0];
    for (const p of this.players.values()) if (p.team === 0 || p.team === 1) c[p.team]++;
    return c;
  }

  canJoin() {
    if (this.closed || this.phase === 'ended') return false;
    if (this.phase === 'live' && this.phaseEnd - this.time < MATCH.joinInProgressMinTime * 1000) return false;
    return this.humans.length < this.settings.maxPlayers;
  }

  _allocPid() {
    for (let i = 0; i < 250; i++) {
      const pid = this.nextPid;
      this.nextPid = (this.nextPid % 250) + 1;
      if (!this.players.has(pid)) return pid;
    }
    throw new Error('no free pid');
  }

  _pickTeam(pref) {
    if (!this.teams) return NO_TEAM;
    const humans = [0, 0];
    for (const p of this.players.values()) if (!p.bot) humans[p.team]++;
    const half = Math.ceil(this.settings.maxPlayers / 2);
    if ((pref === 0 || pref === 1) && humans[pref] < half) return pref;
    if (humans[0] !== humans[1]) return humans[0] < humans[1] ? 0 : 1;
    const all = this.teamCounts();
    return all[0] <= all[1] ? 0 : 1;
  }

  _newPlayer(o) {
    const pid = this._allocPid();
    const sim = createPlayerState(pid, o.loadout);
    sim.alive = false;
    const mp = {
      pid, name: o.name, team: o.team, bot: !!o.bot, client: o.client || null, accountId: o.accountId || null,
      avatar: o.avatar, loadout: { ...o.loadout }, camos: o.camos || {}, level: o.level || 1,
      sim, health: PLAYER.maxHealth, alive: false, respawnAt: this.time + 300, protectUntil: 0, lastDamageAt: -1e9,
      inputs: [], budget: 3, lastSeq: 0, viewTime: 0, ping: 0,
      stats: {
        kills: 0, deaths: 0, assists: 0, score: 0, damage: 0, headshots: 0, botKills: 0, meleeKills: 0,
        streak: 0, bestStreak: 0, weaponKills: {}, mission: {},
      },
      damageFrom: new Map(), lastKillAt: -1e9, multi: 0, lastKilledBy: 0,
      history: new Array(HIST), histIdx: 0,
      joinedAt: this.time, partyId: o.partyId || null,
      brain: null,
    };
    mp.hooks = {
      shot: (p, def, seq, spread) => this._onShot(mp, def, seq, spread),
      melee: (p, def) => this._onMelee(mp, def),
      fall: () => this._kill(mp, null, null, false, 'fall'),
    };
    if (mp.bot) mp.brain = new BotBrain(mp, this, this.settings.botDifficulty);
    this.players.set(pid, mp);
    return mp;
  }

  addHuman(client, opts = {}) {
    const acc = client.account;
    if (this.humans.length >= this.settings.maxPlayers) return null;
    const team = this._pickTeam(opts.team);
    // make room by removing a bot
    if (this.players.size >= this.settings.maxPlayers) {
      const bots = this.bots.filter((b) => !this.teams || b.team === team);
      const victim = bots[bots.length - 1] || this.bots[this.bots.length - 1];
      if (victim) this.removePlayer(victim.pid, 'replaced');
    }
    const mp = this._newPlayer({
      name: acc.username, team, client, accountId: acc.id, avatar: acc.data.avatar, loadout: acc.data.loadout,
      camos: acc.data.camos, level: acc.level, partyId: opts.partyId,
    });
    client.matchPlayer = mp;
    this._broadcastJSON({ t: 'pjoin', p: this._playerInfo(mp) }, mp);
    if (this.phase !== 'countdown') mp.respawnAt = this.time + 200;
    this.scoreDirty = true;
    this.balanceBots();
    client.send({ t: 'match.start', match: this.describe(mp) });
    return mp;
  }

  addBot(team) {
    const name = BOT_NAMES[this.botNameIdx++ % BOT_NAMES.length];
    const mp = this._newPlayer({
      name, team, bot: true, avatar: randomAvatar(this.rng), loadout: randomBotLoadout(this.rng), level: 1 + Math.floor(this.rng() * 40),
    });
    this._broadcastJSON({ t: 'pjoin', p: this._playerInfo(mp) });
    if (this.phase !== 'countdown') mp.respawnAt = this.time + 400;
    this.scoreDirty = true;
    return mp;
  }

  removePlayer(pid, reason = 'left') {
    const mp = this.players.get(pid);
    if (!mp) return;
    this.players.delete(pid);
    if (mp.client && mp.client.matchPlayer === mp) mp.client.matchPlayer = null;
    this._broadcastJSON({ t: 'pleave', pid, reason });
    this.scoreDirty = true;
    if (!mp.bot) {
      if (this.humans.length === 0) { this.close('empty'); return; }
      this.balanceBots();
    }
  }

  /** Keeps the bot population at the configured level and teams even. */
  balanceBots() {
    if (this.closed || this.phase === 'ended') return;
    const max = this.settings.maxPlayers;
    const target = this.settings.bots === null ? max : Math.min(max, this.humans.length + this.settings.bots);
    while (this.players.size > target && this.bots.length) {
      const counts = this.teamCounts();
      const bigTeam = counts[0] >= counts[1] ? 0 : 1;
      const bot = this.bots.filter((b) => !this.teams || b.team === bigTeam).pop() || this.bots.pop();
      this.removePlayer(bot.pid, 'balance');
    }
    while (this.players.size < target) {
      let team = NO_TEAM;
      if (this.teams) { const c = this.teamCounts(); team = c[0] <= c[1] ? 0 : 1; }
      this.addBot(team);
    }
    if (this.teams) {
      // move bots between teams to keep sizes within 1
      for (let i = 0; i < 6; i++) {
        const c = this.teamCounts();
        if (Math.abs(c[0] - c[1]) <= 1) break;
        const from = c[0] > c[1] ? 0 : 1;
        const bot = this.bots.find((b) => b.team === from);
        if (!bot) break;
        this.removePlayer(bot.pid, 'balance');
        this.addBot(1 - from);
      }
    }
  }

  _playerInfo(mp) {
    return { pid: mp.pid, name: mp.name, team: mp.team, bot: mp.bot, avatar: mp.avatar, level: mp.level, loadout: mp.loadout, camos: mp.camos, accountId: mp.accountId };
  }

  describe(forMp) {
    return {
      id: this.id, mode: this.modeId, map: this.map.id, private: this.isPrivate, code: this.code,
      phase: this.phase, phaseTime: Math.max(0, (this.phaseEnd - this.time) / 1000), time: Math.round(this.time),
      teamScores: this.teamScores, scoreLimit: this.settings.scoreLimit, timeLimit: this.settings.timeLimit,
      you: forMp ? forMp.pid : 0, team: forMp ? forMp.team : NO_TEAM,
      players: [...this.players.values()].map((p) => this._playerInfo(p)),
      scores: this._scoreRows(),
    };
  }

  // ───────────────────────── input ─────────────────────────

  queueInputs(mp, inputs) {
    for (const inp of inputs) {
      if (inp.seq <= mp.lastSeq) continue;
      mp.inputs.push(inp);
    }
    if (mp.inputs.length > 90) mp.inputs.splice(0, mp.inputs.length - 90);
  }

  _process(mp, inp) {
    mp.viewTime = Math.max(this.time - MAX_REWIND_MS, Math.min(this.time, inp.viewTime));
    if (!mp.alive) return;
    simulateTick(mp.sim, inp, { world: this.world, map: this.map, dt: TICK_DT, frozen: this.phase !== 'live', hooks: mp.hooks });
  }

  // ───────────────────────── main loop ─────────────────────────

  step() {
    if (this.closed) return;
    this.tick++;
    this.time += TICK_MS;

    if (this.phase === 'countdown' && this.time >= this.phaseEnd) {
      this.phase = 'live';
      this.phaseEnd = this.time + this.settings.timeLimit * 1000;
      this._broadcastJSON({ t: 'phase', phase: 'live', phaseTime: this.settings.timeLimit });
    } else if (this.phase === 'live') {
      const left = (this.phaseEnd - this.time) / 1000;
      if (left <= 60 && !this.announced.min1 && this.settings.timeLimit > 90) { this.announced.min1 = true; this._broadcastJSON({ t: 'announce', key: 'oneMinute' }); }
      if (this.time >= this.phaseEnd) this._end('time');
    } else if (this.phase === 'ended' && this.time >= this.phaseEnd) {
      this.close('finished');
      return;
    }

    // respawns
    for (const mp of this.players.values()) {
      if (!mp.alive && this.phase !== 'ended' && this.time >= mp.respawnAt) this._spawn(mp);
    }

    // input processing
    for (const mp of this.players.values()) {
      if (mp.bot) {
        if (mp.alive) {
          const inp = mp.brain.think();
          this._process(mp, inp);
        }
        continue;
      }
      mp.budget = Math.min(mp.budget + 1, 6);
      let n = 0;
      while (mp.inputs.length && mp.budget >= 1 && n < 5) {
        const inp = mp.inputs.shift();
        mp.budget -= 1; n++;
        mp.lastSeq = inp.seq;
        this._process(mp, inp);
      }
    }

    this._stepProjectiles();

    // regen + history
    for (const mp of this.players.values()) {
      if (mp.alive && mp.health < PLAYER.maxHealth && this.time - mp.lastDamageAt > PLAYER.regenDelay * 1000) {
        mp.health = Math.min(PLAYER.maxHealth, mp.health + PLAYER.regenRate * TICK_DT);
      }
      const s = mp.sim;
      let h = mp.history[mp.histIdx];
      if (!h) h = mp.history[mp.histIdx] = {};
      h.t = this.time; h.x = s.x; h.y = s.y; h.z = s.z; h.yaw = s.yaw; h.crouched = s.crouched; h.alive = mp.alive;
      mp.histIdx = (mp.histIdx + 1) % HIST;
    }

    if (this.pendingShots.length) {
      const bytes = encodeShots(this.writer, this.pendingShots);
      const shooters = new Set(this.pendingShots.map((s) => s.shooter));
      for (const mp of this.players.values()) {
        if (!mp.client) continue;
        if (shooters.size === 1 && shooters.has(mp.pid)) continue;
        mp.client.sendBin(bytes);
      }
      this.pendingShots.length = 0;
    }

    if (this.tick % SNAPSHOT_EVERY === 0) this._sendSnapshots();
    if (this.scoreDirty && this.time - this.lastScoreSend > 400) this._sendScores();
  }

  _sendSnapshots() {
    const others = [];
    for (const mp of this.players.values()) {
      const s = mp.sim;
      let flags = 0;
      if (s.onGround) flags |= RF.GROUND;
      if (s.crouched) flags |= RF.CROUCH;
      if (s.sliding) flags |= RF.SLIDE;
      if (s.sprinting) flags |= RF.SPRINT;
      if (mp.alive) flags |= RF.ALIVE;
      if (s.adsT > 0.5) flags |= RF.ADS;
      if (s.reloadT > 0) flags |= RF.RELOAD;
      if (this.time < mp.protectUntil) flags |= RF.PROTECT;
      if (s.meleeT > 0) flags |= RF.SWING;
      if (s.chargeT > 0) flags |= RF.CHARGE;
      if (s.spin > 0.05) flags |= RF.SPIN;
      if (s.switchT > 0) flags |= RF.SWITCH;
      others.push({
        id: mp.pid, x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, yaw: s.yaw, pitch: s.pitch,
        weapon: currentDef(s).index, health: mp.health, flags, swing: s.swingIdx, mp,
      });
    }
    const projectiles = this.projectiles.map((p) => ({ id: p.id, owner: p.owner, kind: p.def.index, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz }));
    const phaseTime = Math.max(0, (this.phaseEnd - this.time) / 1000);
    for (const mp of this.players.values()) {
      if (!mp.client) continue;
      const snap = {
        tick: this.tick, time: Math.round(this.time), phase: PHASE_CODE[this.phase], phaseTime,
        self: { ack: mp.lastSeq, p: mp.sim, health: mp.health, protect: this.time < mp.protectUntil },
        players: others.filter((o) => o.mp !== mp),
        projectiles,
      };
      mp.client.sendBin(encodeSnapshot(this.writer, snap));
    }
  }

  _scoreRows() {
    return [...this.players.values()].map((p) => [p.pid, p.stats.kills, p.stats.deaths, p.stats.assists, p.stats.score, p.bot ? 0 : Math.round(p.ping), p.stats.damage | 0]);
  }

  _sendScores() {
    this.scoreDirty = false;
    this.lastScoreSend = this.time;
    this._broadcastJSON({ t: 'scores', teams: this.teamScores, rows: this._scoreRows() });
  }

  _broadcastJSON(obj, except) {
    const str = JSON.stringify(obj);
    for (const mp of this.players.values()) {
      if (mp.client && mp !== except) mp.client.sendRaw(str);
    }
  }

  chat(mp, text, teamOnly) {
    const msg = { t: 'chat', ch: teamOnly && this.teams ? 'team' : 'all', pid: mp.pid, from: mp.name, text };
    const str = JSON.stringify(msg);
    for (const o of this.players.values()) {
      if (!o.client) continue;
      if (msg.ch === 'team' && o.team !== mp.team) continue;
      o.client.sendRaw(str);
    }
  }

  // ───────────────────────── spawning ─────────────────────────

  _spawnPoints(mp) {
    const all = this.map.spawns;
    if (this.teams) {
      const own = all.filter((s) => s.team === mp.team);
      if (this.phase === 'countdown' || own.length === 0) return own.length ? own : all;
      // mid-match: own spawns plus neutral ones far from enemies
      return [...own, ...all.filter((s) => s.team === 'ffa')];
    }
    return all;
  }

  _spawn(mp) {
    const points = this._spawnPoints(mp);
    const enemies = [...this.players.values()].filter((o) => o !== mp && o.alive && this.canDamage(o, mp));
    let best = null, bestScore = -Infinity;
    for (const sp of points) {
      let minD = 60;
      let visible = 0;
      for (const e of enemies) {
        const d = Math.hypot(e.sim.x - sp.x, e.sim.z - sp.z);
        if (d < minD) minD = d;
        if (d < 45 && this.world.visible(e.sim.x, e.sim.y + 1.6, e.sim.z, sp.x, sp.y + 1.5, sp.z)) visible++;
      }
      // avoid stacking on teammates/others
      let crowd = 0;
      for (const o of this.players.values()) {
        if (o !== mp && o.alive && Math.hypot(o.sim.x - sp.x, o.sim.z - sp.z) < 1.2) crowd++;
      }
      const isOwn = sp.team === mp.team;
      const score = minD - visible * 18 - crowd * 50 + (isOwn ? 8 : 0) + this.rng() * 6;
      if (score > bestScore) { bestScore = score; best = sp; }
    }
    if (!best) best = this.map.spawns[0];
    // during countdown give every player a distinct spawn
    if (this.phase === 'countdown') {
      const free = points.filter((sp) => ![...this.players.values()].some((o) => o !== mp && o.alive && Math.hypot(o.sim.x - sp.x, o.sim.z - sp.z) < 1));
      if (free.length) best = free[Math.floor(this.rng() * free.length)];
    }
    respawnState(mp.sim, best, mp.loadout);
    mp.sim.alive = true;
    mp.alive = true;
    mp.health = PLAYER.maxHealth;
    mp.protectUntil = this.time + PLAYER.spawnProtect * 1000;
    mp.lastDamageAt = -1e9;
    mp.damageFrom.clear();
    mp.history.fill(undefined);
    if (mp.brain) mp.brain.onSpawn();
    this._broadcastJSON({ t: 'spawn', pid: mp.pid, x: best.x, y: best.y, z: best.z, yaw: mp.sim.yaw });
  }

  // ───────────────────────── combat ─────────────────────────

  canDamage(attacker, victim) {
    if (!this.teams) return true;
    return attacker.team !== victim.team;
  }

  _rewind(mp, t) {
    let newest = null, older = null;
    for (const h of mp.history) {
      if (!h) continue;
      if (h.t <= t && (!older || h.t > older.t)) older = h;
      if (h.t >= t && (!newest || h.t < newest.t)) newest = h;
    }
    if (!older && !newest) return { x: mp.sim.x, y: mp.sim.y, z: mp.sim.z, yaw: mp.sim.yaw, crouched: mp.sim.crouched, alive: mp.alive };
    if (!older) older = newest;
    if (!newest) newest = older;
    if (!older.alive || !newest.alive) {
      const h = newest.alive ? newest : older;
      return { x: h.x, y: h.y, z: h.z, yaw: h.yaw, crouched: h.crouched, alive: h.alive && mp.alive };
    }
    const span = newest.t - older.t;
    const a = span > 0 ? (t - older.t) / span : 0;
    let dyaw = newest.yaw - older.yaw;
    if (dyaw > Math.PI) dyaw -= 2 * Math.PI; else if (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    return {
      x: older.x + (newest.x - older.x) * a, y: older.y + (newest.y - older.y) * a, z: older.z + (newest.z - older.z) * a,
      yaw: older.yaw + dyaw * a, crouched: a < 0.5 ? older.crouched : newest.crouched, alive: mp.alive,
    };
  }

  _onShot(mp, def, seq, spread) {
    mp.protectUntil = 0;
    const p = mp.sim;
    const ex = p.x, ey = p.y + eyeHeight(p), ez = p.z;
    const shotRec = { shooter: mp.pid, weapon: def.index, seq, ox: ex, oy: ey, oz: ez, yaw: p.yaw, pitch: p.pitch, spread, results: [] };
    if (def.projectile) {
      const [d] = shotDirections(p.yaw, p.pitch, spread, 1, shotSeed(p, seq));
      const pr = def.projectile;
      this.projectiles.push({
        id: this.nextProj = (this.nextProj % 65000) + 1, owner: mp.pid, def, seq,
        x: ex + d[0] * 0.5, y: ey + d[1] * 0.5 - 0.08, z: ez + d[2] * 0.5,
        vx: d[0] * pr.speed + p.vx * 0.3, vy: d[1] * pr.speed, vz: d[2] * pr.speed + p.vz * 0.3,
        gravity: pr.gravity, radius: pr.radius, life: pr.life, age: 0,
      });
      this.pendingShots.push(shotRec);
      return;
    }
    const dirs = shotDirections(p.yaw, p.pitch, spread, def.pellets, shotSeed(p, seq));
    const vt = mp.bot ? this.time : mp.viewTime;
    const cands = [];
    for (const o of this.players.values()) {
      if (o === mp || !o.alive || !this.canDamage(mp, o)) continue;
      const h = this._rewind(o, vt);
      if (h.alive) cands.push({ o, h });
    }
    const acc = new Map();
    const pierce = def.pierce || 1;
    for (const d of dirs) {
      const wh = this.world.raycast(ex, ey, ez, d[0], d[1], d[2], 260, true);
      const maxT = wh ? wh.t : 260;
      let hits = null;
      for (const c of cands) {
        const r = rayPlayer(ex, ey, ez, d[0], d[1], d[2], maxT, c.h.x, c.h.y, c.h.z, c.h.yaw, c.h.crouched);
        if (r) (hits || (hits = [])).push({ c, t: r.t, zone: r.zone });
      }
      let endT = maxT, kind = wh ? 0 : 2;
      if (hits) {
        if (hits.length > 1) hits.sort((a, b) => a.t - b.t);
        for (let i = 0; i < hits.length && i < pierce; i++) {
          const h = hits[i];
          const mul = h.zone === HIT_HEAD ? def.headMul : h.zone === HIT_LIMB ? def.limbMul : 1;
          const dmg = def.damage * mul * falloff(def, h.t);
          let a = acc.get(h.c.o);
          if (!a) { a = { dmg: 0, head: false }; acc.set(h.c.o, a); }
          a.dmg += dmg;
          if (h.zone === HIT_HEAD) a.head = true;
        }
        if (pierce === 1) { endT = hits[0].t; kind = 1; }
      }
      shotRec.results.push({ t: endT, kind });
    }
    this.pendingShots.push(shotRec);
    for (const [victim, a] of acc) this._damage(victim, mp, a.dmg, def, a.head, ex, ez, 'bullet');
  }

  _onMelee(mp, def) {
    mp.protectUntil = 0;
    const p = mp.sim;
    const ex = p.x, ey = p.y + eyeHeight(p), ez = p.z;
    const fwd = dirFromAngles(p.yaw, p.pitch);
    const vt = mp.bot ? this.time : mp.viewTime;
    const found = [];
    for (const o of this.players.values()) {
      if (o === mp || !o.alive || !this.canDamage(mp, o)) continue;
      const h = this._rewind(o, vt);
      if (!h.alive) continue;
      const cy = h.y + (h.crouched ? 0.7 : 1.15);
      // closest point on target's vertical segment to the eye
      const ty = Math.max(h.y + 0.3, Math.min(h.y + (h.crouched ? 1.25 : 1.75), ey));
      const dx = h.x - ex, dy = ty - ey, dz = h.z - ez;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > def.range + 0.4) continue;
      const dot = dist > 1e-4 ? (dx * fwd[0] + dy * fwd[1] + dz * fwd[2]) / dist : 1;
      const ang = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
      if (ang > def.arc / 2 + (dist < 1.3 ? 30 : 8)) continue;
      if (!this.world.visible(ex, ey, ez, h.x, cy, h.z)) continue;
      found.push({ o, h, score: dist + ang * 0.03 });
    }
    if (!found.length) return;
    found.sort((a, b) => a.score - b.score);
    const maxTargets = def.anim === 'spin' || def.anim === 'wide' ? 2 : 1;
    for (const f of found.slice(0, maxTargets)) {
      let mul = 1;
      if (def.backstab > 1) {
        const vf = dirFromAngles(f.h.yaw, 0);
        const ax = ex - f.h.x, az = ez - f.h.z;
        const l = Math.hypot(ax, az) || 1;
        if ((vf[0] * ax + vf[2] * az) / l < -0.35) mul = def.backstab;
      }
      this._damage(f.o, mp, def.damage * mul, def, false, ex, ez, mul > 1 ? 'backstab' : 'melee');
    }
  }

  _stepProjectiles() {
    if (!this.projectiles.length) return;
    const keep = [];
    for (const pr of this.projectiles) {
      pr.age += TICK_DT;
      pr.life -= TICK_DT;
      const ox = pr.x, oy = pr.y, oz = pr.z;
      const wh = stepProjectile(pr, this.world, TICK_DT);
      let ex = pr.x, ey = pr.y, ez = pr.z, boom = !!wh || pr.life <= 0;
      // player impact along the segment
      const sx = pr.x - ox, sy = pr.y - oy, sz = pr.z - oz;
      const len = Math.hypot(sx, sy, sz);
      if (len > 1e-6) {
        let bestT = Infinity;
        for (const o of this.players.values()) {
          if (!o.alive) continue;
          if (o.pid === pr.owner && pr.age < 0.25) continue;
          const owner = this.players.get(pr.owner);
          if (owner && o !== owner && !this.canDamage(owner, o)) continue;
          const r = rayPlayer(ox, oy, oz, sx / len, sy / len, sz / len, len + pr.radius, o.sim.x, o.sim.y, o.sim.z, o.sim.yaw, o.sim.crouched);
          if (r && r.t < bestT) bestT = r.t;
        }
        if (bestT < Infinity) {
          ex = ox + (sx / len) * bestT; ey = oy + (sy / len) * bestT; ez = oz + (sz / len) * bestT;
          boom = true;
        }
      }
      if (boom) this._explode(pr, ex, ey, ez, wh);
      else keep.push(pr);
    }
    this.projectiles = keep;
  }

  _explode(pr, x, y, z, wh) {
    const ex = pr.def.projectile.explode;
    if (wh) { x += wh.nx * 0.15; y += wh.ny * 0.15; z += wh.nz * 0.15; }
    this._broadcastJSON({ t: 'boom', x, y, z, r: ex.radius, o: pr.owner, w: pr.def.index, id: pr.id, s: pr.seq });
    const owner = this.players.get(pr.owner);
    for (const o of this.players.values()) {
      if (!o.alive) continue;
      const self = o.pid === pr.owner;
      if (!self && owner && !this.canDamage(owner, o)) continue;
      const cy = o.sim.y + (o.sim.crouched ? 0.65 : 1.0);
      const dx = o.sim.x - x, dy = cy - y, dz = o.sim.z - z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > ex.radius) continue;
      if (!this.world.visible(x, y, z, o.sim.x, cy, o.sim.z)) continue;
      const f = 1 - dist / ex.radius;
      let dmg = ex.minDamage + (ex.damage - ex.minDamage) * f;
      if (self) dmg *= ex.selfMul;
      // knockback
      const k = 10 * f / Math.max(0.3, dist);
      o.sim.vx += dx * k * 0.6; o.sim.vz += dz * k * 0.6; o.sim.vy = Math.max(o.sim.vy, 3 + 6 * f);
      o.sim.onGround = false;
      if (owner) this._damage(o, owner, dmg, pr.def, false, x, z, 'explosion');
      else if (self) this._damage(o, o, dmg, pr.def, false, x, z, 'explosion');
    }
  }

  _damage(victim, attacker, amount, def, head, fromX, fromZ, kind) {
    if (!victim.alive || this.phase !== 'live') return;
    // bots hit human players softer; how much depends on their skill setting
    if (attacker && attacker !== victim && attacker.bot && !victim.bot && attacker.brain) amount *= attacker.brain.d.dmg ?? 1;
    if (this.time < victim.protectUntil) return;
    if (attacker && attacker !== victim && !this.canDamage(attacker, victim)) return;
    amount = Math.max(1, Math.round(amount));
    const before = victim.health;
    victim.health -= amount;
    victim.lastDamageAt = this.time;
    const dealt = Math.min(before, amount);
    if (attacker && attacker !== victim) {
      attacker.stats.damage += dealt;
      attacker.stats.mission.damage = (attacker.stats.mission.damage || 0) + dealt;
      const rec = victim.damageFrom.get(attacker.pid) || { amt: 0, t: 0 };
      rec.amt += dealt; rec.t = this.time;
      victim.damageFrom.set(attacker.pid, rec);
      if (attacker.client) attacker.client.send({ t: 'hit', v: victim.pid, d: amount, h: head ? 1 : 0, k: victim.health <= 0 ? 1 : 0, m: kind });
      if (attacker.brain) attacker.brain.onHit(victim);
    }
    if (victim.client) victim.client.send({ t: 'hurt', a: attacker ? attacker.pid : 0, d: amount, x: fromX, z: fromZ, hp: Math.max(0, Math.ceil(victim.health)) });
    if (victim.brain && attacker && attacker !== victim) victim.brain.onDamaged(attacker);
    if (victim.health <= 0) this._kill(victim, attacker, def, head, kind);
  }

  _kill(victim, killer, def, head, reason) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.sim.alive = false;
    victim.health = 0;
    victim.respawnAt = this.time + this.mode.respawn * 1000;
    victim.stats.deaths++;
    victim.stats.streak = 0;
    if (this.phase !== 'live') return;
    let multi = 0, streak = 0, revenge = false, first = false;
    if (killer && killer !== victim) {
      const ks = killer.stats;
      ks.kills++; ks.streak++; ks.score += 100;
      ks.bestStreak = Math.max(ks.bestStreak, ks.streak);
      streak = ks.streak;
      if (victim.bot) ks.botKills++;
      if (head) { ks.headshots++; ks.mission.headshotKills = (ks.mission.headshotKills || 0) + 1; ks.score += 25; }
      if (def && def.kind === 'melee') ks.meleeKills++;
      if (def) {
        ks.weaponKills[def.id] = (ks.weaponKills[def.id] || 0) + 1;
        for (const key of weaponMissionStats(def)) ks.mission[key] = (ks.mission[key] || 0) + 1;
      }
      multi = this.time - killer.lastKillAt < MATCH.multiKillWindow * 1000 ? killer.multi + 1 : 1;
      killer.multi = multi;
      killer.lastKillAt = this.time;
      if (killer.lastKilledBy === victim.pid) { revenge = true; killer.lastKilledBy = 0; ks.score += 25; }
      if (!this.firstBlood) { this.firstBlood = true; first = true; ks.score += 50; }
      // scavenger: refill one magazine of reserve for the killer's gun
      const slot = killer.sim.slots[killer.sim.slot];
      const kd = WEAPONS[slot.id];
      if (kd && kd.kind === 'gun') slot.reserve = Math.min(kd.reserve, slot.reserve + kd.mag);
      if (this.teams) this.teamScores[killer.team]++;
      victim.lastKilledBy = killer.pid;
    } else if (this.teams === false) {
      victim.stats.score = Math.max(0, victim.stats.score - 50);
    }
    const assists = [];
    for (const [pid, rec] of victim.damageFrom) {
      if (killer && pid === killer.pid) continue;
      if (this.time - rec.t > MATCH.assistWindow * 1000 || rec.amt < MATCH.assistMinDamage) continue;
      const a = this.players.get(pid);
      if (!a) continue;
      a.stats.assists++; a.stats.score += 25;
      a.stats.mission.assists = (a.stats.mission.assists || 0) + 1;
      assists.push(pid);
    }
    victim.damageFrom.clear();
    this._broadcastJSON({
      t: 'kill', k: killer && killer !== victim ? killer.pid : 0, v: victim.pid, w: def ? def.index : 255, h: head ? 1 : 0,
      a: assists, s: streak, m: multi, fb: first ? 1 : 0, rv: revenge ? 1 : 0, r: reason || '',
    });
    this.scoreDirty = true;
    if (killer && killer.brain) killer.brain.onKill(victim);
    // score limit
    if (killer && killer !== victim) {
      if (this.teams && this.teamScores[killer.team] >= this.settings.scoreLimit) this._end('score');
      else if (!this.teams && killer.stats.kills >= this.settings.scoreLimit) this._end('score');
    }
  }

  // ───────────────────────── end of match ─────────────────────────

  _ranking() {
    return [...this.players.values()].sort((a, b) => b.stats.kills - a.stats.kills || b.stats.score - a.stats.score || a.stats.deaths - b.stats.deaths);
  }

  _end(reason) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.phaseEnd = this.time + MATCH.endDuration * 1000;
    this.projectiles = [];
    const ranking = this._ranking();
    let winnerTeam = -1;
    if (this.teams) winnerTeam = this.teamScores[0] > this.teamScores[1] ? 0 : this.teamScores[1] > this.teamScores[0] ? 1 : -1;
    const mvp = [...this.players.values()].sort((a, b) => b.stats.score - a.stats.score)[0];
    const board = ranking.map((p, i) => ({
      pid: p.pid, name: p.name, team: p.team, bot: p.bot, kills: p.stats.kills, deaths: p.stats.deaths, assists: p.stats.assists,
      score: p.stats.score, damage: p.stats.damage | 0, headshots: p.stats.headshots, place: i + 1, level: p.level,
    }));
    const results = [];
    for (const p of this.players.values()) {
      if (p.bot) continue;
      const place = ranking.indexOf(p) + 1;
      const won = this.teams ? p.team === winnerTeam : place === 1;
      const rewards = computeMatchRewards({
        kills: p.stats.kills, botKills: p.stats.botKills, assists: p.stats.assists, headshots: p.stats.headshots,
        won, place, completed: true,
      }, { mode: this.modeId, isPrivate: this.isPrivate });
      const missionStats = {
        ...p.stats.mission, matches: 1, wins: won ? 1 : 0, kills: p.stats.kills, meleeKills: p.stats.meleeKills,
        bestStreak: p.stats.bestStreak, [`matches_${this.modeId}`]: 1,
      };
      results.push({
        mp: p, place, won,
        summary: {
          credits: rewards.credits, xp: rewards.xp, lines: rewards.lines, kills: p.stats.kills, deaths: p.stats.deaths,
          assists: p.stats.assists, headshots: p.stats.headshots, damage: p.stats.damage, won, completed: true,
          mode: this.modeId, meleeKills: p.stats.meleeKills, bestStreak: p.stats.bestStreak, weaponKills: p.stats.weaponKills,
          missionStats, playtime: (this.time - p.joinedAt) / 1000,
        },
      });
    }
    const info = { reason, winnerTeam, teamScores: [...this.teamScores], board, mvp: mvp ? mvp.pid : 0, mode: this.modeId, map: this.map.id, duration: this.time / 1000 };
    this.onEnd(this, info, results);
  }

  close(reason) {
    if (this.closed) return;
    this.closed = true;
    for (const mp of this.players.values()) {
      if (mp.client && mp.client.matchPlayer === mp) {
        mp.client.matchPlayer = null;
        mp.client.send({ t: 'match.close', reason });
      }
    }
    this.onClose(this, reason);
  }
}
