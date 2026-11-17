// Procedural 3D models for all 20 guns and 10 melee weapons, plus weapon camos.
// Convention: weapon points down -Z, origin at the main grip, +Y up, meters.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getItem } from '../../../shared/items.js';
import { mulberry32 } from '../../../shared/rng.js';

// ───────────── materials ─────────────
const mats = new Map();
function mat(key, make) { if (!mats.has(key)) mats.set(key, make()); return mats.get(key); }
const polymer = (c = '#23262e') => mat('poly' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.15 }));
const metal = (c = '#4a505c') => mat('metal' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.85 }));
const accent = (c) => mat('acc' + c, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(0.8), roughness: 0.4, metalness: 0.3, emissive: new THREE.Color(c), emissiveIntensity: 0.12 }));
const glowM = (c, k = 3) => mat('glow' + c + k, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) }));
const lens = (c = '#ff3355') => mat('lens' + c, () => new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.05, metalness: 0.9, emissive: new THREE.Color(c), emissiveIntensity: 0.8 }));
const wood = (c = '#6b4a2f') => mat('wood' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.05 }));
const steel = () => mat('steel', () => new THREE.MeshStandardMaterial({ color: '#c9d2dc', roughness: 0.18, metalness: 1 }));
const leather = () => mat('leather', () => new THREE.MeshStandardMaterial({ color: '#2a211c', roughness: 0.85, metalness: 0 }));

// ───────────── geometry helpers ─────────────
const geos = new Map();
function geo(key, make) { if (!geos.has(key)) geos.set(key, make()); return geos.get(key); }

function part(parent, g, m, x = 0, y = 0, z = 0, opts = {}) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  if (opts.rx) mesh.rotation.x = opts.rx;
  if (opts.ry) mesh.rotation.y = opts.ry;
  if (opts.rz) mesh.rotation.z = opts.rz;
  if (opts.camo) mesh.userData.camo = true;
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
const B = (w, h, d, r = 0) => geo(`B${w}:${h}:${d}:${r}`, () => (r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d)));
const C = (rt, rb, l, seg = 14) => geo(`C${rt}:${rb}:${l}:${seg}`, () => { const g = new THREE.CylinderGeometry(rt, rb, l, seg); g.rotateX(Math.PI / 2); return g; });
const CY = (r, h, seg = 14) => geo(`CY${r}:${h}:${seg}`, () => new THREE.CylinderGeometry(r, r, h, seg));
const T = (r, tube, seg = 24, arc = Math.PI * 2) => geo(`T${r}:${tube}:${seg}:${arc}`, () => new THREE.TorusGeometry(r, tube, 8, seg, arc));

function box(parent, w, h, d, m, x, y, z, o) { return part(parent, B(w, h, d, o && o.r !== undefined ? o.r : Math.min(w, h, d) * 0.18), m, x, y, z, o); }
function tube(parent, r, len, m, x, y, z, o = {}) { return part(parent, C(o.r2 ?? r, r, len, o.seg || 14), m, x, y, z, o); }

function extrude(shape, depth, bevel = 0.004) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// common sub-assemblies
function redDot(g, y, z, lensColor = '#ff2a55') {
  // hollow reflex sight: mount + open frame + tinted glass + glowing dot
  const fm = metal('#262a33');
  box(g, 0.026, 0.012, 0.05, fm, 0, y - 0.024, z);
  box(g, 0.038, 0.006, 0.034, fm, 0, y + 0.016, z, { r: 0.002 });
  box(g, 0.006, 0.034, 0.034, fm, -0.016, y, z, { r: 0.002 });
  box(g, 0.006, 0.034, 0.034, fm, 0.016, y, z, { r: 0.002 });
  box(g, 0.038, 0.005, 0.034, fm, 0, y - 0.016, z, { r: 0.002 });
  part(g, B(0.026, 0.028, 0.002, 0), mat('reflexglass' + lensColor, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(lensColor).multiplyScalar(0.25), transparent: true, opacity: 0.18, depthWrite: false })), 0, y, z - 0.012);
  part(g, geo('reddotdot', () => new THREE.CircleGeometry(0.0016, 12).rotateY(Math.PI)), glowM(lensColor, 6), 0, y, z - 0.013);
  return y;
}
function holoSight(g, y, z, c = '#2af0ff') {
  box(g, 0.05, 0.012, 0.07, metal('#2b2f38'), 0, y - 0.016, z);
  box(g, 0.006, 0.05, 0.07, metal('#2b2f38'), -0.024, y + 0.006, z);
  box(g, 0.006, 0.05, 0.07, metal('#2b2f38'), 0.024, y + 0.006, z);
  box(g, 0.054, 0.006, 0.07, metal('#2b2f38'), 0, y + 0.03, z);
  part(g, B(0.04, 0.04, 0.002, 0), mat('hologlass', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(0.25), transparent: true, opacity: 0.25, depthWrite: false })), 0, y + 0.006, z - 0.02);
  part(g, B(0.004, 0.004, 0.002, 0), glowM(c, 6), 0, y + 0.006, z - 0.019);
  return y + 0.006;
}
function scope(g, y, z, len = 0.26, r = 0.024, c = '#3a7bff') {
  tube(g, r, len, metal('#1d2027'), 0, y, z);
  tube(g, r * 1.35, 0.06, metal('#1d2027'), 0, y, z - len / 2 + 0.02, { r2: r * 1.05 });
  tube(g, r * 1.25, 0.05, metal('#1d2027'), 0, y, z + len / 2 - 0.02, { r2: r * 1.05 });
  part(g, C(r * 1.2, r * 1.2, 0.004), lens(c), 0, y, z - len / 2 - 0.004);
  part(g, C(r, r, 0.004), lens('#88aaff'), 0, y, z + len / 2 + 0.002);
  box(g, 0.018, 0.03, 0.02, metal('#2b2f38'), 0, y - r - 0.012, z - len * 0.25);
  box(g, 0.018, 0.03, 0.02, metal('#2b2f38'), 0, y - r - 0.012, z + len * 0.25);
  return y;
}
function grip(g, m, x = 0, y = -0.06, z = 0.03, ang = 0.25) {
  return box(g, 0.032, 0.11, 0.045, m, x, y, z, { rx: ang });
}
function curvedMag(g, m, y, z, n = 3, len = 0.06) {
  const mg = new THREE.Group();
  mg.position.set(0, y, z);
  for (let i = 0; i < n; i++) {
    const seg = box(mg, 0.028, len, 0.06, m, 0, -i * len * 0.92, i * 0.012);
    seg.rotation.x = -0.12 * i;
  }
  g.add(mg);
  return mg;
}
function straightMag(g, m, y, z, h = 0.14, w = 0.026, d = 0.055, rx = 0.05) {
  const mg = new THREE.Group();
  mg.position.set(0, y, z);
  box(mg, w, h, d, m, 0, -h / 2, 0, { rx });
  box(mg, w + 0.004, 0.012, d + 0.006, metal('#2f333c'), 0, -h + 0.004, Math.sin(rx) * h * 0.5);
  g.add(mg);
  return mg;
}
function muzzle(g, z, y = 0) {
  const m = new THREE.Object3D();
  m.position.set(0, y, z);
  m.name = 'muzzle';
  g.add(m);
  return m;
}
function stockSolid(g, m, z, y = -0.01, len = 0.2) {
  box(g, 0.04, 0.085, len, m, 0, y, z + len / 2, { camo: true });
  box(g, 0.045, 0.1, 0.02, polymer('#15171c'), 0, y - 0.005, z + len);
}
function stockSkeleton(g, m, z, y = 0, len = 0.2) {
  box(g, 0.012, 0.012, len, m, 0, y + 0.03, z + len / 2);
  box(g, 0.012, 0.012, len * 0.9, m, 0, y - 0.04, z + len * 0.45, { rx: -0.1 });
  box(g, 0.035, 0.1, 0.018, polymer('#15171c'), 0, y - 0.005, z + len);
}

function finish(g, info) {
  g.userData = { ...g.userData, ...info };
  g.userData.muzzle = g.getObjectByName('muzzle');
  return g;
}

// ───────────── GUN BUILDERS ─────────────
const GUNS = {
  vx9(acc = '#19e6ff') {
    const g = new THREE.Group(); const body = polymer('#262a33');
    box(g, 0.06, 0.09, 0.4, body, 0, 0.02, -0.08, { camo: true });
    box(g, 0.058, 0.07, 0.28, polymer('#1c1f26'), 0, 0.025, -0.4, { camo: true });
    for (let i = 0; i < 4; i++) box(g, 0.062, 0.012, 0.03, metal(), 0, 0.03, -0.32 - i * 0.05);
    tube(g, 0.011, 0.24, metal('#2c3038'), 0, 0.035, -0.62);
    tube(g, 0.016, 0.05, metal('#1a1d23'), 0, 0.035, -0.75);
    box(g, 0.064, 0.008, 0.3, accent(acc), 0, 0.068, -0.15);
    box(g, 0.02, 0.012, 0.44, metal('#1c1f26'), 0, 0.072, -0.2);
    grip(g, body);
    const mag = curvedMag(g, polymer('#1a1c22'), -0.02, -0.12);
    stockSolid(g, body, 0.11);
    const sy = redDot(g, 0.1, -0.06, '#ff2a55');
    muzzle(g, -0.78, 0.035);
    return finish(g, { mag, sightY: sy, sightZ: -0.06, leftHand: new THREE.Vector3(0, -0.01, -0.36), hold: 'rifle', len: 0.9 });
  },
  ar77(acc = '#ff8a2a') {
    const g = new THREE.Group(); const body = polymer('#30302c');
    box(g, 0.075, 0.11, 0.46, body, 0, 0.02, -0.08, { camo: true });
    box(g, 0.07, 0.085, 0.3, polymer('#22231f'), 0, 0.025, -0.45, { camo: true });
    tube(g, 0.015, 0.22, metal('#2c3038'), 0, 0.035, -0.69);
    box(g, 0.05, 0.05, 0.08, metal('#1d2027'), 0, 0.035, -0.82);
    for (const x of [-0.026, 0.026]) box(g, 0.006, 0.02, 0.05, metal('#111'), x, 0.04, -0.82);
    box(g, 0.078, 0.01, 0.38, accent(acc), 0, -0.035, -0.1);
    grip(g, body, 0, -0.07, 0.04, 0.3);
    const mag = straightMag(g, polymer('#1a1b18'), -0.03, -0.14, 0.16, 0.034, 0.07, 0.03);
    stockSolid(g, body, 0.13, 0, 0.22);
    box(g, 0.022, 0.012, 0.42, metal('#1c1f26'), 0, 0.08, -0.22);
    const sy = holoSight(g, 0.115, -0.05, '#ffb35a');
    muzzle(g, -0.87, 0.035);
    return finish(g, { mag, sightY: sy, sightZ: -0.05, leftHand: new THREE.Vector3(0, -0.015, -0.4), hold: 'rifle', len: 1.0 });
  },
  k3(acc = '#9fe8ff') {
    const g = new THREE.Group(); const body = polymer('#d9dde4');
    box(g, 0.07, 0.11, 0.62, body, 0, 0.03, -0.12, { camo: true, r: 0.02 });
    box(g, 0.072, 0.03, 0.62, polymer('#2a2e37'), 0, -0.035, -0.12);
    box(g, 0.074, 0.01, 0.5, accent(acc), 0, 0.05, -0.15);
    tube(g, 0.012, 0.14, metal('#2c3038'), 0, 0.04, -0.49);
    tube(g, 0.02, 0.05, metal('#1a1d23'), 0, 0.04, -0.57);
    grip(g, polymer('#2a2e37'), 0, -0.07, -0.02, 0.2);
    box(g, 0.028, 0.025, 0.12, polymer('#2a2e37'), 0, -0.065, -0.1);
    const mag = straightMag(g, polymer('#2a2e37'), -0.03, 0.1, 0.12, 0.026, 0.05, -0.15);
    // integrated carry-handle optic
    box(g, 0.03, 0.04, 0.2, polymer('#2a2e37'), 0, 0.105, -0.1);
    part(g, B(0.022, 0.022, 0.004, 0), lens('#33ccff'), 0, 0.11, -0.2);
    part(g, B(0.003, 0.003, 0.002, 0), glowM('#33ccff', 6), 0, 0.11, -0.19);
    muzzle(g, -0.6, 0.04);
    return finish(g, { mag, sightY: 0.11, sightZ: -0.1, leftHand: new THREE.Vector3(0, -0.02, -0.32), hold: 'rifle', len: 0.75 });
  },
  tempest(acc = '#ffe23d') {
    const g = new THREE.Group(); const body = polymer('#1b1d24');
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.05); shape.lineTo(0.62, -0.05); shape.lineTo(0.66, 0.0); shape.lineTo(0.6, 0.055); shape.lineTo(0.08, 0.065); shape.lineTo(0, 0.03); shape.lineTo(0, -0.05);
    const shroud = part(g, geo('tempestShroud', () => { const e = extrude(shape, 0.07, 0.006); e.rotateY(Math.PI / 2); return e; }), body, 0, 0.02, 0.15, { camo: true });
    void shroud;
    box(g, 0.074, 0.008, 0.5, accent(acc), 0, 0.05, -0.22);
    for (let i = 0; i < 3; i++) part(g, B(0.075, 0.006, 0.012, 0), glowM(acc, 2.5), 0, 0.0, -0.3 - i * 0.06);
    tube(g, 0.01, 0.12, metal('#2c3038'), 0, 0.02, -0.58);
    box(g, 0.03, 0.035, 0.05, metal('#1d2027'), 0, 0.02, -0.65);
    grip(g, body, 0, -0.07, 0.05, 0.3);
    box(g, 0.026, 0.07, 0.03, polymer('#2b2e36'), 0, -0.07, -0.33);
    const mag = curvedMag(g, polymer('#2b2e36'), -0.03, -0.1, 3, 0.055);
    stockSkeleton(g, metal('#2b2e36'), 0.15, 0.0, 0.2);
    const sy = redDot(g, 0.1, -0.05, '#ffe23d');
    muzzle(g, -0.68, 0.02);
    return finish(g, { mag, sightY: sy, sightZ: -0.05, leftHand: new THREE.Vector3(0, -0.06, -0.33), hold: 'rifle', len: 0.9 });
  },
  helix(acc = '#c36bff') {
    const g = new THREE.Group(); const body = polymer('#eef0f5');
    box(g, 0.07, 0.1, 0.45, body, 0, 0.02, -0.08, { camo: true, r: 0.03 });
    box(g, 0.05, 0.06, 0.32, polymer('#2a2c35'), 0, 0.02, -0.44);
    for (let i = 0; i < 5; i++) {
      const ring = part(g, T(0.038, 0.007, 20), glowM(acc, 3), 0, 0.02, -0.33 - i * 0.055);
      void ring;
    }
    tube(g, 0.008, 0.36, glowM(acc, 5), 0, 0.02, -0.44);
    box(g, 0.072, 0.012, 0.3, accent(acc), 0, 0.075, -0.1);
    grip(g, polymer('#2a2c35'), 0, -0.065, 0.02, 0.25);
    const mag = new THREE.Group(); mag.position.set(0, -0.03, -0.13);
    box(mag, 0.04, 0.09, 0.07, polymer('#2a2c35'), 0, -0.045, 0);
    part(mag, B(0.042, 0.05, 0.03, 0.005), glowM(acc, 2.5), 0, -0.05, -0.02);
    g.add(mag);
    stockSolid(g, body, 0.14, 0.01, 0.17);
    const sy = holoSight(g, 0.115, -0.04, acc);
    muzzle(g, -0.62, 0.02);
    return finish(g, { mag, sightY: sy, sightZ: -0.04, leftHand: new THREE.Vector3(0, -0.02, -0.36), hold: 'rifle', len: 0.85, energy: true });
  },
  wasp(acc = '#ffcf3d') {
    const g = new THREE.Group(); const body = polymer('#2a2d35');
    box(g, 0.06, 0.08, 0.32, body, 0, 0.02, -0.08, { camo: true });
    tube(g, 0.012, 0.12, metal('#2c3038'), 0, 0.03, -0.29);
    tube(g, 0.018, 0.04, metal('#1a1d23'), 0, 0.03, -0.36);
    box(g, 0.062, 0.008, 0.26, accent(acc), 0, 0.06, -0.06);
    grip(g, body, 0, -0.06, 0.02, 0.2);
    const mag = straightMag(g, polymer('#1a1c22'), -0.02, -0.12, 0.17, 0.024, 0.045, 0.02);
    box(g, 0.01, 0.01, 0.2, metal('#3a3e47'), 0.018, 0.0, 0.17);
    box(g, 0.01, 0.01, 0.2, metal('#3a3e47'), -0.018, 0.0, 0.17);
    box(g, 0.05, 0.07, 0.015, polymer('#15171c'), 0, -0.01, 0.27);
    const sy = redDot(g, 0.085, -0.04, '#ff2a55');
    muzzle(g, -0.38, 0.03);
    return finish(g, { mag, sightY: sy, sightZ: -0.04, leftHand: new THREE.Vector3(0, -0.07, -0.13), hold: 'smg', len: 0.6 });
  },
  phantom(acc = '#2af0ff') {
    const g = new THREE.Group(); const body = polymer('#14161b');
    box(g, 0.062, 0.085, 0.3, body, 0, 0.02, -0.06, { camo: true, r: 0.015 });
    tube(g, 0.028, 0.32, polymer('#0f1014'), 0, 0.02, -0.37, { seg: 18 });
    for (let i = 0; i < 4; i++) part(g, T(0.029, 0.003, 18), glowM(acc, 2.5), 0, 0.02, -0.26 - i * 0.07);
    box(g, 0.064, 0.006, 0.24, accent(acc), 0, 0.064, -0.05);
    grip(g, body, 0, -0.06, 0.03, 0.25);
    const mag = straightMag(g, polymer('#1a1c22'), -0.02, -0.08, 0.15, 0.026, 0.05, 0.12);
    box(g, 0.04, 0.06, 0.12, body, 0, 0.0, 0.14);
    const sy = holoSight(g, 0.1, -0.03, acc);
    muzzle(g, -0.54, 0.02);
    return finish(g, { mag, sightY: sy, sightZ: -0.03, leftHand: new THREE.Vector3(0, -0.02, -0.27), hold: 'smg', len: 0.75, suppressed: true });
  },
  ripper(acc = '#ff7a1a') {
    const g = new THREE.Group(); const body = polymer('#3b3f36');
    box(g, 0.07, 0.11, 0.5, body, 0, 0.0, -0.06, { camo: true, r: 0.035 });
    box(g, 0.072, 0.04, 0.12, polymer('#1e201b'), 0, -0.06, 0.03);
    tube(g, 0.012, 0.1, metal('#2c3038'), 0, 0.01, -0.35);
    const mag = new THREE.Group(); mag.position.set(0, 0.075, -0.08);
    part(mag, B(0.056, 0.03, 0.34, 0.01), mat('ripmag', () => new THREE.MeshStandardMaterial({ color: '#d6c79c', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.75 })), 0, 0, 0);
    for (let i = 0; i < 10; i++) box(mag, 0.012, 0.012, 0.024, metal('#c8a24a'), 0, -0.002, -0.14 + i * 0.03);
    g.add(mag);
    box(g, 0.074, 0.008, 0.36, accent(acc), 0, -0.02, -0.08);
    grip(g, polymer('#1e201b'), 0, -0.07, 0.03, 0.15);
    const sy = redDot(g, 0.12, -0.17, '#ff2a55');
    muzzle(g, -0.41, 0.01);
    return finish(g, { mag, sightY: sy, sightZ: -0.17, leftHand: new THREE.Vector3(0, -0.05, -0.2), hold: 'smg', len: 0.6 });
  },
  breacher(acc = '#ff5a3a') {
    const g = new THREE.Group(); const body = polymer('#24262c');
    box(g, 0.065, 0.085, 0.3, body, 0, 0.02, -0.03, { camo: true });
    tube(g, 0.018, 0.56, metal('#2c3038'), 0, 0.045, -0.44);
    tube(g, 0.016, 0.46, metal('#3a3e47'), 0, 0.0, -0.39);
    const pump = new THREE.Group(); pump.position.set(0, 0.0, -0.38); pump.name = 'pump';
    box(pump, 0.05, 0.05, 0.16, polymer('#151619'), 0, 0, 0, { camo: true });
    for (let i = 0; i < 4; i++) box(pump, 0.052, 0.006, 0.01, metal('#111'), 0, 0, -0.05 + i * 0.033);
    g.add(pump);
    box(g, 0.067, 0.008, 0.26, accent(acc), 0, 0.064, -0.03);
    grip(g, body, 0, -0.065, 0.06, 0.35);
    stockSolid(g, body, 0.12, -0.01, 0.22);
    box(g, 0.006, 0.014, 0.01, metal('#ccc'), 0, 0.072, -0.7);
    muzzle(g, -0.73, 0.045);
    return finish(g, { mag: null, pump, sightY: 0.075, sightZ: -0.1, leftHand: new THREE.Vector3(0, -0.02, -0.38), hold: 'rifle', len: 0.95 });
  },
  hydra(acc = '#3dff9a') {
    const g = new THREE.Group(); const body = polymer('#2b2f2a');
    box(g, 0.08, 0.12, 0.42, body, 0, 0.02, -0.08, { camo: true, r: 0.02 });
    tube(g, 0.024, 0.2, metal('#2c3038'), 0, 0.04, -0.38);
    box(g, 0.06, 0.06, 0.08, metal('#1d2027'), 0, 0.04, -0.5);
    for (let i = 0; i < 3; i++) box(g, 0.062, 0.006, 0.012, metal('#000'), 0, 0.055, -0.47 - i * 0.02);
    const mag = new THREE.Group(); mag.position.set(0, -0.08, -0.12);
    part(mag, C(0.075, 0.075, 0.06, 20), polymer('#1a1c19'), 0, 0, 0, { ry: Math.PI / 2 });
    part(mag, C(0.06, 0.06, 0.064, 20), accent(acc), 0, 0, 0, { ry: Math.PI / 2 });
    g.add(mag);
    box(g, 0.082, 0.008, 0.3, accent(acc), 0, 0.083, -0.1);
    grip(g, body, 0, -0.07, 0.06, 0.3);
    stockSolid(g, body, 0.13, 0.01, 0.18);
    const sy = redDot(g, 0.115, -0.08, '#3dff9a');
    muzzle(g, -0.55, 0.04);
    return finish(g, { mag, sightY: sy, sightZ: -0.08, leftHand: new THREE.Vector3(0, -0.02, -0.32), hold: 'rifle', len: 0.8 });
  },
  twinfang(acc = '#ffcc4d') {
    const g = new THREE.Group(); const woodM = wood('#5a3a22');
    box(g, 0.06, 0.08, 0.14, metal('#3a3530'), 0, 0.02, -0.02);
    const barrels = new THREE.Group(); barrels.position.set(0, 0.04, -0.08); barrels.name = 'break';
    for (const x of [-0.016, 0.016]) tube(barrels, 0.016, 0.55, metal('#2a2c31'), x, 0.01, -0.28);
    box(barrels, 0.05, 0.03, 0.3, woodM, 0, -0.02, -0.18, { camo: true });
    box(barrels, 0.06, 0.008, 0.08, accent(acc), 0, 0.03, -0.03);
    g.add(barrels);
    const stock = new THREE.Shape();
    stock.moveTo(0, 0); stock.lineTo(0.3, -0.05); stock.lineTo(0.3, 0.07); stock.lineTo(0.05, 0.05); stock.lineTo(0, 0.03);
    part(g, geo('fangStock', () => { const e = extrude(stock, 0.042, 0.005); e.rotateY(-Math.PI / 2); return e; }), woodM, 0, -0.02, 0.05, { camo: true });
    grip(g, woodM, 0, -0.06, 0.05, 0.4);
    box(g, 0.062, 0.006, 0.06, accent(acc), 0, 0.063, 0.0);
    muzzle(g, -0.64, 0.05);
    return finish(g, { mag: null, breakAction: barrels, sightY: 0.075, sightZ: -0.1, leftHand: new THREE.Vector3(0, 0.0, -0.3), hold: 'rifle', len: 0.95 });
  },
  longshot(acc = '#4dd2ff') {
    const g = new THREE.Group(); const body = polymer('#3a4033');
    box(g, 0.065, 0.085, 0.42, body, 0, 0.02, -0.06, { camo: true });
    tube(g, 0.014, 0.62, metal('#24272e'), 0, 0.035, -0.58);
    box(g, 0.05, 0.04, 0.06, metal('#1d2027'), 0, 0.035, -0.9);
    const bolt = new THREE.Group(); bolt.position.set(0.04, 0.045, 0.02); bolt.name = 'bolt';
    tube(bolt, 0.006, 0.05, metal('#c9d2dc'), 0.02, 0, 0, { ry: Math.PI / 2 });
    part(bolt, new THREE.SphereGeometry(0.011, 10, 8), metal('#c9d2dc'), 0.045, 0, 0);
    g.add(bolt);
    stockSkeleton(g, polymer('#2a2e25'), 0.15, 0.005, 0.22);
    box(g, 0.04, 0.03, 0.12, polymer('#2a2e25'), 0, 0.055, 0.22);
    grip(g, body, 0, -0.065, 0.05, 0.25);
    const mag = straightMag(g, polymer('#1a1c22'), -0.025, -0.08, 0.08, 0.03, 0.07, 0);
    box(g, 0.068, 0.008, 0.36, accent(acc), 0, -0.024, -0.08);
    for (const s of [-1, 1]) box(g, 0.008, 0.008, 0.18, metal('#2b2f38'), s * 0.02, -0.01, -0.44, { rx: 0.15 });
    const sy = scope(g, 0.1, -0.08, 0.34, 0.026, acc);
    muzzle(g, -0.93, 0.035);
    return finish(g, { mag, bolt, sightY: sy, sightZ: -0.08, scope: true, leftHand: new THREE.Vector3(0, -0.02, -0.34), hold: 'rifle', len: 1.2 });
  },
  marksman(acc = '#ffd36b') {
    const g = new THREE.Group(); const body = polymer('#8a7655');
    box(g, 0.066, 0.09, 0.44, body, 0, 0.02, -0.07, { camo: true });
    box(g, 0.06, 0.07, 0.3, polymer('#6e5e44'), 0, 0.022, -0.43, { camo: true });
    tube(g, 0.012, 0.3, metal('#24272e'), 0, 0.035, -0.7);
    box(g, 0.035, 0.035, 0.06, metal('#1d2027'), 0, 0.035, -0.86);
    stockSolid(g, body, 0.15, 0.0, 0.2);
    grip(g, polymer('#2c2a25'), 0, -0.065, 0.04, 0.25);
    const mag = straightMag(g, polymer('#1a1c22'), -0.025, -0.12, 0.09, 0.03, 0.065, 0.02);
    box(g, 0.068, 0.008, 0.4, accent(acc), 0, -0.026, -0.12);
    const sy = scope(g, 0.1, -0.08, 0.26, 0.022, '#ffaa33');
    muzzle(g, -0.89, 0.035);
    return finish(g, { mag, sightY: sy, sightZ: -0.08, scope: true, leftHand: new THREE.Vector3(0, -0.02, -0.38), hold: 'rifle', len: 1.1 });
  },
  lancer(acc = '#40f0ff') {
    const g = new THREE.Group(); const body = polymer('#20232c');
    box(g, 0.08, 0.11, 0.4, body, 0, 0.02, -0.04, { camo: true, r: 0.02 });
    for (const y of [0.055, -0.015]) box(g, 0.05, 0.016, 0.62, metal('#3a3f4c'), 0, y, -0.5);
    const arc = part(g, B(0.006, 0.05, 0.58, 0), glowM(acc, 4), 0, 0.02, -0.5);
    arc.name = 'arc';
    for (let i = 0; i < 4; i++) box(g, 0.06, 0.09, 0.02, metal('#2b2f38'), 0, 0.02, -0.3 - i * 0.14);
    const mag = new THREE.Group(); mag.position.set(0, -0.04, -0.1);
    box(mag, 0.05, 0.07, 0.1, polymer('#15171c'), 0, -0.035, 0);
    for (let i = 0; i < 3; i++) part(mag, B(0.052, 0.012, 0.08, 0.002), glowM(acc, 2.2), 0, -0.02 - i * 0.02, 0);
    g.add(mag);
    stockSolid(g, body, 0.16, 0.01, 0.2);
    grip(g, body, 0, -0.07, 0.07, 0.25);
    box(g, 0.082, 0.01, 0.34, accent(acc), 0, 0.078, -0.04);
    const sy = scope(g, 0.125, -0.02, 0.24, 0.024, acc);
    muzzle(g, -0.82, 0.02);
    return finish(g, { mag, sightY: sy, sightZ: -0.02, scope: true, leftHand: new THREE.Vector3(0, -0.03, -0.32), hold: 'rifle', len: 1.1, energy: true });
  },
  titan(acc = '#ff8a2a') {
    const g = new THREE.Group(); const body = polymer('#3a3d33');
    box(g, 0.09, 0.13, 0.5, body, 0, 0.03, -0.08, { camo: true, r: 0.02 });
    box(g, 0.075, 0.08, 0.3, polymer('#2a2c25'), 0, 0.03, -0.46, { camo: true });
    for (let i = 0; i < 6; i++) box(g, 0.077, 0.01, 0.02, metal('#151619'), 0, 0.07, -0.36 - i * 0.04);
    tube(g, 0.018, 0.3, metal('#24272e'), 0, 0.04, -0.75);
    tube(g, 0.024, 0.06, metal('#1d2027'), 0, 0.04, -0.92);
    const mag = new THREE.Group(); mag.position.set(-0.01, -0.05, -0.12);
    box(mag, 0.1, 0.12, 0.13, polymer('#4a4d40'), -0.03, -0.05, 0, { camo: true });
    box(mag, 0.11, 0.012, 0.135, accent(acc), -0.03, 0.0, 0);
    g.add(mag);
    for (let i = 0; i < 6; i++) box(g, 0.012, 0.016, 0.02, metal('#c8a24a'), 0.05, 0.03 - i * 0.012, -0.1 + i * 0.008);
    box(g, 0.02, 0.05, 0.16, metal('#2b2f38'), 0, 0.12, -0.15);
    stockSolid(g, body, 0.17, 0.02, 0.2);
    grip(g, body, 0, -0.07, 0.06, 0.3);
    for (const s of [-1, 1]) box(g, 0.01, 0.01, 0.2, metal('#2b2f38'), s * 0.025, -0.02, -0.66, { rx: 0.08 });
    const sy = redDot(g, 0.135, -0.02, '#ff8a2a');
    muzzle(g, -0.96, 0.04);
    return finish(g, { mag, sightY: sy, sightZ: -0.02, leftHand: new THREE.Vector3(0, -0.01, -0.42), hold: 'heavy', len: 1.15 });
  },
  cyclone(acc = '#ffb321') {
    const g = new THREE.Group(); const body = polymer('#2c2f36');
    box(g, 0.13, 0.14, 0.3, body, 0, 0.0, -0.02, { camo: true, r: 0.03 });
    const spin = new THREE.Group(); spin.position.set(0, 0.0, -0.3); spin.name = 'barrels';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      tube(spin, 0.011, 0.5, metal('#2a2c31'), Math.cos(a) * 0.035, Math.sin(a) * 0.035, -0.15);
    }
    for (const z of [-0.05, -0.38]) part(spin, C(0.055, 0.055, 0.02, 16), metal('#3a3e47'), 0, 0, z);
    g.add(spin);
    box(g, 0.14, 0.012, 0.28, accent(acc), 0, 0.075, -0.02);
    box(g, 0.03, 0.06, 0.16, metal('#24272e'), 0, 0.11, -0.05);
    const mag = new THREE.Group(); mag.position.set(0.09, -0.08, 0.02);
    box(mag, 0.1, 0.12, 0.18, polymer('#4a4d40'), 0, 0, 0, { camo: true });
    g.add(mag);
    grip(g, body, 0, -0.1, 0.1, 0.1);
    box(g, 0.025, 0.12, 0.03, polymer('#15171c'), 0, -0.05, -0.17);
    muzzle(g, -0.72, 0);
    return finish(g, { mag, spinner: spin, sightY: 0.1, sightZ: -0.1, leftHand: new THREE.Vector3(0, -0.07, -0.17), hold: 'heavy', len: 0.85 });
  },
  sidekick(acc = '#19e6ff') {
    const g = new THREE.Group();
    const slide = new THREE.Group(); slide.name = 'slide'; slide.position.set(0, 0.035, -0.06);
    box(slide, 0.03, 0.035, 0.19, metal('#3a3e47'), 0, 0, 0, { camo: true });
    for (let i = 0; i < 5; i++) box(slide, 0.031, 0.025, 0.004, metal('#1d2027'), 0, 0, 0.06 + i * 0.008);
    box(slide, 0.032, 0.004, 0.14, accent(acc), 0, 0.019, -0.01);
    box(slide, 0.004, 0.008, 0.006, metal('#ddd'), 0, 0.022, -0.09);
    g.add(slide);
    box(g, 0.028, 0.025, 0.17, polymer('#1f2229'), 0, 0.005, -0.06, { camo: true });
    box(g, 0.028, 0.1, 0.045, polymer('#1f2229'), 0, -0.045, 0.01, { rx: 0.22 });
    const mag = straightMag(g, polymer('#15171c'), -0.06, 0.02, 0.05, 0.024, 0.038, 0.22);
    muzzle(g, -0.16, 0.035);
    return finish(g, { mag, slide, sightY: 0.058, sightZ: -0.08, leftHand: new THREE.Vector3(-0.02, -0.04, 0.01), hold: 'pistol', len: 0.22 });
  },
  judge(acc = '#ffcc4d') {
    const g = new THREE.Group();
    box(g, 0.032, 0.05, 0.12, metal('#8d939d'), 0, 0.02, -0.03, { camo: true });
    tube(g, 0.012, 0.18, metal('#8d939d'), 0, 0.035, -0.18);
    box(g, 0.012, 0.022, 0.18, metal('#8d939d'), 0, 0.055, -0.18);
    const cyl = new THREE.Group(); cyl.position.set(0, 0.02, -0.035); cyl.name = 'cylinder';
    part(cyl, C(0.03, 0.03, 0.06, 6), metal('#5e646e'), 0, 0, 0);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; part(cyl, C(0.006, 0.006, 0.062, 8), metal('#222'), Math.cos(a) * 0.018, Math.sin(a) * 0.018, 0); }
    g.add(cyl);
    box(g, 0.03, 0.1, 0.045, wood('#4a2e1c'), 0, -0.05, 0.03, { rx: 0.35 });
    box(g, 0.034, 0.006, 0.08, accent(acc), 0, 0.048, -0.02);
    box(g, 0.006, 0.014, 0.008, metal('#ddd'), 0, 0.072, -0.26);
    muzzle(g, -0.28, 0.035);
    return finish(g, { mag: cyl, cylinder: cyl, sightY: 0.07, sightZ: -0.1, leftHand: new THREE.Vector3(-0.02, -0.05, 0.02), hold: 'pistol', len: 0.32 });
  },
  hornet(acc = '#ff2fa6') {
    const g = new THREE.Group();
    const slide = new THREE.Group(); slide.name = 'slide'; slide.position.set(0, 0.035, -0.06);
    box(slide, 0.03, 0.035, 0.18, metal('#2a2d35'), 0, 0, 0, { camo: true });
    box(slide, 0.032, 0.004, 0.13, accent(acc), 0, 0.019, -0.01);
    g.add(slide);
    box(g, 0.036, 0.04, 0.05, metal('#1d2027'), 0, 0.03, -0.17);
    for (let i = 0; i < 3; i++) box(g, 0.038, 0.006, 0.006, metal('#000'), 0, 0.05, -0.155 - i * 0.012);
    box(g, 0.028, 0.025, 0.17, polymer('#1f2229'), 0, 0.005, -0.06, { camo: true });
    box(g, 0.028, 0.1, 0.045, polymer('#1f2229'), 0, -0.045, 0.01, { rx: 0.2 });
    box(g, 0.02, 0.05, 0.022, polymer('#1f2229'), 0, -0.03, -0.11);
    const mag = straightMag(g, polymer('#15171c'), -0.06, 0.02, 0.12, 0.024, 0.038, 0.2);
    muzzle(g, -0.2, 0.035);
    return finish(g, { mag, slide, sightY: 0.058, sightZ: -0.08, leftHand: new THREE.Vector3(0, -0.04, -0.11), hold: 'pistol', len: 0.26 });
  },
  comet(acc = '#ff7a2a') {
    const g = new THREE.Group(); const body = polymer('#2a2d35');
    tube(g, 0.045, 0.42, polymer('#3a3d45'), 0, 0.04, -0.18, { seg: 20 });
    part(g, T(0.046, 0.006, 20), glowM(acc, 3), 0, 0.04, -0.39);
    part(g, C(0.036, 0.036, 0.01, 20), glowM(acc, 1.6), 0, 0.04, -0.395);
    box(g, 0.05, 0.06, 0.18, body, 0, 0.0, 0.04, { camo: true });
    for (let i = 0; i < 3; i++) part(g, T(0.047, 0.004, 20), metal('#1d2027'), 0, 0.04, -0.05 - i * 0.1);
    grip(g, body, 0, -0.06, 0.08, 0.25);
    box(g, 0.026, 0.07, 0.03, body, 0, -0.04, -0.16);
    const mag = new THREE.Group(); mag.position.set(0, 0.04, 0.05); g.add(mag);
    box(g, 0.012, 0.03, 0.03, metal('#2b2f38'), 0, 0.1, -0.12);
    part(g, B(0.03, 0.022, 0.004, 0), lens(acc), 0, 0.115, -0.12);
    box(g, 0.052, 0.008, 0.16, accent(acc), 0, 0.033, 0.04);
    muzzle(g, -0.4, 0.04);
    return finish(g, { mag, sightY: 0.118, sightZ: -0.12, leftHand: new THREE.Vector3(0, -0.04, -0.16), hold: 'smg', len: 0.55 });
  },
};

// ───────────── MELEE BUILDERS ─────────────
function bladeShape(len, width, tipLen, curve = 0, back = 0.4) {
  const s = new THREE.Shape();
  s.moveTo(0, -width / 2);
  s.quadraticCurveTo(len * 0.5, -width / 2 - curve, len - tipLen, -width / 2 - curve * 0.6);
  s.lineTo(len, 0 + curve * 0.2);
  s.lineTo(len - tipLen * back, width / 2);
  s.lineTo(0, width / 2);
  s.lineTo(0, -width / 2);
  return s;
}
function blade(parent, len, width, tipLen, m, curve = 0, thick = 0.006, edgeColor = null) {
  const g = geo(`blade${len}:${width}:${tipLen}:${curve}:${thick}`, () => {
    const e = extrude(bladeShape(len, width, tipLen, curve), thick, 0.002);
    e.rotateZ(Math.PI / 2);
    e.rotateY(Math.PI / 2);
    return e;
  });
  const b = part(parent, g, m, 0, 0, 0);
  if (edgeColor) {
    const eg = geo(`edge${len}:${width}:${curve}`, () => { const e = new THREE.BoxGeometry(0.003, len * 0.92, 0.008); return e; });
    part(b, eg, glowM(edgeColor, 4), 0, len * 0.46, -width / 2 - curve * 0.4);
  }
  return b;
}
function handle(parent, len, r, m, y0 = 0) {
  return part(parent, geo(`hdl${len}:${r}`, () => new THREE.CylinderGeometry(r, r * 1.08, len, 10)), m, 0, y0 - len / 2, 0);
}

// Melee models point blade-up along +Y from the grip (origin), edge facing -Z.
const MELEES = {
  knife() {
    const g = new THREE.Group();
    handle(g, 0.11, 0.014, polymer('#1d1f24'));
    box(g, 0.05, 0.012, 0.03, metal('#2b2f38'), 0, 0.004, 0);
    const b = blade(g, 0.17, 0.032, 0.05, steel(), 0.004);
    b.position.y = 0.01;
    return finish(g, { kind: 'melee', hold: 'knife', len: 0.3 });
  },
  karambit() {
    const g = new THREE.Group();
    handle(g, 0.09, 0.014, polymer('#2a1530'));
    part(g, T(0.022, 0.006, 16), metal('#c9d2dc'), 0, -0.11, 0, { ry: Math.PI / 2 });
    const curveG = geo('karCurve', () => { const t = new THREE.TorusGeometry(0.09, 0.008, 6, 24, Math.PI * 0.55); return t; });
    const c = part(g, curveG, steel(), -0.09, 0.0, 0, { ry: Math.PI / 2 });
    c.scale.set(1, 1, 0.5);
    part(c, geo('karEdge', () => new THREE.TorusGeometry(0.098, 0.002, 4, 24, Math.PI * 0.55)), glowM('#ff7ad8', 3), 0, 0, 0);
    return finish(g, { kind: 'melee', hold: 'knife', len: 0.25 });
  },
  daggers() {
    const g = new THREE.Group();
    const one = () => {
      const d = new THREE.Group();
      handle(d, 0.09, 0.012, leather());
      box(d, 0.045, 0.01, 0.022, metal('#c9a24a'), 0, 0.004, 0);
      const b = blade(d, 0.15, 0.026, 0.06, steel(), 0, 0.005);
      b.position.y = 0.008;
      return d;
    };
    const right = one(); g.add(right);
    const left = one(); left.name = 'offhand'; g.add(left);
    g.userData.offhand = left;
    return finish(g, { kind: 'melee', hold: 'dual', len: 0.25 });
  },
  machete() {
    const g = new THREE.Group();
    handle(g, 0.13, 0.016, polymer('#3a2a1c'));
    box(g, 0.05, 0.012, 0.035, metal('#2b2f38'), 0, 0.005, 0);
    const b = blade(g, 0.4, 0.06, 0.09, steel(), 0.012, 0.005);
    b.position.y = 0.012;
    return finish(g, { kind: 'melee', hold: 'sword', len: 0.55 });
  },
  katana() {
    const g = new THREE.Group();
    handle(g, 0.24, 0.016, mat('wrap', () => new THREE.MeshStandardMaterial({ color: '#1b1b22', roughness: 0.9 })));
    for (let i = 0; i < 6; i++) part(g, geo('wrapband', () => new THREE.TorusGeometry(0.017, 0.003, 4, 10)), metal('#b38a3a'), 0, -0.03 - i * 0.035, 0, { rx: Math.PI / 2 });
    part(g, geo('tsuba', () => new THREE.CylinderGeometry(0.04, 0.04, 0.008, 16)), metal('#b38a3a'), 0, 0.005, 0);
    const b = blade(g, 0.72, 0.034, 0.07, steel(), 0.03, 0.006);
    b.position.y = 0.01;
    return finish(g, { kind: 'melee', hold: 'sword', len: 0.95 });
  },
  tomahawk() {
    const g = new THREE.Group();
    handle(g, 0.36, 0.015, polymer('#22252c'), 0.24);
    const head = new THREE.Shape();
    head.moveTo(0, -0.02); head.lineTo(0.08, -0.06); head.quadraticCurveTo(0.11, 0, 0.08, 0.07); head.lineTo(0, 0.03);
    part(g, geo('tomaHead', () => { const e = extrude(head, 0.012, 0.002); e.rotateY(Math.PI / 2); return e; }), metal('#4a505c'), 0, 0.21, 0);
    box(g, 0.01, 0.01, 0.07, metal('#4a505c'), 0, 0.22, 0.04, { rx: 0.3 });
    box(g, 0.004, 0.11, 0.006, glowM('#ffc890', 2), 0, 0.215, -0.1);
    return finish(g, { kind: 'melee', hold: 'axe', len: 0.4 });
  },
  axe() {
    const g = new THREE.Group();
    handle(g, 0.62, 0.018, wood('#5a3a22'), 0.42);
    const head = new THREE.Shape();
    head.moveTo(0, -0.03); head.lineTo(0.12, -0.11); head.quadraticCurveTo(0.17, 0, 0.12, 0.11); head.lineTo(0, 0.03);
    const hg = geo('axeHead', () => { const e = extrude(head, 0.016, 0.003); e.rotateY(Math.PI / 2); return e; });
    part(g, hg, metal('#5e646e'), 0, 0.38, 0);
    part(g, hg, metal('#5e646e'), 0, 0.38, 0, { ry: Math.PI });
    part(g, geo('axeCore', () => new THREE.CylinderGeometry(0.03, 0.03, 0.08, 10)), metal('#2b2f38'), 0, 0.38, 0);
    return finish(g, { kind: 'melee', hold: 'axe', len: 0.8, heavy: true });
  },
  plasma() {
    const g = new THREE.Group();
    handle(g, 0.2, 0.02, metal('#b8c0cc'));
    for (let i = 0; i < 3; i++) part(g, geo('hiltband', () => new THREE.TorusGeometry(0.021, 0.004, 4, 12)), polymer('#111'), 0, -0.04 - i * 0.05, 0, { rx: Math.PI / 2 });
    part(g, geo('emitter', () => new THREE.CylinderGeometry(0.025, 0.02, 0.03, 12)), metal('#3a3e47'), 0, 0.015, 0);
    const core = part(g, geo('saberCore', () => new THREE.CylinderGeometry(0.011, 0.013, 0.78, 10)), glowM('#e8ffff', 4), 0, 0.42, 0);
    const halo = part(g, geo('saberHalo', () => new THREE.CylinderGeometry(0.024, 0.026, 0.8, 12)), mat('saberGlow', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#2af0ff').multiplyScalar(2.2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })), 0, 0.42, 0);
    void core; void halo;
    return finish(g, { kind: 'melee', hold: 'sword', len: 0.95, energy: true });
  },
  nano() {
    const g = new THREE.Group();
    handle(g, 0.18, 0.016, polymer('#1a1b20'));
    box(g, 0.07, 0.02, 0.03, metal('#2b2f38'), 0, 0.006, 0);
    part(g, B(0.072, 0.004, 0.032, 0), glowM('#ff2fa6', 3), 0, 0.017, 0);
    const b = blade(g, 0.58, 0.042, 0.14, metal('#1d2027'), 0.0, 0.007, '#ff2fa6');
    b.position.y = 0.015;
    return finish(g, { kind: 'melee', hold: 'sword', len: 0.8, energy: true });
  },
  reaper() {
    const g = new THREE.Group();
    handle(g, 1.1, 0.017, polymer('#1a1420'), 0.75);
    for (let i = 0; i < 4; i++) part(g, geo('reapBand', () => new THREE.TorusGeometry(0.019, 0.004, 4, 12)), glowM('#9b5bff', 2.5), 0, -0.2 + i * 0.25, 0, { rx: Math.PI / 2 });
    const crescent = new THREE.Shape();
    crescent.moveTo(0, 0); crescent.quadraticCurveTo(0.25, 0.2, 0.55, -0.05); crescent.quadraticCurveTo(0.28, 0.08, 0, -0.06);
    const cg = geo('reapBlade', () => { const e = extrude(crescent, 0.008, 0.002); e.rotateY(-Math.PI / 2); return e; });
    part(g, cg, metal('#2a2c33'), 0, 0.72, 0.02);
    part(g, geo('reapEdge', () => { const c = new THREE.Shape(); c.moveTo(0.02, -0.055); c.quadraticCurveTo(0.28, 0.075, 0.55, -0.05); c.quadraticCurveTo(0.28, 0.06, 0.02, -0.065); const e = extrude(c, 0.01, 0); e.rotateY(-Math.PI / 2); return e; }), glowM('#c48cff', 3.5), 0, 0.72, 0.02);
    return finish(g, { kind: 'melee', hold: 'scythe', len: 1.3, energy: true });
  },
};

// ───────────── camo ─────────────
const camoCache = new Map();
function camoTexture(item) {
  if (camoCache.has(item.id)) return camoCache.get(item.id);
  const d = item.data;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const rng = mulberry32(item.id.length * 977 + item.id.charCodeAt(5));
  ctx.fillStyle = d.base; ctx.fillRect(0, 0, S, S);
  const e = document.createElement('canvas');
  e.width = e.height = S;
  const ex = e.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  const P = d.pattern;
  if (P === 'blotch' || P === 'tiger') {
    for (let i = 0; i < (P === 'tiger' ? 26 : 40); i++) {
      ctx.fillStyle = i % 3 === 0 ? d.b : shade(d.base, 0.75);
      ctx.beginPath();
      const x = rng() * S, y = rng() * S;
      if (P === 'tiger') { ctx.ellipse(x, y, 4 + rng() * 6, 30 + rng() * 40, rng() * 0.6 - 0.3, 0, Math.PI * 2); }
      else ctx.ellipse(x, y, 12 + rng() * 30, 8 + rng() * 20, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (P === 'pixel') {
    const g = 16;
    for (let y = 0; y < S; y += g) for (let x = 0; x < S; x += g) {
      const r = rng();
      if (r < 0.3) { ctx.fillStyle = d.b; ctx.fillRect(x, y, g, g); } else if (r < 0.5) { ctx.fillStyle = shade(d.base, 0.8); ctx.fillRect(x, y, g, g); }
    }
  } else if (P === 'stripe') {
    ctx.fillStyle = d.b;
    for (let i = -S; i < S * 2; i += 36) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 14, 0); ctx.lineTo(i + 14 - S, S); ctx.lineTo(i - S, S); ctx.fill(); }
  } else if (P === 'weave') {
    for (let y = 0; y < S; y += 8) for (let x = 0; x < S; x += 8) {
      ctx.fillStyle = ((x + y) / 8) % 2 ? d.b : shade(d.base, 1.3);
      ctx.fillRect(x, y, 8, 4);
    }
  } else if (P === 'circuit' || P === 'glitch') {
    ex.strokeStyle = d.b; ex.lineWidth = 2;
    ctx.strokeStyle = shade(d.base, 1.6);
    for (let i = 0; i < 40; i++) {
      let x = Math.floor(rng() * 16) * 16, y = Math.floor(rng() * 16) * 16;
      ex.beginPath(); ex.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        if (rng() < 0.5) x += (rng() < 0.5 ? -1 : 1) * 32; else y += (rng() < 0.5 ? -1 : 1) * 32;
        ex.lineTo(x, y);
      }
      ex.stroke();
      ex.fillStyle = d.b; ex.fillRect(x - 3, y - 3, 6, 6);
    }
    if (P === 'glitch') for (let i = 0; i < 20; i++) { ex.fillStyle = rng() < 0.5 ? d.b : '#ff2fa6'; ex.fillRect(0, rng() * S, S, 2 + rng() * 6); }
  } else if (P === 'galaxy') {
    const gr = ctx.createLinearGradient(0, 0, S, S);
    gr.addColorStop(0, d.base); gr.addColorStop(0.5, '#3a1a7a'); gr.addColorStop(1, '#0a2a5a');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 160; i++) { ex.fillStyle = rng() < 0.3 ? d.b : '#ffffff'; const r = rng() * 1.8 + 0.3; ex.beginPath(); ex.arc(rng() * S, rng() * S, r, 0, Math.PI * 2); ex.fill(); }
  } else if (P === 'lava') {
    for (let i = 0; i < 30; i++) {
      ex.strokeStyle = d.b; ex.lineWidth = 2 + rng() * 4;
      ex.beginPath(); let x = rng() * S, y = rng() * S; ex.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (rng() - 0.5) * 60; y += (rng() - 0.5) * 60; ex.lineTo(x, y); }
      ex.stroke();
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  let emissiveMap = null;
  if (d.glow) {
    emissiveMap = new THREE.CanvasTexture(e);
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  }
  const out = { map, emissiveMap };
  camoCache.set(item.id, out);
  return out;
}
function shade(hex, k) {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return '#' + c.getHexString();
}

const camoMats = new Map();
export function camoMaterial(camoId) {
  if (!camoId || camoId === 'camo_none') return null;
  if (camoMats.has(camoId)) return camoMats.get(camoId);
  const item = getItem(camoId);
  if (!item) return null;
  const t = camoTexture(item);
  const d = item.data;
  const m = new THREE.MeshStandardMaterial({
    color: '#ffffff', map: t.map, roughness: d.rough ?? 0.45, metalness: d.metal ?? 0.25,
    emissive: d.glow ? new THREE.Color('#ffffff') : new THREE.Color('#000000'), emissiveMap: t.emissiveMap, emissiveIntensity: d.glow ? 2.2 : 0,
  });
  camoMats.set(camoId, m);
  return m;
}

// ───────────── public API ─────────────
export function buildWeaponModel(id, camoId) {
  const fn = GUNS[id] || MELEES[id];
  if (!fn) return GUNS.vx9();
  const g = fn();
  const cm = camoMaterial(camoId);
  if (cm) g.traverse((o) => { if (o.isMesh && o.userData.camo) o.material = cm; });
  if (MELEES[id] && cm) {
    // melee: apply camo to the handle/blade body parts
    g.traverse((o) => { if (o.isMesh && o.material && o.material.metalness >= 0.85 && o.material.color && o.material.type === 'MeshStandardMaterial') o.material = cm; });
  }
  g.userData.id = id;
  return g;
}

export const MODEL_IDS = [...Object.keys(GUNS), ...Object.keys(MELEES)];
