// Procedural decoration props used by maps and the lobby.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { textTexture, getTextureSet, radialGlowTexture } from './textures.js';

const matCache = new Map();
export function M(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}
export const std = (color, rough = 0.6, metal = 0.2, extra = {}) =>
  M(`std:${color}:${rough}:${metal}:${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
export const glow = (color, intensity = 2.5) =>
  M(`glow:${color}:${intensity}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: true }));
const glass = (color = '#9fd8ff', opacity = 0.35) =>
  M(`glass:${color}:${opacity}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.05, metalness: 0.3, transparent: true, opacity, depthWrite: false }));

const geoCache = new Map();
function G(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
const boxG = (w, h, d) => G(`b:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
const rboxG = (w, h, d, r = 0.05) => G(`rb:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r));
const cylG = (rt, rb, h, seg = 16) => G(`c:${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));

function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

function place(group, d) {
  group.position.set(d.x, d.y, d.z);
  group.rotation.y = d.yaw || 0;
  return group;
}

// ───────────── neon strips (merged) ─────────────
export function buildNeonStrip(list) {
  const group = new THREE.Group();
  const byColor = new Map();
  for (const d of list) {
    if (!byColor.has(d.color)) byColor.set(d.color, []);
    byColor.get(d.color).push(d);
  }
  for (const [color, items] of byColor) {
    const geos = items.map((d) => {
      const g = new THREE.BoxGeometry(d.w, d.h, d.d);
      g.translate(d.x, d.y + d.h / 2, d.z);
      return g;
    });
    const merged = mergeGeos(geos);
    const m = new THREE.Mesh(merged, glow(color, 3.2));
    group.add(m);
  }
  return group;
}

function mergeGeos(geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  const idx = [];
  let off = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx.push(gi[i] + off);
    off += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

// ───────────── individual decorations ─────────────
const DECOS = {
  sign(d) {
    const g = new THREE.Group();
    const tex = textTexture(d.text, d.color, d.vertical ? { vertical: true, width: 256, height: 256 * Math.max(2, Math.round(d.h / Math.max(0.4, d.w || 0.6))) } : { width: 1024, height: Math.max(128, Math.round(1024 * (d.h / Math.max(1, d.w)))) });
    const w = d.vertical ? Math.max(1.0, d.h / Math.max(2, d.text.length) * 1.1) : d.w;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(1, 1, 1).multiplyScalar(d.glow || 2), depthWrite: false, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d.h), mat);
    plane.position.z = 0.06;
    g.add(plane);
    // backing panel
    const back = mesh(boxG(w * 1.04, d.h * 1.04, 0.08), std('#0d0f16', 0.4, 0.6), 0, 0, 0, false);
    g.add(back);
    // light spill
    const glowTex = M('glowtex', () => radialGlowTexture());
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.6, d.h * 2.2), new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(d.color).multiplyScalar(0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.z = 0.1;
    g.add(halo);
    const flick = Math.random() < 0.25;
    if (flick) {
      g.userData.update = (dt) => {
        g.userData.t = (g.userData.t || 0) + dt;
        const on = Math.sin(g.userData.t * 23) > -0.95 || Math.random() > 0.3;
        mat.opacity = on ? 1 : 0.35;
      };
    }
    return place(g, d);
  },

  ceilinglight(d) {
    const g = new THREE.Group();
    g.add(mesh(boxG(d.w + 0.12, 0.06, d.d + 0.12), std('#2a2d38', 0.5, 0.6), 0, -0.03, 0, false));
    const panel = mesh(boxG(d.w, 0.02, d.d), glow('#fff2dc', 2.2), 0, -0.07, 0, false);
    g.add(panel);
    return place(g, d);
  },

  holo(d) {
    const g = new THREE.Group();
    const color = new THREE.Color(d.color || '#19e6ff');
    const beam = new THREE.Mesh(cylG(0.2, 1.4, 3.2, 24), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.35), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 1.6;
    g.add(beam);
    const tex = textTexture('SUPERSHOT', '#' + color.getHexString(), { width: 1024, height: 256 });
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(d.size || 3, (d.size || 3) * 0.25), new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(1.1, 1.1, 1.1), blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    logo.position.y = 3.0;
    g.add(logo);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.04, 8, 48), glow('#' + color.getHexString(), 3));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    g.add(ring);
    g.userData.update = (dt) => {
      logo.rotation.y += dt * 0.8;
      ring.rotation.z += dt * 0.5;
      logo.position.y = 3.0 + Math.sin(performance.now() * 0.0015) * 0.12;
    };
    return place(g, d);
  },

  tree(d, theme) {
    const g = new THREE.Group();
    const s = d.s || 1;
    const snowy = theme.preset === 'snow';
    const leafColor = theme.preset === 'night' ? '#1e6b5a' : theme.preset === 'snow' ? '#2f5d4a' : '#4c8a3a';
    g.add(mesh(boxG(0.28 * s, 1.6 * s, 0.28 * s), std('#5a3d2b', 0.9, 0), 0, 0.8 * s, 0));
    const leaves = std(leafColor, 0.85, 0, theme.preset === 'night' ? { emissive: new THREE.Color('#0b3a33'), emissiveIntensity: 0.6 } : {});
    const parts = [[0, 1.9, 0, 1.4], [0.35, 2.5, 0.2, 1.0], [-0.3, 2.35, -0.25, 0.9], [0.05, 3.0, -0.05, 0.7]];
    for (const [x, y, z, k] of parts) {
      const c = mesh(rboxG(k * s, k * s, k * s, 0.08), leaves, x * s, y * s, z * s);
      c.rotation.y = x * 2;
      g.add(c);
      if (snowy) g.add(mesh(rboxG(k * s * 1.02, 0.12 * s, k * s * 1.02, 0.04), std('#f4f8fc', 0.9, 0), x * s, (y + k / 2) * s, z * s));
    }
    return place(g, d);
  },

  car(d) {
    const g = new THREE.Group();
    const paint = std(d.color || '#ff3d6e', 0.25, 0.7);
    g.add(mesh(rboxG(2.0, 0.6, 4.3, 0.18), paint, 0, 0.62, 0));
    g.add(mesh(rboxG(1.7, 0.55, 2.2, 0.16), glass('#1a2a40', 0.85), 0, 1.15, -0.2));
    g.add(mesh(rboxG(1.95, 0.12, 1.0, 0.04), paint, 0, 0.98, 1.6));
    for (const x of [-0.65, 0.65]) {
      g.add(mesh(boxG(0.4, 0.12, 0.06), glow('#fff6d0', 3), x, 0.7, 2.16, false));
      g.add(mesh(boxG(0.45, 0.1, 0.06), glow('#ff2a3a', 3), x, 0.72, -2.16, false));
    }
    const under = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(d.color || '#ff3d6e').multiplyScalar(1.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = 0.04;
    g.add(under);
    for (const [x, z] of [[-0.85, 1.5], [0.85, 1.5], [-0.85, -1.5], [0.85, -1.5]]) g.add(mesh(cylG(0.32, 0.38, 0.22, 16), std('#22252e', 0.4, 0.8), x, 0.3, z));
    return place(g, d);
  },

  lamp(d, theme) {
    const g = new THREE.Group();
    const warm = theme.preset === 'night' ? '#9fe8ff' : '#ffe2a8';
    g.add(mesh(cylG(0.07, 0.1, 4.6, 8), std('#3a3f4c', 0.5, 0.7), 0, 2.3, 0));
    g.add(mesh(boxG(0.1, 0.1, 1.1), std('#3a3f4c', 0.5, 0.7), 0, 4.55, 0.5));
    g.add(mesh(boxG(0.3, 0.12, 0.5), std('#20232c', 0.5, 0.6), 0, 4.5, 1.0));
    g.add(mesh(boxG(0.24, 0.04, 0.42), glow(warm, 4), 0, 4.43, 1.0, false));
    const cone = new THREE.Mesh(cylG(0.12, 1.4, 4.3, 16, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(warm).multiplyScalar(0.05), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    cone.position.set(0, 2.3, 1.0);
    g.add(cone);
    return place(g, d);
  },

  pipes(d) {
    const g = new THREE.Group();
    const len = d.len || 8;
    const m1 = std('#5d6578', 0.4, 0.8), m2 = std('#8a5a3a', 0.5, 0.6);
    for (let i = 0; i < 3; i++) {
      const p = mesh(cylG(0.12 + i * 0.03, 0.12 + i * 0.03, len, 10), i % 2 ? m2 : m1, 0.25 + i * 0.12, 1.2 + i * 0.45, 0);
      p.rotation.x = Math.PI / 2;
      g.add(p);
    }
    return place(g, d);
  },

  stall(d) {
    const g = new THREE.Group();
    const col = d.color || '#ff7a1a';
    g.add(mesh(boxG(3.2, 1.0, 1.4), std('#5a4636', 0.8, 0.1), 0, 0.5, 0));
    for (const [x, z] of [[-1.5, -0.6], [1.5, -0.6], [-1.5, 0.9], [1.5, 0.9]]) g.add(mesh(cylG(0.05, 0.05, 2.6, 6), std('#2f333c', 0.5, 0.7), x, 1.3, z));
    const awn = mesh(boxG(3.6, 0.08, 2.2), std(col, 0.7, 0, { emissive: new THREE.Color(col), emissiveIntensity: 0.25 }), 0, 2.6, 0.2);
    awn.rotation.x = -0.18;
    g.add(awn);
    g.add(mesh(boxG(3.0, 0.05, 0.05), glow(col, 3), 0, 2.45, 1.25, false));
    for (let i = 0; i < 4; i++) g.add(mesh(boxG(0.4, 0.3, 0.4), std(['#e8c547', '#e05a47', '#6ac46a', '#e8e8e8'][i], 0.7, 0), -1.1 + i * 0.7, 1.15, 0));
    return place(g, d);
  },

  pad(d) {
    const g = new THREE.Group();
    const r = Math.min(d.w, d.d) / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, 0.07, 8, 40), glow('#2af0ff', 4));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03;
    g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.82, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#0aa8ff').multiplyScalar(1.2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.02;
    g.add(disc);
    const chevMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7ff8ff').multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const chevs = [];
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.RingGeometry(r * 0.5, r * 0.62, 32), chevMat.clone());
      c.rotation.x = -Math.PI / 2;
      g.add(c);
      chevs.push(c);
    }
    g.userData.update = (dt) => {
      g.userData.t = ((g.userData.t || 0) + dt) % 1.2;
      chevs.forEach((c, i) => {
        const t = (g.userData.t / 1.2 + i / 3) % 1;
        c.position.y = 0.1 + t * 2.2;
        c.scale.setScalar(1 - t * 0.5);
        c.material.opacity = (1 - t) * 0.8;
      });
      ring.material.color.setScalar(1).multiplyScalar(3 + Math.sin(performance.now() * 0.008) * 1.2).multiply(new THREE.Color('#2af0ff'));
    };
    g.position.set(d.x, d.y, d.z);
    return g;
  },

  rock(d) {
    const s = d.s || 8;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    const rnd = (i) => (Math.sin(i * 12.9898 + s * 78.233) * 43758.5453) % 1;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const k = 1 + Math.abs(rnd(i)) * 0.25;
      pos.setXYZ(i, pos.getX(i) * k, y < 0 ? y * 2.4 * k : y * 0.35, pos.getZ(i) * k);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, std('#5b5268', 0.95, 0.05, { flatShading: true }));
    m.scale.set(s * 0.55, s * 0.5, s * 0.55);
    m.position.set(d.x, d.y - 0.1, d.z);
    m.castShadow = false;
    return m;
  },

  ship(d) {
    const g = new THREE.Group();
    const hull = std('#d9dee6', 0.35, 0.5), dark = std('#2b3142', 0.4, 0.6), acc = std(d.color || '#19e6ff', 0.3, 0.4, { emissive: new THREE.Color(d.color || '#19e6ff'), emissiveIntensity: 0.4 });
    g.add(mesh(rboxG(2.6, 1.6, 6.5, 0.4), hull, 0, 1.6, 0));
    const nose = mesh(new THREE.ConeGeometry(1.1, 2.2, 6), hull, 0, 1.7, 4.2);
    nose.rotation.x = Math.PI / 2;
    g.add(nose);
    g.add(mesh(rboxG(2.0, 0.6, 1.6, 0.2), glass('#132033', 0.9), 0, 2.35, 2.4));
    g.add(mesh(boxG(7.5, 0.18, 2.2), hull, 0, 1.5, -0.8));
    for (const x of [-3.4, 3.4]) {
      g.add(mesh(cylG(0.45, 0.55, 2.4, 12), dark, x, 1.5, -1.2).rotateX(Math.PI / 2));
      g.add(mesh(cylG(0.38, 0.38, 0.1, 12), glow(d.color || '#19e6ff', 4), x, 1.5, -2.45, false).rotateX(Math.PI / 2));
    }
    g.add(mesh(boxG(0.1, 0.25, 5.5), acc, 1.31, 1.6, 0));
    g.add(mesh(boxG(0.1, 0.25, 5.5), acc, -1.31, 1.6, 0));
    for (const [x, z] of [[-1, 2], [1, 2], [-1, -2], [1, -2]]) g.add(mesh(cylG(0.08, 0.12, 1.1, 6), dark, x, 0.55, z));
    return place(g, d);
  },

  antenna(d) {
    const g = new THREE.Group();
    const h = d.h || 8;
    const m = std('#8a93a6', 0.4, 0.8);
    g.add(mesh(cylG(0.06, 0.12, h, 6), m, 0, h / 2, 0));
    for (let i = 1; i < 4; i++) g.add(mesh(boxG(1.4 - i * 0.3, 0.05, 0.05), m, 0, h * (i / 4), 0));
    const bulb = mesh(new THREE.SphereGeometry(0.12, 8, 8), glow('#ff2a3a', 4), 0, h + 0.1, 0, false);
    g.add(bulb);
    g.userData.update = () => { bulb.visible = Math.floor(performance.now() / 700) % 2 === 0; };
    return place(g, d);
  },

  well(d) {
    const g = new THREE.Group();
    g.add(mesh(cylG(1.1, 1.15, 1.0, 16), std('#a8977c', 0.95, 0), 0, 0.5, 0));
    g.add(mesh(cylG(0.85, 0.85, 1.02, 16), std('#2a2520', 1, 0), 0, 0.52, 0));
    for (const x of [-0.95, 0.95]) g.add(mesh(boxG(0.12, 2.0, 0.12), std('#7b5b3a', 0.9, 0), x, 1.0, 0));
    const roof = mesh(boxG(2.4, 0.1, 1.4), std('#8a6a45', 0.9, 0), 0, 2.05, 0);
    g.add(roof);
    return place(g, d);
  },

  tent(d) {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-2.5, 0); shape.lineTo(0, 2.4); shape.lineTo(2.5, 0); shape.lineTo(-2.5, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false });
    geo.translate(0, 0, -2);
    g.add(mesh(geo, std(d.color || '#7d8f4a', 0.95, 0)));
    g.add(mesh(boxG(1.4, 1.8, 0.05), std('#1f241a', 1, 0), 0, 0.9, 2.01));
    return place(g, d);
  },

  truck(d) {
    const g = new THREE.Group();
    const paint = std(d.color || '#9a5a3a', 0.55, 0.3);
    g.add(mesh(rboxG(2.3, 1.6, 1.9, 0.12), paint, 0, 1.45, 1.7));
    g.add(mesh(rboxG(2.0, 0.6, 1.2, 0.1), glass('#1d2633', 0.85), 0, 2.0, 2.0));
    g.add(mesh(boxG(2.4, 0.3, 3.6), std('#4a3a2c', 0.8, 0.3), 0, 0.85, -0.9));
    g.add(mesh(boxG(2.4, 0.8, 0.12), paint, 0, 1.4, -2.65));
    for (const x of [-1.2, 1.2]) g.add(mesh(boxG(0.12, 0.8, 3.6), paint, x, 1.4, -0.9));
    for (const [x, z] of [[-1.15, 1.8], [1.15, 1.8], [-1.15, -1.6], [1.15, -1.6]]) {
      g.add(mesh(cylG(0.5, 0.5, 0.4, 14), std('#1b1b1e', 0.9, 0.1), x, 0.5, z).rotateZ(Math.PI / 2));
    }
    return place(g, d);
  },

  cactus(d) {
    const g = new THREE.Group();
    const m = std('#4f8a3a', 0.8, 0);
    g.add(mesh(cylG(0.28, 0.32, 2.6, 8), m, 0, 1.3, 0));
    g.add(mesh(cylG(0.18, 0.18, 0.9, 8), m, 0.5, 1.6, 0).rotateZ(-Math.PI / 2.3));
    g.add(mesh(cylG(0.16, 0.16, 0.8, 8), m, 0.78, 2.05, 0));
    g.add(mesh(cylG(0.16, 0.16, 0.7, 8), m, -0.45, 1.2, 0).rotateZ(Math.PI / 2.4));
    g.add(mesh(cylG(0.14, 0.14, 0.7, 8), m, -0.7, 1.6, 0));
    return place(g, d);
  },

  palm(d) {
    const g = new THREE.Group();
    const trunk = std('#8a6a45', 0.9, 0);
    let x = 0, y = 0;
    for (let i = 0; i < 7; i++) {
      const s = mesh(cylG(0.18 - i * 0.012, 0.22 - i * 0.012, 0.85, 7), trunk, x, y + 0.42, 0);
      s.rotation.z = -i * 0.05;
      g.add(s);
      x += Math.sin(i * 0.05) * 0.85; y += 0.83;
    }
    const leaf = std('#3f8a3c', 0.8, 0, { side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const l = mesh(boxG(0.5, 0.05, 2.6), leaf, x, y, 0);
      l.rotation.y = (i / 7) * Math.PI * 2;
      l.rotation.x = 0.45;
      l.translateZ(1.1);
      g.add(l);
    }
    return place(g, d);
  },

  roofCanvas(d) {
    const g = new THREE.Group();
    const cloth = std(d.color || '#c96b3a', 0.95, 0, { side: THREE.DoubleSide });
    const roof = mesh(boxG(d.w || 6, 0.08, d.d || 6), cloth, 0, 0, 0);
    roof.rotation.z = 0.06;
    g.add(roof);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(cylG(0.06, 0.06, 2.8, 6), std('#7b5b3a', 0.9, 0), x * ((d.w || 6) / 2 - 0.2), -1.4, z * ((d.d || 6) / 2 - 0.2)));
    return place(g, d);
  },

  cryotank(d) {
    const g = new THREE.Group();
    const col = d.color || '#7fe7ff';
    g.add(mesh(cylG(1.1, 1.1, 1.3, 24), glass('#bff2ff', 0.28), 0, 0.68, 0, false));
    const core = mesh(cylG(0.85, 0.85, 1.2, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6), transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.68, 0, false);
    g.add(core);
    for (const y of [0.02, 1.34]) g.add(mesh(cylG(1.2, 1.2, 0.12, 24), std('#8fa0b4', 0.3, 0.9), 0, y, 0));
    g.userData.update = () => { core.material.opacity = 0.5 + Math.sin(performance.now() * 0.003) * 0.15; };
    return place(g, d);
  },

  servers(d) {
    const g = new THREE.Group();
    const leds = [];
    for (let i = 0; i < 10; i++) {
      const led = mesh(boxG(0.04, 0.05, 0.05), glow(i % 3 ? '#3dff9a' : '#19e6ff', 4), -0.62, 0.3 + (i % 5) * 0.32, -0.9 + Math.floor(i / 5) * 1.8, false);
      g.add(led);
      leds.push(led);
    }
    g.userData.update = () => {
      const t = performance.now();
      leds.forEach((l, i) => { l.visible = Math.sin(t * 0.004 * (1 + i * 0.37) + i) > -0.3; });
    };
    return place(g, d);
  },

  radar(d) {
    const g = new THREE.Group();
    const head = new THREE.Group();
    head.position.y = 3.5;
    const dish = mesh(new THREE.SphereGeometry(1.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3.2), std('#dfe5ec', 0.4, 0.5, { side: THREE.DoubleSide }), 0, 0.9, 0);
    dish.rotation.x = -Math.PI / 2.4;
    head.add(dish);
    head.add(mesh(cylG(0.15, 0.2, 1.2, 8), std('#8a93a6', 0.4, 0.8), 0, 0.5, 0));
    g.add(head);
    g.userData.update = (dt) => { head.rotation.y += dt * 0.4; };
    return place(g, d);
  },

  fueltank(d) {
    const g = new THREE.Group();
    g.add(mesh(cylG(1.25, 1.25, 3.0, 20), std('#d7dde5', 0.35, 0.6), 0, 1.5, 0));
    g.add(mesh(new THREE.SphereGeometry(1.25, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#d7dde5', 0.35, 0.6), 0, 3.0, 0));
    g.add(mesh(cylG(1.27, 1.27, 0.25, 20), std('#ffb321', 0.5, 0.3), 0, 2.2, 0));
    g.add(mesh(cylG(1.27, 1.27, 0.25, 20), std('#ffb321', 0.5, 0.3), 0, 0.8, 0));
    return place(g, d);
  },

  snowcat(d) {
    const g = new THREE.Group();
    const paint = std(d.color || '#ff5a3a', 0.4, 0.3);
    g.add(mesh(rboxG(2.2, 1.0, 3.8, 0.15), paint, 0, 1.0, 0));
    g.add(mesh(rboxG(1.9, 0.9, 1.8, 0.12), glass('#1d2633', 0.85), 0, 1.9, 0.5));
    g.add(mesh(rboxG(2.0, 0.15, 1.9, 0.05), paint, 0, 2.4, 0.5));
    for (const x of [-1.15, 1.15]) g.add(mesh(rboxG(0.5, 0.75, 4.2, 0.2), std('#1b1d22', 0.9, 0.2), x, 0.38, 0));
    for (const x of [-0.6, 0.6]) g.add(mesh(boxG(0.35, 0.18, 0.05), glow('#fff3d0', 3), x, 1.1, 1.92, false));
    return place(g, d);
  },

  reactor(d) {
    const g = new THREE.Group();
    const col = new THREE.Color(d.color || '#9b5bff');
    const core = mesh(new THREE.IcosahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.5) }), 0, 2.6, 0, false);
    g.add(core);
    const shell = mesh(new THREE.IcosahedronGeometry(1.3, 1), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.2), wireframe: true, transparent: true, opacity: 0.5 }), 0, 2.6, 0, false);
    g.add(shell);
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.8 + i * 0.25, 0.04, 8, 64), glow('#' + col.getHexString(), 3));
      r.position.y = 2.6;
      g.add(r);
      rings.push(r);
    }
    const beam = mesh(cylG(0.25, 0.25, 30, 12, 1), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.5), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 15, 0, false);
    g.add(beam);
    g.userData.update = (dt) => {
      core.rotation.y += dt * 1.2; core.rotation.x += dt * 0.7;
      shell.rotation.y -= dt * 0.4;
      rings.forEach((r, i) => { r.rotation.x = performance.now() * 0.0006 * (i + 1); r.rotation.y = performance.now() * 0.0004 * (2 - i); });
    };
    return place(g, d);
  },
};

export function buildDeco(d, theme, q) {
  const fn = DECOS[d.type];
  if (!fn) return null;
  const obj = fn(d, theme, q);
  if (q && q.shadows === 0) obj.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return obj;
}

export { getTextureSet };
