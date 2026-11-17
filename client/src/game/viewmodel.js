// First-person viewmodel: blocky arms holding the current weapon, with
// procedural animation (ADS, sway, bob, sprint, recoil springs, reloads,
// equips, melee swings, inspect, charge/spin effects).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildWeaponModel } from '../engine/weaponmodels.js';
import { WEAPONS } from '../../../shared/weapons.js';
import { getItem } from '../../../shared/items.js';
import { radialGlowTexture } from '../engine/textures.js';

const HOLD_POS = {
  rifle: new THREE.Vector3(0.17, -0.2, -0.5),
  smg: new THREE.Vector3(0.16, -0.185, -0.45),
  heavy: new THREE.Vector3(0.19, -0.23, -0.55),
  pistol: new THREE.Vector3(0.14, -0.17, -0.42),
  knife: new THREE.Vector3(0.2, -0.16, -0.36),
  dual: new THREE.Vector3(0.2, -0.16, -0.36),
  sword: new THREE.Vector3(0.24, -0.22, -0.4),
  axe: new THREE.Vector3(0.24, -0.24, -0.4),
  scythe: new THREE.Vector3(0.26, -0.27, -0.42),
};

const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));

class Spring {
  constructor(k = 180, d = 18) { this.k = k; this.d = d; this.x = 0; this.v = 0; }
  kick(v) { this.v += v; }
  update(dt) {
    const steps = Math.ceil(dt / 0.004);
    const h = dt / steps;
    for (let i = 0; i < steps; i++) { const a = -this.k * this.x - this.d * this.v; this.v += a * h; this.x += this.v * h; }
  }
}

export class Viewmodel {
  constructor(appearance, camos = {}) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 10);
    this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 1.8);
    this.sun.position.set(0.5, 1, 0.3);
    this.scene.add(this.sun);
    this.root = new THREE.Group();
    this.camera.add(this.root);
    this.weaponPivot = new THREE.Group();
    this.root.add(this.weaponPivot);
    this.camos = camos;
    this.appearance = appearance;
    this.armMats = null;
    this._buildArms();
    this.recoilZ = new Spring(260, 22);
    this.recoilRX = new Spring(220, 18);
    this.recoilRY = new Spring(200, 18);
    this.landSpring = new Spring(120, 12);
    this.swayX = 0; this.swayY = 0;
    this.bobPhase = 0;
    this.sprintB = 0;
    this.adsT = 0;
    this.equipT = 1;
    this.equipDur = 0.4;
    this.reload = null;
    this.swing = null;
    this.inspectT = -1;
    this.cycle = null;
    this.flash = this._makeFlash();
    this.trail = this._makeTrail();
    this.weaponId = null;
    this.visible = true;
  }

  _buildArms() {
    const a = this.appearance || {};
    const outfit = getItem(a.outfit);
    const od = outfit && outfit.id !== 'outfit_none' ? outfit.data : null;
    const skin = od && od.skin ? od.skin : a.skinTone || '#eab68c';
    const sleeve = od ? od.body : a.shirtColor || '#19e6ff';
    const shortSleeve = !od && (a.shirt === 'shirt_tee' || a.shirt === 'shirt_tank' || a.shirt === 'shirt_stripes');
    const sleeveCol = new THREE.Color(sleeve).multiplyScalar(0.72);
    const sleeveM = new THREE.MeshStandardMaterial({ color: sleeveCol, roughness: 0.9 });
    const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6, metalness: od && od.metal ? 0.9 : 0 });
    this.arms = [-1, 1].map((s) => {
      const g = new THREE.Group();
      const fore = new THREE.Mesh(new RoundedBoxGeometry(0.062, 0.062, 0.36, 2, 0.014), shortSleeve ? skinM : sleeveM);
      fore.position.z = 0.21;
      g.add(fore);
      const cuff = new THREE.Mesh(new RoundedBoxGeometry(0.068, 0.068, 0.045, 2, 0.012), shortSleeve ? sleeveM : new THREE.MeshStandardMaterial({ color: od ? od.trim : a.accentColor || '#ff2fa6', roughness: 0.6 }));
      cuff.position.z = shortSleeve ? 0.36 : 0.055;
      g.add(cuff);
      const hand = new THREE.Mesh(new RoundedBoxGeometry(0.058, 0.058, 0.075, 2, 0.018), skinM);
      hand.position.z = 0.0;
      g.add(hand);
      g.userData.side = s;
      this.root.add(g);
      return g;
    });
  }

  setAppearance(app) {
    this.appearance = app;
    for (const a of this.arms) this.root.remove(a);
    this._buildArms();
  }

  _makeFlash() {
    const tex = radialGlowTexture();
    const g = new THREE.Group();
    const m = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color('#ffd27a').multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const s = new THREE.Sprite(m); s.scale.setScalar(0.22); g.add(s);
    const starGeo = new THREE.PlaneGeometry(0.34, 0.07);
    const starMat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color('#ffcc66').multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(starGeo, starMat); p.rotation.z = (i / 3) * Math.PI; g.add(p); }
    const side = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.32), starMat); side.rotation.x = Math.PI / 2; side.position.z = -0.1; g.add(side);
    g.visible = false;
    g.userData.t = 1;
    g.userData.mats = [m, starMat];
    return g;
  }

  _makeTrail() {
    const N = 24;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 2 * 3);
    const alpha = new Float32Array(N * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color('#ffffff') } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color * 2.5, vA * 0.75); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    this.camera.add(mesh);
    return { mesh, N, pts: [], active: false };
  }

  setEnvironment(env, theme) {
    this.scene.environment = env;
    if (theme) {
      this.hemi.color.set(theme.hemi.sky); this.hemi.groundColor.set(theme.hemi.ground);
      this.hemi.intensity = Math.min(1.3, theme.hemi.intensity * 0.9 + 0.2);
      this.sun.color.set(theme.sun.color);
      this.sun.intensity = Math.min(1.6, theme.sun.intensity * 0.55 + 0.3);
    }
  }

  setWeapon(id, equipTime = 0.4) {
    if (this.weapon) { this.weaponPivot.remove(this.weapon); }
    this.weaponId = id;
    const def = WEAPONS[id];
    const model = buildWeaponModel(id, this.camos[id]);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    this.weapon = model;
    this.def = def;
    this.hold = model.userData.hold || 'rifle';
    this.isMelee = def.kind === 'melee';
    if (this.isMelee) {
      // melee: blade up and forward, leaning out to the right
      model.rotation.set(-1.0, 0.3, -0.4);
    } else {
      model.rotation.set(0, 0, 0);
    }
    this.weaponPivot.add(model);
    if (model.userData.offhand) {
      this.offhand = model.userData.offhand;
      model.remove(this.offhand);
      this.root.add(this.offhand);
    } else if (this.offhand) {
      this.root.remove(this.offhand);
      this.offhand = null;
    }
    this.equipT = 0;
    this.equipDur = Math.max(0.15, equipTime);
    this.reload = null;
    this.swing = null;
    this.inspectT = -1;
    this.cycle = null;
    this.flash.removeFromParent();
    const mz = model.userData.muzzle;
    if (mz) mz.add(this.flash);
    this.trail.mesh.material.uniforms.color.value.set(def.trail || '#ffffff');
    this.basePos = HOLD_POS[this.hold] || HOLD_POS.rifle;
  }

  // ───────────── events ─────────────
  fire(def) {
    const r = def.recoil;
    const k = def.kind === 'gun' ? r.kick : 0.05;
    this.recoilZ.kick(k * 9);
    this.recoilRX.kick(k * 26 * (1 - 0.5 * this.adsT));
    this.recoilRY.kick((Math.random() - 0.5) * k * 10);
    if (!def.suppressed) {
      this.flash.visible = true;
      this.flash.userData.t = 0;
      this.flash.rotation.z = Math.random() * Math.PI;
      const s = def.cls === 'SHOTGUN' ? 1.6 : def.cls === 'PISTOL' ? 0.8 : def.cls === 'SNIPER' ? 1.5 : 1;
      this.flash.scale.setScalar(s * (0.85 + Math.random() * 0.3));
      const c = new THREE.Color(def.energy ? def.tracer : '#ffc870').multiplyScalar(4);
      for (const m of this.flash.userData.mats) m.color.copy(c);
    }
    const slide = this.weapon && this.weapon.userData.slide;
    if (slide) { slide.userData.kick = 1; }
    const cyl = this.weapon && this.weapon.userData.cylinder;
    if (cyl) cyl.userData.turn = (cyl.userData.turn || 0) + Math.PI / 3;
  }

  startReload(def, empty) {
    let dur = def.shell ? def.shell.start + def.shell.each : (empty ? def.reloadEmpty : def.reload);
    this.reload = { t: 0, dur, def, empty, shell: !!def.shell };
    this.inspectT = -1;
  }

  shellInserted() {
    if (this.reload && this.reload.shell) { this.reload.t = this.reload.def.shell.start; this.reload.dur = this.reload.def.shell.start + this.reload.def.shell.each; this.reload.pulse = 0; }
  }

  endReload() {
    if (this.reload) this.reload.ending = true;
  }

  cycleAction(kind, dur) {
    this.cycle = { kind, t: 0, dur };
  }

  meleeSwing(def, idx) {
    this.swing = { t: 0, dur: def.swing, def, idx, anim: def.anim };
    this.trail.pts = [];
    this.trail.active = true;
  }

  inspect() {
    if (this.reload || this.swing) return;
    this.inspectT = 0;
  }

  land(v) {
    this.landSpring.kick(Math.min(3, v * 0.25));
  }

  // ───────────── per frame ─────────────
  /**
   * s: { dt, adsT, sprint, speed, onGround, crouched, sliding, lookDX, lookDY, chargeT, spin, scoped }
   */
  update(dt, s) {
    if (!this.weapon) return;
    const def = this.def;
    this.adsT = s.adsT;
    const k = (v, t, r) => v + (t - v) * (1 - Math.exp(-r * dt));
    this.sprintB = k(this.sprintB, s.sprint ? 1 : 0, 10);
    this.swayX = k(this.swayX, -s.lookDX * 0.0006, 9);
    this.swayY = k(this.swayY, s.lookDY * 0.0006, 9);
    this.swayX = Math.max(-0.04, Math.min(0.04, this.swayX));
    this.swayY = Math.max(-0.04, Math.min(0.04, this.swayY));
    this.recoilZ.update(dt); this.recoilRX.update(dt); this.recoilRY.update(dt); this.landSpring.update(dt);
    if (s.onGround && s.speed > 0.5) this.bobPhase += dt * Math.min(s.speed, 11) * 1.25;
    const bobAmp = s.onGround ? Math.min(1, s.speed / 6.4) * (1 - this.adsT * 0.85) * (s.bob ?? 1) : 0;
    this.equipT = Math.min(1, this.equipT + dt / this.equipDur);

    // base pose
    const ads = ease(this.adsT);
    const base = this.basePos;
    const sightY = this.weapon.userData.sightY ?? 0.08;
    const sightZ = this.weapon.userData.sightZ ?? -0.06;
    const adsPos = new THREE.Vector3(0, -sightY, -0.3 - sightZ * 0.25);
    if (this.baseFov) {
      const f = this.baseFov * (1 - 0.22 * ads);
      if (Math.abs(this.camera.fov - f) > 0.05) { this.camera.fov = f; this.camera.updateProjectionMatrix(); }
    }
    const pos = new THREE.Vector3().lerpVectors(base, adsPos, ads);
    const rot = new THREE.Euler(0, 0, 0, 'YXZ');
    // breathing / idle
    const tNow = performance.now() * 0.001;
    pos.x += Math.sin(tNow * 1.3) * 0.002 * (1 - ads);
    pos.y += Math.sin(tNow * 1.9) * 0.002 * (1 - ads * 0.7);
    // bob
    pos.x += Math.sin(this.bobPhase) * 0.014 * bobAmp;
    pos.y += -Math.abs(Math.cos(this.bobPhase)) * 0.012 * bobAmp;
    rot.z += Math.sin(this.bobPhase) * 0.02 * bobAmp;
    // sway
    pos.x += this.swayX * (1 - ads * 0.7);
    pos.y += this.swayY * (1 - ads * 0.7);
    rot.y += this.swayX * 2.2 * (1 - ads * 0.8);
    rot.x += this.swayY * 2.0 * (1 - ads * 0.8);
    // sprint pose
    const sp = this.sprintB * (1 - ads);
    if (this.isMelee) { pos.y += -0.03 * sp; rot.x += 0.25 * sp; }
    else { pos.x += -0.04 * sp; pos.y += -0.05 * sp; pos.z += 0.03 * sp; rot.x += -0.32 * sp; rot.y += 0.65 * sp; rot.z += 0.35 * sp; }
    // crouch/slide tilt
    if (s.sliding) rot.z += 0.18;
    // landing
    pos.y -= this.landSpring.x * 0.03;
    // recoil
    pos.z += this.recoilZ.x * 0.01;
    rot.x += this.recoilRX.x * 0.01;
    rot.y += this.recoilRY.x * 0.01;
    // equip raise
    const e = ease(this.equipT);
    pos.y -= (1 - e) * 0.28;
    rot.x -= (1 - e) * 0.9;

    // reload timeline
    const model = this.weapon;
    const mag = model.userData.mag;
    if (mag) { mag.position.copy(mag.userData.home || (mag.userData.home = mag.position.clone())); mag.visible = true; }
    const brk = model.userData.breakAction;
    if (brk) brk.rotation.x = 0;
    if (this.reload) {
      const r = this.reload;
      r.t += dt;
      if (r.ending && r.t >= r.dur) this.reload = null;
      const n = Math.min(1, r.t / r.dur);
      if (r.shell) {
        const tilt = ease(Math.min(1, r.t / 0.25));
        rot.z += 0.35 * tilt; rot.x += 0.25 * tilt; pos.y -= 0.03 * tilt;
        const ph = (r.t - r.def.shell.start) / r.def.shell.each;
        if (ph > 0) pos.z += bump(ph % 1, 0.2, 0.8) * 0.03;
        if (r.ending) { this.reload = null; }
      } else if (brk) {
        const open = bump(n, 0.05, 0.95);
        brk.rotation.x = -open * 0.7;
        rot.x += open * 0.35; rot.z += open * 0.2;
      } else if (model.userData.cylinder) {
        rot.z += bump(n, 0.05, 0.95) * 0.9; rot.x += bump(n, 0.05, 0.95) * 0.3;
        model.userData.cylinder.position.x = -bump(n, 0.1, 0.85) * 0.03;
      } else {
        const tilt = bump(n, 0.0, 1.0);
        rot.z += tilt * 0.55; rot.x += tilt * 0.25; pos.y -= tilt * 0.03; pos.x -= tilt * 0.02;
        if (mag) {
          const out = n < 0.45 ? ease((n - 0.12) / 0.2) : 1 - ease((n - 0.5) / 0.22);
          mag.position.y = mag.userData.home.y - out * 0.3;
          mag.position.z = mag.userData.home.z + out * 0.05;
          mag.visible = !(n > 0.33 && n < 0.45);
        }
        if (r.empty && n > 0.78) { pos.z += bump(n, 0.8, 0.98) * 0.04; rot.y += bump(n, 0.8, 0.98) * 0.15; }
      }
    }
    // pump / bolt cycling after a shot
    if (this.cycle) {
      const c = this.cycle;
      c.t += dt;
      const n = c.t / c.dur;
      if (n >= 1) this.cycle = null;
      else if (c.kind === 'pump' && model.userData.pump) {
        const p = model.userData.pump;
        p.position.z = (p.userData.home || (p.userData.home = p.position.z)) + bump(n, 0.15, 0.75) * 0.1;
        rot.x += bump(n, 0.1, 0.8) * 0.08;
      } else if (c.kind === 'bolt' && model.userData.bolt) {
        const b = model.userData.bolt;
        b.rotation.z = -bump(n, 0.1, 0.9) * 1.2;
        b.position.z = (b.userData.home ?? (b.userData.home = b.position.z)) + bump(n, 0.3, 0.7) * 0.06;
        rot.z += bump(n, 0.05, 0.95) * 0.2; pos.y -= bump(n, 0.05, 0.95) * 0.02;
      }
    }
    // slide kick
    const slide = model.userData.slide;
    if (slide) {
      slide.userData.kick = Math.max(0, (slide.userData.kick || 0) - dt * 14);
      slide.position.z = (slide.userData.home ?? (slide.userData.home = slide.position.z)) + slide.userData.kick * 0.035;
    }
    const cyl = model.userData.cylinder;
    if (cyl) { cyl.rotation.z = k(cyl.rotation.z, cyl.userData.turn || 0, 20); }
    // minigun spin
    if (model.userData.spinner) model.userData.spinner.rotation.z += dt * (s.spin || 0) * 45;
    // railgun charge
    const arc = model.getObjectByName('arc');
    if (arc) { const c = s.chargeT || 0; arc.scale.set(1 + c * 3, 1 + c * 0.5, 1); pos.x += (Math.random() - 0.5) * c * 0.004; pos.y += (Math.random() - 0.5) * c * 0.004; }

    // inspect
    if (this.inspectT >= 0) {
      this.inspectT += dt;
      const n = this.inspectT / 2.6;
      if (n >= 1 || ads > 0.1 || s.sprint) this.inspectT = -1;
      else {
        const a = bump(n, 0, 1);
        rot.y += a * 1.1; rot.z += a * 0.5; rot.x += Math.sin(n * Math.PI * 2) * 0.15;
        pos.x -= a * 0.08; pos.y += a * 0.04;
      }
    }

    // melee swing animation
    const swingOff = this._swingPose(dt, pos, rot);

    this.weaponPivot.position.copy(pos);
    this.weaponPivot.rotation.copy(rot);
    if (swingOff) this.weaponPivot.rotation.z += 0;

    // scoped: hide viewmodel
    const hide = s.scoped && !this.isMelee;
    this.weaponPivot.visible = !hide;
    for (const a of this.arms) a.visible = !hide;
    if (this.offhand) this.offhand.visible = !hide;

    this._poseArms();

    // flash fade
    const f = this.flash;
    if (f.visible) {
      f.userData.t += dt;
      if (f.userData.t > 0.045) f.visible = false;
    }
    this._updateTrail(dt);
  }

  _swingPose(dt, pos, rot) {
    if (!this.swing) return false;
    const sw = this.swing;
    sw.t += dt;
    const n = Math.min(1, sw.t / sw.dur);
    const hitN = sw.def.hitDelay / sw.dur;
    // wind-up (0..hitN*0.6), strike (..hitN*1.4), recover
    const wind = ease(Math.min(1, n / Math.max(0.05, hitN * 0.7)));
    const strike = ease((n - hitN * 0.6) / Math.max(0.05, hitN * 0.9));
    const rec = ease((n - hitN * 1.6) / Math.max(0.1, 1 - hitN * 1.6));
    const alt = sw.idx % 2 === 0 ? 1 : -1;
    const anim = sw.anim;
    const amt = (a) => a * (1 - rec);
    if (anim === 'slash' || anim === 'hook') {
      pos.x += amt(wind * 0.12 - strike * 0.32) * alt;
      pos.y += amt(wind * 0.06 - strike * 0.02);
      pos.z += amt(-strike * 0.08);
      rot.y += amt(wind * 0.6 - strike * 1.4) * alt;
      rot.z += amt(wind * 0.5 - strike * 1.1) * alt;
    } else if (anim === 'dual') {
      const off = this.offhand;
      if (alt > 0) { pos.z += amt(-strike * 0.22 + wind * 0.05); pos.x += amt(-strike * 0.06); rot.x += amt(-strike * 0.6); }
      else if (off) off.userData.stab = amt(strike);
    } else if (anim === 'wide') {
      pos.x += amt(wind * 0.2 - strike * 0.45) * alt;
      pos.y += amt(wind * 0.14 - strike * 0.1);
      pos.z += amt(-strike * 0.1);
      rot.z += amt(wind * 0.9 - strike * 2.0) * alt;
      rot.y += amt(wind * 0.4 - strike * 1.0) * alt;
    } else if (anim === 'chop' || anim === 'overhead') {
      const big = anim === 'overhead' ? 1.4 : 1;
      pos.y += amt(wind * 0.18 * big - strike * 0.3 * big);
      pos.x += amt(-wind * 0.08);
      rot.x += amt(wind * 0.9 * big - strike * 1.7 * big);
      pos.z += amt(-strike * 0.08);
    } else if (anim === 'thrust') {
      pos.z += amt(wind * 0.08 - strike * 0.3);
      pos.x += amt(-strike * 0.1);
      rot.x += amt(-strike * 0.9);
      rot.z += amt(strike * 0.4);
    } else if (anim === 'spin') {
      pos.x += amt(wind * 0.3 - strike * 0.6);
      pos.y += amt(wind * 0.1);
      rot.z += amt(wind * 1.2 - strike * 2.6);
      rot.y += amt(-strike * 1.2);
    }
    if (n >= 1) { this.swing = null; this.trail.active = false; }
    return true;
  }

  _poseArms() {
    const model = this.weapon;
    this.weaponPivot.updateMatrixWorld(true);
    this.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const gripW = new THREE.Vector3(0, -0.035, 0.02).applyMatrix4(model.matrixWorld);
    const gripL = gripW.clone().applyMatrix4(inv);
    const [L, R] = this.arms;
    this._aimArm(R, gripL, new THREE.Vector3(0.34, -0.62, 0.1));
    if (this.isMelee) {
      if (this.offhand) {
        const st = this.offhand.userData.stab || 0;
        const p = new THREE.Vector3(-0.2 + st * 0.06, -0.16 + st * 0.02, -0.34 - st * 0.22);
        p.x += this.weaponPivot.position.x * 0 - 0;
        this.offhand.position.copy(p);
        this.offhand.rotation.set(-1.0 - st * 0.6, -0.3, 0.4);
        this._aimArm(L, p.clone().add(new THREE.Vector3(0, -0.03, 0.02)), new THREE.Vector3(-0.32, -0.42, 0.32));
        L.visible = true;
      } else {
        const heavy = this.hold === 'axe' || this.hold === 'scythe';
        if (heavy) {
          const lh = new THREE.Vector3(0, -0.05, 0.16).applyMatrix4(model.matrixWorld).applyMatrix4(inv);
          this._aimArm(L, lh, new THREE.Vector3(-0.3, -0.45, 0.3));
          L.visible = true;
        } else L.visible = false;
      }
      return;
    }
    L.visible = true;
    const lh = (model.userData.leftHand || new THREE.Vector3(0, -0.02, -0.3)).clone();
    let leftW = lh.applyMatrix4(model.matrixWorld).applyMatrix4(inv);
    if (this.reload && !this.reload.shell && model.userData.mag) {
      // left hand goes to the magazine during mag swaps
      const n = Math.min(1, this.reload.t / this.reload.dur);
      const magW = new THREE.Vector3().setFromMatrixPosition(model.userData.mag.matrixWorld).applyMatrix4(inv);
      const blend = bump(n, 0.08, 0.85);
      leftW = leftW.lerp(magW.add(new THREE.Vector3(-0.02, -0.04, 0)), blend);
    }
    this._aimArm(L, leftW, new THREE.Vector3(-0.22, -0.66, 0.05));
  }

  _aimArm(arm, handPos, elbowHint) {
    arm.position.copy(handPos);
    const dir = elbowHint.clone().sub(handPos).normalize();
    // forearm extends from hand toward elbow along +Z of the arm group
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    arm.quaternion.copy(q);
  }

  _updateTrail(dt) {
    const tr = this.trail;
    const geo = tr.mesh.geometry;
    const pos = geo.attributes.position, alpha = geo.attributes.alpha;
    if (tr.active && this.weapon) {
      const len = this.weapon.userData.len || 0.4;
      const base = new THREE.Vector3(0, 0.05, 0).applyMatrix4(this.weapon.matrixWorld);
      const tip = new THREE.Vector3(0, Math.min(1.1, len), 0).applyMatrix4(this.weapon.matrixWorld);
      const inv = new THREE.Matrix4().copy(this.camera.matrixWorld).invert();
      base.applyMatrix4(inv); tip.applyMatrix4(inv);
      tr.pts.unshift([base, tip, 1]);
      if (tr.pts.length > tr.N) tr.pts.pop();
    }
    for (const p of tr.pts) p[2] -= dt * 4;
    while (tr.pts.length && tr.pts[tr.pts.length - 1][2] <= 0) tr.pts.pop();
    for (let i = 0; i < tr.N; i++) {
      const p = tr.pts[Math.min(i, tr.pts.length - 1)];
      if (!p) { alpha.setX(i * 2, 0); alpha.setX(i * 2 + 1, 0); continue; }
      pos.setXYZ(i * 2, p[0].x, p[0].y, p[0].z);
      pos.setXYZ(i * 2 + 1, p[1].x, p[1].y, p[1].z);
      const a = i < tr.pts.length ? Math.max(0, p[2]) * (1 - i / tr.N) : 0;
      alpha.setX(i * 2, a * 0.2); alpha.setX(i * 2 + 1, a);
    }
    pos.needsUpdate = true; alpha.needsUpdate = true;
    tr.mesh.visible = tr.pts.length > 1;
  }

  /** World position where the viewmodel muzzle appears on screen (accounts for the different FOVs). */
  muzzleWorld(worldCamera) {
    const m = this.weapon && this.weapon.userData.muzzle;
    const local = new THREE.Vector3(0.15, -0.12, -0.6);
    if (m) {
      m.updateMatrixWorld(true);
      local.setFromMatrixPosition(m.matrixWorld).applyMatrix4(new THREE.Matrix4().copy(this.camera.matrixWorld).invert());
    }
    const dist = local.length();
    const ndc = local.clone().applyMatrix4(this.camera.projectionMatrix);
    const dir = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(worldCamera).sub(worldCamera.position).normalize();
    return worldCamera.position.clone().addScaledVector(dir, dist * 1.6);
  }

  setFov(fovDeg) {
    this.baseFov = fovDeg;
    this.camera.fov = fovDeg;
    this.camera.updateProjectionMatrix();
  }
}
