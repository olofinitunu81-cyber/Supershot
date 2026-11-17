// Offscreen 3D thumbnail renderer for shop/inventory/locker item cards.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getItem } from '../../../shared/items.js';
import { DEFAULT_AVATAR } from '../../../shared/avatar.js';
import { WEAPONS } from '../../../shared/weapons.js';
import { Avatar } from '../engine/avatar.js';
import { buildWeaponModel } from '../engine/weaponmodels.js';

let R = null;
const cache = new Map();
const waiting = new Map();
const queue = [];
let running = false;

function setup() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 192;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(192, 192, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(2, 3, -3); scene.add(key);
  const rim = new THREE.DirectionalLight('#19e6ff', 1.2); rim.position.set(-3, 1, 2); scene.add(rim);
  scene.add(new THREE.AmbientLight('#ffffff', 0.5));
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  R = { renderer, scene, camera, canvas };
}

function frameObject(obj, mode) {
  const { camera } = R;
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * (mode === 'head' ? 0.62 : 0.6);
  const dist = radius / Math.tan((camera.fov * Math.PI) / 360) * 1.05;
  const dir = mode === 'weapon' ? new THREE.Vector3(0.95, 0.25, 0.0) : new THREE.Vector3(0.35, 0.18, -1);
  camera.position.copy(center).addScaledVector(dir.normalize(), dist);
  camera.lookAt(center);
}

function renderItem(id) {
  if (!R) setup();
  const { renderer, scene, camera, canvas } = R;
  const item = getItem(id);
  const holder = new THREE.Group();
  scene.add(holder);
  let mode = 'body';
  try {
    if (!item) return '';
    if (item.cat === 'weapon' || item.cat === 'melee') {
      const m = buildWeaponModel(id);
      if (m.userData.kind === 'melee') { m.rotation.z = -Math.PI / 2 - 0.5; m.rotation.y = Math.PI / 2; }
      else m.rotation.y = Math.PI / 2;
      holder.add(m);
      mode = 'weapon';
    } else if (item.cat === 'camo') {
      const m = buildWeaponModel('vx9', id);
      m.rotation.y = Math.PI / 2;
      holder.add(m);
      mode = 'weapon';
    } else {
      const app = { ...DEFAULT_AVATAR, hat: 'hat_none', faceAcc: 'faceacc_none', back: 'back_none' };
      const slot = { outfit: 'outfit', head: 'head', face: 'face', hair: 'hair', hat: 'hat', faceacc: 'faceAcc', shirt: 'shirt', pants: 'pants', back: 'back' }[item.cat];
      if (slot) app[slot] = id;
      if (item.cat === 'hat') app.hair = 'hair_none';
      const av = new Avatar(app, { shadows: false });
      av.attachWeapon(null);
      if (item.cat === 'emote') {
        av.playEmote(id);
        for (let i = 0; i < 20; i++) av.update(0.03, { vx: 0, vz: 0, yaw: 0, onGround: true, pitch: 0 });
      } else av.update(0.016, { vx: 0, vz: 0, yaw: 0, onGround: true, pitch: 0 });
      if (item.cat === 'back') av.root.rotation.y = Math.PI * 0.8;
      holder.add(av.root);
      mode = ['face', 'hair', 'hat', 'faceacc', 'head'].includes(item.cat) ? 'head' : 'body';
      if (mode === 'head') {
        av.root.updateMatrixWorld(true);
        frameObject(av.head, 'head');
      }
    }
    if (mode !== 'head') frameObject(holder, mode);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    return canvas.toDataURL('image/png');
  } finally {
    scene.remove(holder);
  }
}

function pump() {
  if (running) return;
  running = true;
  const step = () => {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 12) {
      const id = queue.shift();
      if (cache.has(id)) continue;
      let url = '';
      try { url = renderItem(id); } catch (e) { console.warn('thumb failed', id, e); }
      cache.set(id, url);
      const ws = waiting.get(id) || [];
      waiting.delete(id);
      ws.forEach((fn) => fn(url));
    }
    if (queue.length) requestAnimationFrame(step);
    else running = false;
  };
  requestAnimationFrame(step);
}

export function thumb(id) {
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  return new Promise((resolve) => {
    if (!waiting.has(id)) { waiting.set(id, []); queue.push(id); }
    waiting.get(id).push(resolve);
    pump();
  });
}

export function cachedThumb(id) {
  return cache.get(id);
}

export { WEAPONS };
