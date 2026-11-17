// Visual effects: GPU particles, tracers, muzzle flashes, impacts, decals,
// explosions, rail beams, spawn flashes and break-apart death debris.
import * as THREE from 'three';
import { radialGlowTexture } from './textures.js';

const pVert = /* glsl */`
attribute vec3 vel; attribute vec4 info; attribute vec3 pcolor;
uniform float time; uniform float gravity;
varying vec3 vColor; varying float vAlpha;
void main() {
  float t = time - info.x;
  float life = info.y;
  if (t < 0.0 || t > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; return; }
  float drag = info.w;

  vec3 p = position + (vel * (1.0 - exp(-drag * t)) / max(drag, 0.0001)) + vec3(0.0, -0.5 * gravity * t * t, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float k = t / life;
  gl_PointSize = info.z * (1.0 - k * 0.6) * (260.0 / -mv.z);
  vColor = pcolor;
  vAlpha = 1.0 - k;
}`;
const pFrag = /* glsl */`
varying vec3 vColor; varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = smoothstep(1.0, 0.0, d) * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor * (1.0 + (1.0 - d) * 1.5), a);
}`;

class ParticleSystem {
  constructor(max = 6000) {
    this.max = max;
    this.head = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.info = new Float32Array(max * 4).fill(-100);
    this.col = new Float32Array(max * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('vel', new THREE.BufferAttribute(this.vel, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('info', new THREE.BufferAttribute(this.info, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.uniforms = { time: { value: 0 }, gravity: { value: 9 } };
    this.mesh = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: pVert, fragmentShader: pFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.dirtyMin = Infinity; this.dirtyMax = -1;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, drag = 1.5) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.info[i * 4] = this.uniforms.time.value; this.info[i * 4 + 1] = life; this.info[i * 4 + 2] = size; this.info[i * 4 + 3] = drag;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }
  update(dt) {
    this.uniforms.time.value += dt;
    if (this.dirtyMax >= 0) {
      const g = this.geo;
      for (const name of ['position', 'vel', 'info', 'pcolor']) {
        const attr = g.attributes[name];
        const size = attr.itemSize;
        attr.clearUpdateRanges();
        attr.addUpdateRange(this.dirtyMin * size, (this.dirtyMax - this.dirtyMin + 1) * size);
        attr.needsUpdate = true;
      }
      this.dirtyMin = Infinity; this.dirtyMax = -1;
    }
  }
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Effects {
  constructor(scene, quality, world) {
    this.scene = scene;
    this.q = quality;
    this.world = world;
    this.particles = new ParticleSystem(Math.floor(6000 * Math.max(0.5, quality.particles)));
    scene.add(this.particles.mesh);
    this.glowTex = radialGlowTexture();
    this.active = [];
    // tracers
    this.tracerGeo = new THREE.PlaneGeometry(1, 1);
    this.tracerGeo.translate(0, 0.5, 0);
    this.tracerTex = (() => {
      const c = document.createElement('canvas'); c.width = 16; c.height = 128;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,1)');
      x.fillStyle = g; x.fillRect(4, 0, 8, 128);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    this.tracers = [];
    // flash lights pool (fixed count avoids shader recompiles)
    this.lights = [];
    const nLights = quality.maxLights >= 6 ? 3 : 1;
    for (let i = 0; i < nLights; i++) {
      const l = new THREE.PointLight('#ffcc88', 0, 9, 2);
      scene.add(l);
      this.lights.push({ l, t: 0, dur: 1 });
    }
    this.lightIdx = 0;
    // decals
    this.decalMax = quality.decals || 48;
    this.decals = [];
    this.decalGeo = new THREE.PlaneGeometry(0.12, 0.12);
    this.decalMat = new THREE.MeshBasicMaterial({ map: this._holeTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, opacity: 0.9 });
    this.debris = [];
  }

  _holeTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(5,5,8,1)'); g.addColorStop(0.35, 'rgba(15,15,20,0.85)'); g.addColorStop(0.55, 'rgba(255,170,80,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  _sprite(color, size, life, x, y, z, opts = {}) {
    const m = new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(color).multiplyScalar(opts.k || 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: opts.depthTest !== false });
    const s = new THREE.Sprite(m);
    s.position.set(x, y, z);
    s.scale.setScalar(size);
    s.renderOrder = 6;
    this.scene.add(s);
    this.active.push({ obj: s, t: 0, life, grow: opts.grow || 0, size, fade: true });
    return s;
  }

  flashLight(x, y, z, color, intensity = 6, dur = 0.06, range = 9) {
    if (!this.lights.length) return;
    const L = this.lights[this.lightIdx];
    this.lightIdx = (this.lightIdx + 1) % this.lights.length;
    L.l.position.set(x, y, z);
    L.l.color.set(color);
    L.l.distance = range;
    L.base = intensity * 10;
    L.l.intensity = L.base;
    L.t = 0; L.dur = dur;
  }

  /** Muzzle flash at a world position (third-person / remote players). */
  muzzleFlash(pos, dir, color = '#ffcc66', scale = 1, light = true) {
    this._sprite(color, 0.45 * scale, 0.05, pos.x, pos.y, pos.z, { k: 3 });
    for (let i = 0; i < 4 * this.q.particles; i++) {
      const sp = 3 + Math.random() * 5;
      this.particles.emit(pos.x, pos.y, pos.z, dir.x * sp + (Math.random() - 0.5) * 2, dir.y * sp + (Math.random() - 0.5) * 2, dir.z * sp + (Math.random() - 0.5) * 2, 0.12, 0.05, 1.5, 1.0, 0.5, 3);
    }
    if (light) this.flashLight(pos.x + dir.x * 0.3, pos.y + dir.y * 0.3, pos.z + dir.z * 0.3, color, 5, 0.05, 8);
  }

  tracer(from, to, color = '#ffd27a', width = 0.025, speed = 320, energy = false) {
    const dist = from.distanceTo(to);
    if (dist < 1.5) return;
    let t = this.tracers.find((x) => !x.alive);
    if (!t) {
      if (this.tracers.length > 80) return;
      const mesh = new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({ map: this.tracerTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      mesh.renderOrder = 7;
      this.scene.add(mesh);
      t = { mesh, alive: false };
      this.tracers.push(t);
    }
    t.alive = true;
    t.from = from.clone();
    t.dir = to.clone().sub(from).normalize();
    t.dist = dist;
    t.pos = 0.6;
    t.speed = speed;
    t.len = Math.min(energy ? 10 : 5, dist * 0.5);
    t.width = width * (energy ? 2.2 : 1);
    t.mesh.material.color.set(color).multiplyScalar(energy ? 4 : 2.5);
    t.mesh.visible = true;
  }

  railBeam(from, to, color = '#40f0ff') {
    const len = from.distanceTo(to);
    const geo = new THREE.CylinderGeometry(0.03, 0.03, len, 8, 1, true);
    geo.translate(0, len / 2, 0);
    geo.rotateX(Math.PI / 2);
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.position.copy(from);
    core.lookAt(to);
    const geo2 = new THREE.CylinderGeometry(0.12, 0.12, len, 10, 1, true);
    geo2.translate(0, len / 2, 0);
    geo2.rotateX(Math.PI / 2);
    const halo = new THREE.Mesh(geo2, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.add(halo);
    this.scene.add(core);
    this.active.push({ obj: core, t: 0, life: 0.45, beam: true, geos: [geo, geo2] });
    // spiral particles along the beam
    const d = to.clone().sub(from).normalize();
    const side = new THREE.Vector3().crossVectors(d, UP).normalize();
    const up = new THREE.Vector3().crossVectors(side, d);
    const c = new THREE.Color(color);
    const n = Math.min(160, len * 3) * this.q.particles;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const a = k * len * 2.2;
      tmp.copy(from).addScaledVector(d, k * len).addScaledVector(side, Math.cos(a) * 0.12).addScaledVector(up, Math.sin(a) * 0.12);
      this.particles.emit(tmp.x, tmp.y, tmp.z, side.x * Math.cos(a) * 0.6, 0.3, side.z * Math.cos(a) * 0.6, 0.5 + Math.random() * 0.3, 0.06, c.r * 1.5, c.g * 1.5, c.b * 1.5, 2);
    }
  }

  impact(pos, normal, kind = 'world', color = '#ffb35a', energy = false) {
    const n = normal || UP;
    const c = new THREE.Color(energy ? color : kind === 'player' ? '#ffcf4a' : '#ffbb66');
    const count = Math.floor((kind === 'player' ? 10 : 7) * this.q.particles);
    for (let i = 0; i < count; i++) {
      tmp.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).normalize();
      if (tmp.dot(n) < 0) tmp.negate();
      const sp = 2 + Math.random() * 5;
      this.particles.emit(pos.x, pos.y, pos.z, (tmp.x + n.x) * sp, (tmp.y + n.y) * sp + 1, (tmp.z + n.z) * sp, 0.25 + Math.random() * 0.25, 0.05, c.r * 2, c.g * 1.6, c.b * 1.2, 2.5);
    }
    if (kind === 'world') {
      // dust puff
      for (let i = 0; i < 3 * this.q.particles; i++) {
        this.particles.emit(pos.x, pos.y, pos.z, n.x * 0.8 + (Math.random() - 0.5) * 0.5, n.y * 0.8 + Math.random() * 0.4, n.z * 0.8 + (Math.random() - 0.5) * 0.5, 0.5, 0.25, 0.25, 0.23, 0.2, 4);
      }
      this._sprite(energy ? color : '#ffcc88', 0.22, 0.06, pos.x + n.x * 0.04, pos.y + n.y * 0.04, pos.z + n.z * 0.04, { k: 2.5 });
      this.decal(pos, n);
    } else {
      this._sprite('#ffe28a', 0.3, 0.07, pos.x, pos.y, pos.z, { k: 2 });
    }
  }

  headshot(pos) {
    this._sprite('#ffffff', 0.7, 0.12, pos.x, pos.y, pos.z, { k: 3, grow: 3 });
    for (let i = 0; i < 18 * this.q.particles; i++) {
      tmp.set((Math.random() - 0.5), Math.random() * 0.8, (Math.random() - 0.5)).normalize().multiplyScalar(3 + Math.random() * 4);
      this.particles.emit(pos.x, pos.y, pos.z, tmp.x, tmp.y, tmp.z, 0.35, 0.07, 2.5, 2.2, 1.2, 2);
    }
  }

  decal(pos, normal) {
    let d;
    if (this.decals.length >= this.decalMax) d = this.decals.shift();
    else { d = new THREE.Mesh(this.decalGeo, this.decalMat); this.scene.add(d); }
    d.position.copy(pos).addScaledVector(normal, 0.01);
    tmp.copy(pos).add(normal);
    d.lookAt(tmp);
    d.rotateZ(Math.random() * Math.PI * 2);
    const s = 0.7 + Math.random() * 0.6;
    d.scale.set(s, s, s);
    this.decals.push(d);
  }

  explosion(pos, radius = 4.5, color = '#ff7a2a') {
    this._sprite('#ffffff', radius * 0.8, 0.12, pos.x, pos.y, pos.z, { k: 4, grow: 2 });
    this._sprite(color, radius * 1.4, 0.4, pos.x, pos.y, pos.z, { k: 2.5, grow: 1.5 });
    const c = new THREE.Color(color);
    const n = Math.floor(90 * this.q.particles);
    for (let i = 0; i < n; i++) {
      tmp.set((Math.random() - 0.5), Math.random() * 0.9 - 0.15, (Math.random() - 0.5)).normalize().multiplyScalar(4 + Math.random() * 10);
      this.particles.emit(pos.x, pos.y, pos.z, tmp.x, tmp.y, tmp.z, 0.5 + Math.random() * 0.6, 0.12 + Math.random() * 0.1, c.r * 2.2, c.g * 1.5, c.b, 2.2);
    }
    for (let i = 0; i < 26 * this.q.particles; i++) {
      tmp.set((Math.random() - 0.5), Math.random() * 0.6, (Math.random() - 0.5)).normalize().multiplyScalar(1 + Math.random() * 2.5);
      this.particles.emit(pos.x, pos.y, pos.z, tmp.x, tmp.y + 1, tmp.z, 1.4 + Math.random(), 0.9, 0.18, 0.16, 0.15, 1.2);
    }
    // shockwave ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.copy(pos);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this.active.push({ obj: ring, t: 0, life: 0.45, ring: radius * 1.2 });
    this.flashLight(pos.x, pos.y + 0.5, pos.z, color, 30, 0.25, radius * 4);
  }

  spawnFlash(pos, color = '#19e6ff') {
    const geo = new THREE.CylinderGeometry(0.6, 0.6, 3.5, 20, 1, true);
    geo.translate(0, 1.75, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.5), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(pos);
    this.scene.add(m);
    this.active.push({ obj: m, t: 0, life: 0.6, spawn: true, geos: [geo] });
    const c = new THREE.Color(color);
    for (let i = 0; i < 30 * this.q.particles; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit(pos.x + Math.cos(a) * 0.6, pos.y + Math.random() * 0.3, pos.z + Math.sin(a) * 0.6, 0, 2 + Math.random() * 3, 0, 0.6, 0.08, c.r * 2, c.g * 2, c.b * 2, 1);
    }
  }

  padBurst(pos) {
    for (let i = 0; i < 24 * this.q.particles; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit(pos.x + Math.cos(a) * 0.5, pos.y + 0.1, pos.z + Math.sin(a) * 0.5, Math.cos(a) * 1.5, 4 + Math.random() * 4, Math.sin(a) * 1.5, 0.5, 0.08, 0.3, 2, 2.5, 1.5);
    }
  }

  slideDust(pos) {
    if (Math.random() > 0.5 * this.q.particles) return;
    this.particles.emit(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.05, pos.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5), 0.6 + Math.random() * 0.5, (Math.random() - 0.5), 0.45, 0.22, 0.22, 0.2, 0.18, 3);
  }

  /** pieces from Avatar.breakApart */
  addDebris(pieces, floorY) {
    for (const p of pieces) { p.floor = floorY; p.t = 0; this.debris.push(p); }
    // energy burst
    if (pieces[0]) {
      const c = pieces[0].obj.position;
      for (let i = 0; i < 30 * this.q.particles; i++) {
        tmp.set((Math.random() - 0.5), Math.random(), (Math.random() - 0.5)).normalize().multiplyScalar(2 + Math.random() * 4);
        this.particles.emit(c.x, c.y, c.z, tmp.x, tmp.y, tmp.z, 0.6, 0.08, 1.2, 2.2, 2.6, 2);
      }
    }
  }

  update(dt, camera) {
    this.particles.update(dt);
    for (const L of this.lights) {
      if (L.l.intensity <= 0) continue;
      L.t += dt;
      L.l.intensity = L.t >= L.dur ? 0 : L.base * (1 - L.t / L.dur);
    }
    // tracers
    for (const t of this.tracers) {
      if (!t.alive) continue;
      t.pos += t.speed * dt;
      const head = Math.min(t.pos, t.dist);
      const tail = Math.max(0, head - t.len);
      if (tail >= t.dist - 0.05) { t.alive = false; t.mesh.visible = false; continue; }
      const m = t.mesh;
      tmp.copy(t.from).addScaledVector(t.dir, tail);
      m.position.copy(tmp);
      // orient: local +Y along dir, face camera around that axis
      const len = head - tail;
      m.scale.set(t.width * (1 + tail * 0.004), len, 1);
      tmp2.copy(camera.position).sub(tmp);
      const yAxis = t.dir;
      const zAxis = tmp2.addScaledVector(yAxis, -tmp2.dot(yAxis)).normalize();
      const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
      const mat4 = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
      m.quaternion.setFromRotationMatrix(mat4);
    }
    // timed objects
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.t += dt;
      const k = a.t / a.life;
      if (k >= 1) {
        this.scene.remove(a.obj);
        if (a.obj.material) a.obj.material.dispose();
        if (a.geos) a.geos.forEach((g) => g.dispose());
        else if (a.ring && a.obj.geometry) a.obj.geometry.dispose();
        this.active.splice(i, 1);
        continue;
      }
      if (a.fade) {
        a.obj.material.opacity = 1 - k;
        if (a.grow) a.obj.scale.setScalar(a.size * (1 + a.grow * k));
      } else if (a.beam) {
        a.obj.traverse((o) => { if (o.material) o.material.opacity = (1 - k) * (o === a.obj ? 1 : 0.6); });
        a.obj.scale.set(1 - k * 0.7, 1 - k * 0.7, 1);
      } else if (a.ring) {
        const s = 0.5 + a.ring * k;
        a.obj.scale.set(s, s, s);
        a.obj.material.opacity = 1 - k;
      } else if (a.spawn) {
        a.obj.material.opacity = 0.5 * (1 - k);
        a.obj.scale.set(1 - k * 0.5, 1 + k, 1 - k * 0.5);
      }
    }
    // debris physics
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      d.v.y -= 22 * dt;
      d.obj.position.addScaledVector(d.v, dt);
      d.obj.rotation.x += d.w.x * dt; d.obj.rotation.y += d.w.y * dt; d.obj.rotation.z += d.w.z * dt;
      if (d.obj.position.y < d.floor + 0.1) {
        d.obj.position.y = d.floor + 0.1;
        d.v.y = Math.abs(d.v.y) * 0.35;
        d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6);
      }
      if (d.t > 2.2) {
        const s = Math.max(0, 1 - (d.t - 2.2) / 0.6);
        d.obj.scale.multiplyScalar(s > 0 ? Math.max(0.85, s) : 0);
      }
      if (d.t > 2.8) { this.scene.remove(d.obj); this.debris.splice(i, 1); }
    }
  }

  dispose() {
    this.scene.remove(this.particles.mesh);
    for (const t of this.tracers) this.scene.remove(t.mesh);
    for (const d of this.decals) this.scene.remove(d);
    for (const a of this.active) this.scene.remove(a.obj);
    for (const L of this.lights) this.scene.remove(L.l);
    for (const d of this.debris) this.scene.remove(d.obj);
  }
}
