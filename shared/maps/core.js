import { MapBuilder } from './dsl.js';

// THE CORE — a compact, four-way symmetric reactor arena built for frantic
// Free For All. Corner balconies, jump pads to the central dais.

export function buildCore() {
  const m = new MapBuilder({
    id: 'core',
    name: 'THE CORE',
    desc: 'A compact reactor arena. Four-way symmetry, jump pads and nowhere to hide.',
    theme: {
      preset: 'arena',
      sky: { top: '#020208', mid: '#0a0a24', horizon: '#3b0f5c', bottom: '#020206', stars: 1, sunDir: [0.2, 0.6, 0.3], sunColor: '#c48cff', sunSize: 0 },
      fog: { color: '#0d0820', near: 30, far: 120 },
      hemi: { sky: '#a596ff', ground: '#3a2456', intensity: 1.6 },
      sun: { color: '#d8ccff', intensity: 2.2, dir: [-0.3, -1, -0.45] },
      exposure: 1.2,
      mats: {
        floor: { tex: 'hexfloor', color: '#4a4d62', rough: 0.3, metal: 0.45 },
        floor2: { tex: 'metalgrid', color: '#3e4256', rough: 0.4, metal: 0.7 },
        wall: { tex: 'panels', color: '#40465f', rough: 0.4, metal: 0.4 },
        wall2: { tex: 'panels', color: '#30344a', rough: 0.4, metal: 0.5 },
        roof: { tex: 'panels', color: '#2c3046', rough: 0.4 },
        trim: { tex: 'metal', color: '#9b5bff', rough: 0.3, metal: 0.7 },
        stairs: { tex: 'metalgrid', color: '#565b74', rough: 0.4, metal: 0.7 },
        interior: { tex: 'tiles', color: '#232534', rough: 0.4 },
        crate: { tex: 'crate', color: '#3a3f58', rough: 0.5, metal: 0.4 },
        metal: { tex: 'metal', color: '#4a5068', rough: 0.4, metal: 0.8 },
        barrier: { tex: 'panels', color: '#34384f', rough: 0.4, stripe: '#ff2fa6' },
        rail: { tex: 'metal', color: '#c4a8ff', rough: 0.3, metal: 0.8 },
        padbase: { tex: 'metal', color: '#2a2d38', rough: 0.4, metal: 0.8 },
      },
      neon: ['#9b5bff', '#ff2fa6', '#19e6ff'],
    },
    modes: ['ffa', 'tdm'],
  });

  m.box(0, -1, 0, 80, 1, 80, 'floor');
  m.bounds(-23, 23, -23, 23);

  // central reactor dais
  m.box(0, 0, 0, 3.4, 3.6, 3.4, 'wall2');
  m.slab(0, 4.2, 0, 8, 8, 0.6, 'floor2');
  m.deco('reactor', 0, 4.2, 0, { color: '#9b5bff' });
  m.light(0, 7, 0, '#b48cff', 3.0, 22);

  m.sym4((b, r) => {
    // outer wall
    b.box(0, 0, -24, 48, 9, 2, 'wall');
    b.neon(0, 3.2, -22.96, 46, 0.12, 0.08, ['#9b5bff', '#ff2fa6', '#19e6ff', '#ffd400'][r]);
    // corner balcony on pillars
    b.slab(-17.5, 3.4, -17.5, 9, 9, 0.4, 'floor2');
    b.pillar(-13.4, -13.4, 0, 3.0, 0.6, 'trim');
    b.railX(-22, -13, -13.05, 3.4);
    b.railZ(-13, -16.4, -13.05, 3.4);
    b.stairs(-7.9, 0, -21.1, '-x', 1.8, 3.4, 'stairs');
    b.box(-17.5, 3.4, -20.5, 2.4, 1.1, 0.6, 'barrier');
    // jump pad to the dais
    b.padTo(0, 0, -10.5, 2.2, 2.2, 0, 4.2, -2.4, 6.0);
    // mid cover
    b.barrier(-6.5, -8, 3, 'x');
    b.pillar(8, -8, 0, 2.6, 1.2, 'wall2');
    b.crate(-11, 0, -4.5, 1.3);
    b.box(4, 0, -16, 1.0, 1.6, 3.0, 'wall2');
    b.light(-17.5, 6, -17.5, ['#9b5bff', '#ff2fa6', '#19e6ff', '#ffd400'][r], 1.4, 14);
    // spawns
    b.spawn('ffa', -17.5, 0.2, -6, Math.PI / 2);
    b.spawn('ffa', 6, 0.2, -19, Math.PI);
    b.spawn(r < 2 ? 0 : 1, -10, 0.2, -18, Math.PI);
    b.spawn(r < 2 ? 0 : 1, 15, 0.2, -15, Math.PI);
  });
  return m.build();
}
