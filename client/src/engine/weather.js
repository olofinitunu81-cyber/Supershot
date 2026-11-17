// GPU-animated weather particles (rain, snow, dust) that follow the camera.
import * as THREE from 'three';

const vert = /* glsl */`
uniform float time; uniform vec3 center; uniform float speed; uniform float sway; uniform float size; uniform float boxSize; uniform float boxH;
attribute float seed;
varying float vAlpha;
void main() {
  vec3 p = position;
  p.y = mod(p.y - time * speed * (0.7 + seed * 0.6), boxH);
  p.x += sin(time * 0.7 + seed * 30.0) * sway;
  p.z += cos(time * 0.6 + seed * 20.0) * sway;
  vec3 wp = vec3(center.x + mod(p.x - center.x + boxSize * 0.5, boxSize) - boxSize * 0.5, center.y - boxH * 0.35 + p.y, center.z + mod(p.z - center.z + boxSize * 0.5, boxSize) - boxSize * 0.5);
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(size * (300.0 / -mv.z), 14.0);
  vAlpha = smoothstep(2.5, 9.0, -mv.z) * (1.0 - smoothstep(boxSize * 0.35, boxSize * 0.5, length(mv.xyz)));
}`;

const frag = /* glsl */`
uniform vec3 color; uniform float stretch; uniform float opacity;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = stretch > 0.0 ? length(vec2(c.x * 8.0, c.y)) : length(c) * 2.0;
  float a = smoothstep(1.0, 0.2, d) * vAlpha * opacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(color, a);
}`;

export function createWeather(theme, q) {
  let kind = null;
  if (theme.rain) kind = 'rain';
  else if (theme.snow) kind = 'snow';
  else if (theme.dust) kind = 'dust';
  if (!kind || q.weather <= 0) return null;
  const cfg = {
    rain: { count: 6000, speed: 24, sway: 0.1, size: 0.32, color: '#9fb8ff', stretch: 1, opacity: 0.4 },
    snow: { count: 4000, speed: 1.6, sway: 0.8, size: 0.16, color: '#b8c4d4', stretch: 0, opacity: 0.85 },
    dust: { count: 900, speed: 0.4, sway: 2.5, size: 0.08, color: '#a08a6a', stretch: 0, opacity: 0.35 },
  }[kind];
  const count = Math.floor(cfg.count * q.weather);
  const boxSize = 50, boxH = 24;
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random() * boxSize;
    pos[i * 3 + 1] = Math.random() * boxH;
    pos[i * 3 + 2] = Math.random() * boxSize;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const uniforms = {
    time: { value: 0 }, center: { value: new THREE.Vector3() }, speed: { value: cfg.speed }, sway: { value: cfg.sway },
    size: { value: cfg.size }, boxSize: { value: boxSize }, boxH: { value: boxH }, color: { value: new THREE.Color(cfg.color) },
    stretch: { value: cfg.stretch }, opacity: { value: cfg.opacity },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, fog: false, blending: kind === 'rain' ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.update = (dt, camera) => {
    uniforms.time.value += dt;
    if (camera) uniforms.center.value.copy(camera.position);
  };
  return pts;
}
