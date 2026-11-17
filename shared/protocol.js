// Network protocol. Hot-path messages (inputs, snapshots, shots) are compact
// binary; everything else (menus, social, events) is JSON text.

import { RECON_FLOATS, packFlags, unpackFlags } from './sim.js';
import { weaponByIndex, WEAPONS } from './weapons.js';

export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;
export const MSG_SHOTS = 3;
export const MSG_PING = 4;
export const MSG_PONG = 5;

const ANG = 32767 / Math.PI;

export class Writer {
  constructor(size = 1024) {
    this.buf = new ArrayBuffer(size);
    this.dv = new DataView(this.buf);
    this.o = 0;
  }
  ensure(n) {
    if (this.o + n <= this.buf.byteLength) return;
    let size = this.buf.byteLength * 2;
    while (size < this.o + n) size *= 2;
    const nb = new ArrayBuffer(size);
    new Uint8Array(nb).set(new Uint8Array(this.buf, 0, this.o));
    this.buf = nb;
    this.dv = new DataView(nb);
  }
  reset() { this.o = 0; return this; }
  u8(v) { this.ensure(1); this.dv.setUint8(this.o, v); this.o += 1; }
  i8(v) { this.ensure(1); this.dv.setInt8(this.o, v); this.o += 1; }
  u16(v) { this.ensure(2); this.dv.setUint16(this.o, v, true); this.o += 2; }
  i16(v) { this.ensure(2); this.dv.setInt16(this.o, v, true); this.o += 2; }
  u32(v) { this.ensure(4); this.dv.setUint32(this.o, v >>> 0, true); this.o += 4; }
  f32(v) { this.ensure(4); this.dv.setFloat32(this.o, v, true); this.o += 4; }
  f64(v) { this.ensure(8); this.dv.setFloat64(this.o, v, true); this.o += 8; }
  bytes() { return new Uint8Array(this.buf, 0, this.o).slice(); }
}

export class Reader {
  constructor(data) {
    if (data instanceof ArrayBuffer) this.dv = new DataView(data);
    else this.dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.o = 0;
  }
  get left() { return this.dv.byteLength - this.o; }
  u8() { const v = this.dv.getUint8(this.o); this.o += 1; return v; }
  i8() { const v = this.dv.getInt8(this.o); this.o += 1; return v; }
  u16() { const v = this.dv.getUint16(this.o, true); this.o += 2; return v; }
  i16() { const v = this.dv.getInt16(this.o, true); this.o += 2; return v; }
  u32() { const v = this.dv.getUint32(this.o, true); this.o += 4; return v; }
  f32() { const v = this.dv.getFloat32(this.o, true); this.o += 4; return v; }
  f64() { const v = this.dv.getFloat64(this.o, true); this.o += 8; return v; }
}

const qa = (a) => Math.max(-32767, Math.min(32767, Math.round(a * ANG)));
const dqa = (v) => v / ANG;

// ───────────── INPUT (client → server) ─────────────
// One message may carry several ticks of input.

export function encodeInputs(w, inputs) {
  w.reset();
  w.u8(MSG_INPUT);
  w.u8(inputs.length);
  for (const i of inputs) {
    w.u32(i.seq);
    w.i8(Math.round(Math.max(-1, Math.min(1, i.mx)) * 127));
    w.i8(Math.round(Math.max(-1, Math.min(1, i.mz)) * 127));
    w.f32(i.yaw);
    w.f32(i.pitch);
    w.u16(i.buttons);
    w.u8(i.slot);
    w.u32(Math.max(0, Math.round(i.viewTime)));
  }
  return w.bytes();
}

export function decodeInputs(r) {
  const n = r.u8();
  const out = [];
  if (n > 16 || r.left < n * 21) return out;
  for (let k = 0; k < n; k++) {
    const seq = r.u32();
    const mx = r.i8() / 127;
    const mz = r.i8() / 127;
    const yaw = r.f32();
    const pitch = r.f32();
    const buttons = r.u16();
    const slot = r.u8();
    const viewTime = r.u32();
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) continue;
    out.push({ seq, mx, mz, yaw, pitch, buttons, slot: Math.min(2, slot), viewTime });
  }
  return out;
}

// ───────────── SNAPSHOT (server → client) ─────────────
// remote player flag bits
export const RF = {
  GROUND: 1, CROUCH: 2, SLIDE: 4, SPRINT: 8, ALIVE: 16, ADS: 32, RELOAD: 64, PROTECT: 128,
  SWING: 256, CHARGE: 512, SPIN: 1024, SWITCH: 2048,
};

/**
 * snap = { tick, time, phase, phaseTime, self: {ack, p, health, protect} | null,
 *          players: [{id, x,y,z, vx,vz, yaw,pitch, weapon, health, flags, swing}],
 *          projectiles: [{id, owner, kind, x,y,z, vx,vy,vz}] }
 */
export function encodeSnapshot(w, snap) {
  w.reset();
  w.u8(MSG_SNAPSHOT);
  w.u32(snap.tick);
  w.u32(snap.time);
  w.u8(snap.phase);
  w.f32(snap.phaseTime);
  if (snap.self) {
    const p = snap.self.p;
    w.u8(1);
    w.u32(snap.self.ack);
    for (const k of RECON_FLOATS) w.f32(p[k]);
    w.u16(packFlags(p));
    w.u8(p.slot); w.u8(p.burstLeft); w.u8(p.swingIdx); w.u8(p.returnSlot);
    w.u32(p.shotSeq);
    w.f32(p.yaw); w.f32(p.pitch);
    for (let i = 0; i < 3; i++) {
      const s = p.slots[i];
      w.u8(WEAPONS[s.id].index); w.u16(s.mag); w.u16(s.reserve);
    }
    w.u8(Math.max(0, Math.min(255, Math.ceil(snap.self.health))));
    w.u8(snap.self.protect ? 1 : 0);
  } else {
    w.u8(0);
  }
  w.u8(snap.players.length);
  for (const o of snap.players) {
    w.u8(o.id);
    w.f32(o.x); w.f32(o.y); w.f32(o.z);
    w.i16(Math.round(Math.max(-327, Math.min(327, o.vx)) * 100));
    w.i16(Math.round(Math.max(-327, Math.min(327, o.vy)) * 100));
    w.i16(Math.round(Math.max(-327, Math.min(327, o.vz)) * 100));
    w.i16(qa(o.yaw)); w.i16(qa(o.pitch));
    w.u8(o.weapon); w.u8(Math.max(0, Math.min(255, Math.ceil(o.health))));
    w.u16(o.flags); w.u8(o.swing);
  }
  w.u8(snap.projectiles.length);
  for (const pr of snap.projectiles) {
    w.u16(pr.id); w.u8(pr.owner); w.u8(pr.kind);
    w.f32(pr.x); w.f32(pr.y); w.f32(pr.z);
    w.f32(pr.vx); w.f32(pr.vy); w.f32(pr.vz);
  }
  return w.bytes();
}

export function decodeSnapshot(r) {
  const snap = { tick: r.u32(), time: r.u32(), phase: r.u8(), phaseTime: r.f32(), self: null, players: [], projectiles: [] };
  if (r.u8() === 1) {
    const ack = r.u32();
    const p = { slots: [{}, {}, {}] };
    for (const k of RECON_FLOATS) p[k] = r.f32();
    unpackFlags(p, r.u16());
    p.slot = r.u8(); p.burstLeft = r.u8(); p.swingIdx = r.u8(); p.returnSlot = r.u8();
    p.shotSeq = r.u32();
    p.yaw = r.f32(); p.pitch = r.f32();
    for (let i = 0; i < 3; i++) {
      const wd = weaponByIndex(r.u8());
      p.slots[i] = { id: wd ? wd.id : 'knife', mag: r.u16(), reserve: r.u16() };
    }
    const health = r.u8();
    const protect = r.u8() === 1;
    snap.self = { ack, p, health, protect };
  }
  const n = r.u8();
  for (let i = 0; i < n; i++) {
    snap.players.push({
      id: r.u8(), x: r.f32(), y: r.f32(), z: r.f32(),
      vx: r.i16() / 100, vy: r.i16() / 100, vz: r.i16() / 100,
      yaw: dqa(r.i16()), pitch: dqa(r.i16()),
      weapon: r.u8(), health: r.u8(), flags: r.u16(), swing: r.u8(),
    });
  }
  const m = r.u8();
  for (let i = 0; i < m; i++) {
    snap.projectiles.push({
      id: r.u16(), owner: r.u8(), kind: r.u8(),
      x: r.f32(), y: r.f32(), z: r.f32(), vx: r.f32(), vy: r.f32(), vz: r.f32(),
    });
  }
  return snap;
}

// ───────────── SHOTS (server → clients, for remote gunfire effects) ─────────────
// shot = { shooter, weapon, seq, ox,oy,oz, yaw, pitch, spread, results: [{t, kind}] }
// kind: 0 = world, 1 = player, 2 = nothing (max range)

export function encodeShots(w, shots) {
  w.reset();
  w.u8(MSG_SHOTS);
  w.u8(shots.length);
  for (const s of shots) {
    w.u8(s.shooter); w.u8(s.weapon); w.u32(s.seq);
    w.f32(s.ox); w.f32(s.oy); w.f32(s.oz);
    w.f32(s.yaw); w.f32(s.pitch); w.f32(s.spread);
    w.u8(s.results.length);
    for (const res of s.results) { w.u16(Math.min(65535, Math.round(res.t * 50))); w.u8(res.kind); }
  }
  return w.bytes();
}

export function decodeShots(r) {
  const n = r.u8();
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = { shooter: r.u8(), weapon: r.u8(), seq: r.u32(), ox: r.f32(), oy: r.f32(), oz: r.f32(), yaw: r.f32(), pitch: r.f32(), spread: r.f32(), results: [] };
    const k = r.u8();
    for (let j = 0; j < k; j++) s.results.push({ t: r.u16() / 50, kind: r.u8() });
    out.push(s);
  }
  return out;
}

export function encodePing(w, type, t) {
  w.reset(); w.u8(type); w.f64(t); return w.bytes();
}
