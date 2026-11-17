import { MapBuilder } from './dsl.js';

// CRYO LABS — an arctic research facility. Fight through the lab's interior
// rooms and mezzanine or flank across the frozen yards and catwalks.

export function buildCryo() {
  const m = new MapBuilder({
    id: 'cryo',
    name: 'CRYO LABS',
    desc: 'Arctic research facility. Indoor labs and a mezzanine, frozen yards and exterior catwalks.',
    theme: {
      preset: 'snow',
      sky: { top: '#3f5f8f', mid: '#9db6d4', horizon: '#e4edf6', bottom: '#cfdbe8', stars: 0, sunDir: [-0.6, 0.18, -0.7], sunColor: '#ffe8cc', sunSize: 0.8 },
      fog: { color: '#cbd8e6', near: 35, far: 170 },
      hemi: { sky: '#dfeaff', ground: '#7d8ea8', intensity: 1.0 },
      sun: { color: '#ffe9d1', intensity: 2.0, dir: [0.6, -0.42, 0.68] },
      exposure: 0.95,
      snow: true,
      mats: {
        floor: { tex: 'snow', color: '#eef3f8', rough: 0.9 },
        floor2: { tex: 'metalgrid', color: '#7c8798', rough: 0.45, metal: 0.7 },
        wall: { tex: 'panels', color: '#dfe5ec', rough: 0.5, metal: 0.2 },
        wall2: { tex: 'panels', color: '#5d6b80', rough: 0.45, metal: 0.4 },
        roof: { tex: 'metal', color: '#b9c3cf', rough: 0.6, metal: 0.4 },
        trim: { tex: 'metal', color: '#ffb321', rough: 0.4, metal: 0.5 },
        stairs: { tex: 'metalgrid', color: '#8f9aab', rough: 0.4, metal: 0.7 },
        interior: { tex: 'tiles', color: '#c6ced8', rough: 0.35 },
        crate: { tex: 'crate', color: '#5f7187', rough: 0.6, metal: 0.3 },
        metal: { tex: 'metal', color: '#8fa0b4', rough: 0.4, metal: 0.8 },
        container: { tex: 'container', color: '#2f6fb3', rough: 0.55, metal: 0.5 },
        barrier: { tex: 'concrete', color: '#c2cad4', rough: 0.9, stripe: '#ff5a3a' },
        ice: { tex: 'ice', color: '#a8dcff', rough: 0.1, metal: 0.1, transparent: 0.82 },
        snowbank: { tex: 'snow', color: '#f4f8fc', rough: 0.95 },
        rail: { tex: 'metal', color: '#ffb321', rough: 0.4, metal: 0.6 },
        padbase: { tex: 'metal', color: '#2a2d38', rough: 0.4, metal: 0.8 },
      },
      neon: ['#7fe7ff', '#ffb321'],
    },
  });

  m.box(0, -1, 0, 130, 1, 150, 'floor');
  m.bounds(-32, 32, -42, 42);

  // ── central lab (shared) ──
  m.slab(0, 5.4, 0, 26, 26, 0.4, 'roof');
  m.box(0, 0, 0, 25, 0.06, 25, 'interior', { noShadow: true });
  m.box(0, 0, 0, 3.2, 3.6, 3.2, 'metal');
  m.deco('cryotank', 0, 3.6, 0, { color: '#7fe7ff' });
  m.light(0, 4.6, 0, '#7fe7ff', 2.4, 16);

  m.sym((b) => {
    // outer lab walls
    b.wallX(-13, 13, -12.75, 0, 5, 0.5, 'wall', [{ at: -6, w: 2.6, y1: 3 }, { at: 6, w: 2.6, y1: 3 }]);
    b.wallZ(-12.5, 0, -12.75, 0, 5, 0.5, 'wall', [{ at: -9, w: 2.6, y1: 3 }]);
    b.wallZ(-12.5, 0, 12.75, 0, 5, 0.5, 'wall', [{ at: -3, w: 2.4, y0: 1.2, y1: 2.6 }]);
    b.sign(-6, 3.9, -13.05, 4, 0.8, 'LAB ' + (b.f === 1 ? '01' : '02'), '#7fe7ff', Math.PI, { glow: 1.8 });
    // NW room
    b.wallX(-12.5, -3, -5, 0, 5, 0.3, 'wall2', [{ at: -8, w: 2.2, y1: 3 }]);
    b.wallZ(-12.5, -5, -3, 0, 5, 0.3, 'wall2', [{ at: -9.5, w: 2.2, y1: 3 }, { at: -6.2, w: 1.6, y0: 1.1, y1: 2.4 }]);
    b.box(-9.5, 0, -11.6, 4, 1.0, 1.0, 'metal');
    b.box(-11.6, 0, -7.5, 1.0, 2.2, 2.4, 'wall2');
    // mezzanine over NE area + stairs along the north wall
    b.slab(7.75, 2.8, -9.75, 9.5, 5.5, 0.4, 'floor2');
    b.railX(3, 12.5, -6.95, 2.8);
    b.railZ(-10.6, -7, 3.05, 2.8);
    b.stairs(-1.2, 0, -11.55, '+x', 1.8, 2.8, 'stairs');
    b.box(9, 0, -9.5, 1.2, 1.9, 2.8, 'metal');
    b.box(5.5, 0, -2.5, 3.2, 1.0, 1.0, 'barrier');
    b.deco('servers', 9, 0, -9.5, { h: 1.9 });
    b.light(-8, 4.4, -9, '#e8f4ff', 1.4, 11);
    b.light(8, 4.4, -4, '#e8f4ff', 1.2, 11);

    // ── spawn garage ──
    b.building({ x: 0, z: -38.5, w: 20, d: 7, h: 5.5, mat: 'wall2', doors: [{ side: 's', at: 0, w: 12, y1: 4.5 }] });
    b.deco('snowcat', -5, 0, -38.5, { color: '#ff5a3a', yaw: 0 });
    b.box(-5, 0, -38.5, 2.6, 2.2, 4.4, 'clip', { hidden: true, bullet: true });
    for (const [x, z] of [[2, -38], [6, -38], [-8, -33], [-3, -33], [3, -33], [8, -33], [13, -35], [-13, -35]]) b.spawn(0, x, 0.2, z, Math.PI);
    b.sign(0, 5.0, -34.9, 5, 0.9, b.f === 1 ? 'HANGAR A' : 'HANGAR B', b.f === 1 ? '#19e6ff' : '#ff3d6e', 0, { glow: 2 });
    b.light(0, 4.5, -37, '#e8f4ff', 1.4, 12);

    // ── snowfield ──
    b.box(-6, 0, -25, 4, 1.2, 1.6, 'snowbank');
    b.box(7, 0, -22, 2.6, 1.05, 0.8, 'barrier');
    b.box(-1, 0, -18, 2.8, 1.05, 0.8, 'barrier');
    b.box(11.5, 0, -28, 1.6, 2.4, 1.6, 'ice');
    b.box(-15, 0, -20, 2, 2.0, 2, 'ice');
    b.deco('radar', -24, 0, -36, {});
    b.box(-24, 0, -36, 3, 3.5, 3, 'metal');

    // ── west yard ──
    b.box(-24, 0, -24, 2.4, 3.2, 2.4, 'metal');
    b.deco('fueltank', -24, 0, -24, {});
    b.box(-27.5, 0, -18, 2.4, 3.2, 2.4, 'metal');
    b.deco('fueltank', -27.5, 0, -18, {});
    b.crate(-20, 0, -10, 1.3);
    b.crate(-19, 0, -11.2, 1.0);
    b.container(-27, 0, -5, 'z', '#2f6fb3');
    b.box(-17, 0, -3, 1.6, 1.4, 4, 'snowbank');

    // ── east yard catwalk ──
    b.slab(16.25, 3.2, -20.25, 2.5, 20.5, 0.3, 'floor2');
    b.railZ(-28.2, -10, 15.05, 3.2);
    b.railZ(-30.5, -10, 17.45, 3.2);
    b.railX(15, 17.5, -10.05, 3.2);
    b.pillar(15.2, -26, 0, 2.9, 0.35, 'trim');
    b.pillar(17.3, -18, 0, 2.9, 0.35, 'trim');
    b.pillar(15.2, -12, 0, 2.9, 0.35, 'trim');
    b.stairs(16.25, 0, -35.2, '+z', 2.0, 3.2, 'stairs');
    b.container(24, 0, -14, 'z', '#c0392b');
    b.container(24, 2.6, -14, 'z', '#2f6fb3');
    b.crate(21, 0, -24, 1.3);
    b.box(27, 0, -28, 4, 1.3, 1.8, 'snowbank');
    b.light(16.25, 5, -20, '#ffd9a8', 1.2, 12);

    // backdrop
    b.box(-46, 0, -10, 16, 16, 44, 'snowbank');
    b.box(0, 0, -55, 70, 20, 14, 'snowbank');
    b.box(44, 0, -30, 14, 24, 30, 'snowbank');
  });

  for (const [x, z, yaw] of [[-8, -9, 0], [8, 9, Math.PI], [7, -9.5, Math.PI], [-24, 0, 0], [24, 0, Math.PI], [0, -22, Math.PI], [0, 22, 0], [-20, -28, Math.PI / 2]]) {
    const y = (Math.abs(x) === 7 && Math.abs(z) === 9.5) ? 3.0 : 0.2;
    m.spawn('ffa', x, y, z, yaw);
  }
  return m.build();
}
