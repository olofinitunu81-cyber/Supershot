import { MapBuilder } from './dsl.js';

// SKYPORT — floating docking platforms above a sea of sunset clouds.
// Bridges, jump pads and a two-level control tower. Falling is fatal.

export function buildSkyport() {
  const m = new MapBuilder({
    id: 'skyport',
    name: 'SKYPORT',
    desc: 'Floating docks high above the clouds. Narrow bridges, jump pads and a deadly drop.',
    killY: -18,
    theme: {
      preset: 'sunset',
      sky: { top: '#1d3b8f', mid: '#f07a54', horizon: '#ffd08a', bottom: '#f6b48a', stars: 0, sunDir: [0.55, 0.12, -0.8], sunColor: '#ffd9a0', sunSize: 1.0 },
      fog: { color: '#f2a983', near: 60, far: 230 },
      hemi: { sky: '#ffd2b0', ground: '#6a4f8a', intensity: 0.95 },
      sun: { color: '#ffd3a1', intensity: 2.4, dir: [-0.55, -0.55, 0.62] },
      exposure: 1.0,
      clouds: true,
      mats: {
        floor: { tex: 'deck', color: '#c9ced8', rough: 0.55, metal: 0.3 },
        floor2: { tex: 'metalgrid', color: '#8d96a8', rough: 0.45, metal: 0.7 },
        wall: { tex: 'panels', color: '#e7eaf0', rough: 0.45, metal: 0.2 },
        wall2: { tex: 'panels', color: '#2e3a55', rough: 0.4, metal: 0.4 },
        roof: { tex: 'panels', color: '#d9dde6', rough: 0.5 },
        trim: { tex: 'metal', color: '#ff8a2a', rough: 0.35, metal: 0.6 },
        stairs: { tex: 'metalgrid', color: '#9aa4b8', rough: 0.4, metal: 0.7 },
        interior: { tex: 'deck', color: '#9ba3b2', rough: 0.5 },
        underside: { tex: 'metal', color: '#4a5168', rough: 0.6, metal: 0.6 },
        crate: { tex: 'crate', color: '#3c6fd1', rough: 0.6, metal: 0.3 },
        metal: { tex: 'metal', color: '#7c8496', rough: 0.4, metal: 0.8 },
        container: { tex: 'container', color: '#e46b2a', rough: 0.55, metal: 0.5 },
        barrier: { tex: 'panels', color: '#f0f2f6', rough: 0.5, stripe: '#ff8a2a' },
        rail: { tex: 'metal', color: '#dfe5ee', rough: 0.3, metal: 0.9 },
        padbase: { tex: 'metal', color: '#2a2d38', rough: 0.4, metal: 0.8 },
      },
      neon: ['#ff8a2a', '#19e6ff', '#ffffff'],
    },
  });

  m.bounds(-38, 38, -52, 52, 60, -30);

  // central platform + tower (shared)
  m.slab(0, 0, 0, 26, 26, 1.6, 'floor');
  m.box(0, -1.6, 0, 26.4, 0.3, 26.4, 'trim');
  m.deco('rock', 0, -1.6, 0, { s: 13 });
  // tower ground floor walls with 4 openings
  m.building({ x: 0, z: 0, w: 9, d: 9, h: 4.1, mat: 'wall2', roof: false, floor: false,
    doors: [{ side: 'n', at: 0, w: 3 }, { side: 's', at: 0, w: 3 }, { side: 'e', at: 0, w: 3 }, { side: 'w', at: 0, w: 3 }] });
  // upper deck
  m.slab(0, 4.5, 0, 12, 12, 0.4, 'floor2');
  m.box(0, 4.5, -5.85, 5, 1.1, 0.3, 'trim');
  m.box(0, 4.5, 5.85, 5, 1.1, 0.3, 'trim');
  m.box(-5.85, 4.5, 0, 0.3, 1.1, 5, 'trim');
  m.box(5.85, 4.5, 0, 0.3, 1.1, 5, 'trim');
  m.box(0, 4.5, 0, 1.6, 2.6, 1.6, 'wall');
  m.deco('antenna', 0, 7.1, 0, { h: 6 });
  m.light(0, 8, 0, '#19e6ff', 2.0, 16);
  m.sign(0, 6.3, 0.85, 1.4, 0.5, 'SKYPORT', '#19e6ff', 0, { glow: 2 });
  m.sign(0, 6.3, -0.85, 1.4, 0.5, 'SKYPORT', '#19e6ff', Math.PI, { glow: 2 });

  m.sym((b) => {
    // ── home base platform ──
    b.slab(0, 0, -40, 30, 16, 1.6, 'floor');
    b.box(0, -1.6, -40, 30.4, 0.3, 16.4, 'trim');
    b.deco('rock', 0, -1.6, -40, { s: 15 });
    b.building({ x: 0, z: -45, w: 18, d: 6, h: 5, mat: 'wall', doors: [{ side: 's', at: 0, w: 11, y1: 4.2 }] });
    b.sign(0, 4.6, -41.95, 6, 0.9, 'DOCK ' + (b.f === 1 ? 'A' : 'B'), b.f === 1 ? '#19e6ff' : '#ff3d6e', 0, { glow: 2.2 });
    b.deco('ship', 10, 0, -38, { yaw: -0.5, color: b.f === 1 ? '#19e6ff' : '#ff3d6e' });
    b.box(10, 0, -38, 6, 2.2, 3.6, 'clip', { hidden: true, bullet: true });
    b.container(-9, 0, -36, 'z', '#e46b2a');
    b.crate(-4, 0, -34, 1.3);
    b.crate(4.5, 0, -33.6, 1.3);
    b.barrier(0, -36.5, 4, 'x');
    for (const [x, z] of [[-6, -40], [-2, -40], [2, -40], [6, -40], [-12, -42], [12, -43], [-3, -37], [3, -37]]) b.spawn(0, x, 0.2, z, Math.PI);
    b.light(0, 3.8, -41, '#ffd3a1', 1.6, 14);

    // wings
    b.slab(-20, 0, -38, 10, 6, 1.4, 'floor');
    b.slab(20, 0, -38, 10, 6, 1.4, 'floor');
    b.box(-20, -1.4, -38, 10.2, 0.25, 6.2, 'trim');
    b.box(20, -1.4, -38, 10.2, 0.25, 6.2, 'trim');
    b.crate(-22, 0, -39.5, 1.2);
    b.crate(22, 0, -36.5, 1.2);

    // center bridge
    b.slab(0, 0, -22, 4, 22, 0.5, 'floor2');
    b.railZ(-33, -13, -2.1, 0);
    b.railZ(-33, -13, 2.1, 0);
    b.neon(-2.1, 1.08, -23, 0.06, 0.06, 20, '#19e6ff');
    b.neon(2.1, 1.08, -23, 0.06, 0.06, 20, '#ff8a2a');

    // side bridges from wings to side platforms
    b.slab(-23.5, 0, -30, 3, 12.2, 0.5, 'floor2');
    b.slab(23.5, 0, -30, 3, 12.2, 0.5, 'floor2');
    b.railZ(-35, -25, -25.1, 0);
    b.railZ(-35, -25, 25.1, 0);

    // side platforms (raised slightly)
    b.slab(-24, 0, -15, 14, 18, 1.4, 'floor');
    b.box(-24, -1.4, -15, 14.2, 0.25, 18.2, 'trim');
    b.deco('rock', -24, -1.4, -15, { s: 9 });
    b.slab(24, 0, -15, 14, 18, 1.4, 'floor');
    b.box(24, -1.4, -15, 14.2, 0.25, 18.2, 'trim');
    b.deco('rock', 24, -1.4, -15, { s: 9 });
    // cover on side platforms
    b.container(-27, 0, -18, 'z', '#3c6fd1');
    b.crate(-21, 0, -11, 1.3);
    b.crate(-21, 1.3, -11, 1.0);
    b.barrier(-24, -7.5, 3.5, 'x');
    b.box(27, 0, -12, 2.2, 2.2, 2.2, 'wall2');
    b.crate(22, 0, -19, 1.3);
    b.barrier(25.5, -22.5, 3, 'x');
    // jump pads → tower upper deck
    b.padTo(-20.5, 0, -15, 2.2, 2.2, -3.2, 4.5, -2.5, 6.2);
    b.padTo(20.5, 0, -15, 2.2, 2.2, 3.2, 4.5, -2.5, 6.2);
    // connectors side platform → central platform
    b.slab(-14.5, 0, -8.5, 5, 3, 0.5, 'floor2');
    b.slab(14.5, 0, -8.5, 5, 3, 0.5, 'floor2');
    // cross-center bridges between side platforms (north half portion)
    b.slab(-24, 0, -3, 3.4, 6, 0.5, 'floor2');
    b.slab(24, 0, -3, 3.4, 6, 0.5, 'floor2');
    b.railZ(-6, 0, -25.8, 0);
    b.railZ(-6, 0, 25.8, 0);

    // tower stairs (to upper deck) on east side of tower, facing north
    b.stairs(7.3, 0, -11, '+z', 2.2, 4.5, 'stairs');
    // central platform cover
    b.box(-8, 0, -9, 2.4, 1.2, 1.2, 'barrier');
    b.crate(10.2, 0, -10.8, 1.3);
    b.box(-10.5, 0, -2, 1.2, 1.6, 3, 'wall2');

    // decorative
    b.deco('antenna', -13, 0, -45, { h: 9 });
    b.deco('lamp', -14, 0, -33.5, {});
    b.deco('lamp', 14, 0, -33.5, {});
    b.light(-24, 3, -15, '#ff8a2a', 1.4, 12);
  });

  for (const [x, z, yaw] of [[-24, -14, 0], [24, 14, Math.PI], [-24, 14, 0], [24, -14, Math.PI], [0, -10, Math.PI], [0, 10, 0], [-9, 0, -Math.PI / 2], [9, 0, Math.PI / 2]]) {
    m.spawn('ffa', x, 0.2, z, yaw);
  }
  return m.build();
}
