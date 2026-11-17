// Procedural, tileable PBR-ish textures generated on canvas at load time.
// Each generator returns color (neutral-ish, tinted by material color),
// a height field (→ normal map), optional roughness and emissive maps.
import * as THREE from 'three';
import { mulberry32 } from '../../../shared/rng.js';

// ───────────── tileable value noise ─────────────
function makeNoise(seed, period) {
  const rng = mulberry32(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const ix0 = ((x0 % period) + period) % period, iy0 = ((y0 % period) + period) % period;
    const ix1 = (ix0 + 1) % period, iy1 = (iy0 + 1) % period;
    const a = g[iy0 * period + ix0], b = g[iy0 * period + ix1], c = g[iy1 * period + ix0], d = g[iy1 * period + ix1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function fbmFactory(seed, basePeriod, octaves = 4) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(makeNoise(seed + o * 101, basePeriod << o));
  return (u, v) => {
    // u, v in [0,1)
    let sum = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const p = basePeriod << o;
      sum += layers[o](u * p, v * p) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

class Tex {
  constructor(size) {
    this.S = size;
    this.color = new Float32Array(size * size * 3).fill(0.8);
    this.height = new Float32Array(size * size).fill(0.5);
    this.rough = null;
    this.emissive = null;
  }
  idx(x, y) { const S = this.S; return (((y % S) + S) % S) * S + (((x % S) + S) % S); }
  set(x, y, r, g, b) { const i = this.idx(x, y) * 3; this.color[i] = r; this.color[i + 1] = g; this.color[i + 2] = b; }
  mul(x, y, f) { const i = this.idx(x, y) * 3; this.color[i] *= f; this.color[i + 1] *= f; this.color[i + 2] *= f; }
  h(x, y) { return this.height[this.idx(x, y)]; }
  setH(x, y, v) { this.height[this.idx(x, y)] = v; }
  ensureRough(v = 1) { if (!this.rough) this.rough = new Float32Array(this.S * this.S).fill(v); return this.rough; }
  ensureEmissive() { if (!this.emissive) this.emissive = new Float32Array(this.S * this.S * 3); return this.emissive; }
  /** Fill rect (wraps) with callback(x, y, lx, ly) */
  rect(x0, y0, w, h, fn) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) fn(x, y, x - x0, y - y0);
  }
}

// ───────────── generators ─────────────
const GEN = {
  concrete(t, rng) {
    const S = t.S, n = fbmFactory(11, 4, 5), n2 = fbmFactory(23, 16, 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const a = n(u, v), b = n2(u, v);
      const c = 0.72 + (a - 0.5) * 0.35 + (b - 0.5) * 0.15;
      t.set(x, y, c, c, c * 0.98);
      t.setH(x, y, a * 0.6 + b * 0.4);
    }
    // form-work seams
    for (let k = 0; k < 2; k++) {
      const yy = Math.floor((k + 0.5) * S / 2);
      for (let x = 0; x < S; x++) { t.mul(x, yy, 0.82); t.setH(x, yy, 0.2); }
    }
    pits(t, rng, 220, 0.75);
  },
  asphalt(t, rng) {
    const S = t.S, n = fbmFactory(31, 8, 5), puddle = fbmFactory(37, 2, 3);
    const R = t.ensureRough();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const a = n(u, v);
      const speck = rng() < 0.08 ? 0.18 : 0;
      const p = puddle(u, v);
      const wet = Math.max(0, Math.min(1, (p - 0.55) * 6));
      const c = (0.55 + (a - 0.5) * 0.5 + speck) * (1 - wet * 0.35);
      t.set(x, y, c, c, c * 1.02);
      t.setH(x, y, a * (1 - wet) + 0.4 * wet);
      R[y * S + x] = 1 - wet * 0.75;
    }
    cracks(t, rng, 3, 0.8);
  },
  tiles(t, rng) {
    const S = t.S, n = fbmFactory(41, 8, 3), N = 4, g = Math.max(2, S / 128);
    for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
      const shade = 0.8 + (rng() - 0.5) * 0.18;
      const ts = S / N;
      t.rect(tx * ts, ty * ts, ts, ts, (x, y, lx, ly) => {
        const grout = lx < g || ly < g;
        const a = n(x / S, y / S);
        const c = grout ? 0.42 : shade + (a - 0.5) * 0.1;
        t.set(x, y, c, c, c);
        const edge = Math.min(lx, ly, ts - lx, ts - ly);
        t.setH(x, y, grout ? 0.1 : Math.min(1, 0.6 + edge / (ts * 0.5) * 0.1));
      });
    }
  },
  brick(t, rng) {
    const S = t.S, n = fbmFactory(51, 8, 4), rows = 8, cols = 4, m = Math.max(2, S / 160);
    const bh = S / rows, bw = S / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw / 2;
      for (let c = -1; c < cols; c++) {
        const shade = 0.78 + (rng() - 0.5) * 0.3;
        const hue = (rng() - 0.5) * 0.08;
        t.rect(Math.floor(c * bw + off), Math.floor(r * bh), Math.ceil(bw), Math.ceil(bh), (x, y, lx, ly) => {
          const mortar = lx < m || ly < m;
          const a = n(x / S, y / S);
          if (mortar) { t.set(x, y, 0.85, 0.83, 0.8); t.setH(x, y, 0.15); return; }
          const v = shade + (a - 0.5) * 0.22;
          t.set(x, y, v * (1 + hue), v, v * (1 - hue));
          const edge = Math.min(lx - m, ly - m, bw - lx, bh - ly);
          t.setH(x, y, 0.55 + Math.min(edge, 4) * 0.06 + (a - 0.5) * 0.2);
        });
      }
    }
  },
  panels(t, rng) {
    const S = t.S, n = fbmFactory(61, 4, 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const a = n(x / S, y / S);
      const c = 0.8 + (a - 0.5) * 0.12;
      t.set(x, y, c, c, c);
      t.setH(x, y, 0.6);
    }
    // large panel grid with recessed seams + inset sub-panels
    const N = 2, ps = S / N, seam = Math.max(2, S / 170);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const x0 = px * ps, y0 = py * ps;
      t.rect(x0, y0, ps, ps, (x, y, lx, ly) => {
        if (lx < seam || ly < seam) { t.mul(x, y, 0.55); t.setH(x, y, 0.1); }
      });
      if (rng() < 0.7) {
        const ix = x0 + ps * 0.18, iy = y0 + ps * 0.2, iw = ps * 0.64, ih = ps * (0.25 + rng() * 0.35);
        t.rect(Math.floor(ix), Math.floor(iy), Math.floor(iw), Math.floor(ih), (x, y, lx, ly) => {
          const edge = Math.min(lx, ly, iw - lx, ih - ly);
          if (edge < 2) { t.mul(x, y, 0.75); t.setH(x, y, 0.35); } else { t.mul(x, y, 0.93); t.setH(x, y, 0.48); }
        });
      }
      // bolts in corners
      for (const [bx, by] of [[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92]]) {
        circle(t, x0 + ps * bx, y0 + ps * by, S / 110, (x, y, d) => { t.mul(x, y, 0.85 + d * 0.2); t.setH(x, y, 0.75 + (1 - d) * 0.15); });
      }
      // vent slots
      if (rng() < 0.4) {
        for (let k = 0; k < 5; k++) {
          const vy = y0 + ps * (0.66 + k * 0.05);
          t.rect(Math.floor(x0 + ps * 0.3), Math.floor(vy), Math.floor(ps * 0.4), Math.max(2, Math.floor(S / 200)), (x, y) => { t.mul(x, y, 0.4); t.setH(x, y, 0.15); });
        }
      }
    }
    scratches(t, rng, 30);
  },
  metal(t, rng) {
    const S = t.S, n = fbmFactory(71, 4, 3), streak = makeNoise(73, 256);
    const R = t.ensureRough();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const s = streak(u * 256, v * 3) * 0.5 + streak(u * 256 + 50, v * 9) * 0.5;
      const a = n(u, v);
      const c = 0.78 + (s - 0.5) * 0.12 + (a - 0.5) * 0.12;
      t.set(x, y, c, c, c * 1.01);
      t.setH(x, y, 0.5 + (s - 0.5) * 0.06);
      R[y * S + x] = 0.75 + (a - 0.5) * 0.5;
    }
    scratches(t, rng, 60);
  },
  metalgrid(t) {
    const S = t.S, N = 8, cs = S / N, bar = cs * 0.22;
    const n = fbmFactory(81, 4, 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const lx = x % cs, ly = y % cs;
      const onBar = lx < bar || ly < bar;
      const a = n(x / S, y / S);
      const c = onBar ? 0.82 + (a - 0.5) * 0.15 : 0.18;
      t.set(x, y, c, c, c);
      t.setH(x, y, onBar ? 0.8 : 0.0);
    }
  },
  crate(t, rng) {
    const S = t.S, grain = fbmFactory(91, 2, 5);
    const planks = 5, ph = S / planks, frame = S * 0.09;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const p = Math.floor(y / ph);
      const g = grain((x / S) * 0.5, (y / S) * 6 + p * 0.37);
      let c = 0.72 + (g - 0.5) * 0.45 + ((p * 37) % 7) / 70;
      let h = 0.5 + (g - 0.5) * 0.15;
      if (y % ph < 2) { c *= 0.55; h = 0.1; }
      const fr = x < frame || x > S - frame || y < frame || y > S - frame;
      if (fr) { c = 0.6 + (g - 0.5) * 0.3; h = 0.9; }
      t.set(x, y, c, c * 0.92, c * 0.82);
      t.setH(x, y, h);
    }
    // diagonal brace
    for (let i = 0; i < S; i++) {
      for (let w = -frame / 2; w < frame / 2; w++) {
        const x = Math.floor(i + w), y = i;
        if (x > frame && x < S - frame && y > frame && y < S - frame) { t.set(x, y, 0.62, 0.56, 0.48); t.setH(x, y, 0.85); }
      }
    }
    void rng;
  },
  container(t, rng) {
    const S = t.S, n = fbmFactory(101, 4, 4), rust = fbmFactory(103, 4, 4);
    const ribs = 16;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S;
      const ph = (u * ribs) % 1;
      const rib = ph < 0.5 ? Math.sin(ph * Math.PI * 2) : 0;
      const a = n(u, y / S), r = rust(u, y / S);
      const rs = Math.max(0, (r - 0.62) * 4);
      const c = 0.85 + (a - 0.5) * 0.1 - rib * 0.08;
      t.set(x, y, c - rs * 0.3, c - rs * 0.45, c - rs * 0.6);
      t.setH(x, y, 0.4 + rib * 0.5);
    }
    // top/bottom rails
    const rail = S * 0.05;
    for (let y = 0; y < S; y++) if (y < rail || y > S - rail) for (let x = 0; x < S; x++) { t.mul(x, y, 0.8); t.setH(x, y, 0.95); }
    void rng;
  },
  windows(t, rng, opts) {
    const S = t.S, cols = 6, rows = 8;
    const E = t.ensureEmissive();
    const R = t.ensureRough();
    const lit = (opts && opts.lit) || ['#ffd36b'];
    const litC = lit.map((h) => new THREE.Color(h));
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { t.set(x, y, 0.55, 0.56, 0.6); t.setH(x, y, 0.7); R[y * S + x] = 0.7; }
    const cw = S / cols, ch = S / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const on = rng() < 0.38;
      const col = litC[Math.floor(rng() * litC.length)];
      const bright = 0.6 + rng() * 0.8;
      t.rect(Math.floor(c * cw + cw * 0.14), Math.floor(r * ch + ch * 0.18), Math.floor(cw * 0.72), Math.floor(ch * 0.62), (x, y, lx, ly) => {
        const i = t.idx(x, y);
        t.set(x, y, 0.12, 0.13, 0.17);
        t.height[i] = 0.3;
        R[i] = 0.12;
        if (on) {
          const f = bright * (0.75 + 0.25 * Math.sin(ly * 0.3));
          E[i * 3] = col.r * f; E[i * 3 + 1] = col.g * f; E[i * 3 + 2] = col.b * f;
        }
        void lx;
      });
    }
  },
  deck(t, rng) {
    const S = t.S, n = fbmFactory(111, 4, 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const a = n(x / S, y / S);
      const c = 0.8 + (a - 0.5) * 0.14;
      t.set(x, y, c, c, c);
      t.setH(x, y, 0.55);
    }
    const N = 4, ps = S / N;
    for (let k = 0; k < N; k++) for (let x = 0; x < S; x++) {
      for (let w = 0; w < 2; w++) { t.mul(x, Math.floor(k * ps) + w, 0.6); t.setH(x, Math.floor(k * ps) + w, 0.1); }
    }
    for (let k = 0; k < 2; k++) for (let y = 0; y < S; y++) {
      for (let w = 0; w < 2; w++) { t.mul(Math.floor(k * S / 2) + w, y, 0.6); t.setH(Math.floor(k * S / 2) + w, y, 0.1); }
    }
    // tread pattern dots
    for (let y = 8; y < S; y += 16) for (let x = 8; x < S; x += 16) {
      circle(t, x + ((y / 16) % 2) * 8, y, S / 180, (xx, yy) => { t.setH(xx, yy, 0.7); t.mul(xx, yy, 1.04); });
    }
    scratches(t, rng, 25);
  },
  sand(t) {
    const S = t.S, n = fbmFactory(121, 4, 5), rip = makeNoise(127, 32);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const a = n(u, v);
      const r = Math.sin((v * 24 + rip(u * 32, v * 32) * 2.5) * Math.PI * 2) * 0.5 + 0.5;
      const c = 0.84 + (a - 0.5) * 0.18 + (r - 0.5) * 0.05;
      t.set(x, y, c, c * 0.97, c * 0.9);
      t.setH(x, y, a * 0.5 + r * 0.35);
    }
  },
  stucco(t, rng) {
    const S = t.S, n = fbmFactory(131, 8, 5), n2 = fbmFactory(137, 2, 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const a = n(u, v), b = n2(u, v);
      const c = 0.82 + (a - 0.5) * 0.18 + (b - 0.5) * 0.12;
      t.set(x, y, c, c * 0.98, c * 0.94);
      t.setH(x, y, a);
    }
    cracks(t, rng, 4);
  },
  wood(t) {
    const S = t.S, grain = fbmFactory(141, 2, 5);
    const planks = 6, pw = S / planks;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const p = Math.floor(x / pw);
      const g = grain(((x % pw) / S) * 6 + p * 0.3, (y / S) * 0.5 + p * 0.17);
      const ring = Math.sin(g * 40) * 0.5 + 0.5;
      let c = 0.7 + (g - 0.5) * 0.3 + ring * 0.06 + ((p * 13) % 5) / 40;
      let h = 0.5 + ring * 0.1;
      if (x % pw < 2) { c *= 0.5; h = 0.1; }
      t.set(x, y, c, c * 0.86, c * 0.7);
      t.setH(x, y, h);
    }
  },
  sandbag(t) {
    const S = t.S, n = fbmFactory(151, 8, 4), rows = 4, cols = 3, bh = S / rows, bw = S / cols;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = Math.floor(y / bh);
      const off = (r % 2) * bw / 2;
      const lx = (x + off) % bw, ly = y % bh;
      const dx = (lx / bw - 0.5) * 2, dy = (ly / bh - 0.5) * 2;
      const bulge = Math.max(0, 1 - Math.pow(Math.abs(dx), 4) - Math.pow(Math.abs(dy), 2.2));
      const a = n(x / S, y / S);
      const c = (0.6 + bulge * 0.3 + (a - 0.5) * 0.15);
      t.set(x, y, c, c * 0.95, c * 0.82);
      t.setH(x, y, bulge * 0.9 + (a - 0.5) * 0.1);
    }
  },
  rock(t, rng) {
    const S = t.S, n = fbmFactory(161, 4, 6), n2 = fbmFactory(167, 16, 3), warp = makeNoise(163, 8);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const a = n(u, v), b = n2(u, v);
      // gently warped horizontal strata
      const band = v * 7 + (warp(u * 8, v * 8) - 0.5) * 0.35;
      const f = band - Math.floor(band);
      const ledge = f < 0.08 ? 1 - f / 0.08 : 0;
      const layer = ((Math.floor(band) * 37) % 5) / 5;
      const c = 0.7 + (a - 0.5) * 0.3 + (b - 0.5) * 0.12 + layer * 0.1 - ledge * 0.18;
      t.set(x, y, c, c * 0.93, c * 0.84);
      t.setH(x, y, a * 0.55 + b * 0.2 + (1 - ledge) * 0.25);
    }
    cracks(t, rng, 6, 0.75);
  },
  snow(t, rng) {
    const S = t.S, n = fbmFactory(171, 4, 5);
    const R = t.ensureRough();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const a = n(x / S, y / S);
      const sp = rng() < 0.01 ? 0.15 : 0;
      const c = 0.92 + (a - 0.5) * 0.12 + sp;
      t.set(x, y, c, c, Math.min(1.05, c * 1.03));
      t.setH(x, y, a);
      R[y * S + x] = sp ? 0.3 : 0.95;
    }
  },
  ice(t, rng) {
    const S = t.S, n = fbmFactory(181, 4, 5);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const a = n(x / S, y / S);
      const c = 0.85 + (a - 0.5) * 0.2;
      t.set(x, y, c * 0.9, c, Math.min(1.1, c * 1.08));
      t.setH(x, y, 0.5 + (a - 0.5) * 0.2);
    }
    cracks(t, rng, 10, 1.15);
  },
  hexfloor(t) {
    const S = t.S, n = fbmFactory(191, 4, 3);
    const E = t.ensureEmissive();
    const R = t.ensureRough();
    const N = 4, ts = S / N, bev = Math.max(3, S / 90);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const lx = x % ts, ly = y % ts;
      const a = n(x / S, y / S);
      const edge = Math.min(lx, ly, ts - 1 - lx, ts - 1 - ly);
      const seam = edge < 1.5;
      const inner = Math.abs(edge - ts * 0.18) < 1.2;
      const c = seam ? 0.22 : 0.62 + (a - 0.5) * 0.1 - (edge < bev ? 0.12 : 0);
      t.set(x, y, c, c, c * 1.05);
      t.setH(x, y, seam ? 0.05 : edge < bev ? 0.3 + edge / bev * 0.3 : 0.6);
      R[y * S + x] = seam ? 0.7 : 0.25 + a * 0.15;
      const tile = Math.floor(x / ts) + Math.floor(y / ts) * 7;
      if (inner && tile % 3 === 0) { const i = (y * S + x) * 3; E[i] = 0.45; E[i + 1] = 0.2; E[i + 2] = 0.9; }
    }
  },
  lobbyfloor(t) {
    const S = t.S, n = fbmFactory(201, 4, 4);
    const E = t.ensureEmissive();
    const R = t.ensureRough();
    const N = 4, ts = S / N;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const lx = x % ts, ly = y % ts;
      const a = n(x / S, y / S);
      const seam = lx < 2 || ly < 2;
      const c = seam ? 0.25 : 0.5 + (a - 0.5) * 0.08;
      t.set(x, y, c, c, c * 1.04);
      t.setH(x, y, seam ? 0.1 : 0.6);
      R[y * S + x] = seam ? 0.6 : 0.18 + a * 0.1;
      if (seam && (Math.floor(x / ts) + Math.floor(y / ts)) % 3 === 0) { const i = (y * S + x) * 3; E[i] = 0.1; E[i + 1] = 0.9; E[i + 2] = 1.0; }
    }
  },
};

function circle(t, cx, cy, rad, fn) {
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
    const d = Math.hypot(x - cx, y - cy) / rad;
    if (d <= 1) fn(x, y, d);
  }
}

function pits(t, rng, count, depth) {
  for (let i = 0; i < count; i++) {
    const x = rng() * t.S, y = rng() * t.S, r = 1 + rng() * 2.5;
    circle(t, x, y, r, (xx, yy) => { t.mul(xx, yy, depth + rng() * 0.2); t.setH(xx, yy, 0.15); });
  }
}

function scratches(t, rng, count) {
  for (let i = 0; i < count; i++) {
    let x = rng() * t.S, y = rng() * t.S;
    const a = rng() * Math.PI * 2, len = 10 + rng() * t.S * 0.15;
    for (let s = 0; s < len; s++) {
      x += Math.cos(a); y += Math.sin(a);
      t.mul(Math.floor(x), Math.floor(y), 1.12);
    }
  }
}

function cracks(t, rng, count, bright = 0.6) {
  for (let i = 0; i < count; i++) {
    let x = rng() * t.S, y = rng() * t.S;
    let a = rng() * Math.PI * 2;
    const len = t.S * (0.1 + rng() * 0.25);
    for (let s = 0; s < len; s++) {
      a += (rng() - 0.5) * 0.6;
      x += Math.cos(a); y += Math.sin(a);
      t.mul(Math.floor(x), Math.floor(y), bright);
      t.setH(Math.floor(x), Math.floor(y), 0.05);
    }
  }
}

// ───────────── baking to THREE textures ─────────────
const cache = new Map();

function toCanvas(S, fill) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  fill(img.data);
  ctx.putImageData(img, 0, 0);
  return c;
}

function makeTexture(canvas, srgb, aniso) {
  const tx = new THREE.CanvasTexture(canvas);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tx.anisotropy = aniso;
  tx.generateMipmaps = true;
  tx.minFilter = THREE.LinearMipmapLinearFilter;
  tx.needsUpdate = true;
  return tx;
}

/**
 * Returns { map, normalMap, roughnessMap?, emissiveMap? } for texture type `type`.
 */
export function getTextureSet(type, { size = 512, anisotropy = 8, opts } = {}) {
  const key = `${type}:${size}:${opts ? JSON.stringify(opts) : ''}`;
  if (cache.has(key)) return cache.get(key);
  const gen = GEN[type] || GEN.concrete;
  const t = new Tex(size);
  const rng = mulberry32(size * 7 + type.length * 131 + type.charCodeAt(0));
  gen(t, rng, opts);
  const S = size;
  const map = makeTexture(toCanvas(S, (d) => {
    for (let i = 0, j = 0; i < S * S; i++, j += 3) {
      d[i * 4] = Math.min(255, t.color[j] * 255);
      d[i * 4 + 1] = Math.min(255, t.color[j + 1] * 255);
      d[i * 4 + 2] = Math.min(255, t.color[j + 2] * 255);
      d[i * 4 + 3] = 255;
    }
  }), true, anisotropy);
  const strength = 2.2;
  const normalMap = makeTexture(toCanvas(S, (d) => {
    const H = t.height;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const l = H[y * S + ((x - 1 + S) % S)], r = H[y * S + ((x + 1) % S)];
      const u = H[((y - 1 + S) % S) * S + x], dn = H[((y + 1) % S) * S + x];
      let nx = (l - r) * strength, ny = (dn - u) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * S + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }), false, anisotropy);
  const set = { map, normalMap };
  if (t.rough) {
    set.roughnessMap = makeTexture(toCanvas(S, (d) => {
      for (let i = 0; i < S * S; i++) { const v = Math.max(0, Math.min(255, t.rough[i] * 255)); d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    }), false, anisotropy);
  }
  if (t.emissive) {
    set.emissiveMap = makeTexture(toCanvas(S, (d) => {
      for (let i = 0, j = 0; i < S * S; i++, j += 3) {
        d[i * 4] = Math.min(255, t.emissive[j] * 255); d[i * 4 + 1] = Math.min(255, t.emissive[j + 1] * 255); d[i * 4 + 2] = Math.min(255, t.emissive[j + 2] * 255); d[i * 4 + 3] = 255;
      }
    }), true, anisotropy);
  }
  cache.set(key, set);
  return set;
}

/** Meters covered by one texture repeat, per type. */
export const TEX_SCALE = {
  concrete: 4, asphalt: 6, tiles: 3, brick: 3, panels: 4, metal: 3, metalgrid: 2, crate: 1.2, container: 2.6,
  windows: 8, deck: 4, sand: 6, stucco: 4, wood: 2.5, sandbag: 1.6, rock: 6, snow: 6, ice: 3, hexfloor: 4, lobbyfloor: 4,
};

// ───────────── misc canvas textures ─────────────
export function textTexture(text, color, opts = {}) {
  const w = opts.width || 1024, h = opts.height || 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const font = opts.font || '"Exo 2", "Chakra Petch", sans-serif';
  let size = opts.vertical ? w * 0.8 : h * 0.7;
  ctx.font = `italic 900 ${size}px ${font}`;
  const chars = opts.vertical ? text.split('') : [text];
  if (!opts.vertical) {
    while (ctx.measureText(text).width > w * 0.92 && size > 8) { size *= 0.92; ctx.font = `italic 900 ${size}px ${font}`; }
  } else {
    size = Math.min(w * 0.85, (h / chars.length) * 0.92);
    ctx.font = `italic 900 ${size}px ${font}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.25;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.08;
  if (opts.vertical) {
    chars.forEach((ch, i) => {
      const y = (i + 0.5) * (h / chars.length);
      ctx.strokeText(ch, w / 2, y);
      ctx.fillText(ch, w / 2, y);
    });
  } else {
    ctx.strokeText(text, w / 2, h / 2);
    ctx.fillText(text, w / 2, h / 2);
  }
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  return tx;
}

export function radialGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.55)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
