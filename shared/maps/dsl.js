// Map construction DSL. Maps are authored as data with prefab helpers and a
// symmetry helper that duplicates a half-map rotated 180° about the origin,
// which guarantees perfectly balanced team layouts.

export class MapBuilder {
  constructor(meta) {
    this.meta = meta;
    this.boxes = [];
    this.decos = [];
    this.spawns = [];
    this.pads = [];
    this.lights = [];
    this.rot = 0; // quarter turns applied to everything emitted (CCW from above)
  }

  get f() { return this.rot === 2 ? -1 : 1; }

  // ── symmetry ──
  /** Emits fn twice: as authored and rotated 180° about the origin (team-balanced). */
  sym(fn) {
    this.rot = 0; fn(this, 1);
    this.rot = 2; this.swapTeams = true; fn(this, -1);
    this.rot = 0; this.swapTeams = false;
    return this;
  }
  /** Emits fn four times rotated by quarter turns (for symmetric FFA arenas). */
  sym4(fn) {
    for (let r = 0; r < 4; r++) { this.rot = r; fn(this, r); }
    this.rot = 0;
    return this;
  }
  /** Rotates a logical (x, z) point by the current quarter-turn count. R(x,z) = (z, -x). */
  P(x, z) {
    switch (this.rot) {
      case 1: return [z, -x];
      case 2: return [-x, -z];
      case 3: return [-z, x];
      default: return [x, z];
    }
  }
  Yaw(y) { return y + this.rot * (Math.PI / 2); }

  // ── primitives ──
  /** Solid box. x,z = center, y = bottom. */
  box(x, y, z, w, h, d, mat = 'wall', o = {}) {
    if (w <= 0 || h <= 0 || d <= 0) return this;
    const [cx, cz] = this.P(x, z);
    if (this.rot & 1) { const t = w; w = d; d = t; }
    this.boxes.push({
      min: [r3(cx - w / 2), r3(y), r3(cz - d / 2)],
      max: [r3(cx + w / 2), r3(y + h), r3(cz + d / 2)],
      mat,
      bullet: o.bullet !== false,
      hidden: !!o.hidden,
      color: o.color || null,
      emissive: o.emissive || null,
      noShadow: !!o.noShadow,
    });
    return this;
  }
  /** Box from min/max corners (logical coordinates). */
  boxMM(x0, y0, z0, x1, y1, z1, mat, o) {
    return this.box((x0 + x1) / 2, Math.min(y0, y1), (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), mat, o);
  }
  clip(x, y, z, w, h, d) {
    return this.box(x, y, z, w, h, d, 'clip', { hidden: true, bullet: false });
  }
  deco(type, x, y, z, o = {}) {
    const [px, pz] = this.P(x, z);
    const out = { ...o, type, x: r3(px), y: r3(y), z: r3(pz), yaw: this.Yaw(o.yaw || 0) };
    if ((this.rot & 1) && o.w !== undefined && o.d !== undefined && type !== 'sign') { out.w = o.d; out.d = o.w; }
    this.decos.push(out);
    return this;
  }
  neon(x, y, z, w, h, d, color) {
    return this.deco('neon', x, y, z, { w, h, d, color });
  }
  sign(x, y, z, w, h, text, color, yaw = 0, o = {}) {
    return this.deco('sign', x, y, z, { w, h, text, color, yaw, ...o });
  }
  light(x, y, z, color, intensity = 1, range = 18) {
    const [px, pz] = this.P(x, z);
    this.lights.push({ x: r3(px), y, z: r3(pz), color, intensity, range });
    return this;
  }
  spawn(team, x, y, z, yaw) {
    let t = team;
    if (this.swapTeams && (t === 0 || t === 1)) t = 1 - t;
    const [px, pz] = this.P(x, z);
    this.spawns.push({ team: t, x: r3(px), y, z: r3(pz), yaw: this.Yaw(yaw) });
    return this;
  }
  /** Jump pad: launches with velocity v = [vx|null, vy, vz|null] (logical axes). */
  pad(x, y, z, w, d, v) {
    const [cx, cz] = this.P(x, z);
    let [vx, vz] = this.P(v[0] ?? 0, v[2] ?? 0);
    if (v[0] === null && v[2] === null) { vx = null; vz = null; }
    const [pw, pd] = this.rot & 1 ? [d, w] : [w, d];
    this.pads.push({ min: [cx - pw / 2, y, cz - pd / 2], max: [cx + pw / 2, y + 0.3, cz + pd / 2], v: [vx, v[1], vz] });
    this.box(x, y, z, w + 0.4, 0.12, d + 0.4, 'padbase');
    this.deco('pad', x, y + 0.12, z, { w, d });
    return this;
  }

  /** Jump pad that lands the player at (tx, ty, tz) after an arc reaching `apex` m above the pad. */
  padTo(x, y, z, w, d, tx, ty, tz, apex = 3) {
    const g = 24;
    const vy = Math.sqrt(2 * g * apex);
    const tUp = vy / g;
    const fall = Math.max(0.05, y + 0.12 + apex - ty);
    const T = tUp + Math.sqrt((2 * fall) / g);
    return this.pad(x, y, z, w, d, [(tx - x) / T, vy, (tz - z) / T]);
  }

  // ── prefabs ──
  slab(x, yTop, z, w, d, t = 0.4, mat = 'floor', o) {
    return this.box(x, yTop - t, z, w, t, d, mat, o);
  }

  /** Wall along X from x1→x2 at z, with optional openings [{at, w, y0, y1}]. */
  wallX(x1, x2, z, y, h, t = 0.5, mat = 'wall', openings = []) {
    const a = Math.min(x1, x2), b = Math.max(x1, x2);
    this._wall(a, b, openings, (s, e, y0, y1) => this.box((s + e) / 2, y + y0, z, e - s, y1 - y0, t, mat), h);
    return this;
  }
  wallZ(z1, z2, x, y, h, t = 0.5, mat = 'wall', openings = []) {
    const a = Math.min(z1, z2), b = Math.max(z1, z2);
    this._wall(a, b, openings, (s, e, y0, y1) => this.box(x, y + y0, (s + e) / 2, t, y1 - y0, e - s, mat), h);
    return this;
  }
  _wall(a, b, openings, emit, h) {
    const ops = openings.map((o) => ({ s: o.at - o.w / 2, e: o.at + o.w / 2, y0: o.y0 ?? 0, y1: o.y1 ?? 2.8 })).sort((p, q) => p.s - q.s);
    let cur = a;
    for (const o of ops) {
      const s = Math.max(a, o.s), e = Math.min(b, o.e);
      if (e <= s) continue;
      if (s > cur) emit(cur, s, 0, h);
      if (o.y0 > 0) emit(s, e, 0, o.y0);
      if (o.y1 < h) emit(s, e, o.y1, h);
      cur = e;
    }
    if (cur < b) emit(cur, b, 0, h);
  }

  /**
   * Staircase. Foot center at (x, y, z); climbs `rise` meters toward dir
   * ('+x','-x','+z','-z'). Steps are 0.3 high × 0.42 deep, filled underneath.
   */
  stairs(x, y, z, dir, width, rise, mat = 'stairs') {
    const n = Math.max(1, Math.ceil(rise / 0.3 - 1e-6));
    const sh = rise / n, sd = 0.42;
    for (let i = 0; i < n; i++) {
      const top = sh * (i + 1);
      const off = sd * i + sd / 2;
      let cx = x, cz = z, w = width, d = width;
      if (dir === '+x') { cx = x + off; w = sd; }
      else if (dir === '-x') { cx = x - off; w = sd; }
      else if (dir === '+z') { cz = z + off; d = sd; }
      else { cz = z - off; d = sd; }
      this.box(cx, y, cz, w, top, d, mat);
    }
    return n * sd;
  }

  crate(x, y, z, s = 1.2, mat = 'crate', o) {
    return this.box(x, y, z, s, s, s, mat, o);
  }

  container(x, y, z, axis = 'x', color = '#c0392b') {
    if (axis === 'x') this.box(x, y, z, 6.1, 2.6, 2.44, 'container', { color });
    else this.box(x, y, z, 2.44, 2.6, 6.1, 'container', { color });
    return this;
  }

  barrier(x, z, len, axis = 'x', y = 0, mat = 'barrier') {
    if (axis === 'x') this.box(x, y, z, len, 1.05, 0.6, mat);
    else this.box(x, y, z, 0.6, 1.05, len, mat);
    return this;
  }

  railX(x1, x2, z, y, h = 1.05) {
    const a = Math.min(x1, x2), b = Math.max(x1, x2);
    this.box((a + b) / 2, y, z, b - a, h, 0.12, 'rail', { bullet: false });
    return this;
  }
  railZ(z1, z2, x, y, h = 1.05) {
    const a = Math.min(z1, z2), b = Math.max(z1, z2);
    this.box(x, y, (a + b) / 2, 0.12, h, b - a, 'rail', { bullet: false });
    return this;
  }

  pillar(x, z, y, h, s = 0.8, mat = 'trim') {
    return this.box(x, y, z, s, h, s, mat);
  }

  /**
   * Enclosed building with door/window openings and a roof slab.
   * doors/windows: [{side:'n'|'s'|'e'|'w', at: offset from center along wall, w, y0, y1}]
   */
  building(o) {
    const { x, z, w, d } = o;
    const y = o.y ?? 0, h = o.h ?? 4.5, t = o.wallT ?? 0.5, mat = o.mat ?? 'wall';
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const ops = (side) => [...(o.doors || []), ...(o.windows || [])].filter((p) => p.side === side).map((p) => ({
      at: (side === 'n' || side === 's' ? x : z) + p.at, w: p.w ?? 2.4, y0: p.y0 ?? 0, y1: p.y1 ?? 2.9,
    }));
    this.wallX(x0, x1, z0 + t / 2, y, h, t, mat, ops('n'));
    this.wallX(x0, x1, z1 - t / 2, y, h, t, mat, ops('s'));
    this.wallZ(z0 + t, z1 - t, x0 + t / 2, y, h, t, mat, ops('w'));
    this.wallZ(z0 + t, z1 - t, x1 - t / 2, y, h, t, mat, ops('e'));
    if (o.roof !== false) {
      const rt = 0.4;
      if (o.hatch) {
        // roof with a rectangular hole (hatch) for interior stairs: {x0,z0,x1,z1}
        const hh = o.hatch;
        this.boxMM(x0, y + h, z0, x1, y + h + rt, hh.z0, o.roofMat ?? 'roof');
        this.boxMM(x0, y + h, hh.z1, x1, y + h + rt, z1, o.roofMat ?? 'roof');
        this.boxMM(x0, y + h, hh.z0, hh.x0, y + h + rt, hh.z1, o.roofMat ?? 'roof');
        this.boxMM(hh.x1, y + h, hh.z0, x1, y + h + rt, hh.z1, o.roofMat ?? 'roof');
      } else {
        this.box(x, y + h, z, w, rt, d, o.roofMat ?? 'roof');
      }
      if (o.parapet) {
        const ph = o.parapet, py = y + h + rt;
        this.box(x, py, z0 + 0.15, w, ph, 0.3, 'trim');
        this.box(x, py, z1 - 0.15, w, ph, 0.3, 'trim');
        this.box(x0 + 0.15, py, z, 0.3, ph, d - 0.6, 'trim');
        this.box(x1 - 0.15, py, z, 0.3, ph, d - 0.6, 'trim');
      }
    }
    if (o.floor !== false) this.box(x, y, z, w - 2 * t, 0.06, d - 2 * t, o.floorMat ?? 'interior', { noShadow: true });
    return this;
  }

  /** Invisible walls around the playable area. */
  bounds(minX, maxX, minZ, maxZ, h = 40, y = -5) {
    const rot = this.rot; this.rot = 0;
    const t = 2;
    this.boxMM(minX - t, y, minZ - t, maxX + t, y + h, minZ, 'clip', { hidden: true, bullet: false });
    this.boxMM(minX - t, y, maxZ, maxX + t, y + h, maxZ + t, 'clip', { hidden: true, bullet: false });
    this.boxMM(minX - t, y, minZ, minX, y + h, maxZ, 'clip', { hidden: true, bullet: false });
    this.boxMM(maxX, y, minZ, maxX + t, y + h, maxZ, 'clip', { hidden: true, bullet: false });
    this.rot = rot;
    this.playBounds = { minX, maxX, minZ, maxZ };
    return this;
  }

  build() {
    const m = this.meta;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
    for (const b of this.boxes) {
      if (b.mat === 'clip') continue;
      minX = Math.min(minX, b.min[0]); maxX = Math.max(maxX, b.max[0]);
      minZ = Math.min(minZ, b.min[2]); maxZ = Math.max(maxZ, b.max[2]);
      maxY = Math.max(maxY, b.max[1]);
    }
    return {
      id: m.id,
      name: m.name,
      desc: m.desc,
      modes: m.modes || ['tdm', 'ffa'],
      theme: m.theme,
      killY: m.killY ?? -25,
      boxes: this.boxes,
      decos: this.decos,
      spawns: this.spawns,
      pads: this.pads,
      lights: this.lights,
      extent: { minX, maxX, minZ, maxZ, maxY },
      play: this.playBounds || { minX, maxX, minZ, maxZ },
    };
  }
}

function r3(v) {
  return Math.round(v * 1000) / 1000;
}
