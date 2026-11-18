import { MapBuilder } from './dsl.js';

// The social lobby hangar. Used only by clients (positions are relayed by the server).

export const STATIONS = [
  { id: 'play', label: 'DEPLOY', panel: 'play', x: 0, z: -15.5, r: 4.2, cam: { pos: [0, 3.2, -6], look: [0, 3.2, -16] } },
  { id: 'locker', label: 'LOCKER', panel: 'locker', x: -21, z: 0, r: 4, cam: { pos: [-17.3, 1.75, 0.9], look: [-21, 1.2, 0] } },
  { id: 'armory', label: 'ARMORY', panel: 'armory', x: 21, z: 0, r: 4, cam: { pos: [17.3, 2.25, 0.75], look: [21, 1.8, 0] } },
  { id: 'shop', label: 'SHOP', panel: 'shop', x: 14, z: 14, r: 3.6, cam: { pos: [11.2, 2.7, 10.2], look: [14.5, 2.4, 16.5] } },
  { id: 'leaderboard', label: 'LEADERBOARDS', panel: 'leaderboard', x: -14, z: 16.5, r: 4, cam: { pos: [-11, 3.4, 8], look: [-14, 3.6, 18] } },
  { id: 'missions', label: 'DAILY & MISSIONS', panel: 'missions', x: 13, z: -12, r: 3.4, cam: { pos: [9, 2.4, -7.5], look: [13, 1.6, -12] } },
  { id: 'social', label: 'FRIENDS & PARTY', panel: 'friends', x: -13, z: -12, r: 3.4, cam: { pos: [-9, 2.4, -7.5], look: [-13, 1.6, -12] } },
];

export function buildLobby() {
  const m = new MapBuilder({
    id: 'lobby',
    name: 'HANGAR',
    theme: {
      preset: 'night',
      sky: { top: '#030312', mid: '#120a2e', horizon: '#3a1468', bottom: '#030308', stars: 1, sunDir: [0.2, 0.3, -0.9], sunColor: '#9b5bff', sunSize: 0.6 },
      fog: { color: '#0b0820', near: 40, far: 160 },
      hemi: { sky: '#7d6bff', ground: '#1a1030', intensity: 1.1 },
      sun: { color: '#b9c7ff', intensity: 1.2, dir: [-0.3, -1, 0.25] },
      exposure: 1.05,
      mats: {
        floor: { tex: 'lobbyfloor', color: '#3a3d4c', rough: 0.25, metal: 0.4 },
        floor2: { tex: 'metalgrid', color: '#5a6178', rough: 0.4, metal: 0.7 },
        wall: { tex: 'panels', color: '#252a3a', rough: 0.45, metal: 0.5 },
        wall2: { tex: 'panels', color: '#1a1d2a', rough: 0.4, metal: 0.6 },
        roof: { tex: 'panels', color: '#1c1f2c', rough: 0.5 },
        trim: { tex: 'metal', color: '#8f97ad', rough: 0.3, metal: 0.85 },
        stairs: { tex: 'metalgrid', color: '#6c7385', rough: 0.4, metal: 0.7 },
        interior: { tex: 'tiles', color: '#2b2d38', rough: 0.4 },
        crate: { tex: 'crate', color: '#3c6fd1', rough: 0.6, metal: 0.3 },
        metal: { tex: 'metal', color: '#4a5068', rough: 0.4, metal: 0.8 },
        barrier: { tex: 'panels', color: '#2c3046', rough: 0.4 },
        rail: { tex: 'metal', color: '#9aa3b5', rough: 0.3, metal: 0.9 },
        padbase: { tex: 'metal', color: '#2a2d38', rough: 0.4, metal: 0.8 },
      },
      neon: ['#19e6ff', '#ff2fa6', '#9b5bff'],
    },
  });
  m.box(0, -1, 0, 70, 1, 56, 'floor');
  // perimeter walls (north wall has a huge window)
  m.box(0, 0, -23, 62, 1.2, 1, 'wall2');
  m.box(0, 9, -23, 62, 5, 1, 'wall2');
  for (const x of [-24, -12, 0, 12, 24]) m.box(x, 1.2, -23, 1, 7.8, 1.2, 'trim');
  m.box(0, 0, 23, 62, 14, 1, 'wall');
  m.box(-31, 0, 0, 1, 14, 46, 'wall');
  m.box(31, 0, 0, 1, 14, 46, 'wall');
  m.box(0, 14, 0, 64, 0.6, 48, 'roof');
  m.bounds(-29.5, 29.5, -21.5, 21.5, 20, -2);
  for (const x of [-30.4, 30.4]) for (const z of [-14, -4, 6, 16]) m.neon(x, 0.3, z, 0.1, 9, 0.12, x < 0 ? '#ff2fa6' : '#19e6ff');
  m.neon(0, 13.9, 0, 50, 0.08, 0.3, '#9b5bff');
  m.neon(0, 13.9, -10, 50, 0.08, 0.3, '#19e6ff');
  m.neon(0, 13.9, 10, 50, 0.08, 0.3, '#ff2fa6');
  // central spawn platform
  m.box(0, 0, 3, 9, 0.25, 9, 'floor2');
  m.box(0, 0, 3, 3.4, 0.6, 3.4, 'trim');
  m.deco('holo', 0, 0.6, 3, { kind: 'logo', color: '#19e6ff', size: 4.2 });
  m.light(0, 5, 3, '#19e6ff', 2.0, 16);
  // deploy gate platform
  m.box(0, 0, -16.5, 12, 0.35, 6, 'floor2');
  m.light(0, 4, -15, '#ff2fa6', 2.5, 18);
  // locker stage
  m.box(-21.5, 0, 0, 5, 0.4, 8, 'floor2');
  m.light(-19, 4.5, 0, '#ffffff', 1.6, 12);
  // armory wall
  m.box(21.5, 0, 0, 5, 0.4, 8, 'floor2');
  m.box(29.2, 0, 0, 2.5, 6, 14, 'wall2');
  m.light(19, 4.5, 0, '#ffd27a', 1.6, 12);
  // shop kiosk
  m.box(14.5, 0, 15.5, 6, 0.3, 5, 'floor2');
  m.box(15.5, 0, 17, 3.2, 1.1, 1.2, 'wall2');
  m.light(14, 4, 14, '#ffd400', 1.8, 12);
  // leaderboard wall screen frame
  m.box(-14, 0, 18.6, 12, 0.6, 1.5, 'trim');
  m.light(-14, 6, 15, '#19e6ff', 1.6, 14);
  // missions terminal
  m.box(13, 0, -12.5, 2.4, 1.2, 1.2, 'wall2');
  m.light(13, 3.5, -11, '#3dff9a', 1.4, 10);
  // social terminal + benches
  m.box(-13, 0, -12.5, 2.4, 1.2, 1.2, 'wall2');
  m.box(-17, 0, -9, 3.5, 0.5, 1, 'trim');
  m.box(-9, 0, -9, 3.5, 0.5, 1, 'trim');
  m.light(-13, 3.5, -11, '#9b5bff', 1.4, 10);
  // pillars with neon
  for (const [x, z] of [[-8, -6], [8, -6], [-8, 12], [8, 12]]) {
    m.box(x, 0, z, 1.2, 14, 1.2, 'trim');
    m.neon(x - 0.62, 0.5, z, 0.06, 12.8, 0.4, x < 0 ? '#ff2fa6' : '#19e6ff');
    m.neon(x + 0.62, 0.5, z, 0.06, 12.8, 0.4, x < 0 ? '#ff2fa6' : '#19e6ff');
  }
  m.deco('tree', -26, 0, 19, { s: 1.4 });
  m.deco('tree', 26, 0, 19, { s: 1.4 });
  m.deco('tree', -26, 0, -19, { s: 1.2 });
  m.deco('tree', 26, 0, -19, { s: 1.2 });
  m.deco('car', 22, 0, 13, { color: '#ff2fa6', yaw: 0.6 });
  m.box(22, 0, 13, 3.4, 1.35, 4.8, 'clip', { hidden: true, bullet: true });
  m.deco('ship', -22, 6.5, -14, { color: '#19e6ff', yaw: 0.4 });
  m.sign(0, 10.5, 22.4, 16, 2.2, 'SUPERSHOT', '#19e6ff', Math.PI, { glow: 1.3 });
  m.sign(-30.4, 6, 0, 0.2, 1.6, 'LOCKER', '#ff2fa6', Math.PI / 2, { glow: 2.2 });
  m.sign(28, 7, 0, 0.2, 1.6, 'ARMORY', '#ffd27a', -Math.PI / 2, { glow: 2.2 });
  return m.build();
}
