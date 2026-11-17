// Theme-driven materials, procedural sky dome, environment map and lighting.
import * as THREE from 'three';
import { getTextureSet, TEX_SCALE } from './textures.js';

export class MaterialLibrary {
  constructor(theme, quality, anisotropy = 8) {
    this.theme = theme;
    this.q = quality;
    this.aniso = Math.min(anisotropy, quality.shadows >= 2048 ? 16 : 4);
    this.cache = new Map();
    this.texSize = quality.shadows === 0 ? 256 : 512;
  }

  def(name) {
    return this.theme.mats[name] || this.theme.mats.wall || { tex: 'concrete', color: '#888888', rough: 0.8 };
  }

  texScale(name) {
    return TEX_SCALE[this.def(name).tex] || 4;
  }

  get(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const d = this.def(name);
    const set = getTextureSet(d.tex, { size: this.texSize, anisotropy: this.aniso, opts: d.lit ? { lit: d.lit } : undefined });
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(d.color || '#ffffff'),
      map: set.map,
      normalMap: set.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: d.rough ?? 0.8,
      metalness: d.metal ?? 0,
      roughnessMap: set.roughnessMap || null,
      vertexColors: true,
      envMapIntensity: 0.9,
    });
    if (set.emissiveMap) {
      mat.emissive = new THREE.Color('#ffffff');
      mat.emissiveMap = set.emissiveMap;
      mat.emissiveIntensity = d.tex === 'windows' ? 2.4 : 1.1;
    }
    if (d.transparent) {
      mat.transparent = true;
      mat.opacity = d.transparent;
      mat.depthWrite = false;
    }
    mat.name = name;
    this.cache.set(name, mat);
    return mat;
  }

  dispose() {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
  }
}

// ───────────── sky ─────────────

const skyVert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */`
uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 bottom;
uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunSize; uniform float stars; uniform float time; uniform float clouds;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col;
  if (y > 0.0) {
    float t1 = smoothstep(0.0, 0.18, y);
    float t2 = smoothstep(0.12, 0.75, y);
    col = mix(horizon, mid, t1);
    col = mix(col, top, t2);
  } else {
    col = mix(horizon, bottom, smoothstep(0.0, -0.25, y));
  }
  // sun
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(sd, 900.0) * 6.0 * sunSize + pow(sd, 24.0) * 0.35 * (sunSize + 0.25) + pow(sd, 4.0) * 0.12);
  // stars
  if (stars > 0.0 && y > 0.0) {
    vec3 p = d * 260.0;
    float s = hash(floor(p));
    float tw = 0.6 + 0.4 * sin(time * 2.0 + s * 40.0);
    col += vec3(smoothstep(0.996, 1.0, s)) * stars * tw * smoothstep(0.05, 0.3, y) * 1.5;
  }
  // soft clouds
  if (clouds > 0.0) {
    vec2 uv = d.xz / max(0.08, abs(d.y) + 0.12);
    float n = noise(vec3(uv * 0.6 + time * 0.01, 0.0)) * 0.6 + noise(vec3(uv * 1.7, 3.0)) * 0.4;
    float c = smoothstep(0.55, 0.8, n) * clouds * (1.0 - smoothstep(0.0, 0.5, abs(y)));
    col = mix(col, horizon * 1.15 + vec3(0.08), c * 0.6);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky(theme) {
  const sky = theme.sky;
  const u = {
    top: { value: new THREE.Color(sky.top) },
    mid: { value: new THREE.Color(sky.mid) },
    horizon: { value: new THREE.Color(sky.horizon) },
    bottom: { value: new THREE.Color(sky.bottom) },
    sunDir: { value: new THREE.Vector3(...(sky.sunDir || [0.3, 0.5, -0.8])).normalize() },
    sunColor: { value: new THREE.Color(sky.sunColor || '#ffffff') },
    sunSize: { value: sky.sunSize ?? 1 },
    stars: { value: sky.stars || 0 },
    clouds: { value: theme.clouds ? 1 : sky.clouds || 0 },
    time: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.userData.update = (dt) => { u.time.value += dt; };
  return mesh;
}

export function createEnvMap(renderer, theme) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  const sky = createSky({ ...theme, clouds: false });
  scene.add(sky);
  // a few bright panels so metals catch highlights
  const neon = theme.neon || ['#ffffff'];
  neon.slice(0, 3).forEach((c, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(120, 18), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6), side: THREE.DoubleSide }));
    const a = (i / 3) * Math.PI * 2;
    m.position.set(Math.cos(a) * 300, 60 + i * 20, Math.sin(a) * 300);
    m.lookAt(0, 0, 0);
    scene.add(m);
  });
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  sky.geometry.dispose();
  sky.material.dispose();
  return rt.texture;
}

export function createLights(scene, theme, extent, q) {
  const hemi = new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity * 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity);
  const dir = new THREE.Vector3(...theme.sun.dir).normalize();
  const cx = (extent.minX + extent.maxX) / 2, cz = (extent.minZ + extent.maxZ) / 2;
  const span = Math.max(extent.maxX - extent.minX, extent.maxZ - extent.minZ) * 0.5 + 6;
  sun.position.set(cx - dir.x * 120, -dir.y * 120, cz - dir.z * 120);
  sun.target.position.set(cx, 0, cz);
  scene.add(sun);
  scene.add(sun.target);
  if (q.shadows > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(q.shadows, q.shadows);
    const cam = sun.shadow.camera;
    cam.left = -span; cam.right = span; cam.top = span; cam.bottom = -span;
    cam.near = 1; cam.far = 320;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 2;
    cam.updateProjectionMatrix();
  }
  return { hemi, sun };
}
