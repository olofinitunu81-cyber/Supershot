// Client-side match: prediction + reconciliation of the local player,
// interpolation of remote players, effects, audio and HUD wiring.
import * as THREE from 'three';
import { TICK_DT, INTERP_DELAY_MS, BTN, MODES, PLAYER, NO_TEAM, TEAM_COLORS } from '../../../shared/config.js';
import { getMap } from '../../../shared/maps/index.js';
import { CollisionWorld, eyeHeight, stepProjectile } from '../../../shared/physics.js';
import { createPlayerState, simulateTick, shotDirections, shotSeed, seedBaseFor, computeSpread, currentDef, RECON_FLOATS } from '../../../shared/sim.js';
import { WEAPONS, weaponByIndex, fireInterval } from '../../../shared/weapons.js';
import { hashInts } from '../../../shared/rng.js';
import { rayPlayer } from '../../../shared/hitbox.js';
import { Writer, encodeInputs, decodeSnapshot, decodeShots, MSG_SNAPSHOT, MSG_SHOTS, RF } from '../../../shared/protocol.js';
import { DEG, wrapAngle, dirFromAngles } from '../../../shared/math.js';
import { buildMapScene } from '../engine/mapbuilder.js';
import { Effects } from '../engine/effects.js';
import { Avatar } from '../engine/avatar.js';
import { audio } from '../engine/audio.js';
import { Viewmodel } from './viewmodel.js';
import { HUD } from './hud.js';
import { input } from '../input.js';
import { net } from '../net.js';
import { S } from '../state.js';

const SENS = 0.0022;
const tmpV = new THREE.Vector3();

function nameTag(info, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.font = 'italic 800 52px "Exo 2", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const label = info.bot ? `${info.name}` : info.name;
  x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,0.75)';
  x.strokeText(label, 256, 52);
  x.fillStyle = color;
  x.fillText(label, 256, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
  s.scale.set(1.6, 0.3, 1);
  s.renderOrder = 20;
  return s;
}

class RemotePlayer {
  constructor(mc, info) {
    this.mc = mc;
    this.info = info;
    this.isSelf = info.pid === mc.selfPid;
    this.buf = [];
    this.alive = false;
    this.weaponIdx = -1;
    this.stepDist = 0;
    this.tagT = 0;
    this.lastFlags = 0;
    if (!this.isSelf) {
      this.avatar = new Avatar(info.avatar, { shadows: mc.engine.quality.shadows > 0 });
      this.avatar.root.visible = false;
      mc.scene.add(this.avatar.root);
      const ally = mc.teams && info.team === mc.team;
      const color = mc.teams ? (ally ? '#5fe8ff' : '#ff5a7a') : '#ffffff';
      this.tag = nameTag(info, color);
      this.tag.position.y = 2.25;
      this.avatar.root.add(this.tag);
      this.ally = ally;
    }
  }

  push(t, o) {
    this.buf.push({ t, ...o });
    if (this.buf.length > 40) this.buf.shift();
  }

  sample(rt) {
    const b = this.buf;
    if (!b.length) return null;
    if (rt <= b[0].t) return { ...b[0] };
    for (let i = b.length - 1; i >= 0; i--) {
      if (b[i].t <= rt) {
        const a = b[i], n = b[i + 1];
        if (!n) {
          const ex = Math.min(0.15, (rt - a.t) / 1000);
          return { ...a, x: a.x + a.vx * ex, y: a.y + (a.flags & RF.GROUND ? 0 : a.vy * ex), z: a.z + a.vz * ex };
        }
        const k = (rt - a.t) / Math.max(1, n.t - a.t);
        if (!(n.flags & RF.ALIVE) || !(a.flags & RF.ALIVE) || Math.hypot(n.x - a.x, n.z - a.z) > 6) return { ...n };
        return {
          ...n,
          x: a.x + (n.x - a.x) * k, y: a.y + (n.y - a.y) * k, z: a.z + (n.z - a.z) * k,
          yaw: a.yaw + wrapAngle(n.yaw - a.yaw) * k, pitch: a.pitch + (n.pitch - a.pitch) * k,
          vx: a.vx + (n.vx - a.vx) * k, vz: a.vz + (n.vz - a.vz) * k,
        };
      }
    }
    return { ...b[0] };
  }

  update(dt, rt) {
    if (this.isSelf) return;
    const s = this.sample(rt);
    if (!s) return;
    this.state = s;
    const alive = !!(s.flags & RF.ALIVE);
    const av = this.avatar;
    if (alive !== this.alive) {
      this.alive = alive;
      av.root.visible = alive && !this.dying;
    }
    if (!alive) return;
    this.dying = false;
    av.root.visible = true;
    av.root.position.set(s.x, s.y, s.z);
    av.root.rotation.y = s.yaw;
    if (s.weapon !== this.weaponIdx) {
      this.weaponIdx = s.weapon;
      const wd = weaponByIndex(s.weapon);
      if (wd) av.attachWeapon(wd.id, this.info.camos);
    }
    const reloading = !!(s.flags & RF.RELOAD);
    if (reloading && !(this.lastFlags & RF.RELOAD)) {
      audio.play('magout', { pos: av.root.position, vol: 0.5, ref: 3 });
      audio.play('magin', { pos: av.root.position, vol: 0.5, ref: 3, delay: 0.6 });
    }
    if ((s.flags & RF.CHARGE) && !(this.lastFlags & RF.CHARGE)) audio.play('charge', { pos: av.root.position, vol: 0.7, ref: 6 });
    if ((s.flags & RF.SPIN) && !(this.lastFlags & RF.SPIN)) audio.play('spinup', { pos: av.root.position, vol: 0.6, ref: 6 });
    this.lastFlags = s.flags;
    av.update(dt, {
      vx: s.vx, vz: s.vz, yaw: s.yaw, onGround: !!(s.flags & RF.GROUND), crouch: !!(s.flags & RF.CROUCH),
      slide: !!(s.flags & RF.SLIDE), pitch: s.pitch, ads: !!(s.flags & RF.ADS), reloading, swing: s.swing,
      sprint: !!(s.flags & RF.SPRINT),
    });
    // spawn protection shimmer
    const prot = !!(s.flags & RF.PROTECT);
    if (prot !== this.prot) {
      this.prot = prot;
      av.root.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material)) { o.material.transparent = prot || o.material.userData.wasTransparent; o.material.opacity = prot ? 0.55 : (o.material.userData.baseOpacity ?? 1); } });
    }
    // remote footsteps
    const sp = Math.hypot(s.vx, s.vz);
    if ((s.flags & RF.GROUND) && sp > 2.5 && !(s.flags & RF.SLIDE) && !(s.flags & RF.CROUCH)) {
      this.stepDist += sp * dt;
      if (this.stepDist > 2.1) {
        this.stepDist = 0;
        const d = av.root.position.distanceTo(this.mc.camera.position);
        if (d < 30) audio.play(`step_${this.mc.stepMat}_${Math.floor(Math.random() * 3)}`, { pos: av.root.position, vol: 0.55, ref: 3, rolloff: 1.5 });
      }
    }
    // name tag visibility
    this.tagT -= dt;
    const showTag = this.ally || this.tagT > 0;
    this.tag.visible = showTag;
    if (showTag) {
      const d = this.mc.camera.position.distanceTo(av.root.position);
      const k = Math.max(1, d / 12);
      this.tag.scale.set(1.6 * k * 0.6, 0.3 * k * 0.6, 1);
    }
  }

  muzzleWorld() {
    const m = this.avatar && this.avatar.weaponModel && this.avatar.weaponModel.userData.muzzle;
    if (m && this.avatar.root.visible) { m.updateMatrixWorld(true); return new THREE.Vector3().setFromMatrixPosition(m.matrixWorld); }
    const s = this.state;
    return s ? new THREE.Vector3(s.x, s.y + 1.4, s.z) : new THREE.Vector3();
  }

  headWorld() {
    const s = this.state;
    if (!s) return null;
    return new THREE.Vector3(s.x, s.y + (s.flags & RF.CROUCH ? 1.3 : 1.85), s.z);
  }

  die(dir) {
    if (this.isSelf || !this.avatar || !this.avatar.root.visible) return;
    const pieces = this.avatar.breakApart(dir, this.mc.scene);
    const s = this.state || { x: 0, y: 0, z: 0 };
    const g = this.mc.world.groundHeight(s.x, s.z, s.y + 1, 30);
    this.mc.effects.addDebris(pieces, g ?? s.y);
    this.avatar.root.visible = false;
    this.dying = true;
    this.alive = false;
  }

  dispose() {
    if (this.avatar) this.avatar.dispose();
  }
}

export class MatchClient {
  constructor(app, info) {
    this.app = app;
    this.engine = app.engine;
    this.info = info;
    this.selfPid = info.you;
    this.team = info.team;
    this.mode = info.mode;
    this.teams = MODES[info.mode].teams;
    this.map = getMap(info.map);
    this.world = new CollisionWorld(this.map.boxes);
    const q = this.engine.quality;
    this.built = buildMapScene(this.map, this.world, this.engine, q);
    this.scene = this.built.scene;
    this.engine.exposure = this.map.theme.exposure || 1;
    const bright = ['day', 'snow', 'sunset'].includes(this.map.theme.preset);
    this.engine.setBloom(bright ? 0.32 : 0.5, 0.4, bright ? 1.15 : 0.85);
    const preset = this.map.theme.preset;
    this.stepMat = preset === 'snow' ? 'snow' : preset === 'day' ? 'sand' : preset === 'sunset' || preset === 'arena' ? 'metal' : 'concrete';
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    const prof = S.profile.value;
    this.vm = new Viewmodel(prof ? prof.avatar : {}, prof ? prof.camos : {});
    this.vm.setEnvironment(this.scene.environment, this.map.theme);
    this.engine.setView(this.scene, this.camera, this.vm.scene, this.vm.camera);
    this.effects = new Effects(this.scene, q, this.world);
    this.players = new Map();
    for (const p of info.players) this._addPlayer(p);
    const me = info.players.find((p) => p.pid === this.selfPid);
    this.loadout = me ? me.loadout : { primary: 'vx9', secondary: 'sidekick', melee: 'knife' };
    this.pred = createPlayerState(this.selfPid, this.loadout);
    this.pred.alive = false;
    this.slotWanted = 0;
    this.yaw = 0; this.pitch = 0;
    this.seq = 0;
    this.pending = [];
    this.hist = new Map();
    this.acc = 0;
    this.out = [];
    this.writer = new Writer(512);
    this.serverOffset = null;
    this.phase = info.phase === 'live' ? 1 : info.phase === 'ended' ? 2 : 0;
    this.phaseTime = info.phaseTime;
    this.phaseAt = performance.now();
    this.health = 100;
    this.protect = false;
    this.prevPos = new THREE.Vector3();
    this.curPos = new THREE.Vector3();
    this.errOff = new THREE.Vector3();
    this.eyeH = PLAYER.eye;
    this.stepOff = 0;
    this.punch = 0; this.punchYaw = 0;
    this.shake = 0;
    this.recoilAccum = 0;
    this.lastShotAt = 0;
    this.stepDist = 0;
    this.lookDX = 0; this.lookDY = 0;
    this.localProj = [];
    this.projMeshes = new Map();
    this.ended = false;
    this.deathCam = null;
    this.crouchToggle = false;
    this.adsToggle = false;
    this.mev = {};
    this.hud = new HUD(document.getElementById('ui-hud') || document.body, {
      selfPid: this.selfPid, team: this.team, teams: this.teams, mode: this.mode, scoreLimit: info.scoreLimit, players: this.players,
    });
    this.hud.setScores({ teams: info.teamScores, rows: info.scores || [] });
    this.hooks = {
      shot: (p, def, seq, spread) => this._localShot(def, seq, spread),
      melee: () => {},
      sound: (p, name, def, arg) => this._localSound(name, def, arg),
      move: (p, ev) => this._localMove(ev),
      fall: () => {},
    };
    this.replayCtx = { world: this.world, map: this.map, dt: TICK_DT, frozen: false, hooks: null };
    this.freshCtx = { world: this.world, map: this.map, dt: TICK_DT, frozen: false, hooks: this.hooks };
    this.offs = [
      net.on(`bin:${MSG_SNAPSHOT}`, (r) => this._snapshot(r)),
      net.on(`bin:${MSG_SHOTS}`, (r) => this._shots(r)),
      net.on('hit', (m) => this._hit(m)),
      net.on('hurt', (m) => this._hurt(m)),
      net.on('kill', (m) => this._kill(m)),
      net.on('spawn', (m) => this._spawn(m)),
      net.on('scores', (m) => { this.hud.setScores(m); this.scores = m; }),
      net.on('phase', (m) => this._phase(m)),
      net.on('announce', (m) => this._announce(m)),
      net.on('boom', (m) => this._boom(m)),
      net.on('pjoin', (m) => { if (!this.players.has(m.p.pid)) { this._addPlayer(m.p); if (!m.p.bot) this.hud.notice(`${m.p.name} joined`); } }),
      net.on('pleave', (m) => { const p = this.players.get(m.pid); if (p) { if (!p.info.bot && m.reason !== 'replaced') this.hud.notice(`${p.info.name} left`); p.dispose(); this.players.delete(m.pid); } }),
      net.on('chat', (m) => this.hud.addChat(m)),
      net.on('match.end', (m) => this._end(m)),
    ];
    this.unInput = input.on((type, code) => this._key(type, code));
    this.pingTimer = setInterval(() => net.send({ t: 'ping', ms: Math.round(net.rtt) }), 2000);
    S.match.value = { ...info, scores: info.scores };
    this.vm.setWeapon(this.loadout.primary, 0.01);
    this.applySettings(S.settings.value);
    this.app.audioMatchStart?.();
  }

  _addPlayer(info) {
    this.players.set(info.pid, new RemotePlayer(this, info));
  }

  applySettings(s) {
    this.fovBase = s.fov;
    this.hud.applyCrosshair();
    this.vm.setFov(Math.min(70, 52 + (s.fov - 90) * 0.4));
  }

  // ───────────── input ─────────────
  _key(type, code) {
    if (this.ended) return;
    const k = S.settings.value.keys;
    if (type !== 'keydown') return;
    if (this.hud.chatOpen) {
      if (code === 'Enter') {
        const text = this.hud.r.chatInput.value.trim();
        if (text) net.send({ t: 'chat', ch: this.hud.chatTeam ? 'team' : 'all', text });
        this.hud.closeChat();
      } else if (code === 'Escape') this.hud.closeChat();
      return;
    }
    if (code === k.chat) this.hud.openChat(false);
    else if (code === k.teamChat && this.teams) this.hud.openChat(true);
    else if (code === k.scoreboard) this.hud.toggleBoard(true);
    else if (code === k.crouch && S.settings.value.toggleCrouch) this.crouchToggle = !this.crouchToggle;
  }

  _buildInput() {
    const locked = input.locked && !this.hud.chatOpen && !S.paused.value && !this.ended;
    const s = S.settings.value;
    const a = (name) => locked && input.isAction(name);
    let mz = (a('forward') ? 1 : 0) - (a('back') ? 1 : 0);
    let mx = (a('right') ? 1 : 0) - (a('left') ? 1 : 0);
    let buttons = 0;
    if (a('jump')) buttons |= BTN.JUMP;
    const crouch = s.toggleCrouch ? this.crouchToggle && locked : a('crouch');
    if (crouch) buttons |= BTN.CROUCH;
    if (a('sprint') || (s.autoSprint && mz > 0)) buttons |= BTN.SPRINT;
    if (a('fire')) buttons |= BTN.FIRE;
    if (s.toggleAds ? this.adsToggle && locked : a('ads')) buttons |= BTN.ADS;
    if (a('reload')) buttons |= BTN.RELOAD;
    if (a('melee')) buttons |= BTN.MELEE;
    if (!this.pred.alive) { mx = 0; mz = 0; }
    return { seq: 0, mx, mz, yaw: this.yaw, pitch: this.pitch, buttons, slot: this.slotWanted, viewTime: this.renderTime() };
  }

  serverNow() {
    return performance.now() + (this.serverOffset ?? 0);
  }

  renderTime() {
    return Math.max(0, this.serverNow() - INTERP_DELAY_MS);
  }

  // ───────────── frame ─────────────
  frame(dt) {
    const s = S.settings.value;
    const def = currentDef(this.pred);
    // mouse look
    const m = input.takeMouse();
    this.lookDX = m.dx; this.lookDY = m.dy;
    if (input.locked && !this.ended) {
      const zoom = this.pred.adsT > 0.01 && def.kind === 'gun' ? 1 + (s.adsSensitivity * this._zoomFactor(def) - 1) * this.pred.adsT : 1;
      const sens = SENS * s.sensitivity * zoom;
      this.yaw = wrapAngle(this.yaw - m.dx * sens);
      this.pitch = Math.max(-1.53, Math.min(1.53, this.pitch - m.dy * sens * (s.invertY ? -1 : 1)));
    }
    // weapon slot selection
    if (input.locked && !this.hud.chatOpen) {
      if (input.pressed('primary')) this.slotWanted = 0;
      if (input.pressed('secondary')) this.slotWanted = 1;
      if (input.pressed('meleeSlot')) this.slotWanted = 2;
      const w = input.takeWheel();
      if (w) this.slotWanted = (this.slotWanted + (w > 0 ? 1 : 2)) % 3;
      if (input.pressed('inspect')) this.vm.inspect();
      if (s.toggleAds && input.pressed('ads')) this.adsToggle = !this.adsToggle;
    }
    if (!input.isAction('scoreboard') && this.hud.boardOpen) this.hud.toggleBoard(false);

    // fixed-step prediction
    this.acc += dt;
    let steps = 0;
    while (this.acc >= TICK_DT && steps < 6) {
      this._tick();
      this.acc -= TICK_DT;
      steps++;
    }
    if (steps === 6) this.acc = 0;
    if (this.out.length) {
      net.sendBin(encodeInputs(this.writer, this.out));
      this.out.length = 0;
    }
    // recoil recovery
    if (performance.now() - this.lastShotAt > 140 && this.recoilAccum > 0.0001) {
      const d = this.recoilAccum * Math.min(1, dt * 7) * 0.55;
      this.pitch -= d; this.recoilAccum -= d / 0.55;
      if (this.recoilAccum < 0) this.recoilAccum = 0;
    }

    // camera
    const alpha = this.acc / TICK_DT;
    const p = this.pred;
    tmpV.lerpVectors(this.prevPos, this.curPos, alpha);
    this.errOff.multiplyScalar(Math.exp(-dt * 14));
    this.stepOff *= Math.exp(-dt * 16);
    this.eyeH += ((p.crouched ? PLAYER.crouchEye : PLAYER.eye) - this.eyeH) * (1 - Math.exp(-dt * 16));
    this.punch *= Math.exp(-dt * 14); this.punchYaw *= Math.exp(-dt * 14);
    this.shake *= Math.exp(-dt * 8);
    const cam = this.camera;
    if (p.alive || !this.deathCam) {
      cam.position.set(tmpV.x + this.errOff.x, tmpV.y + this.errOff.y + this.eyeH + this.stepOff, tmpV.z + this.errOff.z);
      const sh = this.shake;
      cam.rotation.set(this.pitch + this.punch + (Math.random() - 0.5) * sh * 0.02, this.yaw + this.punchYaw + (Math.random() - 0.5) * sh * 0.02, (p.sliding ? 0.06 : 0) + (Math.random() - 0.5) * sh * 0.01);
    } else this._updateDeathCam(dt);
    // FOV with ADS zoom
    const zoomF = def.kind === 'gun' ? 1 + (def.ads.fov - 1) * this.pred.adsT : 1;
    const hfov = s.fov * DEG;
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / cam.aspect) / DEG;
    const sprintF = p.sprinting ? 1.06 : p.sliding ? 1.08 : 1;
    const targetFov = vfov * zoomF * sprintF;
    cam.fov += (targetFov - cam.fov) * (1 - Math.exp(-dt * 18));
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // remote players
    const rt = this.renderTime();
    for (const rp of this.players.values()) rp.update(dt, rt);
    this._aimTag();
    this._updateProjectiles(dt);

    // footsteps (local)
    const hs = Math.hypot(p.vx, p.vz);
    if (p.alive && p.onGround && hs > 2.2 && !p.sliding) {
      this.stepDist += hs * dt;
      if (this.stepDist > (p.sprinting ? 2.5 : 2.0)) {
        this.stepDist = 0;
        audio.play(`step_${this.stepMat}_${Math.floor(Math.random() * 3)}`, { vol: p.crouched ? 0.15 : 0.32 });
      }
    }
    if (p.sliding) this.effects.slideDust(new THREE.Vector3(p.x, p.y, p.z));

    // viewmodel
    const scoped = def.kind === 'gun' && def.ads.scope && this.pred.adsT > 0.88;
    this.vm.root.visible = p.alive && !this.ended;
    this.vm.update(dt, {
      adsT: p.adsT, sprint: p.sprinting, speed: hs, onGround: p.onGround, crouched: p.crouched, sliding: p.sliding,
      lookDX: this.lookDX, lookDY: this.lookDY, chargeT: def.charge ? p.chargeT / def.charge : 0, spin: p.spin, scoped, bob: s.viewBob,
    });
    this.effects.update(dt, cam);
    this.built.update(dt, cam);

    // audio listener
    audio.setListener(cam.position, dirFromAngles(this.yaw, this.pitch, [0, 0, 0]).reduce((v, c, i) => { v[['x', 'y', 'z'][i]] = c; return v; }, {}));

    // HUD
    const slot = p.slots[p.slot];
    const spreadDeg = def.kind === 'gun' ? computeSpread(p, def) : 0;
    const spreadPx = def.kind === 'gun' ? Math.tan(spreadDeg * DEG) / Math.tan((cam.fov * DEG) / 2) * (window.innerHeight / 2) : 6;
    const phaseTime = Math.max(0, this.phaseTime - (performance.now() - this.phaseAt) / 1000);
    let reloadP = 0;
    if (p.reloadT > 0 && def.kind === 'gun') {
      const total = def.shell ? def.shell.each : (slot.mag === 0 ? def.reloadEmpty : def.reload);
      reloadP = 1 - Math.min(1, p.reloadT / total);
    }
    this.hud.frame(dt, {
      hp: this.health, mag: slot.mag, reserve: slot.reserve, def, slot: p.slot, slots: p.slots, reloadP,
      spreadPx: s.crosshairDynamic ? Math.max(4, spreadPx) : 8, scoped, adsT: p.adsT, phase: this.phase, phaseTime,
      fps: this.engine.fps, ping: net.rtt, protect: this.protect, alive: p.alive, sprint: p.sprinting,
    });
    input.endFrame();
  }

  _zoomFactor(def) {
    return def.ads.fov;
  }

  _tick() {
    const inp = this._buildInput();
    inp.seq = ++this.seq;
    const p = this.pred;
    this.prevPos.set(p.x, p.y, p.z);
    this.freshCtx.frozen = this.phase !== 1;
    if (p.alive) simulateTick(p, inp, this.freshCtx);
    this.curPos.set(p.x, p.y, p.z);
    this.pending.push(inp);
    if (this.pending.length > 300) this.pending.shift();
    this.hist.set(inp.seq, this._histOf(p));
    if (this.hist.size > 320) { const first = this.hist.keys().next().value; this.hist.delete(first); }
    this.out.push(inp);
  }

  _histOf(p) {
    return {
      x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, alive: p.alive, slot: p.slot, crouched: p.crouched, reloadT: p.reloadT,
      m0: p.slots[0].mag, m1: p.slots[1].mag, r0: p.slots[0].reserve, r1: p.slots[1].reserve, onGround: p.onGround,
    };
  }

  // ───────────── network: snapshots & reconciliation ─────────────
  _snapshot(r) {
    const snap = decodeSnapshot(r);
    const now = performance.now();
    const sample = snap.time - now;
    if (this.serverOffset === null) this.serverOffset = sample;
    else if (sample > this.serverOffset) this.serverOffset += (sample - this.serverOffset) * 0.5;
    else this.serverOffset += (sample - this.serverOffset) * 0.02;
    const prevPhase = this.phase;
    this.phase = snap.phase;
    this.phaseTime = snap.phaseTime;
    this.phaseAt = now;
    if (prevPhase !== this.phase && this.phase === 2) this.ended = true;
    for (const o of snap.players) {
      const rp = this.players.get(o.id);
      if (rp && !rp.isSelf) rp.push(snap.time, o);
    }
    this.serverProj = snap.projectiles;
    this.serverProjAt = now;
    if (snap.self) this._reconcile(snap.self);
  }

  _reconcile(self) {
    this.health = self.health;
    this.protect = self.protect;
    const sp = self.p;
    const ack = self.ack;
    while (this.pending.length && this.pending[0].seq <= ack) this.pending.shift();
    const mine = this.hist.get(ack);
    for (const k of this.hist.keys()) { if (k <= ack) this.hist.delete(k); else break; }
    const p = this.pred;
    const wasAlive = p.alive;
    let need = !mine;
    if (mine) {
      need = Math.abs(mine.x - sp.x) > 0.02 || Math.abs(mine.y - sp.y) > 0.02 || Math.abs(mine.z - sp.z) > 0.02 ||
        mine.alive !== sp.alive || mine.slot !== sp.slot || mine.crouched !== sp.crouched ||
        mine.m0 !== sp.slots[0].mag || mine.m1 !== sp.slots[1].mag || mine.r0 !== sp.slots[0].reserve || mine.r1 !== sp.slots[1].reserve ||
        Math.abs(mine.vx - sp.vx) > 0.25 || Math.abs(mine.vz - sp.vz) > 0.25 || Math.abs(mine.vy - sp.vy) > 0.5 ||
        Math.abs(mine.reloadT - sp.reloadT) > 0.08;
    }
    if (!need) return;
    const bx = p.x, by = p.y, bz = p.z;
    const prevSlot = p.slot;
    for (const k of RECON_FLOATS) p[k] = sp[k];
    p.onGround = sp.onGround; p.crouched = sp.crouched; p.sliding = sp.sliding; p.sprinting = sp.sprinting;
    p.jumpHeld = sp.jumpHeld; p.crouchHeld = sp.crouchHeld; p.alive = sp.alive; p.quickMelee = sp.quickMelee;
    p.fireHeld = sp.fireHeld; p.meleeHeld = sp.meleeHeld; p.reloadHeld = sp.reloadHeld;
    p.slot = sp.slot; p.burstLeft = sp.burstLeft; p.swingIdx = sp.swingIdx; p.returnSlot = sp.returnSlot; p.shotSeq = sp.shotSeq;
    for (let i = 0; i < 3; i++) { p.slots[i].id = sp.slots[i].id; p.slots[i].mag = sp.slots[i].mag; p.slots[i].reserve = sp.slots[i].reserve; }
    this.replayCtx.frozen = this.phase !== 1;
    for (const inp of this.pending) {
      if (p.alive) simulateTick(p, inp, this.replayCtx);
      this.hist.set(inp.seq, this._histOf(p));
    }
    const dx = bx - p.x, dy = by - p.y, dz = bz - p.z;
    const err = Math.hypot(dx, dy, dz);
    if (err < 2.5 && wasAlive && p.alive) this.errOff.add(new THREE.Vector3(dx, dy, dz));
    else this.errOff.set(0, 0, 0);
    this.curPos.set(p.x, p.y, p.z);
    if (err >= 2.5 || !wasAlive) this.prevPos.copy(this.curPos);
    else this.prevPos.add(new THREE.Vector3(-dx, -dy, -dz));
    if (!wasAlive && p.alive) this._localRespawn();
    if (!this._lockVm && (p.slot !== prevSlot || this.vm.weaponId !== p.slots[p.slot].id)) this.vm.setWeapon(p.slots[p.slot].id, 0.2);
  }

  _localRespawn() {
    this.deathCam = null;
    this.hud.hideDeath();
    this.yaw = this.pred.yaw;
    this.pitch = 0;
    this.recoilAccum = 0;
    this.slotWanted = 0;
    this.prevPos.set(this.pred.x, this.pred.y, this.pred.z);
    this.curPos.copy(this.prevPos);
    this.vm.setWeapon(this.pred.slots[this.pred.slot].id, 0.35);
  }

  // ───────────── local prediction hooks ─────────────
  _localShot(def, seq, spread) {
    const p = this.pred;
    this.lastShotAt = performance.now();
    const eye = new THREE.Vector3(p.x, p.y + eyeHeight(p), p.z);
    this.camera.updateMatrixWorld();
    const muzzle = this.vm.muzzleWorld(this.camera);
    this.vm.fire(def);
    audio.shot(def, null, true);
    // recoil to view
    const r = def.recoil;
    const adsK = 1 - p.adsT * (1 - r.adsMul);
    const up = r.up * DEG * adsK * (p.crouched ? 0.8 : 1);
    this.pitch = Math.min(1.53, this.pitch + up);
    this.recoilAccum += up;
    this.yaw += ((Math.random() - 0.5) * 2 * r.side + r.bias) * DEG * adsK;
    this.punch += up * 0.6;
    this.punchYaw += (Math.random() - 0.5) * r.side * DEG * 0.5;
    if (def.cls === 'SHOTGUN' || def.cls === 'SNIPER' || def.cls === 'RAIL' || def.cls === 'LAUNCHER') this.shake += 0.6;
    if (def.projectile) {
      const [d] = shotDirections(p.yaw, p.pitch, spread, 1, shotSeed(p, seq));
      const pr = def.projectile;
      this.localProj.push({
        seq, def, x: eye.x + d[0] * 0.5, y: eye.y + d[1] * 0.5 - 0.08, z: eye.z + d[2] * 0.5,
        vx: d[0] * pr.speed + p.vx * 0.3, vy: d[1] * pr.speed, vz: d[2] * pr.speed + p.vz * 0.3, gravity: pr.gravity, radius: pr.radius, life: 2.5, hit: false,
      });
      return;
    }
    const dirs = shotDirections(p.yaw, p.pitch, spread, def.pellets, shotSeed(p, seq));
    const rt = this.renderTime();
    const color = '#' + new THREE.Color(def.tracer || 0xffd27a).getHexString();
    dirs.forEach((d, i) => {
      const wh = this.world.raycast(eye.x, eye.y, eye.z, d[0], d[1], d[2], 260, true);
      let t = wh ? wh.t : 260, kind = wh ? 'world' : 'none';
      for (const rp of this.players.values()) {
        if (rp.isSelf || !rp.alive || !rp.state) continue;
        if (this.teams && rp.info.team === this.team) continue;
        const s = rp.state;
        const hit = rayPlayer(eye.x, eye.y, eye.z, d[0], d[1], d[2], t, s.x, s.y, s.z, s.yaw, !!(s.flags & RF.CROUCH));
        if (hit && hit.t < t) { t = hit.t; kind = 'player'; }
      }
      void rt;
      const end = new THREE.Vector3(eye.x + d[0] * t, eye.y + d[1] * t, eye.z + d[2] * t);
      if (def.cls === 'RAIL') { if (i === 0) this.effects.railBeam(muzzle, end, color); }
      else if (def.pellets === 1 || i % 2 === 0) this.effects.tracer(muzzle, end, color, def.cls === 'SNIPER' ? 0.035 : 0.025, def.energy ? 220 : 340, !!def.energy);
      if (kind === 'world') this.effects.impact(end, new THREE.Vector3(wh.nx, wh.ny, wh.nz), 'world', color, !!def.energy);
      else if (kind === 'player') this.effects.impact(end, null, 'player');
      if (kind === 'world' && i === 0) audio.play(wh.box.mat === 'metal' || wh.box.mat === 'container' || wh.box.mat === 'trim' ? 'impactMetal' : 'impact', { pos: end, vol: 0.5, ref: 2 });
    });
  }

  _localSound(name, def, arg) {
    const vm = this.vm;
    switch (name) {
      case 'reload': {
        vm.startReload(def, arg === 1);
        const dur = def.shell ? def.shell.start : arg === 1 ? def.reloadEmpty : def.reload;
        if (!def.shell) {
          audio.play('magout', { delay: dur * 0.2, vol: 0.7 });
          audio.play('magin', { delay: dur * 0.58, vol: 0.8 });
          if (arg === 1 || def.fire === 'bolt') { audio.play('boltback', { delay: dur * 0.8, vol: 0.7 }); audio.play('boltfwd', { delay: dur * 0.88, vol: 0.7 }); }
        }
        break;
      }
      case 'shell': vm.shellInserted(); audio.play('shell', { vol: 0.8 }); break;
      case 'reloadEnd': vm.endReload(); if (def.shell && arg === 1) audio.play('pump', { vol: 0.7 }); break;
      case 'pump': vm.cycleAction('pump', fireInterval(def) * 0.85); audio.play('pump', { delay: 0.12, vol: 0.8 }); break;
      case 'bolt': vm.cycleAction('bolt', fireInterval(def) * 0.9); audio.play('boltback', { delay: 0.28, vol: 0.8 }); audio.play('boltfwd', { delay: 0.62, vol: 0.8 }); break;
      case 'equip': vm.setWeapon(def.id, def.equip * (arg ? 0.55 : 1)); audio.play('equip', { vol: 0.6 }); break;
      case 'dry': audio.play('dry', { vol: 0.8 }); break;
      case 'charge': audio.play('charge', { vol: 0.8 }); break;
      case 'swing':
        if (vm.weaponId !== def.id) vm.setWeapon(def.id, 0.02);
        vm.meleeSwing(def, arg);
        audio.play(`swing_${def.id}`, { vol: 0.9 });
        break;
      default: break;
    }
  }

  _localMove(ev) {
    if (ev.jumped) audio.play('jump', { vol: 0.35 });
    if (ev.landed) { audio.play('land', { vol: 0.45 }); this.vm.land(Math.abs(this.pred.vy) + 4); }
    if (ev.slideStart) audio.play('slide', { vol: 0.6 });
    if (ev.padLaunch) { audio.play('pad', { vol: 0.8 }); this.effects.padBurst(new THREE.Vector3(this.pred.x, this.pred.y, this.pred.z)); }
    if (ev.stepped && Math.abs(ev.stepped) < 0.7) this.stepOff -= ev.stepped;
  }

  // ───────────── remote shots & events ─────────────
  _shots(r) {
    const shots = decodeShots(r);
    for (const s of shots) {
      if (s.shooter === this.selfPid) continue;
      const def = weaponByIndex(s.weapon);
      if (!def) continue;
      const rp = this.players.get(s.shooter);
      const muzzle = rp ? rp.muzzleWorld() : new THREE.Vector3(s.ox, s.oy, s.oz);
      if (rp && rp.avatar) rp.avatar.triggerRecoil(def.cls === 'SHOTGUN' ? 1 : 0.5);
      audio.shot(def, muzzle, false);
      const d0 = dirFromAngles(s.yaw, s.pitch);
      const near = muzzle.distanceTo(this.camera.position) < 45;
      if (!def.suppressed) this.effects.muzzleFlash(muzzle, new THREE.Vector3(d0[0], d0[1], d0[2]), def.energy ? '#' + new THREE.Color(def.tracer).getHexString() : '#ffcc66', def.cls === 'SHOTGUN' ? 1.4 : 1, near);
      if (def.projectile) continue;
      const seed = hashInts(seedBaseFor(s.shooter), s.seq);
      const dirs = shotDirections(s.yaw, s.pitch, s.spread, def.pellets, seed);
      const color = '#' + new THREE.Color(def.tracer || 0xffd27a).getHexString();
      dirs.forEach((d, i) => {
        const res = s.results[i];
        if (!res) return;
        const end = new THREE.Vector3(s.ox + d[0] * res.t, s.oy + d[1] * res.t, s.oz + d[2] * res.t);
        if (def.cls === 'RAIL') { if (i === 0) this.effects.railBeam(muzzle, end, color); }
        else if (def.pellets === 1 || i % 3 === 0) this.effects.tracer(muzzle, end, color, 0.03, def.energy ? 220 : 300, !!def.energy);
        if (res.kind === 0 && end.distanceTo(this.camera.position) < 70) {
          const wh = this.world.raycast(s.ox, s.oy, s.oz, d[0], d[1], d[2], res.t + 0.2, true);
          if (wh) this.effects.impact(end, new THREE.Vector3(wh.nx, wh.ny, wh.nz), 'world', color, !!def.energy);
        } else if (res.kind === 1) this.effects.impact(end, null, 'player');
      });
      // bullet whiz when shots pass close by
      const cam = this.camera.position;
      const o = new THREE.Vector3(s.ox, s.oy, s.oz);
      const dv = new THREE.Vector3(d0[0], d0[1], d0[2]);
      const along = cam.clone().sub(o).dot(dv);
      if (along > 3) {
        const closest = o.clone().addScaledVector(dv, along);
        if (closest.distanceTo(cam) < 1.6) audio.play('jump', { pos: closest, vol: 0.5, rate: 2.2 });
      }
    }
  }

  _hit(m) {
    const kind = m.k ? 'kill' : m.h ? 'head' : 'hit';
    this.hud.hitmarker(kind);
    if (S.settings.value.hitSound) audio.ui(m.h ? 'hitmarkerHead' : 'hitmarker');
    if (m.k) audio.ui('kill');
    const rp = this.players.get(m.v);
    const head = rp && rp.headWorld();
    if (head) {
      if (m.h) this.effects.headshot(head);
      const v = head.clone().project(this.camera);
      if (v.z < 1) this.hud.damageNumber((v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight, m.d, !!m.h);
    }
  }

  _hurt(m) {
    this.health = m.hp;
    this.hud.damageFlash(m.d);
    this.shake += Math.min(1.2, m.d / 40);
    audio.play('hurt', { vol: 0.7 });
    const ax = m.x, az = m.z;
    if (m.a && m.a !== this.selfPid) {
      this.hud.damageIndicator(() => {
        const dx = ax - this.pred.x, dz = az - this.pred.z;
        const ang = Math.atan2(-dx, -dz);
        return -(ang - this.yaw);
      });
    }
  }

  _kill(m) {
    this.hud.killfeed(m);
    const killer = this.players.get(m.k);
    const victim = this.players.get(m.v);
    if (m.v === this.selfPid) this._localDeath(m);
    else if (victim) {
      let dir = null;
      if (killer && killer.state && victim.state) dir = new THREE.Vector3(victim.state.x - killer.state.x, 0.4, victim.state.z - killer.state.z).normalize();
      if (m.k === this.selfPid) dir = new THREE.Vector3(victim.state ? victim.state.x - this.pred.x : 0, 0.4, victim.state ? victim.state.z - this.pred.z : 0).normalize();
      victim.die(dir);
      if (victim.state && victim.avatar) audio.play('death', { pos: new THREE.Vector3(victim.state.x, victim.state.y + 1, victim.state.z), vol: 0.6 });
    }
    if (m.k === this.selfPid && m.v !== this.selfPid) {
      const name = victim ? victim.info.name : '';
      const pts = 100 + (m.h ? 25 : 0) + (m.fb ? 50 : 0) + (m.rv ? 25 : 0);
      this.hud.banner(`<span class="kb-label">${m.h ? 'HEADSHOT' : 'ELIMINATED'}</span><span class="kb-name">${name.replace(/</g, '&lt;')}</span><span class="kb-pts">+${pts}</span>`);
      const multi = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUAD KILL', 5: 'MEGA KILL' }[Math.min(5, m.m)];
      const streak = { 3: 'KILLING SPREE', 5: 'RAMPAGE', 7: 'DOMINATING', 10: 'UNSTOPPABLE', 15: 'GODLIKE' }[m.s];
      if (m.fb) { this.hud.announce('FIRST BLOOD', 'gold'); audio.announce('First blood!'); }
      else if (multi) { this.hud.announce(multi, 'gold'); audio.announce(multi.toLowerCase()); }
      else if (streak) { this.hud.announce(streak, 'pink'); audio.announce(streak.toLowerCase()); }
      else if (m.rv) this.hud.announce('REVENGE', 'cyan', 1.5);
    } else if (m.fb && m.k) {
      this.hud.announce(`FIRST BLOOD · ${killer ? killer.info.name : ''}`, 'small');
    }
    if (m.a && m.a.includes(this.selfPid)) this.hud.banner('<span class="kb-label">ASSIST</span><span class="kb-pts">+25</span>', 1.2);
  }

  _localDeath(m) {
    const killer = this.players.get(m.k);
    const def = weaponByIndex(m.w);
    this.hud.showDeath(killer && m.k !== this.selfPid ? killer.info.name : null, m.r === 'fall' ? null : def, MODES[this.mode].respawn, m.r);
    audio.play('death', { vol: 0.7 });
    this.deathCam = { t: 0, from: this.camera.position.clone(), killer: m.k, yaw: this.yaw };
    this.pred.alive = false;
  }

  _updateDeathCam(dt) {
    const dc = this.deathCam;
    dc.t += dt;
    const cam = this.camera;
    const k = Math.min(1, dc.t / 1.2);
    const e = k * k * (3 - 2 * k);
    const back = new THREE.Vector3(Math.sin(dc.yaw) * 3, 2.4, Math.cos(dc.yaw) * 3);
    cam.position.copy(dc.from).addScaledVector(back, e);
    const killer = this.players.get(dc.killer);
    if (killer && killer.state && killer.alive && !killer.isSelf) {
      const target = new THREE.Vector3(killer.state.x, killer.state.y + 1.3, killer.state.z);
      const m = new THREE.Matrix4().lookAt(cam.position, target, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      cam.quaternion.slerp(q, Math.min(1, dt * 4));
    } else {
      cam.rotation.set(-0.5 * e + this.pitch * (1 - e), dc.yaw, 0);
    }
  }

  _spawn(m) {
    const pos = new THREE.Vector3(m.x, m.y, m.z);
    if (m.pid === this.selfPid) {
      this.effects.spawnFlash(pos, this.teams ? '#' + new THREE.Color(TEAM_COLORS[this.team === 1 ? 1 : 0]).getHexString() : '#19e6ff');
      audio.play('spawn', { vol: 0.6 });
      this.yaw = m.yaw;
      this.pitch = 0;
      this.hud.hideDeath();
    } else {
      const rp = this.players.get(m.pid);
      if (rp) { rp.buf = []; rp.dying = false; }
      if (pos.distanceTo(this.camera.position) < 60) this.effects.spawnFlash(pos, rp && this.teams ? (rp.info.team === this.team ? '#19e6ff' : '#ff3d6e') : '#ffffff');
    }
  }

  _phase(m) {
    if (m.phase === 'live') {
      this.hud.announce('FIGHT!', 'big');
      audio.ui('go');
      audio.announce('Fight!', { stinger: false });
    }
  }

  _announce(m) {
    if (m.key === 'oneMinute') { this.hud.announce('1 MINUTE REMAINING', 'small'); audio.announce('One minute remaining'); }
  }

  _boom(m) {
    const pos = new THREE.Vector3(m.x, m.y, m.z);
    this.effects.explosion(pos, m.r);
    audio.play('explosion', { pos, vol: 1.2, ref: 8 });
    const d = pos.distanceTo(this.camera.position);
    this.shake += Math.max(0, 2.2 - d * 0.12);
    if (m.o === this.selfPid) this.localProj = this.localProj.filter((p) => p.seq !== m.s);
  }

  _end(m) {
    this.ended = true;
    S.matchEnd.value = m;
    input.unlock();
    const you = m.you;
    if (you.won) { audio.ui('victory'); audio.announce(this.teams ? 'Victory!' : 'You win!'); }
    else { audio.ui('defeat'); audio.announce(this.teams ? 'Defeat' : 'Match over'); }
    this.hud.el.classList.add('ended');
  }

  // ───────────── projectiles ─────────────
  _projMesh() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3a').multiplyScalar(3) }));
    g.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.effects.glowTex, color: new THREE.Color('#ff7a2a').multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(0.9);
    g.add(halo);
    this.scene.add(g);
    return g;
  }

  _updateProjectiles(dt) {
    const seen = new Set();
    // local predicted projectiles
    for (const pr of this.localProj) {
      if (!pr.hit) {
        const wh = stepProjectile(pr, this.world, dt);
        if (wh) pr.hit = true;
      }
      pr.life -= dt;
      const key = `l${pr.seq}`;
      seen.add(key);
      let m = this.projMeshes.get(key);
      if (!m) { m = this._projMesh(); this.projMeshes.set(key, m); }
      m.position.set(pr.x, pr.y, pr.z);
      m.visible = !pr.hit;
      if (!pr.hit) this.effects.particles.emit(pr.x, pr.y, pr.z, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0.35, 0.18, 1.6, 0.7, 0.2, 2);
    }
    this.localProj = this.localProj.filter((p) => p.life > 0);
    // server projectiles from other players
    if (this.serverProj) {
      const age = (performance.now() - this.serverProjAt) / 1000;
      for (const pr of this.serverProj) {
        if (pr.owner === this.selfPid) continue;
        const key = `s${pr.id}`;
        seen.add(key);
        let m = this.projMeshes.get(key);
        if (!m) { m = this._projMesh(); this.projMeshes.set(key, m); }
        const t = Math.min(age, 0.1);
        m.position.set(pr.x + pr.vx * t, pr.y + pr.vy * t - 4.5 * t * t, pr.z + pr.vz * t);
        m.visible = true;
        this.effects.particles.emit(m.position.x, m.position.y, m.position.z, 0, 0, 0, 0.35, 0.18, 1.6, 0.7, 0.2, 2);
      }
    }
    for (const [k, m] of this.projMeshes) {
      if (!seen.has(k)) { this.scene.remove(m); this.projMeshes.delete(k); }
    }
  }

  // show enemy name tags when aimed at
  _aimTag() {
    const p = this.pred;
    if (!p.alive) return;
    const eye = this.camera.position;
    const d = dirFromAngles(this.yaw, this.pitch);
    const wh = this.world.raycast(eye.x, eye.y, eye.z, d[0], d[1], d[2], 120, true);
    const maxT = wh ? wh.t : 120;
    for (const rp of this.players.values()) {
      if (rp.isSelf || !rp.alive || !rp.state) continue;
      const s = rp.state;
      const h = rayPlayer(eye.x, eye.y, eye.z, d[0], d[1], d[2], maxT, s.x, s.y, s.z, s.yaw, !!(s.flags & RF.CROUCH));
      if (h) rp.tagT = 0.8;
    }
  }

  leave() {
    net.send({ t: 'match.leave' });
  }

  dispose() {
    for (const off of this.offs) off();
    this.unInput();
    clearInterval(this.pingTimer);
    this.hud.dispose();
    for (const rp of this.players.values()) rp.dispose();
    this.effects.dispose();
    this.built.dispose();
    S.match.value = null;
  }
}

export { NO_TEAM, BTN };
