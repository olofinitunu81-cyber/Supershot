// Roblox-inspired blocky avatars: customizable parts, procedural animation
// with two-bone IK for weapon holds, emotes and break-apart deaths.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getItem } from '../../../shared/items.js';
import { DEFAULT_AVATAR } from '../../../shared/avatar.js';
import { buildWeaponModel } from './weaponmodels.js';
import { WEAPONS } from '../../../shared/weapons.js';

const DIMS = {
  hipY: 0.76, thigh: 0.38, shin: 0.38, legW: 0.28, legD: 0.3, legX: 0.155,
  torsoW: 0.62, torsoH: 0.68, torsoD: 0.34,
  shoulderX: 0.44, shoulderY: 0.6, upper: 0.33, lower: 0.33, armW: 0.24, armD: 0.26,
  headY: 0.7,
};

// ───────────── shared resources ─────────────
const geoCache = new Map();
const G = (k, f) => { if (!geoCache.has(k)) geoCache.set(k, f()); return geoCache.get(k); };
const RB = (w, h, d, r) => G(`rb${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r));
const BX = (w, h, d) => G(`bx${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));

const matCache = new Map();
function std(color, rough = 0.65, metal = 0, extra) {
  const key = `${color}:${rough}:${metal}:${extra ? JSON.stringify(extra) : ''}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...(extra || {}) }));
  return matCache.get(key);
}
function glowMat(color, k = 2.5) {
  const key = `glow:${color}:${k}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }));
  return matCache.get(key);
}

// ───────────── face textures ─────────────
const faceCache = new Map();
export function faceTexture(id) {
  if (faceCache.has(id)) return faceCache.get(id);
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.lineCap = 'round'; x.lineJoin = 'round';
  const ink = '#141414';
  const eye = (cx, cy, r = 14) => { x.fillStyle = ink; x.beginPath(); x.ellipse(cx, cy, r * 0.75, r, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(cx + 3, cy - 5, r * 0.28, 0, Math.PI * 2); x.fill(); };
  const smile = (w = 50, d = 26, y = 158) => { x.strokeStyle = ink; x.lineWidth = 9; x.beginPath(); x.moveTo(128 - w, y); x.quadraticCurveTo(128, y + d * 2, 128 + w, y); x.stroke(); };
  switch (id) {
    case 'face_grin':
      eye(92, 104); eye(164, 104);
      x.fillStyle = ink; x.beginPath(); x.moveTo(70, 148); x.quadraticCurveTo(128, 230, 186, 148); x.closePath(); x.fill();
      x.fillStyle = '#fff'; x.fillRect(84, 150, 88, 14);
      break;
    case 'face_chill':
      x.strokeStyle = ink; x.lineWidth = 9;
      x.beginPath(); x.moveTo(74, 108); x.lineTo(110, 108); x.moveTo(146, 108); x.lineTo(182, 108); x.stroke();
      smile(34, 10, 160);
      break;
    case 'face_angry':
      eye(92, 112, 12); eye(164, 112, 12);
      x.strokeStyle = ink; x.lineWidth = 10;
      x.beginPath(); x.moveTo(68, 78); x.lineTo(114, 96); x.moveTo(188, 78); x.lineTo(142, 96); x.stroke();
      x.beginPath(); x.moveTo(90, 176); x.quadraticCurveTo(128, 150, 166, 176); x.stroke();
      break;
    case 'face_smug':
      x.strokeStyle = ink; x.lineWidth = 9;
      x.beginPath(); x.moveTo(74, 104); x.quadraticCurveTo(94, 94, 112, 106); x.moveTo(144, 106); x.quadraticCurveTo(162, 94, 182, 104); x.stroke();
      x.beginPath(); x.moveTo(96, 166); x.quadraticCurveTo(140, 178, 178, 146); x.stroke();
      break;
    case 'face_wink':
      eye(92, 104);
      x.strokeStyle = ink; x.lineWidth = 9; x.beginPath(); x.moveTo(146, 106); x.quadraticCurveTo(164, 92, 184, 106); x.stroke();
      smile(46, 22);
      break;
    case 'face_shock':
      eye(92, 100, 17); eye(164, 100, 17);
      x.fillStyle = ink; x.beginPath(); x.ellipse(128, 170, 18, 24, 0, 0, Math.PI * 2); x.fill();
      break;
    case 'face_determined':
      eye(92, 110, 11); eye(164, 110, 11);
      x.strokeStyle = ink; x.lineWidth = 10;
      x.beginPath(); x.moveTo(70, 88); x.lineTo(116, 94); x.moveTo(186, 88); x.lineTo(140, 94); x.stroke();
      x.beginPath(); x.moveTo(98, 168); x.lineTo(158, 164); x.stroke();
      break;
    case 'face_kitty':
      eye(90, 104, 13); eye(166, 104, 13);
      x.strokeStyle = ink; x.lineWidth = 8;
      x.beginPath(); x.moveTo(98, 156); x.quadraticCurveTo(113, 172, 128, 156); x.quadraticCurveTo(143, 172, 158, 156); x.stroke();
      x.strokeStyle = '#ff8fc8'; x.lineWidth = 6;
      for (const s of [-1, 1]) for (const k of [0, 1]) { x.beginPath(); x.moveTo(128 + s * 60, 140 + k * 14); x.lineTo(128 + s * 100, 132 + k * 22); x.stroke(); }
      break;
    case 'face_shades':
      x.fillStyle = '#0c0c0f';
      x.beginPath(); x.roundRect(58, 84, 62, 40, 10); x.roundRect(136, 84, 62, 40, 10); x.fill();
      x.fillRect(116, 92, 24, 8);
      x.fillStyle = 'rgba(120,200,255,0.55)'; x.fillRect(66, 90, 20, 8); x.fillRect(144, 90, 20, 8);
      smile(40, 12, 166);
      break;
    case 'face_robot':
      x.fillStyle = '#05070a'; x.beginPath(); x.roundRect(48, 82, 160, 52, 16); x.fill();
      x.fillStyle = '#19e6ff'; x.shadowColor = '#19e6ff'; x.shadowBlur = 18;
      x.fillRect(70, 100, 40, 14); x.fillRect(146, 100, 40, 14);
      x.shadowBlur = 0; x.fillStyle = '#19e6ff';
      for (let i = 0; i < 5; i++) x.fillRect(86 + i * 18, 166, 10, 10);
      break;
    case 'face_star':
      for (const cx of [92, 164]) {
        x.fillStyle = '#ffd400'; x.beginPath();
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 9 : 22; x.lineTo(cx + Math.cos(a) * r, 106 + Math.sin(a) * r); }
        x.fill();
      }
      smile(44, 22);
      break;
    case 'face_skull':
      x.fillStyle = ink;
      x.beginPath(); x.ellipse(92, 108, 22, 24, 0, 0, Math.PI * 2); x.ellipse(164, 108, 22, 24, 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.moveTo(128, 136); x.lineTo(116, 156); x.lineTo(140, 156); x.fill();
      for (let i = 0; i < 6; i++) x.fillRect(88 + i * 14, 176, 8, 22);
      break;
    case 'face_beast':
      eye(92, 106, 12); eye(164, 106, 12);
      x.strokeStyle = ink; x.lineWidth = 10;
      x.beginPath(); x.moveTo(66, 86); x.lineTo(116, 98); x.moveTo(190, 86); x.lineTo(140, 98); x.stroke();
      x.fillStyle = ink; x.beginPath(); x.roundRect(80, 150, 96, 40, 10); x.fill();
      x.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(84 + i * 15, 152); x.lineTo(91 + i * 15, 166); x.lineTo(98 + i * 15, 152); x.fill(); }
      break;
    default: // face_smile
      eye(92, 106); eye(164, 106);
      smile(46, 22);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  faceCache.set(id, t);
  return t;
}

// ───────────── clothing textures ─────────────
const clothCache = new Map();
function clothTexture(kind, color, accent, part = 'front') {
  const key = `${kind}:${color}:${accent}:${part}`;
  if (clothCache.has(key)) return clothCache.get(key);
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const col = new THREE.Color(color);
  const dark = '#' + col.clone().multiplyScalar(0.7).getHexString();
  const light = '#' + col.clone().lerp(new THREE.Color('#ffffff'), 0.25).getHexString();
  x.fillStyle = color; x.fillRect(0, 0, S, S);
  // subtle fabric noise
  for (let i = 0; i < 900; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'; x.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
  const front = part === 'front';
  switch (kind) {
    case 'shirt_tee':
      if (front) { x.fillStyle = dark; x.beginPath(); x.arc(64, 0, 22, 0, Math.PI); x.fill(); x.fillStyle = accent; x.font = 'italic 900 34px sans-serif'; x.textAlign = 'center'; x.fillText('S', 64, 82); }
      break;
    case 'shirt_hoodie':
      if (front) { x.fillStyle = dark; x.fillRect(30, 76, 68, 34); x.strokeStyle = light; x.lineWidth = 3; x.beginPath(); x.moveTo(52, 0); x.lineTo(56, 44); x.moveTo(76, 0); x.lineTo(72, 44); x.stroke(); }
      x.fillStyle = dark; x.fillRect(0, S - 10, S, 10);
      break;
    case 'shirt_jacket':
      x.fillStyle = dark; x.fillRect(60, 0, 8, S);
      if (front) { x.fillStyle = '#e8e8e8'; x.beginPath(); x.moveTo(44, 0); x.lineTo(64, 34); x.lineTo(84, 0); x.fill(); }
      x.fillStyle = accent; x.fillRect(0, S - 12, S, 4); x.fillRect(0, 30, S, 3);
      break;
    case 'shirt_vest':
      x.fillStyle = '#2a2f25'; x.fillRect(10, 10, 108, 118);
      x.fillStyle = '#3a4133';
      for (let i = 0; i < 3; i++) x.fillRect(16 + i * 34, 70, 28, 36);
      x.fillStyle = accent; x.fillRect(10, 10, 108, 4);
      break;
    case 'shirt_stripes':
      for (let y = 0; y < S; y += 20) { x.fillStyle = accent; x.fillRect(0, y, S, 9); }
      break;
    case 'shirt_suit':
      x.fillStyle = '#1b1d24'; x.fillRect(0, 0, S, S);
      if (front) { x.fillStyle = '#f2f2f2'; x.beginPath(); x.moveTo(40, 0); x.lineTo(64, 70); x.lineTo(88, 0); x.fill(); x.fillStyle = accent; x.beginPath(); x.moveTo(58, 8); x.lineTo(70, 8); x.lineTo(67, 60); x.lineTo(64, 66); x.lineTo(61, 60); x.fill(); }
      break;
    case 'shirt_armor':
      x.fillStyle = '#3b4150'; x.fillRect(8, 8, 112, 112);
      x.strokeStyle = accent; x.lineWidth = 3; x.strokeRect(14, 14, 100, 46); x.strokeRect(14, 66, 46, 50); x.strokeRect(68, 66, 46, 50);
      break;
    case 'shirt_circuit':
      x.strokeStyle = accent; x.lineWidth = 3;
      for (let i = 0; i < 12; i++) { let px = (i * 37) % S, py = (i * 53) % S; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 3; k++) { if (k % 2) px += 24; else py += 24; x.lineTo(px, py); } x.stroke(); x.fillStyle = accent; x.fillRect(px - 3, py - 3, 6, 6); }
      break;
    case 'shirt_camo':
      for (let i = 0; i < 26; i++) { x.fillStyle = i % 2 ? dark : '#4d5b34'; x.beginPath(); x.ellipse(Math.random() * S, Math.random() * S, 10 + Math.random() * 18, 6 + Math.random() * 10, Math.random() * 3, 0, Math.PI * 2); x.fill(); }
      break;
    case 'shirt_racer':
      x.fillStyle = accent; x.fillRect(22, 0, 14, S); x.fillRect(92, 0, 14, S);
      if (front) { x.fillStyle = '#fff'; x.font = 'italic 900 28px sans-serif'; x.textAlign = 'center'; x.fillText('77', 64, 80); }
      break;
    case 'shirt_tank':
      break;
    case 'pants_jeans':
      x.strokeStyle = light; x.lineWidth = 2; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(64, 0); x.lineTo(64, S); x.stroke();
      break;
    case 'pants_cargo':
      x.fillStyle = dark; x.fillRect(8, 50, 36, 30); x.fillRect(84, 50, 36, 30);
      break;
    case 'pants_tactical':
      x.fillStyle = '#20231d'; x.fillRect(20, 84, 88, 30);
      break;
    case 'pants_track':
      x.fillStyle = accent; x.fillRect(0, 0, 10, S); x.fillRect(S - 10, 0, 10, S);
      break;
    case 'pants_armor':
      x.fillStyle = '#3b4150'; x.fillRect(12, 20, 104, 90); x.strokeStyle = accent; x.lineWidth = 3; x.strokeRect(18, 26, 92, 78);
      break;
    case 'pants_neon':
      x.fillStyle = accent; x.fillRect(56, 0, 16, S);
      break;
    default:
      break;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  clothCache.set(key, t);
  return t;
}

function clothMat(kind, color, accent, part, glow) {
  const key = `cm:${kind}:${color}:${accent}:${part}:${glow}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ map: clothTexture(kind, color, accent, part), roughness: 0.8, metalness: 0 });
  if (glow) { m.emissive = new THREE.Color(accent); m.emissiveMap = m.map; m.emissiveIntensity = 0.25; }
  matCache.set(key, m);
  return m;
}

// ───────────── avatar ─────────────
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);

export class Avatar {
  constructor(appearance = DEFAULT_AVATAR, opts = {}) {
    this.opts = opts;
    this.root = new THREE.Group();
    this.root.name = 'avatar';
    this.app = { ...DEFAULT_AVATAR, ...appearance };
    this.weaponId = null;
    this.weapon = null;
    this.t = Math.random() * 10;
    this.phase = 0;
    this.crouchB = 0;
    this.slideB = 0;
    this.airB = 0;
    this.emote = null;
    this.emoteT = 0;
    this.swingT = 1;
    this.swingAnim = 'slash';
    this.recoil = 0;
    this.reloadB = 0;
    this.capeSwing = 0;
    this.build();
  }

  build() {
    // dispose old
    for (const c of [...this.root.children]) this.root.remove(c);
    const a = this.app;
    const outfit = getItem(a.outfit);
    const od = outfit && outfit.id !== 'outfit_none' ? outfit.data : null;
    const skin = od && od.skin ? od.skin : a.skinTone;
    const shirtColor = od ? od.body : a.shirtColor;
    const pantsColor = od ? (od.astro ? '#e8ecf2' : od.body) : a.pantsColor;
    const accent = od ? od.trim : a.accentColor;
    const shirtKind = od ? (od.tactical ? 'shirt_vest' : od.robot ? 'shirt_armor' : od.glow ? 'shirt_circuit' : 'shirt_tee') : a.shirt;
    const pantsKind = od ? (od.robot ? 'pants_armor' : od.glow ? 'pants_neon' : 'pants_cargo') : a.pants;
    const glowCloth = !!(od && od.glow) || shirtKind === 'shirt_circuit' || pantsKind === 'pants_neon';
    let skinM = std(skin, 0.6, 0);
    if (od && od.metal) skinM = std(skin, 0.25, 0.9);
    if (od && od.ghost) skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.3, transparent: true, opacity: 0.55, emissive: new THREE.Color(skin), emissiveIntensity: 0.8 });
    if (od && od.lava) skinM = std('#2a1410', 0.9, 0, { emissive: new THREE.Color('#ff5a14'), emissiveIntensity: 0.25 });
    const shirtFront = clothMat(shirtKind, shirtColor, accent, 'front', glowCloth);
    const shirtSide = clothMat(shirtKind, shirtColor, accent, 'side', glowCloth);
    let sleeveM = std(shirtColor, 0.8, 0);
    if (od && od.metal) { sleeveM = std(shirtColor, 0.25, 0.9); }
    if (od && od.ghost) { sleeveM = skinM; }
    const pantsM = clothMat(pantsKind, pantsColor, accent, 'front', glowCloth);
    const shoeM = std(od ? accent : '#1b1d22', 0.6, 0.1);
    this.mats = { skinM, sleeveM, accent };

    const body = new THREE.Group(); body.name = 'body';
    this.root.add(body);
    this.body = body;
    const pelvis = new THREE.Group(); pelvis.position.y = DIMS.hipY; body.add(pelvis);
    this.pelvis = pelvis;

    // legs
    const shorts = pantsKind === 'pants_shorts';
    this.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group(); hip.position.set(s * DIMS.legX, 0, 0); pelvis.add(hip);
      const thigh = new THREE.Mesh(RB(DIMS.legW, DIMS.thigh, DIMS.legD, 0.04), pantsM); thigh.position.y = -DIMS.thigh / 2; hip.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -DIMS.thigh; hip.add(knee);
      const shin = new THREE.Mesh(RB(DIMS.legW * 0.96, DIMS.shin - 0.06, DIMS.legD * 0.96, 0.04), shorts ? skinM : pantsM); shin.position.y = -DIMS.shin / 2 + 0.03; knee.add(shin);
      const shoe = new THREE.Mesh(RB(DIMS.legW, 0.1, DIMS.legD + 0.06, 0.03), shoeM); shoe.position.set(0, -DIMS.shin + 0.05, -0.03); knee.add(shoe);
      if (pantsKind === 'pants_tactical' || pantsKind === 'pants_armor') {
        const pad = new THREE.Mesh(RB(DIMS.legW * 0.8, 0.12, 0.06, 0.02), std(pantsKind === 'pants_armor' ? '#3b4150' : '#20231d', 0.6, 0.3)); pad.position.set(0, -0.02, -DIMS.legD / 2 - 0.02); knee.add(pad);
      }
      if (pantsKind === 'pants_cargo') {
        const pk = new THREE.Mesh(BX(0.06, 0.12, 0.14), pantsM); pk.position.set(s * (DIMS.legW / 2 + 0.02), -0.2, 0); hip.add(pk);
      }
      return { hip, knee, thigh, shin };
    });

    // torso
    const torsoPivot = new THREE.Group(); pelvis.add(torsoPivot); this.torsoPivot = torsoPivot;
    const torsoMats = [shirtSide, shirtSide, sleeveM, sleeveM, shirtSide, shirtFront];
    const torso = new THREE.Mesh(RB(DIMS.torsoW, DIMS.torsoH, DIMS.torsoD, 0.05), torsoMats);
    torso.position.y = DIMS.torsoH / 2;
    torsoPivot.add(torso);
    this.torso = torso;
    if (shirtKind === 'shirt_hoodie') {
      const hood = new THREE.Mesh(RB(0.5, 0.18, 0.16, 0.06), sleeveM); hood.position.set(0, DIMS.torsoH - 0.02, 0.15); torsoPivot.add(hood);
    }
    if (shirtKind === 'shirt_vest' || shirtKind === 'shirt_armor') {
      const plate = new THREE.Mesh(RB(DIMS.torsoW + 0.04, DIMS.torsoH * 0.62, DIMS.torsoD + 0.06, 0.04), std(shirtKind === 'shirt_armor' ? '#3b4150' : '#2a2f25', 0.55, shirtKind === 'shirt_armor' ? 0.5 : 0.1));
      plate.position.y = DIMS.torsoH * 0.55; torsoPivot.add(plate);
      if (shirtKind === 'shirt_armor') { const g1 = new THREE.Mesh(BX(0.4, 0.02, 0.01), glowMat(accent, 2.5)); g1.position.set(0, DIMS.torsoH * 0.62, -DIMS.torsoD / 2 - 0.035); torsoPivot.add(g1); }
    }
    if (shirtKind === 'shirt_jacket' || shirtKind === 'shirt_racer') {
      const collar = new THREE.Mesh(RB(0.44, 0.08, 0.3, 0.03), sleeveM); collar.position.set(0, DIMS.torsoH - 0.01, 0.01); torsoPivot.add(collar);
    }

    // aim pivot holds arms + weapon so they pitch together
    const aim = new THREE.Group(); aim.position.y = DIMS.shoulderY; torsoPivot.add(aim); this.aim = aim;
    const shortSleeve = shirtKind === 'shirt_tee' || shirtKind === 'shirt_stripes' || shirtKind === 'shirt_racer' && false;
    const noSleeve = shirtKind === 'shirt_tank';
    this.arms = [-1, 1].map((s) => {
      const shoulder = new THREE.Group(); shoulder.position.set(s * DIMS.shoulderX, 0, 0); aim.add(shoulder);
      const upper = new THREE.Mesh(RB(DIMS.armW, DIMS.upper, DIMS.armD, 0.04), noSleeve ? skinM : sleeveM); upper.position.y = -DIMS.upper / 2; shoulder.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -DIMS.upper; shoulder.add(elbow);
      const lowerM = noSleeve || shortSleeve ? skinM : sleeveM;
      const lower = new THREE.Mesh(RB(DIMS.armW * 0.94, DIMS.lower - 0.08, DIMS.armD * 0.94, 0.04), lowerM); lower.position.y = -(DIMS.lower - 0.08) / 2; elbow.add(lower);
      const hand = new THREE.Mesh(RB(DIMS.armW * 0.92, 0.1, DIMS.armD * 0.92, 0.04), skinM); hand.position.y = -DIMS.lower + 0.05; elbow.add(hand);
      if (od && od.robot) { const j = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), glowMat(accent, 2)); elbow.add(j); }
      return { shoulder, elbow, upper, lower, hand };
    });

    // head
    const head = new THREE.Group(); head.position.y = DIMS.headY; torsoPivot.add(head); this.head = head;
    const neck = new THREE.Mesh(BX(0.2, 0.06, 0.2), skinM); neck.position.y = 0.0; head.add(neck);
    const hShape = od && od.robot ? 'head_tv' : od && od.astro ? 'head_orb' : a.head;
    let hw = 0.46, hh = 0.42, hd = 0.42, headMesh;
    if (hShape === 'head_round') headMesh = new THREE.Mesh(RB(0.46, 0.44, 0.44, 0.16), skinM);
    else if (hShape === 'head_cyl') { headMesh = new THREE.Mesh(G('hcyl', () => new THREE.CylinderGeometry(0.23, 0.23, 0.42, 24)), skinM); hd = 0.46; }
    else if (hShape === 'head_wide') { hw = 0.58; hh = 0.38; headMesh = new THREE.Mesh(RB(0.58, 0.38, 0.42, 0.08), skinM); }
    else if (hShape === 'head_tv') headMesh = new THREE.Mesh(RB(0.5, 0.42, 0.42, 0.04), std('#2a2d35', 0.4, 0.6));
    else if (hShape === 'head_orb') { headMesh = new THREE.Mesh(G('horb', () => new THREE.SphereGeometry(0.26, 24, 18)), od && od.astro ? new THREE.MeshStandardMaterial({ color: '#aac8ff', roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.55 }) : skinM); hd = 0.5; }
    else headMesh = new THREE.Mesh(RB(0.46, 0.42, 0.42, 0.06), skinM);
    headMesh.position.y = 0.24;
    head.add(headMesh);
    this.headMesh = headMesh;
    if (od && od.astro) { const inner = new THREE.Mesh(RB(0.36, 0.34, 0.34, 0.08), std(a.skinTone, 0.6)); inner.position.y = 0.24; head.add(inner); }
    // face decal
    const faceId = od && od.robot ? 'face_robot' : a.face;
    const faceMat = new THREE.MeshBasicMaterial({ map: faceTexture(faceId), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    if (hShape === 'head_tv') faceMat.color = new THREE.Color(2.2, 2.2, 2.2);
    const face = new THREE.Mesh(G('faceplane', () => new THREE.PlaneGeometry(0.4, 0.4)), faceMat);
    face.position.set(0, 0.24, -hd / 2 - (hShape === 'head_cyl' || hShape === 'head_orb' ? 0.0 : 0.004));
    face.rotation.y = Math.PI;
    if (hShape === 'head_cyl' || hShape === 'head_orb') face.position.z = -hd / 2 + 0.01;
    head.add(face);
    this.face = face;
    if (od && od.ninja) {
      const mask = new THREE.Mesh(RB(hw + 0.02, 0.16, hd + 0.02, 0.04), std('#15161c', 0.7)); mask.position.set(0, 0.14, 0); head.add(mask);
      const band = new THREE.Mesh(RB(hw + 0.03, 0.05, hd + 0.03, 0.02), std(accent, 0.5)); band.position.set(0, 0.4, 0); head.add(band);
    }
    const topY = 0.24 + hh / 2;
    this._buildHair(head, a, hw, hd, topY, od);
    this._buildHat(head, a, hw, hd, topY);
    this._buildFaceAcc(head, a, hw, hd);
    this._buildBack(torsoPivot, a, od);
    this.attachWeapon(this.weaponId, this.camos);
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = this.opts.shadows !== false; o.receiveShadow = false; } });
  }

  _buildHair(head, a, hw, hd, topY, od) {
    if (od && (od.robot || od.astro || od.ninja)) return;
    const id = a.hair;
    if (!id || id === 'hair_none' || (a.hat === 'hat_helmet' || a.hat === 'hat_tophat' || a.hat === 'hat_cowboy' || a.hat === 'hat_wizard') && ['hair_buzz', 'hair_spiky', 'hair_mohawk'].includes(id)) return;
    const item = getItem(id);
    const hm = item && item.data.glow ? std(a.hairColor, 0.5, 0, { emissive: new THREE.Color(item.data.glow), emissiveIntensity: 0.7 }) : std(a.hairColor, 0.75, 0);
    const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, hm); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); head.add(m); return m; };
    const cap = () => add(RB(hw + 0.04, 0.1, hd + 0.04, 0.04), 0, topY - 0.02, 0.01);
    switch (id) {
      case 'hair_buzz': add(RB(hw + 0.02, 0.05, hd + 0.02, 0.02), 0, topY - 0.005, 0); break;
      case 'hair_spiky':
        cap();
        for (let i = 0; i < 7; i++) { const x = -0.18 + (i % 4) * 0.12, z = i < 4 ? -0.06 : 0.08; add(G('spike', () => new THREE.ConeGeometry(0.07, 0.18, 4)), x + (i >= 4 ? 0.06 : 0), topY + 0.1, z, z * 2, 0, x * 0.8); }
        break;
      case 'hair_mohawk':
        for (let i = 0; i < 5; i++) add(BX(0.07, 0.16 - Math.abs(i - 2) * 0.02, 0.09), 0, topY + 0.06, -0.18 + i * 0.09);
        break;
      case 'hair_bob':
        cap(); add(RB(0.06, 0.32, hd + 0.04, 0.03), -hw / 2 - 0.02, topY - 0.17, 0.02); add(RB(0.06, 0.32, hd + 0.04, 0.03), hw / 2 + 0.02, topY - 0.17, 0.02); add(RB(hw + 0.04, 0.32, 0.06, 0.03), 0, topY - 0.17, hd / 2 + 0.02);
        break;
      case 'hair_long':
        cap(); add(RB(hw + 0.04, 0.55, 0.08, 0.03), 0, topY - 0.28, hd / 2 + 0.03);
        add(RB(0.06, 0.3, 0.3, 0.03), -hw / 2 - 0.02, topY - 0.15, 0.06); add(RB(0.06, 0.3, 0.3, 0.03), hw / 2 + 0.02, topY - 0.15, 0.06);
        break;
      case 'hair_ponytail':
        cap(); add(G('tail', () => new THREE.CylinderGeometry(0.05, 0.035, 0.36, 8)), 0, topY - 0.16, hd / 2 + 0.09, 0.4);
        break;
      case 'hair_afro': add(G('afro', () => new THREE.SphereGeometry(0.34, 16, 12)), 0, topY + 0.02, 0.04).scale.set(1, 0.85, 1); break;
      case 'hair_swoop':
        cap(); add(RB(hw * 0.7, 0.1, 0.22, 0.04), 0.07, topY + 0.04, -hd / 2 + 0.06, -0.4, 0, -0.25);
        break;
      case 'hair_buns':
        cap(); add(G('bun', () => new THREE.SphereGeometry(0.1, 12, 10)), -0.16, topY + 0.07, 0.02); add(G('bun', () => new THREE.SphereGeometry(0.1, 12, 10)), 0.16, topY + 0.07, 0.02);
        break;
      case 'hair_flame':
        cap();
        for (let i = 0; i < 6; i++) add(G('flame', () => new THREE.ConeGeometry(0.08, 0.28, 5)), -0.17 + (i % 3) * 0.17, topY + 0.14, i < 3 ? -0.05 : 0.1, 0.2, i, 0);
        break;
      default: cap();
    }
  }

  _buildHat(head, a, hw, hd, topY) {
    const id = a.hat;
    if (!id || id === 'hat_none') return;
    const acc = a.accentColor;
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); head.add(mesh); return mesh; };
    switch (id) {
      case 'hat_cap': {
        const m = std(acc, 0.7);
        add(RB(hw + 0.06, 0.14, hd + 0.06, 0.06), m, 0, topY + 0.04, 0.0);
        add(BX(hw * 0.9, 0.025, 0.2), m, 0, topY - 0.01, -hd / 2 - 0.08);
        break;
      }
      case 'hat_beanie': {
        const m = std(acc, 0.9);
        add(RB(hw + 0.06, 0.2, hd + 0.06, 0.08), m, 0, topY + 0.06, 0);
        add(RB(hw + 0.08, 0.07, hd + 0.08, 0.03), std('#' + new THREE.Color(acc).multiplyScalar(0.7).getHexString(), 0.9), 0, topY - 0.02, 0);
        add(G('pom', () => new THREE.SphereGeometry(0.06, 10, 8)), m, 0, topY + 0.18, 0);
        break;
      }
      case 'hat_headphones': {
        const m = std('#1b1d22', 0.4, 0.4);
        add(G('hpband', () => new THREE.TorusGeometry(hw / 2 + 0.06, 0.025, 6, 24, Math.PI)), m, 0, topY - 0.16, 0);
        for (const s of [-1, 1]) {
          add(G('hpcup', () => new THREE.CylinderGeometry(0.1, 0.1, 0.07, 18)), m, s * (hw / 2 + 0.04), 0.22, 0, 0, 0, Math.PI / 2);
          add(G('hpring', () => new THREE.TorusGeometry(0.075, 0.012, 6, 18)), glowMat(acc, 2.5), s * (hw / 2 + 0.08), 0.22, 0, 0, Math.PI / 2, 0);
        }
        break;
      }
      case 'hat_tophat': {
        const m = std('#16171c', 0.6);
        add(G('thb', () => new THREE.CylinderGeometry(0.34, 0.34, 0.03, 24)), m, 0, topY + 0.01, 0);
        add(G('thc', () => new THREE.CylinderGeometry(0.2, 0.2, 0.34, 24)), m, 0, topY + 0.18, 0);
        add(G('thr', () => new THREE.CylinderGeometry(0.205, 0.205, 0.05, 24)), std(acc, 0.5), 0, topY + 0.06, 0);
        break;
      }
      case 'hat_crown': {
        const gold = std('#f5c040', 0.25, 1);
        add(G('crownring', () => new THREE.CylinderGeometry(0.22, 0.22, 0.1, 20, 1, true)), gold, 0, topY + 0.04, 0);
        for (let i = 0; i < 8; i++) { const ang = (i / 8) * Math.PI * 2; add(G('crownpt', () => new THREE.ConeGeometry(0.04, 0.12, 4)), gold, Math.cos(ang) * 0.2, topY + 0.14, Math.sin(ang) * 0.2); }
        for (let i = 0; i < 4; i++) { const ang = (i / 4) * Math.PI * 2 + 0.4; add(G('gem', () => new THREE.OctahedronGeometry(0.03)), glowMat(['#ff2a55', '#19e6ff', '#3dff9a', '#c36bff'][i], 2), Math.cos(ang) * 0.225, topY + 0.04, Math.sin(ang) * 0.225); }
        break;
      }
      case 'hat_horns': {
        const m = std('#e8dcc8', 0.5);
        for (const s of [-1, 1]) add(G('horn', () => new THREE.ConeGeometry(0.06, 0.24, 8)), m, s * 0.16, topY + 0.08, 0, 0, 0, -s * 0.5);
        break;
      }
      case 'hat_halo': {
        const h = add(G('halo', () => new THREE.TorusGeometry(0.2, 0.025, 8, 32)), glowMat('#fff3a0', 3), 0, topY + 0.22, 0, Math.PI / 2);
        h.userData.halo = true;
        break;
      }
      case 'hat_cat': {
        const m = std(a.hairColor, 0.7);
        for (const s of [-1, 1]) add(G('catear', () => new THREE.ConeGeometry(0.08, 0.16, 4)), m, s * 0.15, topY + 0.07, 0, 0, Math.PI / 4, -s * 0.2);
        break;
      }
      case 'hat_helmet': {
        const m = std('#3a4133', 0.7, 0.2);
        add(RB(hw + 0.08, 0.22, hd + 0.08, 0.09), m, 0, topY + 0.02, 0.01);
        add(BX(hw + 0.1, 0.05, 0.06), std('#20231d', 0.5), 0, topY - 0.06, -hd / 2 - 0.03);
        add(BX(0.05, 0.07, 0.05), glowMat(acc, 2), hw / 2 + 0.04, topY, -0.05);
        break;
      }
      case 'hat_cowboy': {
        const m = std('#7a4a28', 0.8);
        add(G('cbb', () => new THREE.CylinderGeometry(0.42, 0.42, 0.03, 24)), m, 0, topY + 0.01, 0);
        add(RB(0.36, 0.2, 0.34, 0.06), m, 0, topY + 0.1, 0);
        add(G('cbr', () => new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20)), std('#2b1d12', 0.7), 0, topY + 0.04, 0);
        break;
      }
      case 'hat_cone': {
        add(G('cone', () => new THREE.ConeGeometry(0.2, 0.42, 16)), std('#ff6a1a', 0.6), 0, topY + 0.2, 0);
        add(G('conestripe', () => new THREE.CylinderGeometry(0.13, 0.155, 0.06, 16)), std('#f4f4f4', 0.6), 0, topY + 0.16, 0);
        add(BX(0.42, 0.04, 0.42), std('#ff6a1a', 0.6), 0, topY + 0.0, 0);
        break;
      }
      case 'hat_wizard': {
        const m = std('#3b3bd6', 0.7);
        add(G('wizb', () => new THREE.CylinderGeometry(0.36, 0.36, 0.03, 24)), m, 0, topY + 0.01, 0);
        add(G('wizc', () => new THREE.ConeGeometry(0.22, 0.55, 16)), m, 0.02, topY + 0.29, 0.02, 0.1, 0, -0.1);
        for (let i = 0; i < 3; i++) add(G('wstar', () => new THREE.OctahedronGeometry(0.03)), glowMat('#ffd400', 2), -0.08 + i * 0.08, topY + 0.18 + i * 0.1, -0.15);
        break;
      }
      case 'hat_antenna': {
        add(G('antrod', () => new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6)), std('#9aa3b5', 0.3, 0.9), 0.1, topY + 0.15, 0);
        add(G('antball', () => new THREE.SphereGeometry(0.045, 10, 8)), glowMat(acc, 2.5), 0.1, topY + 0.32, 0);
        break;
      }
      case 'hat_neonband': {
        add(RB(hw + 0.05, 0.06, hd + 0.05, 0.025), glowMat(acc, 2.2), 0, topY - 0.07, 0);
        break;
      }
      default: break;
    }
  }

  _buildFaceAcc(head, a, hw, hd) {
    const id = a.faceAcc;
    if (!id || id === 'faceacc_none') return;
    const fz = -hd / 2 - 0.02;
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); head.add(mesh); return mesh; };
    switch (id) {
      case 'faceacc_visor': add(RB(hw + 0.04, 0.09, 0.05, 0.02), glowMat(a.accentColor, 2.2), 0, 0.28, fz); break;
      case 'faceacc_aviators':
        for (const s of [-1, 1]) add(RB(0.13, 0.09, 0.02, 0.03), std('#1a1206', 0.05, 0.9, { emissive: new THREE.Color('#5a3a10'), emissiveIntensity: 0.4 }), s * 0.1, 0.28, fz);
        add(BX(0.08, 0.015, 0.015), std('#c9a24a', 0.3, 1), 0, 0.3, fz);
        break;
      case 'faceacc_mask':
        add(RB(0.3, 0.2, 0.12, 0.05), std('#2a2d35', 0.6, 0.2), 0, 0.14, fz + 0.03);
        for (const s of [-1, 1]) add(G('filter', () => new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10)), std('#4a505c', 0.4, 0.6), s * 0.13, 0.1, fz - 0.02, Math.PI / 2, 0, s * 0.4);
        break;
      case 'faceacc_bandana': add(RB(hw + 0.03, 0.16, hd * 0.6, 0.04), std(a.accentColor, 0.85), 0, 0.12, fz + hd * 0.25); break;
      case 'faceacc_patch':
        add(RB(0.1, 0.09, 0.02, 0.02), std('#0c0c0f', 0.7), 0.1, 0.29, fz);
        add(BX(hw + 0.04, 0.015, hd + 0.04), std('#0c0c0f', 0.7), 0, 0.33, 0, 0.3);
        break;
      case 'faceacc_goggles':
        for (const s of [-1, 1]) {
          add(G('gogrim', () => new THREE.CylinderGeometry(0.075, 0.075, 0.06, 16)), std('#2a2d35', 0.4, 0.6), s * 0.11, 0.29, fz - 0.01, Math.PI / 2);
          add(G('goglens', () => new THREE.CircleGeometry(0.06, 16)), glowMat(a.accentColor, 2), s * 0.11, 0.29, fz - 0.045, 0, Math.PI);
        }
        add(BX(hw + 0.05, 0.03, hd + 0.05), std('#1b1d22', 0.6), 0, 0.29, 0);
        break;
      case 'faceacc_mustache': add(RB(0.2, 0.05, 0.03, 0.02), std(a.hairColor, 0.8), 0, 0.17, fz); break;
      default: break;
    }
  }

  _buildBack(torsoPivot, a, od) {
    const id = od && od.astro ? 'back_tank' : a.back;
    if (!id || id === 'back_none') return;
    const acc = a.accentColor;
    const bz = DIMS.torsoD / 2;
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); torsoPivot.add(mesh); return mesh; };
    switch (id) {
      case 'back_pack':
        add(RB(0.46, 0.5, 0.2, 0.06), std(acc, 0.8), 0, 0.36, bz + 0.1);
        add(RB(0.36, 0.18, 0.08, 0.04), std('#1b1d22', 0.8), 0, 0.24, bz + 0.22);
        break;
      case 'back_cape': {
        const cape = add(BX(0.6, 0.95, 0.025), std(acc, 0.85, 0, { side: THREE.DoubleSide }), 0, 0.2, bz + 0.03);
        cape.geometry = G('capeGeo', () => { const g = new THREE.BoxGeometry(0.6, 0.95, 0.025); g.translate(0, -0.47, 0); return g; });
        cape.position.y = 0.66;
        this.cape = cape;
        break;
      }
      case 'back_jetpack':
        for (const s of [-1, 1]) {
          add(G('jettank', () => new THREE.CylinderGeometry(0.1, 0.1, 0.44, 14)), std('#cfd6e0', 0.3, 0.8), s * 0.12, 0.38, bz + 0.12);
          add(G('jetnoz', () => new THREE.ConeGeometry(0.08, 0.1, 12)), std('#2a2d35', 0.4, 0.7), s * 0.12, 0.12, bz + 0.12, Math.PI);
          add(G('jetflame', () => new THREE.ConeGeometry(0.06, 0.18, 10)), glowMat('#ff8a2a', 3), s * 0.12, 0.0, bz + 0.12, Math.PI);
        }
        break;
      case 'back_wings':
        for (const s of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            const w = add(BX(0.6 - i * 0.12, 0.05, 0.02), std('#cfd6e0', 0.3, 0.7), s * (0.32 + (0.3 - i * 0.06)), 0.55 - i * 0.12, bz + 0.12, 0, 0, s * (0.5 - i * 0.18));
            const e = new THREE.Mesh(BX(0.6 - i * 0.12, 0.012, 0.025), glowMat(acc, 2.5)); e.position.y = -0.03; w.add(e);
          }
        }
        break;
      case 'back_katana':
        add(BX(0.06, 0.9, 0.05), std('#16171c', 0.6), 0, 0.35, bz + 0.05, 0, 0, 0.7);
        add(BX(0.03, 0.22, 0.03), std('#b38a3a', 0.4, 0.6), -0.33, 0.72, bz + 0.05, 0, 0, 0.7);
        break;
      case 'back_guitar':
        add(RB(0.36, 0.42, 0.08, 0.1), std(acc, 0.4, 0.2), 0.05, 0.22, bz + 0.07, 0, 0, 0.5);
        add(BX(0.06, 0.55, 0.04), std('#2b1d12', 0.6), -0.14, 0.62, bz + 0.07, 0, 0, 0.5);
        break;
      case 'back_tank':
        for (const s of [-1, 1]) add(G('o2', () => new THREE.CylinderGeometry(0.11, 0.11, 0.5, 14)), std(od && od.astro ? '#e8ecf2' : '#ffb321', 0.4, 0.5), s * 0.13, 0.36, bz + 0.12);
        break;
      default: break;
    }
  }

  setAppearance(app) {
    this.app = { ...DEFAULT_AVATAR, ...app };
    this.build();
  }

  attachWeapon(id, camos) {
    this.camos = camos || {};
    if (this.weapon) { this.weapon.parent && this.weapon.parent.remove(this.weapon); this.weapon = null; }
    if (this.offhand) { this.offhand.parent && this.offhand.parent.remove(this.offhand); this.offhand = null; }
    this.weaponId = id;
    if (!id) return;
    const model = buildWeaponModel(id, this.camos[id]);
    const def = WEAPONS[id];
    const holder = new THREE.Group();
    holder.add(model);
    this.aim.add(holder);
    this.weapon = holder;
    this.weaponModel = model;
    this.hold = model.userData.hold || (def && def.kind === 'melee' ? 'sword' : 'rifle');
    if (model.userData.offhand) {
      const off = model.userData.offhand;
      model.remove(off);
      const h2 = new THREE.Group(); h2.add(off); this.aim.add(h2); this.offhand = h2;
    }
    model.traverse((o) => { if (o.isMesh) o.castShadow = this.opts.shadows !== false; });
  }

  // ───────────── animation ─────────────

  /**
   * s: { vx, vz (world), yaw, onGround, crouch, slide, pitch, ads, reloading, swing (counter), sprint, dead, emote }
   */
  update(dt, s) {
    this.t += dt;
    const sp = Math.hypot(s.vx || 0, s.vz || 0);
    const yaw = s.yaw ?? 0;
    // local movement direction
    const fwd = -(s.vx || 0) * Math.sin(yaw) - (s.vz || 0) * Math.cos(yaw);
    const right = (s.vx || 0) * Math.cos(yaw) - (s.vz || 0) * Math.sin(yaw);
    const k = (v, tgt, rate) => v + (tgt - v) * (1 - Math.exp(-rate * dt));
    this.crouchB = k(this.crouchB, s.crouch ? 1 : 0, 14);
    this.slideB = k(this.slideB, s.slide ? 1 : 0, 12);
    this.airB = k(this.airB, s.onGround === false ? 1 : 0, 10);
    this.reloadB = k(this.reloadB, s.reloading ? 1 : 0, 10);
    this.recoil = k(this.recoil, 0, 18);
    if (s.swing !== undefined && s.swing !== this.lastSwing) {
      if (this.lastSwing !== undefined) { this.swingT = 0; this.swingDir = (this.swingDir || 1) * -1; }
      this.lastSwing = s.swing;
    }
    this.swingT = Math.min(1, this.swingT + dt * 2.6);

    const moving = sp > 0.4 && s.onGround !== false;
    const stride = s.sprint ? 1.25 : 1;
    this.phase += dt * Math.min(sp, 12) * 1.55 / stride;
    const amp = moving ? Math.min(1, sp / 6) * (s.sprint ? 1.1 : 0.75) : 0;
    const sw = Math.sin(this.phase);
    const dirSign = fwd < -0.5 ? -1 : 1;
    const crouch = this.crouchB, slide = this.slideB, air = this.airB;

    // pelvis height
    const bob = moving ? Math.abs(Math.cos(this.phase)) * 0.05 * amp : Math.sin(this.t * 1.6) * 0.008;
    this.pelvis.position.y = DIMS.hipY - crouch * 0.42 - slide * 0.1 + bob;
    this.body.rotation.x = slide * -0.5;

    // legs
    const legs = this.legs;
    for (let i = 0; i < 2; i++) {
      const L = legs[i];
      const ph = i === 0 ? sw : -sw;
      let hipRot = ph * 0.75 * amp * dirSign;
      let kneeRot = Math.max(0, i === 0 ? Math.cos(this.phase) : -Math.cos(this.phase)) * 0.9 * amp;
      // crouch pose
      hipRot = hipRot * (1 - crouch * 0.6) - crouch * 1.15;
      kneeRot = kneeRot * (1 - crouch * 0.5) + crouch * 2.0;
      // air tuck
      hipRot -= air * (i === 0 ? 0.6 : 0.2);
      kneeRot += air * (i === 0 ? 0.9 : 0.4);
      // slide: one leg forward, one tucked
      if (slide > 0.01) { hipRot = hipRot * (1 - slide) + slide * (i === 0 ? -1.4 : -0.6); kneeRot = kneeRot * (1 - slide) + slide * (i === 0 ? 0.2 : 1.6); }
      // +X rotation swings a leg forward (-Z); knees bend backward (negative)
      L.hip.rotation.x = -hipRot;
      L.hip.rotation.z = right * 0.02 * (i === 0 ? 1 : -1);
      L.knee.rotation.x = -kneeRot;
    }

    // torso lean + aim
    const pitch = s.pitch || 0;
    this.torsoPivot.rotation.x = -pitch * 0.25 + (moving ? amp * 0.08 : 0) + crouch * 0.12;
    this.torsoPivot.rotation.y = moving ? Math.sin(this.phase) * 0.05 * amp : 0;
    this.aim.rotation.x = pitch * 0.75 - this.torsoPivot.rotation.x * 0.2 + this.recoil * 0.2;
    this.head.rotation.x = pitch * 0.25 + this.torsoPivot.rotation.x * -0.5;

    if (this.cape) {
      this.capeSwing = k(this.capeSwing, Math.min(1.1, sp * 0.12) + air * 0.4, 6);
      this.cape.rotation.x = this.capeSwing + Math.sin(this.t * 6) * 0.04 * (sp > 1 ? 1 : 0.3);
    }
    this.root.traverse((o) => { if (o.userData.halo) o.rotation.z += dt; });

    if (this.emote) this._emote(dt);
    else this._poseArms(s, moving, amp, sw);
  }

  playEmote(id) {
    this.emote = id;
    this.emoteT = 0;
  }

  stopEmote() {
    this.emote = null;
  }

  _emote(dt) {
    this.emoteT += dt;
    const t = this.emoteT;
    const [L, R] = this.arms;
    const reset = (a) => { a.shoulder.quaternion.identity(); a.elbow.quaternion.identity(); };
    reset(L); reset(R);
    if (this.weapon) this.weapon.visible = false;
    if (this.offhand) this.offhand.visible = false;
    this.aim.rotation.x = 0;
    const e = this.emote;
    if (e === 'emote_wave') {
      R.shoulder.rotation.set(0, 0, 2.6); R.elbow.rotation.set(0, 0, Math.sin(t * 9) * 0.5);
    } else if (e === 'emote_salute') {
      R.shoulder.rotation.set(-0.3, 0, 2.2); R.elbow.rotation.set(0, 0, 1.9);
    } else if (e === 'emote_cheer') {
      const j = Math.abs(Math.sin(t * 6));
      L.shoulder.rotation.set(0, 0, -2.8 + j * 0.2); R.shoulder.rotation.set(0, 0, 2.8 - j * 0.2);
      this.pelvis.position.y += j * 0.12;
    } else if (e === 'emote_dance') {
      const b = Math.sin(t * 8);
      this.pelvis.position.x = b * 0.08;
      this.torsoPivot.rotation.z = b * 0.15;
      L.shoulder.rotation.set(-1.2 + b * 0.6, 0, -0.6); R.shoulder.rotation.set(-1.2 - b * 0.6, 0, 0.6);
      L.elbow.rotation.x = -1.2; R.elbow.rotation.x = -1.2;
      this.legs[0].knee.rotation.x = -Math.max(0, b) * 0.6; this.legs[1].knee.rotation.x = -Math.max(0, -b) * 0.6;
    } else if (e === 'emote_robot') {
      const step = Math.floor(t * 2.5) % 4;
      const poses = [[-1.57, 0], [0, -1.57], [-1.57, -1.57], [0, 0]];
      L.shoulder.rotation.x = poses[step][0]; R.shoulder.rotation.x = poses[step][1];
      L.elbow.rotation.x = -1.4 * (step % 2); R.elbow.rotation.x = -1.4 * ((step + 1) % 2);
      this.head.rotation.y = [0.5, -0.5, 0, 0][step];
    } else if (e === 'emote_flex') {
      L.shoulder.rotation.set(0, 0, -1.5); R.shoulder.rotation.set(0, 0, 1.5);
      L.elbow.rotation.set(0, 0, -1.7 - Math.sin(t * 5) * 0.2); R.elbow.rotation.set(0, 0, 1.7 + Math.sin(t * 5) * 0.2);
    } else if (e === 'emote_spin') {
      this.root.rotation.y += dt * 9;
      L.shoulder.rotation.set(0, 0, -1.5); R.shoulder.rotation.set(0, 0, 1.5);
    } else if (e === 'emote_sit') {
      this.pelvis.position.y = 0.32;
      for (const Lg of this.legs) { Lg.hip.rotation.x = 1.5; Lg.knee.rotation.x = -1.5; }
      L.shoulder.rotation.set(-0.4, 0, -0.2); R.shoulder.rotation.set(-0.4, 0, 0.2);
    }
  }

  _ik(arm, target, pole) {
    // two-bone IK in aim-space. target/pole are Vector3 in aim-local coordinates.
    const S = arm.shoulder.position;
    const a = DIMS.upper, b = DIMS.lower - 0.03;
    tmpV.copy(target).sub(S);
    let d = tmpV.length();
    d = Math.min(Math.max(d, 0.05), a + b - 0.002);
    const dir = tmpV.normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    // pole direction perpendicular to dir
    const pv = tmpV2.copy(pole).sub(S);
    pv.addScaledVector(dir, -pv.dot(dir)).normalize();
    const elbow = new THREE.Vector3().copy(S).addScaledVector(dir, a * cosA).addScaledVector(pv, a * sinA);
    const upDir = elbow.clone().sub(S).normalize();
    arm.shoulder.quaternion.setFromUnitVectors(DOWN, upDir);
    const hand = new THREE.Vector3().copy(S).addScaledVector(dir, d);
    const loDir = hand.sub(elbow).normalize();
    tmpQ.copy(arm.shoulder.quaternion).invert();
    loDir.applyQuaternion(tmpQ);
    arm.elbow.quaternion.setFromUnitVectors(DOWN, loDir);
  }

  _poseArms(s, moving, amp, sw) {
    const [L, R] = this.arms;
    if (this.weapon) this.weapon.visible = true;
    if (this.offhand) this.offhand.visible = true;
    const hold = this.hold;
    const w = this.weapon;
    if (!w) {
      // idle arms swing
      L.shoulder.quaternion.setFromEuler(new THREE.Euler(sw * 0.6 * amp, 0, -0.08));
      R.shoulder.quaternion.setFromEuler(new THREE.Euler(-sw * 0.6 * amp, 0, 0.08));
      L.elbow.rotation.set(-0.2 - amp * 0.3, 0, 0); R.elbow.rotation.set(-0.2 - amp * 0.3, 0, 0);
      return;
    }
    const m = this.weaponModel;
    const sprint = s.sprint ? 1 : 0;
    const reload = this.reloadB;
    if (hold === 'rifle' || hold === 'smg' || hold === 'heavy') {
      // gun held at chest height, pointing forward (-Z)
      w.position.set(0.16, -0.12 + sprint * -0.08, -0.35 + this.recoil * 0.06);
      w.rotation.set(sprint * -0.5 + reload * -0.35, sprint * 0.6, sprint * 0.2 + reload * 0.4);
      w.updateMatrix();
      const grip = new THREE.Vector3(0, -0.04, 0.02).applyMatrix4(w.matrix);
      const fore = (m.userData.leftHand ? m.userData.leftHand.clone() : new THREE.Vector3(0, -0.02, -0.3)).applyMatrix4(w.matrix);
      if (reload > 0.3) fore.set(0.0, -0.32, -0.25);
      this._ik(R, grip, new THREE.Vector3(0.9, -0.6, 0.4));
      this._ik(L, fore, new THREE.Vector3(-0.9, -0.8, 0.2));
    } else if (hold === 'pistol') {
      w.position.set(0.04, -0.06 + sprint * -0.2, -0.52 + this.recoil * 0.05);
      w.rotation.set(sprint * -0.9 + reload * -0.5, 0, 0);
      w.updateMatrix();
      const grip = new THREE.Vector3(0, -0.05, 0.02).applyMatrix4(w.matrix);
      const sup = grip.clone().add(new THREE.Vector3(-0.07, -0.02, 0.03));
      this._ik(R, grip, new THREE.Vector3(1, -0.5, 0.3));
      this._ik(L, sup, new THREE.Vector3(-1, -0.6, 0.3));
    } else {
      // melee holds with swing animation
      const st = this.swingT;
      const swingK = st < 1 ? Math.sin(Math.min(1, st * 1.4) * Math.PI) : 0;
      const dir = this.swingDir || 1;
      const base = new THREE.Vector3(0.28, -0.28, -0.32);
      const hand = base.clone();
      hand.x += -dir * swingK * 0.45;
      hand.y += swingK * 0.18;
      hand.z += -swingK * 0.25;
      w.position.copy(hand);
      w.rotation.set(-1.1 + swingK * 0.6, 0, -0.3 + dir * swingK * 1.6);
      this._ik(R, hand, new THREE.Vector3(1, -0.6, 0.4));
      if (this.offhand) {
        const h2 = new THREE.Vector3(-0.28 + dir * swingK * 0.3, -0.3 + swingK * 0.1, -0.3);
        this.offhand.position.copy(h2);
        this.offhand.rotation.set(-1.1, 0, 0.3);
        this._ik(L, h2, new THREE.Vector3(-1, -0.6, 0.4));
      } else {
        L.shoulder.quaternion.setFromEuler(new THREE.Euler(sw * 0.5 * amp - 0.2, 0, -0.15));
        L.elbow.rotation.set(-0.4, 0, 0);
      }
    }
  }

  triggerRecoil(k = 1) {
    this.recoil = Math.min(1.5, this.recoil + k);
  }

  /** Detaches all visible meshes as world-space debris for a break-apart death. */
  breakApart(impulseDir, scene) {
    this.root.updateMatrixWorld(true);
    const pieces = [];
    const parts = [this.headMesh, this.torso, ...this.arms.flatMap((a) => [a.upper, a.lower]), ...this.legs.flatMap((l) => [l.thigh, l.shin])];
    if (this.weapon) parts.push(this.weaponModel);
    for (const p of parts) {
      if (!p) continue;
      const wm = p.matrixWorld.clone();
      const clone = p.clone();
      wm.decompose(clone.position, clone.quaternion, clone.scale);
      scene.add(clone);
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3);
      if (impulseDir) v.addScaledVector(impulseDir, 3 + Math.random() * 3);
      pieces.push({ obj: clone, v, w: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10) });
    }
    return pieces;
  }

  dispose() {
    this.root.removeFromParent();
  }
}

export const AVATAR_DIMS = DIMS;
