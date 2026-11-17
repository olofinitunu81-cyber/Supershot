import { MapBuilder } from './dsl.js';

// NEON DISTRICT — rain-slick downtown at night. Three lanes (alley, main street,
// market), enterable shops, rooftop overwatch and two footbridges over the street.

export function buildNeon() {
  const m = new MapBuilder({
    id: 'neon',
    name: 'NEON DISTRICT',
    desc: 'Rain-slick downtown streets under a sea of neon. Three lanes, rooftops and tight interiors.',
    theme: {
      preset: 'night',
      sky: { top: '#05040f', mid: '#1b0f3d', horizon: '#ff3d8b', bottom: '#07060d', stars: 0.6, sunDir: [0.3, 0.25, -0.9], sunColor: '#ff9ad8', sunSize: 0.0 },
      fog: { color: '#160c2e', near: 25, far: 150 },
      hemi: { sky: '#6a5cff', ground: '#24102a', intensity: 0.75 },
      sun: { color: '#9db4ff', intensity: 1.25, dir: [-0.45, -1, -0.35] },
      exposure: 1.05,
      mats: {
        floor: { tex: 'asphalt', color: '#24242c', rough: 0.32, metal: 0.1 },
        floor2: { tex: 'tiles', color: '#4a4b57', rough: 0.55 },
        wall: { tex: 'brick', color: '#5a3e46', rough: 0.85 },
        wall2: { tex: 'panels', color: '#383b4b', rough: 0.6, metal: 0.3 },
        roof: { tex: 'concrete', color: '#3b3d47', rough: 0.9 },
        trim: { tex: 'metal', color: '#7d8597', rough: 0.35, metal: 0.8 },
        stairs: { tex: 'metalgrid', color: '#6c7385', rough: 0.4, metal: 0.7 },
        interior: { tex: 'tiles', color: '#2b2d38', rough: 0.4 },
        crate: { tex: 'crate', color: '#7a5a3a', rough: 0.8 },
        metal: { tex: 'metal', color: '#3f6b55', rough: 0.5, metal: 0.6 },
        container: { tex: 'container', color: '#c0392b', rough: 0.6, metal: 0.5 },
        barrier: { tex: 'concrete', color: '#8c8f99', rough: 0.9, stripe: '#ffcc00' },
        planter: { tex: 'concrete', color: '#5b5f6b', rough: 0.9 },
        rail: { tex: 'metal', color: '#9aa3b5', rough: 0.3, metal: 0.9 },
        tower: { tex: 'windows', color: '#1b1d29', rough: 0.4, metal: 0.4, lit: ['#ff5fb7', '#5fe3ff', '#ffd36b'] },
        padbase: { tex: 'metal', color: '#2a2d38', rough: 0.4, metal: 0.8 },
      },
      neon: ['#ff2fa6', '#19e6ff', '#ffd400', '#9b5bff'],
      rain: true,
    },
  });

  // Ground and skyline backdrop
  m.box(0, -1, 0, 120, 1, 140, 'floor');
  m.bounds(-32, 32, -42, 42);

  // Center statue (shared by both halves)
  m.box(0, 0, 0, 3.4, 1.25, 3.4, 'trim');
  m.box(0, 1.25, 0, 1.2, 0.4, 1.2, 'wall2');
  m.deco('holo', 0, 1.65, 0, { kind: 'logo', color: '#19e6ff', size: 3.2 });
  m.light(0, 3.5, 0, '#19e6ff', 2.2, 14);

  m.sym((b) => {
    // ── sidewalks along main street ──
    b.box(-9, 0, -21, 4, 0.16, 20, 'floor2');
    b.box(9, 0, -21, 4, 0.16, 20, 'floor2');

    // ── spawn plaza ──
    b.box(0, 0, -39.5, 7, 3.1, 4.2, 'wall2');
    b.sign(0, 3.4, -37.35, 4.6, 1.1, 'METRO', '#19e6ff', 0, { glow: 2 });
    b.box(-9.5, 0, -33.5, 2.6, 1.05, 1.2, 'planter');
    b.box(9.5, 0, -33.5, 2.6, 1.05, 1.2, 'planter');
    b.deco('tree', -9.5, 1.05, -33.5, { s: 1 });
    b.deco('tree', 9.5, 1.05, -33.5, { s: 1 });
    for (const [x, z] of [[-13, -38], [-7, -36.2], [7, -36.2], [13, -38], [-14, -33.5], [14, -33.5], [-4, -34], [4, -34]]) {
      b.spawn(0, x, 0.2, z, Math.PI);
    }

    // ── skyline blocks flanking spawn ──
    b.box(-24, 0, -36.5, 16, 17, 11, 'tower');
    b.box(24, 0, -36.5, 16, 13, 11, 'tower');
    b.sign(-15.85, 8, -36.5, 0.2, 8, 'HOTEL NOVA', '#ff2fa6', Math.PI / 2, { vertical: true, glow: 2.5 });
    b.sign(24, 9.5, -30.95, 9, 2.2, 'SUPERSHOT', '#ffd400', 0, { glow: 2.2 });
    b.light(-15.5, 8, -33, '#ff2fa6', 2.5, 16);

    // ── W1: NOODLE BAR (enterable, accessible roof) ──
    b.building({
      x: -15.5, z: -18, w: 9, d: 16, h: 4.2, mat: 'wall',
      doors: [{ side: 'e', at: 0 }, { side: 'w', at: -5 }, { side: 'n', at: -1.5 }],
      windows: [{ side: 's', at: -2.2, w: 2.2, y0: 1.0, y1: 2.5 }, { side: 's', at: 2.2, w: 2.2, y0: 1.0, y1: 2.5 }, { side: 'e', at: -5, w: 2.4, y0: 1.0, y1: 2.5 }],
    });
    b.box(-17.5, 0, -18, 1, 1.05, 6, 'trim');
    b.crate(-13, 0, -23.8, 1.2);
    b.sign(-10.85, 3.25, -18, 0.2, 1.3, 'NOODLES', '#ff2fa6', Math.PI / 2, { glow: 2.4 });
    b.light(-9.5, 4, -18, '#ff2fa6', 2.0, 13);
    b.stairs(-21, 0, -10.6, '-z', 2.0, 4.6, 'stairs');
    b.railX(-20, -11, -10.1, 4.6);

    // ── E1: ARCADE (enterable, roof via exterior stairs) ──
    b.building({
      x: 15.5, z: -18, w: 9, d: 16, h: 4.2, mat: 'wall2',
      doors: [{ side: 'w', at: -3 }, { side: 'e', at: 4 }, { side: 's', at: 0, w: 4, y1: 3.2 }],
      windows: [{ side: 'w', at: 4, w: 2.6, y0: 1.0, y1: 2.6 }],
    });
    b.box(15.5, 0, -21.5, 1.0, 1.9, 1.0, 'trim');
    b.box(17.8, 0, -16, 1.0, 1.9, 1.0, 'trim');
    b.box(13.2, 0, -14, 1.0, 1.9, 1.0, 'trim');
    b.sign(10.85, 3.25, -20, 0.2, 1.3, 'ARCADE', '#19e6ff', -Math.PI / 2, { glow: 2.4 });
    b.light(9.5, 4, -20, '#19e6ff', 2.0, 13);
    b.stairs(21, 0, -26.4, '+z', 2.0, 4.6, 'stairs');
    b.railX(11, 20, -10.1, 4.6);

    // ── footbridge over main street (roof to roof) ──
    b.box(0, 4.2, -12, 22, 0.4, 3.2, 'trim');
    b.railX(-11, 11, -13.55, 4.6);
    b.railX(-11, 11, -10.45, 4.6);
    b.neon(0, 4.1, -13.6, 22, 0.08, 0.08, '#ff2fa6');
    b.neon(0, 4.1, -10.4, 22, 0.08, 0.08, '#19e6ff');

    // ── main street cover ──
    b.deco('car', -4, 0, -22, { color: '#ff3d6e', yaw: 0.1 });
    b.box(-4, 0, -22, 2.0, 1.35, 4.4, 'clip', { hidden: true, bullet: true });
    b.deco('car', 4.5, 0, -6.5, { color: '#2f7bff', yaw: Math.PI / 2 + 0.15 });
    b.box(4.5, 0, -6.5, 4.4, 1.35, 2.0, 'clip', { hidden: true, bullet: true });
    b.barrier(3, -27, 3.2, 'x');
    b.barrier(-6, -14, 2.6, 'x');
    b.box(-9, 0, -5, 3, 0.95, 1.2, 'planter');
    b.deco('tree', -9, 0.95, -5, { s: 0.9 });

    // ── west alley (x -32..-20) ──
    b.box(-30.5, 0, -27, 2.4, 1.45, 1.3, 'metal');
    b.crate(-26.5, 0, -21, 1.3);
    b.crate(-25.2, 0, -21.2, 1.1);
    b.crate(-26.2, 1.3, -21, 1.0);
    b.box(-31, 0, -14, 1.4, 2.2, 6, 'wall2');
    b.crate(-24.5, 0, -6, 1.4);
    b.barrier(-29, -3.5, 3, 'x');
    b.deco('lamp', -22.5, 0, -27, {});
    b.deco('pipes', -32, 0, -20, { len: 10 });
    b.sign(-33.9, 6, -11, 0.2, 2.0, 'CYBER', '#9b5bff', Math.PI / 2, { glow: 2 });

    // ── east market (x 20..32) ──
    b.container(26, 0, -22, 'z', '#c0392b');
    b.container(29.5, 0, -14.5, 'x', '#2f7bff');
    b.container(29.5, 2.6, -14.5, 'x', '#e6b31e');
    b.crate(24, 0, -13, 1.3);
    b.box(23.5, 0, -5.5, 3, 1.05, 1.5, 'trim');
    b.deco('stall', 27.5, 0, -6, { color: '#ff7a1a' });
    b.box(27.5, 0, -6, 3.2, 1.0, 1.4, 'clip', { hidden: true, bullet: true });
    b.deco('lamp', 22.5, 0, -9, {});
    b.light(27.5, 3, -6, '#ffb35a', 1.6, 10);

    // ── street → lane connectors at spawn street (z -31..-26) ──
    b.barrier(-24, -28.5, 2.8, 'x');
    b.barrier(24.5, -28.5, 2.8, 'x');

    // ── street lamps ──
    for (const z of [-30, -16]) {
      b.deco('lamp', -7.4, 0.16, z, {});
      b.deco('lamp', 7.4, 0.16, z, {});
    }

    // ── background skyline ──
    b.box(-44, 0, -20, 20, 26, 22, 'tower');
    b.box(-44, 0, 4, 20, 19, 22, 'tower');
    b.box(-42, 0, -48, 24, 30, 14, 'tower');
    b.box(0, 0, -52, 30, 22, 14, 'tower');
    b.box(36, 0, -50, 20, 34, 16, 'tower');
    b.sign(-33.9, 14, -20, 0.2, 2.6, 'ZENITH', '#19e6ff', Math.PI / 2, { glow: 2 });
    b.sign(0, 15, -44.9, 12, 2.8, 'HYPERCORP', '#ff2fa6', 0, { glow: 2 });
  });

  // ── mid planters (one per quadrant via rotation above), center cover ──
  m.box(-6.5, 0, 2.2, 1.2, 0.95, 3, 'planter');
  m.box(6.5, 0, -2.2, 1.2, 0.95, 3, 'planter');
  m.deco('tree', -6.5, 0.95, 2.2, { s: 0.8 });
  m.deco('tree', 6.5, 0.95, -2.2, { s: 0.8 });

  // FFA spawns spread across the map
  for (const [x, z, yaw] of [[-26, -2, 0], [26, 2, Math.PI], [-15.5, -18, Math.PI], [15.5, 18, 0], [0, -24, Math.PI], [0, 24, 0], [-28.5, 9, 0], [28.5, -9, Math.PI]]) {
    m.spawn('ffa', x, 0.2, z, yaw);
  }
  return m.build();
}
