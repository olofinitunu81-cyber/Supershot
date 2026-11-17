// Builds the static map scene: merged per-material geometry with world-space
// UVs and baked per-vertex ambient occlusion, plus decorations and lights.
import * as THREE from 'three';
import { MaterialLibrary, createSky, createEnvMap, createLights } from './environment.js';
import { buildDeco, buildNeonStrip } from './decos.js';
import { createWeather } from './weather.js';

const AO_DIRS = (() => {
  // cosine-weighted hemisphere directions in tangent space (z = normal)
  const out = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = i * 2.399963 + 0.3;
    const r = Math.sqrt((i + 0.5) / N);
    out.push([Math.cos(a) * r, Math.sin(a) * r, Math.sqrt(1 - r * r)]);
  }
  return out;
})();

class PointOccupancy {
  constructor(world) {
    this.w = world;
  }
  inside(x, y, z) {
    const w = this.w;
    const c = Math.floor((x - w.ox) / w.cell), r = Math.floor((z - w.oz) / w.cell);
    if (c < 0 || r < 0 || c >= w.cols || r >= w.rows) return false;
    const list = w.grid[r * w.cols + c];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.aoSkip) continue;
      if (x > b.minX && x < b.maxX && y > b.minY && y < b.maxY && z > b.minZ && z < b.maxZ) return true;
    }
    return false;
  }
}

function computeAO(occ, px, py, pz, n, t1, t2) {
  let o = 0, tot = 0;
  for (const d of AO_DIRS) {
    const dx = t1[0] * d[0] + t2[0] * d[1] + n[0] * d[2];
    const dy = t1[1] * d[0] + t2[1] * d[1] + n[1] * d[2];
    const dz = t1[2] * d[0] + t2[2] * d[1] + n[2] * d[2];
    for (const [dist, w] of [[0.32, 1], [1.0, 0.6]]) {
      tot += w;
      if (occ.inside(px + n[0] * 0.04 + dx * dist, py + n[1] * 0.04 + dy * dist, pz + n[2] * 0.04 + dz * dist)) o += w;
    }
  }
  const v = 1 - (o / tot) * 1.05;
  return Math.max(0.46, Math.min(1, v));
}

const FACES = [
  // axis, sign, u-axis, v-axis
  { n: [1, 0, 0], u: 2, v: 1, uSign: -1 },
  { n: [-1, 0, 0], u: 2, v: 1, uSign: 1 },
  { n: [0, 1, 0], u: 0, v: 2, uSign: 1 },
  { n: [0, -1, 0], u: 0, v: 2, uSign: 1 },
  { n: [0, 0, 1], u: 0, v: 1, uSign: 1 },
  { n: [0, 0, -1], u: 0, v: 1, uSign: -1 },
];

class GeoAccum {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.count = 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Emits a subdivided, AO-baked box into accumulators. */
function emitBox(acc, b, opts) {
  const { occ, texScale, tint, play, aoBake } = opts;
  const min = b.min, max = b.max;
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const inPlay = !(max[0] < play.minX - 2 || min[0] > play.maxX + 2 || max[2] < play.minZ - 2 || min[2] > play.maxZ + 2);
  const spacing = inPlay ? 1.5 : 6;
  for (const f of FACES) {
    const axis = f.n[0] ? 0 : f.n[1] ? 1 : 2;
    const sgn = f.n[axis];
    if (axis === 1 && sgn < 0 && min[1] <= 0.02) continue; // resting on the ground
    if (axis === 1 && sgn < 0 && min[1] < -0.5) continue;
    const plane = sgn > 0 ? max[axis] : min[axis];
    const ua = f.u, va = f.v;
    const su = size[ua], sv = size[va];
    const nu = Math.max(1, Math.min(48, Math.ceil(su / spacing)));
    const nv = Math.max(1, Math.min(48, Math.ceil(sv / spacing)));
    const base = acc.count;
    const t1 = [0, 0, 0], t2 = [0, 0, 0];
    t1[ua] = 1; t2[va] = 1;
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const p = [0, 0, 0];
        p[axis] = plane;
        p[ua] = min[ua] + (su * i) / nu;
        p[va] = min[va] + (sv * j) / nv;
        acc.pos.push(p[0], p[1], p[2]);
        acc.nor.push(f.n[0], f.n[1], f.n[2]);
        // world-space UVs (consistent texel density across boxes)
        const uu = (f.uSign * p[ua]) / texScale, vv = p[va] / texScale;
        acc.uv.push(axis === 1 ? p[0] / texScale : uu, axis === 1 ? p[2] / texScale : vv);
        const ao = aoBake && inPlay ? computeAO(occ, p[0], p[1], p[2], f.n, t1, t2) : (axis === 1 && sgn < 0 ? 0.6 : 1);
        acc.col.push(tint.r * ao, tint.g * ao, tint.b * ao);
        acc.count++;
      }
    }
    // winding: ensure front faces point along the normal
    const cross = (() => {
      const a = [0, 0, 0], c = [0, 0, 0];
      a[ua] = 1; c[va] = 1;
      return [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
    })();
    const flip = cross[0] * f.n[0] + cross[1] * f.n[1] + cross[2] * f.n[2] < 0;
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i, bb = a + 1, c = a + (nu + 1), d = c + 1;
        if (!flip) acc.idx.push(a, bb, d, a, d, c);
        else acc.idx.push(a, d, bb, a, c, d);
      }
    }
  }
}

export function buildMapScene(map, world, engine, q) {
  const theme = map.theme;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.fog.color);
  scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far * (q.shadows === 0 ? 0.85 : 1));
  const sky = createSky(theme);
  scene.add(sky);
  scene.environment = createEnvMap(engine.renderer, theme);
  scene.environmentIntensity = 0.8;
  const lib = new MaterialLibrary(theme, q, engine.maxAniso);
  const lights = createLights(scene, theme, map.play || map.extent, q);

  // mark boxes excluded from AO (invisible boundaries)
  for (const b of world.boxes) b.aoSkip = b.mat === 'clip' && !b.bullet;
  const occ = new PointOccupancy(world);
  const accs = new Map();
  const t0 = performance.now();
  for (const b of map.boxes) {
    if (b.hidden || b.mat === 'clip') continue;
    const key = b.mat;
    let acc = accs.get(key);
    if (!acc) { acc = new GeoAccum(); accs.set(key, acc); }
    const tint = b.color ? new THREE.Color(b.color) : new THREE.Color(1, 1, 1);
    if (b.color) {
      // material color multiplies; normalize so the tint reads as the actual color
      const mc = new THREE.Color(lib.def(b.mat).color || '#ffffff');
      tint.r /= Math.max(0.2, mc.r); tint.g /= Math.max(0.2, mc.g); tint.b /= Math.max(0.2, mc.b);
    }
    emitBox(acc, b, { occ, texScale: lib.texScale(b.mat), tint, play: map.play, aoBake: q.aoBake });
  }
  const statics = new THREE.Group();
  statics.name = 'statics';
  for (const [key, acc] of accs) {
    const mesh = new THREE.Mesh(acc.build(), lib.get(key));
    mesh.castShadow = q.shadows > 0 && key !== 'floor';
    mesh.receiveShadow = q.shadows > 0;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    statics.add(mesh);
  }
  scene.add(statics);
  const aoMs = performance.now() - t0;

  // decorations
  const decoGroup = new THREE.Group();
  const animated = [];
  const neonStrips = map.decos.filter((d) => d.type === 'neon');
  if (neonStrips.length) decoGroup.add(buildNeonStrip(neonStrips));
  for (const d of map.decos) {
    if (d.type === 'neon') continue;
    const obj = buildDeco(d, theme, q);
    if (!obj) continue;
    decoGroup.add(obj);
    if (obj.userData.update) animated.push(obj);
  }
  scene.add(decoGroup);

  // point lights (limited by quality)
  const pls = [...map.lights].sort((a, b) => b.intensity - a.intensity).slice(0, q.maxLights);
  for (const l of pls) {
    const pl = new THREE.PointLight(l.color, l.intensity * 14, l.range * 1.4, 2);
    pl.position.set(l.x, l.y, l.z);
    scene.add(pl);
  }

  // weather
  const weather = createWeather(theme, q);
  if (weather) { scene.add(weather); animated.push(weather); }

  sky.userData.update && animated.push(sky);
  return {
    scene, lib, lights, animated, stats: { aoMs, meshes: statics.children.length },
    update(dt, camera) {
      for (const o of animated) o.userData.update(dt, camera);
    },
    dispose() {
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      lib.dispose();
      if (scene.environment) scene.environment.dispose();
    },
  };
}
