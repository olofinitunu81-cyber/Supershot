import { MapBuilder } from './dsl.js';

// DUNE OUTPOST — a fortified compound in a sun-bleached canyon. Long sniper
// lanes on the flanks, close-quarters fighting inside the compound.

export function buildDunes() {
  const m = new MapBuilder({
    id: 'dunes',
    name: 'DUNE OUTPOST',
    desc: 'A fortified desert compound. Sniper lanes on the flanks, close quarters in the courtyard.',
    theme: {
      preset: 'day',
      sky: { top: '#2f7fd6', mid: '#8cc4ef', horizon: '#f6e3c2', bottom: '#d9b98c', stars: 0, sunDir: [-0.4, 0.75, 0.5], sunColor: '#fff4d6', sunSize: 1.2 },
      fog: { color: '#e8d2ad', near: 70, far: 260 },
      hemi: { sky: '#d6e4f0', ground: '#c09060', intensity: 0.85 },
      sun: { color: '#fff1d6', intensity: 3.0, dir: [0.42, -0.78, -0.46] },
      exposure: 0.92,
      dust: true,
      mats: {
        floor: { tex: 'sand', color: '#d8b47e', rough: 0.95 },
        floor2: { tex: 'concrete', color: '#bfae95', rough: 0.9 },
        wall: { tex: 'stucco', color: '#d9c19a', rough: 0.95 },
        wall2: { tex: 'concrete', color: '#a8977c', rough: 0.9 },
        roof: { tex: 'concrete', color: '#b7a487', rough: 0.95 },
        trim: { tex: 'wood', color: '#8a6a45', rough: 0.85 },
        stairs: { tex: 'concrete', color: '#c4ae8c', rough: 0.9 },
        interior: { tex: 'tiles', color: '#a2876a', rough: 0.8 },
        crate: { tex: 'crate', color: '#9a7646', rough: 0.85 },
        metal: { tex: 'metal', color: '#6d7a5a', rough: 0.6, metal: 0.5 },
        container: { tex: 'container', color: '#7d8f4a', rough: 0.7, metal: 0.4 },
        barrier: { tex: 'sandbag', color: '#c2a675', rough: 1 },
        rock: { tex: 'rock', color: '#b98d5c', rough: 0.95 },
        rail: { tex: 'wood', color: '#7b5b3a', rough: 0.8 },
        padbase: { tex: 'metal', color: '#2a2d38', rough: 0.4, metal: 0.8 },
      },
      neon: ['#ffb321', '#19e6ff'],
    },
  });

  m.box(0, -1, 0, 140, 1, 160, 'floor');
  m.bounds(-36, 36, -46, 46);

  // ── central compound (shared) ──
  // two-story keep in the middle with roof access from inside
  m.building({
    x: 0, z: 0, w: 12, d: 10, h: 4.2, mat: 'wall',
    doors: [{ side: 'n', at: -3 }, { side: 's', at: 3 }, { side: 'e', at: 2.5 }, { side: 'w', at: -2.5 }],
    windows: [{ side: 'n', at: 3, w: 1.8, y0: 1.1, y1: 2.3 }, { side: 's', at: -3, w: 1.8, y0: 1.1, y1: 2.3 }],
    hatch: { x0: -1.2, z0: -2.85, x1: 1.2, z1: 1.8 }, parapet: 1.0,
  });
  m.stairs(0, 0, 3.9, '-z', 2.2, 4.6, 'stairs');
  m.light(0, 3.4, 0, '#ffcc88', 1.4, 10);

  m.sym((b) => {
    // compound walls with gates (14 m from center)
    b.wallX(-15, 15, -14.25, 0, 3.2, 0.7, 'wall2', [{ at: 0, w: 4.4, y0: 0, y1: 3.2 }, { at: -9, w: 2, y0: 1.3, y1: 2.2 }, { at: 9, w: 2, y0: 1.3, y1: 2.2 }]);
    b.wallZ(-14.6, -0.01, -14.65, 0, 3.2, 0.7, 'wall2', [{ at: -6, w: 4.4, y0: 0, y1: 3.2 }]);
    b.wallZ(-14.6, -0.01, 14.65, 0, 3.2, 0.7, 'wall2', [{ at: -6, w: 2, y0: 1.3, y1: 2.2 }]);
    // courtyard cover
    b.box(-9, 0, -9, 2.6, 1.05, 1.0, 'barrier');
    b.crate(9.5, 0, -8.5, 1.4);
    b.crate(10.6, 0, -9.6, 1.0);
    b.box(-10.5, 0, -2.5, 1.2, 1.2, 3.2, 'barrier');
    b.deco('well', 6.5, 0, -10.5, {});
    b.box(6.5, 0, -10.5, 2.2, 1.0, 2.2, 'clip', { hidden: true, bullet: true });
    // walkway along inner wall (rampart) reached by stairs
    b.box(9, 0, -12.9, 8, 2.2, 2.0, 'floor2');
    b.stairs(1.64, 0, -12.9, '+x', 2.0, 2.2, 'stairs');

    // ── home base ──
    b.box(0, 0, -44.5, 24, 6, 3, 'wall2');
    b.deco('tent', -9, 0, -38.5, { color: '#7d8f4a' });
    b.box(-9, 0, -38.5, 5, 2.4, 4, 'clip', { hidden: true, bullet: true });
    b.deco('tent', 9, 0, -38.5, { color: '#7d8f4a' });
    b.box(9, 0, -38.5, 5, 2.4, 4, 'clip', { hidden: true, bullet: true });
    b.container(0, 0, -41.2, 'x', '#7d8f4a');
    b.barrier(-4, -33.5, 3, 'x');
    b.barrier(4, -33.5, 3, 'x');
    for (const [x, z] of [[-14, -40], [-4, -37], [4, -37], [14, -40], [-16, -35], [16, -35], [0, -36], [-11, -34]]) b.spawn(0, x, 0.2, z, Math.PI);
    b.sign(0, 4.8, -42.95, 5, 1, b.f === 1 ? 'OUTPOST NORTH' : 'OUTPOST SOUTH', '#ffb321', 0, { glow: 1.6 });

    // ── west sniper road ──
    b.box(-34, 0, -22, 4, 7, 16, 'rock');
    b.box(-33, 0, -2, 6, 9, 10, 'rock');
    b.box(-28, 0, -28, 3, 1.6, 3, 'rock');
    b.deco('truck', -27, 0, -14, { yaw: 0.25, color: '#9a5a3a' });
    b.box(-27, 0, -14, 2.4, 2.3, 5.5, 'clip', { hidden: true, bullet: true });
    b.barrier(-24, -5, 3, 'x');
    b.crate(-22.5, 0, -22, 1.3);
    b.box(-30, 0, -36, 6, 4.5, 6, 'rock');

    // ── east watchtower ──
    b.box(24, 0, -22, 5, 4.6, 5, 'wall2');
    b.slab(24, 5.0, -22, 6, 6, 0.4, 'trim');
    b.box(24, 5.0, -24.85, 6, 1.1, 0.3, 'trim');
    b.box(26.85, 5.0, -22, 0.3, 1.1, 5.4, 'trim');
    b.box(21.15, 5.0, -24.25, 0.3, 1.1, 1.5, 'trim');
    b.deco('roofCanvas', 24, 7.8, -22, { w: 6.2, d: 6.2, color: '#c96b3a' });
    b.stairs(19.8, 0, -16, '-z', 1.8, 5.0, 'stairs');
    b.box(31, 0, -12, 6, 3.6, 3, 'rock');
    b.box(33, 0, -30, 6, 6, 12, 'rock');
    b.crate(19, 0, -7, 1.4);
    b.container(26, 0, -4.5, 'x', '#a3462c');
    b.light(24, 4.4, -22, '#ffcc88', 1.2, 10);

    // ── no-man's-land dunes between base and compound ──
    b.box(-12, 0, -24, 7, 1.3, 3, 'rock');
    b.box(13, 0, -27, 5, 1.6, 3.5, 'rock');
    b.box(-3, 0, -19.5, 2.8, 1.05, 1.0, 'barrier');
    b.deco('cactus', -18, 0, -30, {});
    b.deco('cactus', 30, 0, -40, {});
    b.deco('palm', -20, 0, -40, {});

    // skyline mesas
    b.box(-50, 0, -10, 18, 22, 40, 'rock');
    b.box(0, 0, -60, 60, 26, 16, 'rock');
    b.box(48, 0, -30, 16, 18, 40, 'rock');
  });

  for (const [x, z, yaw] of [[-26, 0, 0], [26, 0, Math.PI], [0, -24, Math.PI], [0, 24, 0], [-8, -8, 0], [8, 8, Math.PI], [24, -12, Math.PI], [-24, 12, 0]]) {
    m.spawn('ffa', x, 0.2, z, yaw);
  }
  return m.build();
}
