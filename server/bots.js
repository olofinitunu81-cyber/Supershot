// Server-side bots. They generate the same input commands a human client
// would, so they obey identical movement/weapon rules and hit detection.

import { BTN, PLAYER } from '../shared/config.js';
import { WEAPONS } from '../shared/weapons.js';
import { eyeHeight } from '../shared/physics.js';
import { wrapAngle, anglesFromDir } from '../shared/math.js';

export const BOT_NAMES = [
  'Vortex', 'Nyx', 'Glitch', 'Pixel', 'Rogue', 'Cipher', 'Blitz', 'Echo', 'Havoc', 'Jinx', 'Kilo', 'Lynx',
  'Maverick', 'Nova', 'Onyx', 'Quasar', 'Raptor', 'Saber', 'Titan', 'Viper', 'Wraith', 'Xeno', 'Zephyr', 'Bolt',
  'Comet', 'Dash', 'Ember', 'Flux', 'Gizmo', 'Halo', 'Ion', 'Jolt', 'Karma', 'Laser', 'Mako', 'Neon', 'Orbit',
  'Pulse', 'Quirk', 'Rift', 'Spark', 'Turbo', 'Ultra', 'Volt', 'Wisp', 'Yeti', 'Zap', 'Astra', 'Byte', 'Chrome',
].map((n) => n.toUpperCase());

const PRIMARIES = ['vx9', 'vx9', 'ar77', 'k3', 'tempest', 'helix', 'wasp', 'wasp', 'phantom', 'ripper', 'breacher', 'hydra', 'twinfang', 'marksman', 'titan', 'longshot'];
const SECONDARIES = ['sidekick', 'sidekick', 'judge', 'hornet'];
const MELEES = ['knife', 'karambit', 'daggers', 'machete', 'katana', 'tomahawk', 'axe', 'plasma', 'nano', 'reaper'];

export function randomBotLoadout(rng) {
  const p = (a) => a[Math.floor(rng() * a.length) % a.length];
  return { primary: p(PRIMARIES), secondary: p(SECONDARIES), melee: p(MELEES) };
}

const DIFF = {
  easy: { react: 0.55, turn: 3.2, aimErr: 0.11, errDecay: 1.4, fireCone: 0.06, view: 75, headChance: 0.1, strafe: 0.5 },
  normal: { react: 0.34, turn: 5.5, aimErr: 0.065, errDecay: 2.4, fireCone: 0.045, view: 95, headChance: 0.25, strafe: 0.8 },
  hard: { react: 0.2, turn: 9, aimErr: 0.035, errDecay: 4, fireCone: 0.03, view: 110, headChance: 0.45, strafe: 1 },
};

export class BotBrain {
  constructor(mp, match, difficulty = 'normal') {
    this.mp = mp;
    this.match = match;
    this.d = DIFF[difficulty] || DIFF.normal;
    this.rng = match.rng;
    this.seq = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.slot = 0;
    this.onSpawn();
  }

  onSpawn() {
    const s = this.mp.sim;
    this.yaw = s.yaw;
    this.pitch = 0;
    this.slot = 0;
    this.target = null;
    this.targetSince = 0;
    this.lastSeen = null;
    this.path = null;
    this.pathIdx = 0;
    this.goal = null;
    this.repathAt = 0;
    this.strafeDir = this.rng() < 0.5 ? -1 : 1;
    this.strafeUntil = 0;
    this.errYaw = 0;
    this.errPitch = 0;
    this.thinkCd = Math.floor(this.rng() * 6);
    this.firePulse = false;
    this.stuckT = 0;
    this.lastX = s.x; this.lastZ = s.z;
    this.jumpCd = 0;
    this.crouchUntil = 0;
    this.aggro = null;
    this.aggroUntil = 0;
    this.padFlight = false;
    this.fireHold = 0;
  }

  onDamaged(attacker) {
    this.aggro = attacker;
    this.aggroUntil = this.match.time + 2500;
  }

  onHit() {}

  onKill() {
    this.target = null;
  }

  _now() { return this.match.time / 1000; }

  _eye() {
    const s = this.mp.sim;
    return [s.x, s.y + eyeHeight(s), s.z];
  }

  _aimPoint(o, head) {
    const s = o.sim;
    if (head) return [s.x, s.y + (s.crouched ? 1.13 : 1.64), s.z];
    return [s.x, s.y + (s.crouched ? 0.7 : 1.15), s.z];
  }

  _visible(o) {
    const [ex, ey, ez] = this._eye();
    const w = this.match.world;
    const s = o.sim;
    if (w.visible(ex, ey, ez, s.x, s.y + (s.crouched ? 1.1 : 1.6), s.z)) return true;
    return w.visible(ex, ey, ez, s.x, s.y + (s.crouched ? 0.7 : 1.1), s.z);
  }

  _perceive() {
    const me = this.mp;
    const s = me.sim;
    const [ex, , ez] = this._eye();
    let best = null, bestScore = Infinity;
    for (const o of this.match.players.values()) {
      if (o === me || !o.alive || !this.match.canDamage(me, o)) continue;
      const dx = o.sim.x - ex, dz = o.sim.z - ez;
      const dist = Math.hypot(dx, dz, o.sim.y - s.y);
      if (dist > 90) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - this.yaw)) * 180 / Math.PI;
      const isAggro = this.aggro === o && this.match.time < this.aggroUntil;
      const isCur = this.target === o;
      if (!isAggro && !isCur && ang > this.d.view && dist > 7) continue;
      if (!this._visible(o)) continue;
      const score = dist + (isCur ? -12 : 0) + (isAggro ? -15 : 0) + ang * 0.05;
      if (score < bestScore) { bestScore = score; best = o; }
    }
    if (best && best !== this.target) {
      this.target = best;
      this.targetSince = this._now();
      this.errYaw = (this.rng() - 0.5) * 2 * this.d.aimErr * 2.2;
      this.errPitch = (this.rng() - 0.5) * 2 * this.d.aimErr * 1.4;
      this.useHead = this.rng() < this.d.headChance;
    }
    if (!best && this.target) {
      this.lastSeen = { x: this.target.sim.x, y: this.target.sim.y, z: this.target.sim.z, t: this._now() };
      this.target = null;
    }
    if (best) this.lastSeen = { x: best.sim.x, y: best.sim.y, z: best.sim.z, t: this._now() };
  }

  _pathTo(x, y, z) {
    const s = this.mp.sim;
    const nav = this.match.nav;
    const from = nav.nearest(s.x, s.y, s.z);
    const to = nav.nearest(x, y, z);
    this.path = nav.path(from, to);
    this.pathIdx = 0;
    this.repathAt = this._now() + 2 + this.rng() * 1.5;
    if (!this.path) this.goal = null;
  }

  _pickRoamGoal() {
    const nav = this.match.nav;
    // bias toward enemies' general area so bots find fights
    const enemies = [...this.match.players.values()].filter((o) => o.alive && o !== this.mp && this.match.canDamage(this.mp, o));
    if (enemies.length && this.rng() < 0.65) {
      const e = enemies[Math.floor(this.rng() * enemies.length)];
      const n = nav.nearest(e.sim.x + (this.rng() - 0.5) * 16, e.sim.y, e.sim.z + (this.rng() - 0.5) * 16, 6);
      if (n) return n;
    }
    return nav.randomNode(this.rng);
  }

  /** Returns the next path waypoint direction (world XZ) or null. */
  _followPath(inp) {
    const s = this.mp.sim;
    if (!this.path || this.pathIdx >= this.path.length) return null;
    let node = this.path[this.pathIdx];
    const dx = node.x - s.x, dz = node.z - s.z;
    const hd = Math.hypot(dx, dz);
    if (hd < 0.55 && Math.abs(node.y - s.y) < 1.4) {
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) return null;
      node = this.path[this.pathIdx];
    }
    // edge type handling
    const prev = this.pathIdx > 0 ? this.path[this.pathIdx - 1] : this.match.nav.nearest(s.x, s.y, s.z);
    const type = prev ? this.match.nav.edgeType(prev, node) : 'walk';
    if (type === 'jump' && s.onGround && Math.hypot(node.x - s.x, node.z - s.z) < 1.6 && this.jumpCd <= 0) {
      inp.buttons |= BTN.JUMP;
      this.jumpCd = 0.5;
    }
    if (type === 'pad') this.padFlight = true;
    const ddx = node.x - s.x, ddz = node.z - s.z;
    const l = Math.hypot(ddx, ddz) || 1;
    return [ddx / l, ddz / l, l];
  }

  think() {
    const me = this.mp;
    const s = me.sim;
    const m = this.match;
    const now = this._now();
    const dt = 1 / 60;
    const inp = { seq: ++this.seq, mx: 0, mz: 0, yaw: this.yaw, pitch: this.pitch, buttons: 0, slot: this.slot, viewTime: m.time };
    if (this.jumpCd > 0) this.jumpCd -= dt;
    if (m.phase !== 'live') {
      this._turnToward(this.yaw, 0, dt);
      inp.yaw = this.yaw; inp.pitch = this.pitch;
      return inp;
    }
    if (--this.thinkCd <= 0) { this.thinkCd = 6; this._perceive(); }

    // landing after a pad launch
    if (this.padFlight) {
      if (s.onGround && s.padCd <= 0.2) this.padFlight = false;
      else { inp.yaw = this.yaw; inp.pitch = this.pitch; return inp; }
    }

    const slotDef = WEAPONS[s.slots[s.slot].id];
    const cur = s.slots[s.slot];
    let moveDir = null;
    let lookYaw = this.yaw, lookPitch = 0;
    const t = this.target && this.target.alive ? this.target : null;
    if (!t) this.target = null;

    if (t) {
      const [ex, ey, ez] = this._eye();
      let [ax, ay, az] = this._aimPoint(t, this.useHead);
      const dist = Math.hypot(ax - ex, az - ez, ay - ey);
      // projectile lead + aim low for splash
      if (slotDef.projectile) {
        const tt = dist / slotDef.projectile.speed;
        ax += t.sim.vx * tt; az += t.sim.vz * tt; ay = t.sim.y + 0.3 + 0.5 * slotDef.projectile.gravity * tt * tt;
      }
      const a = anglesFromDir(ax - ex, ay - ey, az - ez);
      this.errYaw *= Math.exp(-this.d.errDecay * dt);
      this.errPitch *= Math.exp(-this.d.errDecay * dt);
      // continuous tracking wobble
      const wob = this.d.aimErr * 0.25;
      lookYaw = a.yaw + this.errYaw + Math.sin(now * 3.1 + me.pid) * wob;
      lookPitch = a.pitch + this.errPitch + Math.sin(now * 2.3 + me.pid * 2) * wob * 0.6;

      // weapon choice
      if (cur.mag === 0 && s.slot === 0 && dist < 18 && s.slots[1].mag > 0) this.slot = 1;
      const pref = slotDef.cls === 'SHOTGUN' ? 6 : slotDef.cls === 'SMG' ? 10 : (slotDef.cls === 'SNIPER' || slotDef.cls === 'DMR' || slotDef.cls === 'RAIL') ? 30 : 16;

      // combat movement: strafe + range keeping
      if (now > this.strafeUntil) {
        this.strafeDir = this.rng() < 0.5 ? -1 : 1;
        this.strafeUntil = now + 0.35 + this.rng() * 0.9;
        if (this.rng() < 0.12 && s.onGround && this._safeAround()) inp.buttons |= BTN.JUMP;
        if (this.rng() < 0.15) this.crouchUntil = now + 0.6 + this.rng();
      }
      const tx = (t.sim.x - s.x) / Math.max(0.1, dist), tz = (t.sim.z - s.z) / Math.max(0.1, dist);
      let mvx = -tz * this.strafeDir * this.d.strafe, mvz = tx * this.strafeDir * this.d.strafe;
      if (dist > pref + 6) { mvx += tx; mvz += tz; }
      else if (dist < pref - 4 && slotDef.cls !== 'SHOTGUN') { mvx -= tx * 0.7; mvz -= tz * 0.7; }
      if (slotDef.kind === 'melee' || (slotDef.cls === 'SHOTGUN' && dist > 4)) { mvx += tx * 1.5; mvz += tz * 1.5; }
      const ml = Math.hypot(mvx, mvz);
      if (ml > 0.01) moveDir = [mvx / ml, mvz / ml, 2];
      if (now < this.crouchUntil && slotDef.cls !== 'SHOTGUN') inp.buttons |= BTN.CROUCH;

      // ADS at range
      if (slotDef.kind === 'gun' && dist > 13 && slotDef.cls !== 'SHOTGUN' && slotDef.fire !== 'spin') inp.buttons |= BTN.ADS;
      if (slotDef.fire === 'spin') inp.buttons |= BTN.ADS;

      // fire when on target
      const errAng = Math.hypot(wrapAngle(this.yaw - a.yaw), this.pitch - a.pitch);
      const angSize = Math.atan2(0.45, Math.max(1, dist));
      const reacted = now - this.targetSince > this.d.react;
      if (reacted && errAng < this.d.fireCone + angSize) {
        if (slotDef.kind === 'melee') {
          if (dist < slotDef.range + 0.3) inp.buttons |= BTN.FIRE;
        } else if (dist < 2.2 && this.rng() < 0.3) {
          inp.buttons |= BTN.MELEE;
        } else if (slotDef.fire === 'auto' || slotDef.fire === 'spin' || slotDef.fire === 'charge') {
          inp.buttons |= BTN.FIRE;
        } else {
          this.firePulse = !this.firePulse;
          if (this.firePulse) inp.buttons |= BTN.FIRE;
        }
      }
      // don't stand still when sniping close targets
      if (slotDef.cls === 'SNIPER' && dist < 7 && s.slots[1].mag > 0) this.slot = 1;
    } else {
      // no target: hunt last seen position, else roam
      if (this.slot !== 0 && s.slots[0].mag + s.slots[0].reserve > 0) this.slot = 0;
      if (cur.mag < (slotDef.mag || 0) * 0.5 && cur.reserve > 0 && slotDef.kind === 'gun') inp.buttons |= BTN.RELOAD;
      const hunting = this.lastSeen && now - this.lastSeen.t < 5;
      if (hunting && (!this.goal || this.goal.hunt !== this.lastSeen.t) && now > this.repathAt - 1.5) {
        this.goal = { x: this.lastSeen.x, y: this.lastSeen.y, z: this.lastSeen.z, hunt: this.lastSeen.t };
        this._pathTo(this.goal.x, this.goal.y, this.goal.z);
      }
      if (!this.goal || !this.path || this.pathIdx >= this.path.length || now > this.repathAt + 6) {
        const n = this._pickRoamGoal();
        if (n) {
          this.goal = { x: n.x, y: n.y, z: n.z };
          this._pathTo(n.x, n.y, n.z);
        }
      }
      moveDir = this._followPath(inp);
      if (moveDir) {
        lookYaw = Math.atan2(-moveDir[0], -moveDir[1]);
        lookPitch = 0;
        if (moveDir[2] > 3 && !hunting) inp.buttons |= BTN.SPRINT;
      }
      if (hunting) {
        const a = anglesFromDir(this.lastSeen.x - s.x, this.lastSeen.y + 1.4 - (s.y + 1.6), this.lastSeen.z - s.z);
        lookYaw = a.yaw; lookPitch = a.pitch * 0.5;
      }
    }

    // follow the nav path while fighting if far from target
    if (t && !moveDir) moveDir = this._followPath(inp);

    this._turnToward(lookYaw, lookPitch, dt);
    inp.yaw = this.yaw;
    inp.pitch = this.pitch;
    inp.slot = this.slot;

    if (moveDir && !s.onGround && !this.padFlight) {
      // airborne: don't steer out over the void
      if (!this._safeAhead(moveDir[0], moveDir[1], 2.2)) moveDir = null;
    }
    if (moveDir && s.onGround) {
      // ledge safety: never step toward a lethal or large drop unless the path says so
      const pathDrop = !t && this.path && this.pathIdx < this.path.length && this.path[this.pathIdx].y < s.y - 0.6;
      if (!pathDrop && !this._safeAhead(moveDir[0], moveDir[1])) {
        // try the opposite strafe, else stop
        this.strafeDir *= -1;
        this.strafeUntil = now + 0.6;
        const alt = [-moveDir[0], -moveDir[1], moveDir[2]];
        moveDir = t && this._safeAhead(alt[0], alt[1]) ? alt : null;
      }
    }

    if (moveDir) {
      // world dir → local input relative to current yaw
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const fx = -sy, fz = -cy, rx = cy, rz = -sy;
      inp.mz = moveDir[0] * fx + moveDir[1] * fz;
      inp.mx = moveDir[0] * rx + moveDir[1] * rz;
    }

    // stuck detection
    const moved = Math.hypot(s.x - this.lastX, s.z - this.lastZ);
    this.lastX = s.x; this.lastZ = s.z;
    if (moveDir && moved < 0.02 && s.onGround) {
      this.stuckT += dt;
      if (this.stuckT > 0.6 && this.jumpCd <= 0) { inp.buttons |= BTN.JUMP; this.jumpCd = 0.8; }
      if (this.stuckT > 1.5) { this.stuckT = 0; this.path = null; this.goal = null; this.strafeDir *= -1; }
    } else this.stuckT = Math.max(0, this.stuckT - dt * 2);

    return inp;
  }

  _safeAround() {
    return this._safeAhead(1, 0, 2.6) && this._safeAhead(-1, 0, 2.6) && this._safeAhead(0, 1, 2.6) && this._safeAhead(0, -1, 2.6);
  }

  _safeAhead(dx, dz, far = 1.4) {
    const s = this.mp.sim;
    const w = this.match.world;
    for (const d of [0.7, far]) {
      const g = w.groundHeight(s.x + dx * d, s.z + dz * d, s.y + 0.6, 40);
      if (g === null || g < this.match.map.killY + 2 || s.y - g > 3.2) return false;
    }
    return true;
  }

  _turnToward(yaw, pitch, dt) {
    const max = this.d.turn * dt;
    const dy = wrapAngle(yaw - this.yaw);
    const dp = pitch - this.pitch;
    // ease-in turning: proportional with cap
    const sy = Math.sign(dy) * Math.min(Math.abs(dy), Math.max(max * 0.15, Math.abs(dy) * 0.22), max);
    const sp = Math.sign(dp) * Math.min(Math.abs(dp), Math.max(max * 0.15, Math.abs(dp) * 0.22), max);
    this.yaw = wrapAngle(this.yaw + sy);
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch + sp));
  }
}

export { PLAYER };
