// Navigation grid auto-generated from map collision boxes. Supports multi-level
// geometry, stairs, jump-up / drop-down edges and jump pad trajectories.

import { CollisionWorld, stepMovement } from '../shared/physics.js';
import { PLAYER } from '../shared/config.js';

const CELL = 1.0;
const R = 0.38;

export class NavGrid {
  constructor(map, world = new CollisionWorld(map.boxes)) {
    this.map = map;
    this.world = world;
    const b = map.play;
    this.minX = b.minX; this.minZ = b.minZ;
    this.cols = Math.ceil((b.maxX - b.minX) / CELL);
    this.rows = Math.ceil((b.maxZ - b.minZ) / CELL);
    this.nodes = [];
    this.columns = new Array(this.cols * this.rows);
    this._build();
  }

  _colIndex(ix, iz) {
    if (ix < 0 || iz < 0 || ix >= this.cols || iz >= this.rows) return -1;
    return iz * this.cols + ix;
  }

  _build() {
    const w = this.world;
    const top = this.map.extent.maxY + 3;
    for (let iz = 0; iz < this.rows; iz++) {
      for (let ix = 0; ix < this.cols; ix++) {
        const x = this.minX + (ix + 0.5) * CELL + 0.013, z = this.minZ + (iz + 0.5) * CELL + 0.017;
        const col = [];
        let y = top;
        for (let k = 0; k < 8 && y > this.map.killY; k++) {
          const hit = w.raycast(x, y, z, 0, -1, 0, y - this.map.killY);
          if (!hit) break;
          if (hit.t === 0) { y = hit.box.minY - 0.02; continue; }
          const sy = y - hit.t;
          if (hit.ny === 1 && !w.overlaps(x - R, sy + 0.3, z - R, x + R, sy + PLAYER.height, z + R)) {
            const node = { id: this.nodes.length, x, y: sy, z, ix, iz, edges: [] };
            this.nodes.push(node);
            col.push(node.id);
          }
          y = sy - 0.02;
        }
        this.columns[iz * this.cols + ix] = col;
      }
    }
    // edges
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const n of this.nodes) {
      for (const [dx, dz] of dirs) {
        const ci = this._colIndex(n.ix + dx, n.iz + dz);
        if (ci < 0) continue;
        for (const mid of this.columns[ci]) {
          const m = this.nodes[mid];
          const dy = m.y - n.y;
          if (dy > 1.2 || dy < -9) continue;
          if (dx !== 0 && dz !== 0) {
            // no corner cutting: both orthogonal neighbours must be similar-height nodes
            if (!this._hasNear(n.ix + dx, n.iz, n.y, m.y) || !this._hasNear(n.ix, n.iz + dz, n.y, m.y)) continue;
          }
          const dist = Math.hypot(m.x - n.x, dy, m.z - n.z);
          const type = this._edgeType(n, m, dy);
          if (!type) continue;
          n.edges.push({ to: m.id, cost: dist + (type === 'jump' ? 1.2 : type === 'drop' ? 0.4 : 0), type });
        }
      }
    }
    this._padEdges();
  }

  _hasNear(ix, iz, y1, y2) {
    const ci = this._colIndex(ix, iz);
    if (ci < 0) return false;
    const lo = Math.min(y1, y2) - 0.7, hi = Math.max(y1, y2) + 0.7;
    return this.columns[ci].some((id) => this.nodes[id].y >= lo && this.nodes[id].y <= hi);
  }

  _edgeType(n, m, dy) {
    const w = this.world;
    const mx = (n.x + m.x) / 2, mz = (n.z + m.z) / 2;
    const hi = Math.max(n.y, m.y);
    if (Math.abs(dy) <= 1.2) {
      // sample ground along the segment to detect stairs vs. walls
      let prev = n.y, ok = true;
      for (const t of [0.25, 0.5, 0.75]) {
        const sx = n.x + (m.x - n.x) * t, sz = n.z + (m.z - n.z) * t;
        const g = w.groundHeight(sx, sz, hi + 0.7, 3);
        if (g === null || Math.abs(g - prev) > 0.58) { ok = false; break; }
        prev = g;
      }
      if (ok && Math.abs(m.y - prev) <= 0.58 && !w.overlaps(mx - R + 0.04, hi + 0.32, mz - R + 0.04, mx + R - 0.04, hi + PLAYER.height - 0.05, mz + R - 0.04)) return 'walk';
      if (dy > 0.58 && dy <= 1.15) {
        if (!w.overlaps(n.x - R, n.y + 0.05, n.z - R, n.x + R, n.y + PLAYER.height + dy + 0.1, n.z + R) &&
            !w.overlaps(mx - R + 0.04, hi + 0.06, mz - R + 0.04, mx + R - 0.04, hi + PLAYER.height, mz + R - 0.04)) return 'jump';
      }
    }
    if (dy < -0.58) {
      // walking off a ledge: the space at the higher level between nodes must be free,
      // and the fall column above the landing node must be clear all the way down
      if (!w.overlaps(mx - R + 0.04, n.y + 0.06, mz - R + 0.04, mx + R - 0.04, n.y + PLAYER.height, mz + R - 0.04) &&
          !w.overlaps(m.x - R + 0.04, m.y + 0.06, m.z - R + 0.04, m.x + R - 0.04, n.y + PLAYER.height, m.z + R - 0.04)) return 'drop';
    }
    return null;
  }

  _padEdges() {
    const map = this.map;
    for (const pad of map.pads) {
      const cx = (pad.min[0] + pad.max[0]) / 2, cz = (pad.min[2] + pad.max[2]) / 2;
      const p = { x: cx, y: pad.max[1] - 0.18, z: cz, vx: 0, vy: 0, vz: 0, yaw: 0, onGround: true, crouched: false, sliding: false, sprinting: false, slideT: 0, slideCd: 0, padCd: 0, jumpBuf: 0, jumpHeld: false, crouchHeld: false };
      const ev = {};
      let launched = false, land = null;
      for (let i = 0; i < 60 * 5; i++) {
        stepMovement(p, { mx: 0, mz: 0, buttons: 0 }, this.world, map, 1 / 60, { moveMul: 1, adsT: 0 }, ev);
        if (ev.padLaunch) launched = true;
        if (launched && p.onGround && i > 10) { land = { x: p.x, y: p.y, z: p.z }; break; }
        if (ev.fell) break;
      }
      if (!land) continue;
      const target = this.nearest(land.x, land.y, land.z);
      if (!target) continue;
      for (const n of this.nodes) {
        if (n.x >= pad.min[0] - 0.3 && n.x <= pad.max[0] + 0.3 && n.z >= pad.min[2] - 0.3 && n.z <= pad.max[2] + 0.3 && Math.abs(n.y - pad.max[1]) < 0.6) {
          n.edges.push({ to: target.id, cost: Math.hypot(target.x - n.x, target.z - n.z) * 0.6 + 1, type: 'pad' });
          n.pad = true;
        }
      }
    }
  }

  /** Nearest node to a world position (prefers the surface the position stands on). */
  nearest(x, y, z, maxRing = 4) {
    const ix = Math.floor((x - this.minX) / CELL), iz = Math.floor((z - this.minZ) / CELL);
    let best = null, bestD = Infinity;
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const ci = this._colIndex(ix + dx, iz + dz);
          if (ci < 0) continue;
          for (const id of this.columns[ci]) {
            const n = this.nodes[id];
            const vy = n.y - y;
            if (vy > 0.9) continue;
            const d = (n.x - x) ** 2 + (n.z - z) ** 2 + vy * vy * 4;
            if (d < bestD) { bestD = d; best = n; }
          }
        }
      }
      if (best && ring >= 1) break;
    }
    return best;
  }

  /** A* search. Returns array of nodes (excluding start) or null. */
  path(fromNode, toNode, maxExpand = 12000) {
    if (!fromNode || !toNode) return null;
    if (fromNode === toNode) return [toNode];
    const N = this.nodes.length;
    if (!this._g || this._g.length !== N) {
      this._g = new Float64Array(N);
      this._came = new Int32Array(N);
      this._seen = new Uint32Array(N);
      this._closed = new Uint32Array(N);
      this._gen = 0;
    }
    const g = this._g, came = this._came, seen = this._seen, closed = this._closed;
    const gen = ++this._gen;
    const heap = new MinHeap();
    const h = (n) => Math.hypot(n.x - toNode.x, n.y - toNode.y, n.z - toNode.z);
    seen[fromNode.id] = gen; g[fromNode.id] = 0; came[fromNode.id] = -1;
    heap.push(fromNode.id, h(fromNode));
    let expanded = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === toNode.id) break;
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (++expanded > maxExpand) return null;
      const node = this.nodes[cur];
      for (const e of node.edges) {
        const ng = g[cur] + e.cost;
        if (seen[e.to] !== gen || ng < g[e.to]) {
          seen[e.to] = gen; g[e.to] = ng; came[e.to] = cur;
          heap.push(e.to, ng + h(this.nodes[e.to]));
        }
      }
    }
    if (seen[toNode.id] !== gen) return null;
    const out = [];
    let c = toNode.id;
    while (c !== -1 && c !== fromNode.id) { out.push(this.nodes[c]); c = came[c]; }
    out.reverse();
    return out;
  }

  edgeType(a, b) {
    const e = a.edges.find((x) => x.to === b.id);
    return e ? e.type : null;
  }

  randomNode(rng = Math.random) {
    for (let i = 0; i < 30; i++) {
      const n = this.nodes[Math.floor(rng() * this.nodes.length)];
      if (n && n.edges.length >= 3) return n;
    }
    return this.nodes[Math.floor(rng() * this.nodes.length)];
  }
}

class MinHeap {
  constructor() { this.ids = []; this.pri = []; }
  get size() { return this.ids.length; }
  push(id, p) {
    const ids = this.ids, pri = this.pri;
    let i = ids.length;
    ids.push(id); pri.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pri[parent] <= p) break;
      ids[i] = ids[parent]; pri[i] = pri[parent];
      i = parent;
    }
    ids[i] = id; pri[i] = p;
  }
  pop() {
    const ids = this.ids, pri = this.pri;
    const top = ids[0];
    const lastId = ids.pop(), lastP = pri.pop();
    if (ids.length) {
      let i = 0;
      const n = ids.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && pri[c + 1] < pri[c]) c++;
        if (pri[c] >= lastP) break;
        ids[i] = ids[c]; pri[i] = pri[c];
        i = c;
      }
      ids[i] = lastId; pri[i] = lastP;
    }
    return top;
  }
}

const navCache = new Map();
export function getNav(map) {
  let nav = navCache.get(map.id);
  if (!nav) { nav = new NavGrid(map); navCache.set(map.id, nav); }
  return nav;
}
