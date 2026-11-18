// Interactive 3D lobby: walk around the hangar, see other players, emote and
// use stations (with smooth camera flights to each one).
import * as THREE from 'three';
import { buildLobby, STATIONS } from '../../../shared/maps/lobby.js';
import { CollisionWorld, stepMovement } from '../../../shared/physics.js';
import { BTN, LOBBY } from '../../../shared/config.js';
import { GUNS, MELEE } from '../../../shared/weapons.js';
import { itemsByCat } from '../../../shared/items.js';
import { buildMapScene } from '../engine/mapbuilder.js';
import { Avatar } from '../engine/avatar.js';
import { buildWeaponModel } from '../engine/weaponmodels.js';
import { textTexture, radialGlowTexture } from '../engine/textures.js';
import { input } from '../input.js';
import { net } from '../net.js';
import { S } from '../state.js';
import { audio } from '../engine/audio.js';

function makeTag(name, level, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.font = 'italic 800 54px "Exo 2", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 9; x.strokeStyle = 'rgba(0,0,0,0.7)';
  x.strokeText(name, 256, 70);
  x.fillStyle = color; x.fillText(name, 256, 70);
  x.font = 'italic 800 30px "Chakra Petch", sans-serif';
  x.fillStyle = '#19e6ff'; x.fillText(`LV ${level}`, 256, 22);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(1.8, 0.45, 1);
  s.position.y = 2.35;
  return s;
}

export class LobbyScene {
  constructor(app) {
    this.app = app;
    this.engine = app.engine;
    const q = this.engine.quality;
    this.map = buildLobby();
    this.world = new CollisionWorld(this.map.boxes);
    this.built = buildMapScene(this.map, this.world, this.engine, q);
    this.scene = this.built.scene;
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(0, 3, 12);
    this.scene.add(this.camera);
    this.me = { x: 0, y: 0.3, z: 7.5, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: false, crouched: false, sliding: false, sprinting: false, slideT: 0, slideCd: 0, padCd: 0, jumpBuf: 0, jumpHeld: false, crouchHeld: false };
    this.camYaw = 0;
    this.camPitch = -0.18;
    this.camDist = 5.2;
    this.focus = null;
    this.focusT = 0;
    this.camPos = this.camera.position.clone();
    this.camLook = new THREE.Vector3(0, 1.5, 6);
    this.others = new Map();
    this.sendT = 0;
    this.lastSent = '';
    this.ev = {};
    this.time = 0;
    const prof = S.profile.value;
    this.avatar = new Avatar(prof ? prof.avatar : undefined, { shadows: q.shadows > 0 });
    this.scene.add(this.avatar.root);
    this.tag = makeTag(prof ? prof.username : '', prof ? prof.level : 1, '#ffffff');
    this.avatar.root.add(this.tag);
    this._buildStations(q);
    this._bindPointer();
    this.offs = [
      net.on('lobby.state', (m) => this.setPlayers(m)),
      net.on('lobby.add', (m) => this._addOther(m.p)),
      net.on('lobby.remove', (m) => this._removeOther(m.id)),
      net.on('lobby.moves', (m) => { for (const [id, x, y, z, yaw, a] of m.l) { const o = this.others.get(id); if (o) { o.tx = x; o.ty = y; o.tz = z; o.tyaw = yaw; o.anim = a; } } }),
      net.on('lobby.emote', (m) => { const o = this.others.get(m.id); if (o) { o.avatar.playEmote(m.e); o.emoteT = 4; } }),
      net.on('lobby.avatar', (m) => { const o = this.others.get(m.id); if (o) { o.avatar.setAppearance(m.avatar); o.avatar.root.remove(o.tag); o.tag = makeTag(m.name, m.level); o.avatar.root.add(o.tag); } }),
    ];
    this.unInput = input.on((type, code) => this._key(type, code));
  }

  activate() {
    this.engine.setView(this.scene, this.camera);
    this.engine.exposure = this.map.theme.exposure || 1;
    this.engine.setBloom(0.42, 0.45, 0.9);
  }

  // ───────────── stations ─────────────
  _buildStations(q) {
    const sc = this.scene;
    const glowTex = radialGlowTexture();
    this.anim = [];
    // DEPLOY gate: big ring with energy field
    const gate = new THREE.Group();
    gate.position.set(0, 0.35, -17.5);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.28, 16, 72), new THREE.MeshStandardMaterial({ color: '#20243a', metalness: 0.9, roughness: 0.25 }));
    ring.position.y = 3.9;
    gate.add(ring);
    const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.07, 8, 72), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2fa6').multiplyScalar(3) }));
    ringGlow.position.copy(ring.position);
    ringGlow.position.z = 0.25;
    gate.add(ringGlow);
    const fieldMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, c1: { value: new THREE.Color('#ff2fa6') }, c2: { value: new THREE.Color('#19e6ff') } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float time; uniform vec3 c1; uniform vec3 c2; varying vec2 vUv;
        void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
          float swirl = sin(a * 6.0 + r * 14.0 - time * 3.0) * 0.5 + 0.5;
          float rings = sin(r * 30.0 - time * 6.0) * 0.5 + 0.5;
          vec3 col = mix(c1, c2, swirl) * (0.4 + rings * 0.6);
          float alpha = smoothstep(1.0, 0.75, r) * (0.35 + swirl * 0.35);
          gl_FragColor = vec4(col * 1.8, alpha); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const field = new THREE.Mesh(new THREE.CircleGeometry(3.4, 64), fieldMat);
    field.position.y = 3.9;
    gate.add(field);
    const deployTxt = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.2), new THREE.MeshBasicMaterial({ map: textTexture('DEPLOY', '#ff2fa6'), transparent: true, depthWrite: false, color: new THREE.Color(2, 2, 2) }));
    deployTxt.position.set(0, 8.4, 0);
    gate.add(deployTxt);
    sc.add(gate);
    this.anim.push((dt) => { fieldMat.uniforms.time.value += dt; ringGlow.rotation.z += dt * 0.3; });

    // LOCKER turntable + showcase avatar
    const turn = new THREE.Group();
    turn.position.set(-21, 0.4, 0);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.2, 48), new THREE.MeshStandardMaterial({ color: '#1d2130', metalness: 0.8, roughness: 0.3 }));
    disc.position.y = 0.1;
    turn.add(disc);
    const discRing = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.035, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2fa6').multiplyScalar(3) }));
    discRing.rotation.x = Math.PI / 2; discRing.position.y = 0.2;
    turn.add(discRing);
    sc.add(turn);
    this.turntable = turn;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.2, 3.4), new THREE.MeshStandardMaterial({ color: '#2a2f42', metalness: 0.7, roughness: 0.35 }));
    frame.position.set(-23.6, 2.5, 0);
    sc.add(frame);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.8), new THREE.MeshStandardMaterial({ color: '#3a4258', metalness: 0.8, roughness: 0.34, envMapIntensity: 0.7 }));
    mirror.position.set(-23.48, 2.5, 0); mirror.rotation.y = Math.PI / 2;
    sc.add(mirror);
    this.showcase = new Avatar(S.profile.value ? S.profile.value.avatar : undefined, { shadows: q.shadows > 0 });
    this.showcase.root.position.y = 0.2;
    turn.add(this.showcase.root);
    this.showcaseSpin = 0;
    this.anim.push((dt) => {
      this.showcaseSpin += dt * (this.focus && this.focus.id === 'locker' ? 0.0 : 0.4);
      this.showcase.root.rotation.y = this.showcaseSpin + (this.dragSpin || 0);
      this.showcase.update(dt, { vx: 0, vz: 0, yaw: 0, onGround: true, pitch: 0 });
    });

    // ARMORY: wall of guns + rotating pedestal
    const wall = new THREE.Group();
    wall.position.set(27.9, 0, 0);
    const cols = 5;
    [...GUNS].forEach((g, i) => {
      const m = buildWeaponModel(g.id);
      const s = 0.9 / (m.userData.len || 1);
      m.scale.setScalar(Math.min(1.5, s));
      m.rotation.y = Math.PI / 2;
      m.position.set(0, 1.0 + Math.floor(i / cols) * 1.15, -5 + (i % cols) * 2.5);
      wall.add(m);
    });
    MELEE.forEach((g, i) => {
      const m = buildWeaponModel(g.id);
      const s = 1.1 / (m.userData.len || 1);
      m.scale.setScalar(Math.min(1.6, s));
      m.rotation.set(0, Math.PI / 2, 0);
      m.position.set(-0.2, 1.2, i < 5 ? -6.6 - i * 0.0 : 6.6);
      m.position.z = (i < 5 ? -6.5 : 6.5);
      m.position.y = 0.9 + (i % 5) * 1.0;
      m.rotation.z = Math.PI / 2;
      wall.add(m);
    });
    sc.add(wall);
    const ped = new THREE.Group();
    ped.position.set(21, 0.4, 0);
    const pbase = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 1.0, 32), new THREE.MeshStandardMaterial({ color: '#1d2130', metalness: 0.8, roughness: 0.3 }));
    pbase.position.y = 0.5;
    ped.add(pbase);
    const pglow = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(1.1) }));
    pglow.position.y = 1.0;
    ped.add(pglow);
    const holder = new THREE.Group();
    holder.position.y = 1.55;
    ped.add(holder);
    sc.add(ped);
    this.pedestal = holder;
    this.anim.push((dt) => { holder.rotation.y += dt * 0.6; holder.position.y = 1.55 + Math.sin(this.time * 1.5) * 0.05; });
    const prof = S.profile.value;
    this.previewWeapon(prof ? prof.loadout.primary : 'vx9', prof ? prof.camos[prof.loadout.primary] : null);

    // SHOP kiosk: floating holo screens
    const shop = new THREE.Group();
    shop.position.set(14.5, 0.3, 15.5);
    const kioskTxt = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: textTexture('SHOP', '#ffd400'), transparent: true, depthWrite: false, color: new THREE.Color(2.2, 2.2, 2.2), side: THREE.DoubleSide }));
    kioskTxt.position.set(0, 4.2, 1.2);
    kioskTxt.rotation.y = Math.PI;
    shop.add(kioskTxt);
    const holoItems = new THREE.Group();
    holoItems.position.set(0, 2.4, 1.5);
    ['outfit_mecha', 'camo_gold', 'hat_crown'].forEach((id, i) => {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(['#19e6ff', '#ffd400', '#ff2fa6'][i]).multiplyScalar(0.5), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      panel.position.set(-1.4 + i * 1.4, 0, 0);
      holoItems.add(panel);
      void id;
    });
    shop.add(holoItems);
    const shopGun = buildWeaponModel('helix', 'camo_galaxy');
    shopGun.position.set(0, 2.4, 1.6);
    shop.add(shopGun);
    sc.add(shop);
    this.anim.push((dt) => { shopGun.rotation.y += dt * 1.2; holoItems.rotation.y = Math.sin(this.time * 0.6) * 0.15; });

    // LEADERBOARD screen
    const lbCanvas = document.createElement('canvas');
    lbCanvas.width = 1024; lbCanvas.height = 512;
    this.lbCanvas = lbCanvas;
    this.lbTex = new THREE.CanvasTexture(lbCanvas);
    this.lbTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5), new THREE.MeshBasicMaterial({ map: this.lbTex, color: new THREE.Color(1.5, 1.5, 1.5) }));
    screen.position.set(-14, 3.6, 18.4);
    screen.rotation.y = Math.PI;
    sc.add(screen);
    this.drawLeaderboard([]);

    // MISSIONS terminal & SOCIAL terminal: holo icons
    const mkTerminal = (x, z, text, color) => {
      const g = new THREE.Group();
      g.position.set(x, 1.2, z + 0.1);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.6), new THREE.MeshBasicMaterial({ map: textTexture(text, color), transparent: true, depthWrite: false, color: new THREE.Color(2, 2, 2), side: THREE.DoubleSide }));
      scr.position.y = 1.6;
      scr.rotation.y = Math.PI;
      g.add(scr);
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), wireframe: true }));
      orb.position.y = 0.7;
      g.add(orb);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(color).multiplyScalar(1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.y = 0.7; halo.scale.setScalar(1.6);
      g.add(halo);
      sc.add(g);
      this.anim.push((dt) => { orb.rotation.y += dt; orb.rotation.x += dt * 0.5; orb.position.y = 0.7 + Math.sin(this.time * 2 + x) * 0.08; });
      return g;
    };
    this.dailyTerminal = mkTerminal(13, -12.5, 'DAILY', '#3dff9a');
    mkTerminal(-13, -12.5, 'SOCIAL', '#9b5bff');

    // floating drones
    for (let i = 0; i < 4; i++) {
      const d = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: '#dfe5ee', metalness: 0.7, roughness: 0.25 }));
      d.add(body);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? '#19e6ff' : '#ff2fa6').multiplyScalar(3) }));
      eye.position.z = -0.18;
      d.add(eye);
      sc.add(d);
      const r = 9 + i * 3, h = 6 + i, sp = 0.15 + i * 0.05;
      this.anim.push(() => { const a = this.time * sp + i * 1.7; d.position.set(Math.cos(a) * r, h + Math.sin(this.time * 1.3 + i) * 0.4, Math.sin(a) * r * 0.6 + 2); d.rotation.y = -a; });
    }
  }

  drawLeaderboard(rows) {
    const c = this.lbCanvas, x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#0b0e22'); g.addColorStop(1, '#170a2a');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    x.strokeStyle = '#19e6ff'; x.lineWidth = 6; x.strokeRect(6, 6, 1012, 500);
    x.font = 'italic 900 52px "Exo 2", sans-serif'; x.fillStyle = '#ffffff'; x.textAlign = 'left';
    x.fillText('TOP OPERATORS', 40, 72);
    x.font = 'italic 700 26px "Chakra Petch", sans-serif'; x.fillStyle = '#19e6ff'; x.fillText('RANKED BY LEVEL', 700, 70);
    const list = rows.slice(0, 8);
    if (!list.length) { x.font = 'italic 700 32px "Chakra Petch", sans-serif'; x.fillStyle = '#8f97ad'; x.fillText('PLAY A MATCH TO CLAIM THE TOP SPOT', 40, 260); }
    list.forEach((r, i) => {
      const y = 130 + i * 46;
      x.fillStyle = i === 0 ? 'rgba(255,212,0,0.18)' : i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.0)';
      x.fillRect(30, y - 34, 964, 42);
      x.font = 'italic 900 30px "Exo 2", sans-serif';
      x.fillStyle = ['#ffd400', '#d8e2f0', '#ff9a4a'][i] || '#8f97ad';
      x.fillText(`#${r.rank}`, 44, y);
      x.fillStyle = '#ffffff'; x.fillText(r.name, 140, y);
      x.font = 'italic 700 26px "Chakra Petch", sans-serif'; x.fillStyle = '#19e6ff';
      x.fillText(`LV ${r.level}`, 620, y);
      x.fillStyle = '#ff6fbf'; x.fillText(`${r.kills} ELIMS`, 760, y);
    });
    this.lbTex.needsUpdate = true;
  }

  previewWeapon(id, camo) {
    for (const c of [...this.pedestal.children]) this.pedestal.remove(c);
    if (!id) return;
    const m = buildWeaponModel(id, camo);
    const melee = m.userData.kind === 'melee';
    const s = (melee ? 1.5 : 1.45) / (m.userData.len || 1);
    m.scale.setScalar(Math.min(3.2, s));
    if (melee) { m.rotation.z = Math.PI / 2; m.position.x = -((m.userData.len || 1) * Math.min(3.2, s)) / 2.5; }
    this.pedestal.add(m);
  }

  previewAvatar(app) {
    this.showcase.setAppearance(app);
  }

  // ───────────── players ─────────────
  setPlayers(m) {
    for (const o of this.others.values()) o.avatar.dispose();
    this.others.clear();
    this.selfId = m.you;
    for (const p of m.players) if (p.id !== m.you) this._addOther(p);
  }

  _addOther(p) {
    if (p.id === this.selfId || this.others.has(p.id)) return;
    const av = new Avatar(p.avatar, { shadows: this.engine.quality.shadows > 0 });
    av.root.position.set(p.x, p.y, p.z);
    av.root.rotation.y = p.yaw;
    const tag = makeTag(p.name, p.level, '#ffffff');
    av.root.add(tag);
    this.scene.add(av.root);
    this.others.set(p.id, { avatar: av, tag, tx: p.x, ty: p.y, tz: p.z, tyaw: p.yaw, anim: p.a || 0, px: p.x, pz: p.z, emoteT: 0 });
  }

  _removeOther(id) {
    const o = this.others.get(id);
    if (!o) return;
    o.avatar.dispose();
    this.others.delete(id);
  }

  // ───────────── controls ─────────────
  _bindPointer() {
    const el = this.engine.canvas;
    let dragging = false, lx = 0, ly = 0;
    this.pd = (e) => { if (S.screen.value !== 'lobby') return; dragging = true; lx = e.clientX; ly = e.clientY; };
    this.pm = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (this.focus && this.focus.id === 'locker') { this.dragSpin = (this.dragSpin || 0) + dx * 0.012; return; }
      if (this.focus) return;
      this.camYaw -= dx * 0.005;
      this.camPitch = Math.max(-0.9, Math.min(0.35, this.camPitch - dy * 0.004));
    };
    this.pu = () => { dragging = false; };
    this.wh = (e) => { if (S.screen.value === 'lobby' && !this.focus && e.target === el) this.camDist = Math.max(2.5, Math.min(9, this.camDist + Math.sign(e.deltaY) * 0.5)); };
    el.addEventListener('pointerdown', this.pd);
    window.addEventListener('pointermove', this.pm);
    window.addEventListener('pointerup', this.pu);
    window.addEventListener('wheel', this.wh, { passive: true });
  }

  /** Camera drag from the touch controls' look area. */
  touchLook(dx, dy) {
    if (this.focus) return;
    this.camYaw -= dx * 0.006;
    this.camPitch = Math.max(-0.9, Math.min(0.35, this.camPitch - dy * 0.0045));
  }

  _key(type, code) {
    if (type !== 'keydown' || S.screen.value !== 'lobby') return;
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
    if (S.panel.value) return;
    if (code === S.settings.value.keys.interact && this.near) {
      this.app.openPanel(this.near.panel, this.near.id);
      audio.ui('uiClick');
      return;
    }
    const m = /^Digit([1-8])$/.exec(code);
    if (m) {
      const owned = itemsByCat('emote').filter((e) => S.profile.value && S.profile.value.inventory.includes(e.id));
      const e = owned[+m[1] - 1];
      if (e) { this.avatar.playEmote(e.id); this.emoteT = 4; net.send({ t: 'lobby.emote', id: e.id }); }
    }
  }

  setFocus(stationId) {
    const st = STATIONS.find((s) => s.id === stationId);
    this.focus = st || null;
    this.focusT = 0;
    if (stationId === 'locker') this.dragSpin = 0;
  }

  // ───────────── frame ─────────────
  frame(dt) {
    this.time += dt;
    const typing = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
    const canMove = !this.focus && !S.panel.value && !typing && S.screen.value === 'lobby';
    const a = (n) => canMove && input.isAction(n);
    const mz = (a('forward') ? 1 : 0) - (a('back') ? 1 : 0);
    const mx = (a('right') ? 1 : 0) - (a('left') ? 1 : 0);
    let buttons = 0;
    if (a('jump')) buttons |= BTN.JUMP;
    if (a('sprint')) buttons |= BTN.SPRINT;
    // move relative to camera yaw; the body faces movement direction
    const me = this.me;
    let moveYaw = me.yaw;
    const moving = mx !== 0 || mz !== 0;
    if (moving) {
      const ang = Math.atan2(-mx, mz);
      moveYaw = this.camYaw + ang;
      if (this.emoteT > 0) { this.avatar.stopEmote(); this.emoteT = 0; }
    }
    me.yaw = moveYaw;
    stepMovement(me, { mx: 0, mz: moving ? 1 : 0, buttons: buttons | (moving && a('sprint') ? BTN.SPRINT : 0) }, this.world, this.map, Math.min(dt, 0.05), { moveMul: 1.05, adsT: 0 }, this.ev);
    const b = LOBBY.bounds;
    me.x = Math.max(b.minX, Math.min(b.maxX, me.x));
    me.z = Math.max(b.minZ, Math.min(b.maxZ, me.z));
    const av = this.avatar;
    av.root.position.set(me.x, me.y, me.z);
    const cur = av.root.rotation.y;
    let d = moveYaw - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
    av.root.rotation.y = cur + d * Math.min(1, dt * 12);
    if (this.emoteT > 0) { this.emoteT -= dt; if (this.emoteT <= 0) av.stopEmote(); }
    av.update(dt, { vx: me.vx, vz: me.vz, yaw: av.root.rotation.y, onGround: me.onGround, pitch: 0, sprint: me.sprinting });

    // network
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / 12;
      const sp = Math.hypot(me.vx, me.vz);
      const anim = !me.onGround ? 3 : sp > 7 ? 2 : sp > 0.5 ? 1 : 0;
      const key = `${me.x.toFixed(2)},${me.z.toFixed(2)},${av.root.rotation.y.toFixed(2)},${anim}`;
      if (key !== this.lastSent) { this.lastSent = key; net.send({ t: 'lobby.move', x: me.x, y: me.y, z: me.z, yaw: av.root.rotation.y, a: anim }); }
    }

    // others
    for (const o of this.others.values()) {
      const r = o.avatar.root;
      const k = Math.min(1, dt * 10);
      const ox = r.position.x, oz = r.position.z;
      r.position.x += (o.tx - r.position.x) * k;
      r.position.y += (o.ty - r.position.y) * k;
      r.position.z += (o.tz - r.position.z) * k;
      let dy = o.tyaw - r.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      r.rotation.y += dy * k;
      const vx = (r.position.x - ox) / Math.max(dt, 1e-3), vz = (r.position.z - oz) / Math.max(dt, 1e-3);
      if (o.emoteT > 0) { o.emoteT -= dt; if (o.emoteT <= 0 || Math.hypot(vx, vz) > 1) { o.avatar.stopEmote(); o.emoteT = 0; } }
      o.avatar.update(dt, { vx, vz, yaw: r.rotation.y, onGround: o.anim !== 3, pitch: 0, sprint: o.anim === 2 });
    }

    // station proximity
    let near = null;
    for (const st of STATIONS) {
      const dd = Math.hypot(me.x - st.x, me.z - st.z);
      if (dd < st.r && (!near || dd < near.d)) near = { ...st, d: dd };
    }
    this.near = near;
    const hint = near && !S.panel.value ? `${near.label}` : null;
    if (S.interactHint.value !== hint) S.interactHint.value = hint;

    // camera
    const cam = this.camera;
    let tPos, tLook;
    if (this.focus) {
      this.focusT = Math.min(1, this.focusT + dt * 1.6);
      tPos = new THREE.Vector3(...this.focus.cam.pos);
      tLook = new THREE.Vector3(...this.focus.cam.look);
    } else {
      const target = new THREE.Vector3(me.x, me.y + 1.55, me.z);
      const off = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), -Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch)).multiplyScalar(this.camDist);
      const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw)).multiplyScalar(0.45);
      tPos = target.clone().add(off).add(right);
      // keep the camera inside the hangar
      const hit = this.world.raycast(target.x, target.y, target.z, ...tPos.clone().sub(target).normalize().toArray(), tPos.distanceTo(target), true);
      if (hit) tPos = target.clone().add(tPos.clone().sub(target).normalize().multiplyScalar(Math.max(0.6, hit.t - 0.3)));
      tLook = target.clone().add(right);
    }
    const lk = 1 - Math.exp(-dt * (this.focus ? 5 : 12));
    this.camPos.lerp(tPos, lk);
    this.camLook.lerp(tLook, lk);
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    // shift the rendered view left while a side panel covers the right of the screen
    const panel = S.panel.value;
    // centre the station in the space left of the panel (panels have a fixed width)
    if (panel && panel !== 'settings') {
      this.panelProbeT = (this.panelProbeT || 0) - dt;
      if (this.panelProbeT <= 0) {
        this.panelProbeT = 0.25;
        const el = document.querySelector('.panel.panel-right');
        const W0 = window.innerWidth, left = el ? el.getBoundingClientRect().left : W0 * 0.58;
        this.panelShift = left > W0 * 0.2 ? Math.min(0.36, Math.max(0, 0.5 - left / 2 / W0)) : 0;
      }
    } else this.panelProbeT = 0;
    const shiftTarget = panel && panel !== 'settings' ? (this.panelShift ?? 0.21) : 0;
    this.viewShift = (this.viewShift || 0) + (shiftTarget - (this.viewShift || 0)) * (1 - Math.exp(-dt * 6));
    const W = window.innerWidth, H = window.innerHeight;
    if (Math.abs(this.viewShift) > 0.002) cam.setViewOffset(W, H, W * this.viewShift, 0, W, H);
    else if (cam.view && cam.view.enabled) cam.clearViewOffset();
    cam.updateMatrixWorld();
    for (const f of this.anim) f(dt);
    this.built.update(dt, cam);
    audio.setListener(cam.position, { x: -Math.sin(this.camYaw), y: 0, z: -Math.cos(this.camYaw) });
    input.endFrame();
  }

  refreshSelf() {
    const prof = S.profile.value;
    if (!prof) return;
    this.avatar.setAppearance(prof.avatar);
    this.avatar.root.remove(this.tag);
    this.tag = makeTag(prof.username, prof.level, '#ffffff');
    this.avatar.root.add(this.tag);
  }

  dispose() {
    for (const off of this.offs) off();
    this.unInput();
    const el = this.engine.canvas;
    el.removeEventListener('pointerdown', this.pd);
    window.removeEventListener('pointermove', this.pm);
    window.removeEventListener('pointerup', this.pu);
    window.removeEventListener('wheel', this.wh);
    for (const o of this.others.values()) o.avatar.dispose();
    this.built.dispose();
  }
}

export { STATIONS };
