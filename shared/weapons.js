// SUPERSHOT weapon catalogue — 20 guns + 10 melee weapons.
// All numbers are authoritative on the server; the client uses the same table
// for prediction, viewmodels, sounds and UI stats.
//
// Damage model: 100 HP. `damage` is per bullet/pellet, scaled by hit zone
// (headMul / limbMul) and by distance falloff (range[0] → range[1] lerps to minDmg).
// Spread values are cone half-angles in degrees.

const g = (def) => ({
  kind: 'gun',
  pellets: 1,
  headMul: 1.6,
  limbMul: 0.85,
  minDmg: 0.7,
  reloadEmpty: def.reload ? def.reload * 1.2 : 2.4,
  moveMul: 1,
  equip: 0.45,
  rarity: 'common',
  ...def,
  spread: { hip: 2.5, ads: 0.4, move: 1.6, air: 4, bloom: 0.2, maxBloom: 2, recover: 7, crouch: 0.8, ...def.spread },
  recoil: { up: 0.5, side: 0.25, bias: 0, adsMul: 0.6, kick: 0.04, ...def.recoil },
  ads: { fov: 0.8, time: 0.2, scope: 0, ...def.ads },
});

const m = (def) => ({
  kind: 'melee',
  slot: 'melee',
  cls: 'MELEE',
  backstab: 1,
  lunge: 0,
  moveMul: 1.1,
  equip: 0.3,
  rarity: 'common',
  energy: false,
  ...def,
});

export const GUNS = [
  // ───────────── ASSAULT RIFLES ─────────────
  g({
    id: 'vx9', name: 'VX-9 VECTOR', short: 'VX-9', cls: 'AR', slot: 'primary',
    desc: 'Reliable full-auto rifle with a controllable climb. The frontline standard.',
    price: 0, fire: 'auto', rpm: 660, damage: 24, headMul: 1.6,
    range: [24, 52], minDmg: 0.75, mag: 30, reserve: 150, reload: 2.0, reloadEmpty: 2.45,
    spread: { hip: 2.6, ads: 0.32, move: 1.8, bloom: 0.2, maxBloom: 2.1 },
    recoil: { up: 0.52, side: 0.24, bias: 0.05 },
    ads: { fov: 0.78, time: 0.22 }, equip: 0.45,
    tracer: 0xffd27a,
    snd: { pitch: 1.0, body: 1700, thump: 110, decay: 0.12, tail: 0.55, crack: 0.6, gain: 0.9 },
  }),
  g({
    id: 'ar77', name: 'AR-77 BRUTE', short: 'BRUTE', cls: 'AR', slot: 'primary', rarity: 'rare',
    desc: 'Heavy battle rifle. Three body shots drop anyone — if you can tame the kick.',
    price: 1200, fire: 'auto', rpm: 450, damage: 35, headMul: 1.6,
    range: [28, 64], minDmg: 0.8, mag: 20, reserve: 100, reload: 2.3, reloadEmpty: 2.85,
    spread: { hip: 3.0, ads: 0.3, move: 2.1, bloom: 0.42, maxBloom: 2.6, recover: 6 },
    recoil: { up: 1.05, side: 0.34, bias: 0.12, kick: 0.06 },
    ads: { fov: 0.76, time: 0.26 }, moveMul: 0.96, equip: 0.5,
    tracer: 0xffb35a,
    snd: { pitch: 0.82, body: 1300, thump: 85, decay: 0.16, tail: 0.75, crack: 0.75, gain: 1.0 },
  }),
  g({
    id: 'k3', name: 'K3 KESTREL', short: 'KESTREL', cls: 'AR', slot: 'primary', rarity: 'rare',
    desc: 'Three-round burst rifle. A headshot in the burst means a one-burst elimination.',
    price: 900, fire: 'burst', rpm: 1100, burst: 3, burstDelay: 0.3, damage: 30, headMul: 1.7,
    range: [30, 60], minDmg: 0.8, mag: 24, reserve: 120, reload: 2.1, reloadEmpty: 2.5,
    spread: { hip: 2.4, ads: 0.2, move: 1.6, bloom: 0.12, maxBloom: 1.4 },
    recoil: { up: 0.44, side: 0.18, bias: -0.04 },
    ads: { fov: 0.75, time: 0.22 },
    tracer: 0x9fe8ff,
    snd: { pitch: 1.12, body: 2100, thump: 120, decay: 0.09, tail: 0.5, crack: 0.7, gain: 0.85 },
  }),
  g({
    id: 'tempest', name: 'TEMPEST', short: 'TEMPEST', cls: 'AR', slot: 'primary', rarity: 'epic',
    desc: 'Blistering 820 RPM rifle. Shreds up close, demands discipline at range.',
    price: 1500, fire: 'auto', rpm: 820, damage: 20, headMul: 1.55,
    range: [18, 42], minDmg: 0.7, mag: 36, reserve: 180, reload: 2.2, reloadEmpty: 2.6,
    spread: { hip: 2.7, ads: 0.4, move: 1.7, bloom: 0.16, maxBloom: 2.3 },
    recoil: { up: 0.6, side: 0.42, bias: 0.1 },
    ads: { fov: 0.8, time: 0.21 },
    tracer: 0xfff08a,
    snd: { pitch: 1.18, body: 2300, thump: 115, decay: 0.08, tail: 0.45, crack: 0.65, gain: 0.82 },
  }),
  g({
    id: 'helix', name: 'HELIX PULSE', short: 'HELIX', cls: 'AR', slot: 'primary', rarity: 'legendary',
    desc: 'Coil-driven energy rifle. Near-zero recoil and laser-straight pulses.',
    price: 2200, fire: 'auto', rpm: 600, damage: 23, headMul: 1.7,
    range: [32, 72], minDmg: 0.82, mag: 40, reserve: 160, reload: 2.5, reloadEmpty: 2.5,
    spread: { hip: 2.2, ads: 0.12, move: 1.4, bloom: 0.08, maxBloom: 1.0 },
    recoil: { up: 0.28, side: 0.1, bias: 0 },
    ads: { fov: 0.74, time: 0.24 }, equip: 0.55,
    tracer: 0xc36bff, energy: true,
    snd: { pitch: 1.0, body: 900, thump: 90, decay: 0.1, tail: 0.5, crack: 0.2, gain: 0.85, energy: [1400, 300, 0.12] },
  }),

  // ───────────── SMGs ─────────────
  g({
    id: 'wasp', name: 'MX-5 WASP', short: 'WASP', cls: 'SMG', slot: 'primary',
    desc: 'Compact bullet hose. Fast handling, deadly in close quarters.',
    price: 0, fire: 'auto', rpm: 950, damage: 17, headMul: 1.4,
    range: [11, 26], minDmg: 0.6, mag: 32, reserve: 192, reload: 1.7, reloadEmpty: 2.1,
    spread: { hip: 2.1, ads: 0.75, move: 0.8, bloom: 0.12, maxBloom: 1.8, recover: 9 },
    recoil: { up: 0.36, side: 0.34, bias: 0.06 },
    ads: { fov: 0.84, time: 0.16 }, moveMul: 1.06, equip: 0.35,
    tracer: 0xffe08a,
    snd: { pitch: 1.35, body: 2600, thump: 140, decay: 0.06, tail: 0.32, crack: 0.5, gain: 0.72 },
  }),
  g({
    id: 'phantom', name: 'PHANTOM', short: 'PHANTOM', cls: 'SMG', slot: 'primary', rarity: 'rare',
    desc: 'Integrally suppressed SMG. No muzzle flash, whisper-quiet report.',
    price: 1100, fire: 'auto', rpm: 820, damage: 19, headMul: 1.45,
    range: [12, 30], minDmg: 0.62, mag: 30, reserve: 180, reload: 1.8, reloadEmpty: 2.2,
    spread: { hip: 2.0, ads: 0.6, move: 0.8, bloom: 0.1, maxBloom: 1.6, recover: 9 },
    recoil: { up: 0.3, side: 0.24, bias: -0.04 },
    ads: { fov: 0.84, time: 0.17 }, moveMul: 1.05, equip: 0.38, suppressed: true,
    tracer: 0x8ad8ff,
    snd: { pitch: 1.0, body: 900, thump: 160, decay: 0.05, tail: 0.12, crack: 0.15, gain: 0.45, suppressed: true },
  }),
  g({
    id: 'ripper', name: 'RIPPER P50', short: 'RIPPER', cls: 'SMG', slot: 'primary', rarity: 'rare',
    desc: 'Top-loaded 50-round magazine. Keep the trigger down and the pressure up.',
    price: 1300, fire: 'auto', rpm: 900, damage: 16, headMul: 1.4,
    range: [12, 28], minDmg: 0.6, mag: 50, reserve: 200, reload: 2.5, reloadEmpty: 3.0,
    spread: { hip: 2.2, ads: 0.7, move: 0.9, bloom: 0.1, maxBloom: 1.8, recover: 8 },
    recoil: { up: 0.32, side: 0.3, bias: 0.08 },
    ads: { fov: 0.83, time: 0.18 }, moveMul: 1.03, equip: 0.42,
    tracer: 0xffd27a,
    snd: { pitch: 1.25, body: 2400, thump: 130, decay: 0.065, tail: 0.35, crack: 0.5, gain: 0.74 },
  }),

  // ───────────── SHOTGUNS ─────────────
  g({
    id: 'breacher', name: 'SG-12 BREACHER', short: 'BREACHER', cls: 'SHOTGUN', slot: 'primary',
    desc: 'Pump-action door kicker. One clean blast at close range is all it takes.',
    price: 0, fire: 'pump', rpm: 70, damage: 14, pellets: 8, headMul: 1.25, limbMul: 0.9,
    range: [7, 18], minDmg: 0.35, mag: 6, reserve: 30, reload: 0.5, shell: { start: 0.32, each: 0.46 },
    spread: { hip: 6.2, ads: 4.6, move: 0.6, air: 1.5, bloom: 0, maxBloom: 0 },
    recoil: { up: 4.4, side: 0.8, kick: 0.14 },
    ads: { fov: 0.88, time: 0.2 }, equip: 0.5,
    tracer: 0xffcf7a,
    snd: { pitch: 0.78, body: 1100, thump: 70, decay: 0.2, tail: 0.85, crack: 0.9, gain: 1.05, mech: 'pump' },
  }),
  g({
    id: 'hydra', name: 'HYDRA AUTO-12', short: 'HYDRA', cls: 'SHOTGUN', slot: 'primary', rarity: 'epic',
    desc: 'Drum-fed automatic shotgun. Sustained buckshot for room clearing.',
    price: 1600, fire: 'auto', rpm: 230, damage: 10, pellets: 7, headMul: 1.25, limbMul: 0.9,
    range: [6, 15], minDmg: 0.3, mag: 10, reserve: 40, reload: 2.6, reloadEmpty: 3.0,
    spread: { hip: 7.0, ads: 5.4, move: 0.6, air: 1.5, bloom: 0, maxBloom: 0 },
    recoil: { up: 2.5, side: 0.9, kick: 0.1 },
    ads: { fov: 0.88, time: 0.22 }, moveMul: 0.97, equip: 0.55,
    tracer: 0xffcf7a,
    snd: { pitch: 0.9, body: 1250, thump: 80, decay: 0.15, tail: 0.6, crack: 0.8, gain: 0.95 },
  }),
  g({
    id: 'twinfang', name: 'TWIN FANG', short: 'TWIN FANG', cls: 'SHOTGUN', slot: 'primary', rarity: 'rare',
    desc: 'Double-barrel with a tight choke. Two devastating shots, then reload.',
    price: 1400, fire: 'semi', rpm: 320, damage: 13, pellets: 9, headMul: 1.25, limbMul: 0.9,
    range: [9, 22], minDmg: 0.35, mag: 2, reserve: 24, reload: 1.9, reloadEmpty: 1.9,
    spread: { hip: 4.8, ads: 3.1, move: 0.5, air: 1.4, bloom: 0, maxBloom: 0 },
    recoil: { up: 5.2, side: 1.0, kick: 0.16 },
    ads: { fov: 0.86, time: 0.2 }, equip: 0.45,
    tracer: 0xffcf7a,
    snd: { pitch: 0.7, body: 1000, thump: 60, decay: 0.24, tail: 1.0, crack: 1.0, gain: 1.1 },
  }),

  // ───────────── SNIPERS / MARKSMAN ─────────────
  g({
    id: 'longshot', name: 'L-50 LONGSHOT', short: 'LONGSHOT', cls: 'SNIPER', slot: 'primary', rarity: 'epic',
    desc: 'Bolt-action precision rifle. Headshots are lethal at any range.',
    price: 2000, fire: 'bolt', rpm: 48, damage: 95, headMul: 2.6, limbMul: 0.8,
    range: [90, 160], minDmg: 0.9, mag: 5, reserve: 25, reload: 2.7, reloadEmpty: 3.2,
    spread: { hip: 9, ads: 0, move: 4, air: 8, bloom: 0, maxBloom: 0, crouch: 0.85 },
    recoil: { up: 4.2, side: 0.7, kick: 0.2, adsMul: 0.8 },
    ads: { fov: 0.3, time: 0.32, scope: 1 }, moveMul: 0.92, equip: 0.65,
    tracer: 0xffffff,
    snd: { pitch: 0.6, body: 1500, thump: 55, decay: 0.22, tail: 1.6, crack: 1.0, gain: 1.15, mech: 'bolt' },
  }),
  g({
    id: 'marksman', name: 'M14 MARKSMAN', short: 'MARKSMAN', cls: 'DMR', slot: 'primary', rarity: 'rare',
    desc: 'Semi-auto designated marksman rifle. One headshot, one elimination.',
    price: 1700, fire: 'semi', rpm: 280, damage: 46, headMul: 2.2, limbMul: 0.85,
    range: [45, 95], minDmg: 0.85, mag: 12, reserve: 60, reload: 2.4, reloadEmpty: 2.9,
    spread: { hip: 4.0, ads: 0.1, move: 2.6, air: 6, bloom: 0.55, maxBloom: 2.5, recover: 6 },
    recoil: { up: 1.6, side: 0.4, kick: 0.09 },
    ads: { fov: 0.45, time: 0.27, scope: 1 }, moveMul: 0.95, equip: 0.55,
    tracer: 0xfff0c0,
    snd: { pitch: 0.85, body: 1800, thump: 75, decay: 0.15, tail: 1.1, crack: 0.95, gain: 1.0 },
  }),
  g({
    id: 'lancer', name: 'LANCER RAILGUN', short: 'LANCER', cls: 'RAIL', slot: 'primary', rarity: 'legendary',
    desc: 'Charges for 0.55s then fires a piercing rail slug through everyone in line.',
    price: 3000, fire: 'charge', charge: 0.55, rpm: 60, damage: 105, headMul: 1.5, limbMul: 0.75,
    range: [120, 200], minDmg: 1, mag: 4, reserve: 16, reload: 3.0, reloadEmpty: 3.0, pierce: 3,
    spread: { hip: 3.0, ads: 0, move: 1.5, air: 5, bloom: 0, maxBloom: 0 },
    recoil: { up: 3.4, side: 0.4, kick: 0.18, adsMul: 0.8 },
    ads: { fov: 0.5, time: 0.3, scope: 1 }, moveMul: 0.9, equip: 0.7,
    tracer: 0x40f0ff, energy: true,
    snd: { pitch: 1.0, body: 600, thump: 50, decay: 0.3, tail: 1.3, crack: 0.6, gain: 1.1, energy: [3200, 120, 0.35] },
  }),

  // ───────────── HEAVY ─────────────
  g({
    id: 'titan', name: 'TITAN LMG', short: 'TITAN', cls: 'LMG', slot: 'primary', rarity: 'epic',
    desc: '100-round belt-fed suppression machine. Slow to handle, impossible to outlast.',
    price: 2400, fire: 'auto', rpm: 680, damage: 23, headMul: 1.5,
    range: [26, 56], minDmg: 0.75, mag: 100, reserve: 200, reload: 4.4, reloadEmpty: 5.0,
    spread: { hip: 3.6, ads: 0.5, move: 2.4, bloom: 0.12, maxBloom: 2.4, recover: 5 },
    recoil: { up: 0.48, side: 0.34, bias: 0.1 },
    ads: { fov: 0.78, time: 0.38 }, moveMul: 0.86, equip: 0.75,
    tracer: 0xffa040,
    snd: { pitch: 0.88, body: 1400, thump: 90, decay: 0.13, tail: 0.65, crack: 0.7, gain: 0.95 },
  }),
  g({
    id: 'cyclone', name: 'CYCLONE MINIGUN', short: 'CYCLONE', cls: 'LMG', slot: 'primary', rarity: 'legendary',
    desc: 'Six barrels, 1500 RPM. Spin up with fire or aim, then unleash a storm.',
    price: 3500, fire: 'spin', spinUp: 0.55, spinDown: 0.9, rpm: 1500, damage: 10, headMul: 1.3,
    range: [16, 34], minDmg: 0.55, mag: 200, reserve: 400, reload: 5.2, reloadEmpty: 5.2,
    spread: { hip: 3.1, ads: 2.4, move: 1.2, bloom: 0.05, maxBloom: 1.4, recover: 6 },
    recoil: { up: 0.12, side: 0.16, bias: 0, adsMul: 1 },
    ads: { fov: 0.95, time: 0.3 }, moveMul: 0.78, equip: 0.9,
    tracer: 0xffc060,
    snd: { pitch: 1.4, body: 2000, thump: 120, decay: 0.05, tail: 0.3, crack: 0.45, gain: 0.7 },
  }),

  // ───────────── SECONDARIES ─────────────
  g({
    id: 'sidekick', name: 'P-9 SIDEKICK', short: 'SIDEKICK', cls: 'PISTOL', slot: 'secondary',
    desc: 'Dependable sidearm with a quick draw. Your best friend when the mag runs dry.',
    price: 0, fire: 'semi', rpm: 420, damage: 27, headMul: 1.6,
    range: [14, 32], minDmg: 0.65, mag: 15, reserve: 75, reload: 1.35, reloadEmpty: 1.7,
    spread: { hip: 1.6, ads: 0.4, move: 0.9, bloom: 0.5, maxBloom: 2.2, recover: 8 },
    recoil: { up: 1.2, side: 0.3, kick: 0.07 },
    ads: { fov: 0.86, time: 0.14 }, moveMul: 1.05, equip: 0.25,
    tracer: 0xffe08a,
    snd: { pitch: 1.3, body: 2400, thump: 130, decay: 0.07, tail: 0.4, crack: 0.6, gain: 0.78 },
  }),
  g({
    id: 'judge', name: 'JUDGE .50', short: 'JUDGE', cls: 'PISTOL', slot: 'secondary', rarity: 'rare',
    desc: 'Six-shot hand cannon. Two to the body or one to the head.',
    price: 900, fire: 'semi', rpm: 140, damage: 56, headMul: 1.85,
    range: [18, 42], minDmg: 0.7, mag: 6, reserve: 30, reload: 2.3, reloadEmpty: 2.3,
    spread: { hip: 2.2, ads: 0.25, move: 1.3, bloom: 1.4, maxBloom: 3, recover: 6 },
    recoil: { up: 3.6, side: 0.6, kick: 0.15 },
    ads: { fov: 0.84, time: 0.18 }, moveMul: 1.03, equip: 0.35,
    tracer: 0xffd27a,
    snd: { pitch: 0.75, body: 1400, thump: 70, decay: 0.18, tail: 1.0, crack: 0.95, gain: 1.05 },
  }),
  g({
    id: 'hornet', name: 'HORNET MP', short: 'HORNET', cls: 'PISTOL', slot: 'secondary', rarity: 'rare',
    desc: 'Full-auto machine pistol. Spits 1050 rounds a minute.',
    price: 1000, fire: 'auto', rpm: 1050, damage: 14, headMul: 1.35,
    range: [8, 20], minDmg: 0.55, mag: 24, reserve: 120, reload: 1.5, reloadEmpty: 1.8,
    spread: { hip: 2.5, ads: 1.3, move: 0.8, bloom: 0.14, maxBloom: 2.2, recover: 9 },
    recoil: { up: 0.4, side: 0.44, bias: 0.05 },
    ads: { fov: 0.88, time: 0.14 }, moveMul: 1.05, equip: 0.28,
    tracer: 0xffe08a,
    snd: { pitch: 1.5, body: 2800, thump: 150, decay: 0.05, tail: 0.28, crack: 0.45, gain: 0.66 },
  }),
  g({
    id: 'comet', name: 'COMET GL', short: 'COMET', cls: 'LAUNCHER', slot: 'secondary', rarity: 'epic',
    desc: 'Single-shot grenade launcher. Impact-detonating plasma charge with splash damage.',
    price: 2500, fire: 'semi', rpm: 60, damage: 0, headMul: 1, limbMul: 1,
    range: [0, 0], minDmg: 1, mag: 1, reserve: 6, reload: 2.1, reloadEmpty: 2.1,
    spread: { hip: 0.8, ads: 0.2, move: 0.5, air: 1, bloom: 0, maxBloom: 0 },
    recoil: { up: 4.8, side: 0.6, kick: 0.2 },
    ads: { fov: 0.85, time: 0.25 }, moveMul: 0.95, equip: 0.55,
    projectile: { speed: 40, gravity: 9, radius: 0.18, life: 4, explode: { radius: 4.6, damage: 105, minDamage: 22, selfMul: 0.45 } },
    tracer: 0xff7a2a,
    snd: { pitch: 0.9, body: 600, thump: 65, decay: 0.2, tail: 0.6, crack: 0.3, gain: 0.95, mech: 'launcher' },
  }),
];

export const MELEE = [
  m({
    id: 'knife', name: 'COMBAT KNIFE', short: 'KNIFE', price: 0,
    desc: 'Fast and silent. A strike from behind is an instant elimination.',
    damage: 50, backstab: 2, swing: 0.42, hitDelay: 0.1, range: 2.1, arc: 50, moveMul: 1.12, anim: 'slash',
    trail: 0xdfe8ff, snd: { whoosh: 1.25, impact: 'stab' },
  }),
  m({
    id: 'karambit', name: 'KARAMBIT', short: 'KARAMBIT', price: 800, rarity: 'rare',
    desc: 'Curved talon blade. Lightning recovery and lethal backstabs.',
    damage: 46, backstab: 2.2, swing: 0.36, hitDelay: 0.08, range: 1.95, arc: 45, moveMul: 1.14, anim: 'hook',
    trail: 0xff7ad8, snd: { whoosh: 1.4, impact: 'stab' },
  }),
  m({
    id: 'daggers', name: 'TWIN DAGGERS', short: 'DAGGERS', price: 1000, rarity: 'rare',
    desc: 'A dagger in each hand. Alternating strikes at blistering speed.',
    damage: 34, backstab: 2, swing: 0.27, hitDelay: 0.07, range: 1.9, arc: 40, moveMul: 1.15, anim: 'dual',
    trail: 0xb8f4ff, snd: { whoosh: 1.55, impact: 'stab' },
  }),
  m({
    id: 'machete', name: 'MACHETE', short: 'MACHETE', price: 700,
    desc: 'Broad jungle blade with a wide slash. Two hits and done.',
    damage: 55, swing: 0.5, hitDelay: 0.13, range: 2.3, arc: 60, moveMul: 1.1, anim: 'slash',
    trail: 0xe8eef5, snd: { whoosh: 1.0, impact: 'slash' },
  }),
  m({
    id: 'katana', name: 'KATANA', short: 'KATANA', price: 1500, rarity: 'epic',
    desc: 'Folded steel with long reach. Sweeping cuts cover a wide arc.',
    damage: 68, swing: 0.58, hitDelay: 0.14, range: 2.7, arc: 70, moveMul: 1.08, anim: 'wide',
    trail: 0xffffff, snd: { whoosh: 0.9, impact: 'slash' },
  }),
  m({
    id: 'tomahawk', name: 'TOMAHAWK', short: 'TOMAHAWK', price: 1100, rarity: 'rare',
    desc: 'Tactical hatchet. Brutal downward chops.',
    damage: 62, swing: 0.55, hitDelay: 0.16, range: 2.2, arc: 50, moveMul: 1.1, anim: 'chop',
    trail: 0xffc890, snd: { whoosh: 0.85, impact: 'chop' },
  }),
  m({
    id: 'axe', name: 'BATTLE AXE', short: 'AXE', price: 2000, rarity: 'epic',
    desc: 'Massive double-bit axe. Slow, but a full swing is a one-hit elimination.',
    damage: 100, swing: 1.05, hitDelay: 0.32, range: 2.5, arc: 60, moveMul: 1.0, anim: 'overhead',
    trail: 0xff9b5a, snd: { whoosh: 0.6, impact: 'chop' },
  }),
  m({
    id: 'plasma', name: 'PLASMA SABER', short: 'SABER', price: 2500, rarity: 'legendary', energy: true,
    desc: 'Contained plasma blade. Lunges forward with every swing.',
    damage: 72, swing: 0.55, hitDelay: 0.12, range: 2.6, arc: 65, lunge: 7, moveMul: 1.08, anim: 'wide',
    trail: 0x2af0ff, snd: { whoosh: 0.8, impact: 'energy', hum: 110 },
  }),
  m({
    id: 'nano', name: 'NANOBLADE', short: 'NANO', price: 2200, rarity: 'legendary', energy: true,
    desc: 'Vibro-edged blade with a dash thrust that closes gaps instantly.',
    damage: 58, swing: 0.44, hitDelay: 0.1, range: 2.5, arc: 55, lunge: 9, moveMul: 1.12, anim: 'thrust',
    trail: 0xff2fa6, snd: { whoosh: 1.1, impact: 'energy', hum: 180 },
  }),
  m({
    id: 'reaper', name: 'REAPER SCYTHE', short: 'REAPER', price: 3000, rarity: 'legendary', energy: true,
    desc: 'A spinning crescent of death. Huge reach and the widest arc in the game.',
    damage: 85, swing: 0.8, hitDelay: 0.22, range: 3.1, arc: 90, moveMul: 1.04, anim: 'spin',
    trail: 0x9b5bff, snd: { whoosh: 0.55, impact: 'slash', hum: 70 },
  }),
];

export const WEAPON_LIST = [...GUNS, ...MELEE];
export const WEAPONS = Object.fromEntries(WEAPON_LIST.map((w, i) => [w.id, Object.assign(w, { index: i })]));

export const DEFAULT_LOADOUT = { primary: 'vx9', secondary: 'sidekick', melee: 'knife' };
export const STARTER_WEAPONS = WEAPON_LIST.filter((w) => w.price === 0).map((w) => w.id);

export const CLASS_NAMES = {
  AR: 'ASSAULT RIFLE', SMG: 'SMG', SHOTGUN: 'SHOTGUN', SNIPER: 'SNIPER', DMR: 'MARKSMAN',
  RAIL: 'RAILGUN', LMG: 'HEAVY', PISTOL: 'PISTOL', LAUNCHER: 'LAUNCHER', MELEE: 'MELEE',
};

export function getWeapon(id) {
  return WEAPONS[id] || null;
}

export function weaponByIndex(i) {
  return WEAPON_LIST[i] || null;
}

export function fireInterval(def) {
  return 60 / def.rpm;
}

/** Damage multiplier from distance falloff. */
export function falloff(def, dist) {
  const [a, b] = def.range;
  if (b <= 0 || dist <= a) return 1;
  if (dist >= b) return def.minDmg;
  return 1 + (def.minDmg - 1) * ((dist - a) / (b - a));
}

export function isValidSlot(def, slot) {
  if (!def) return false;
  return def.slot === slot;
}

/** Normalized 0..1 stat bars for the UI. */
export function statBars(def) {
  if (def.kind === 'melee') {
    return {
      damage: Math.min(1, def.damage / 100),
      speed: Math.min(1, 0.25 / def.swing),
      range: Math.min(1, (def.range - 1.6) / 1.6),
      mobility: Math.min(1, (def.moveMul - 0.9) / 0.28),
    };
  }
  const dps = (def.projectile ? def.projectile.explode.damage : def.damage * def.pellets) * (def.fire === 'burst' ? def.rpm / 2.2 : def.rpm) / 60;
  const perShot = def.projectile ? def.projectile.explode.damage : def.damage * def.pellets;
  return {
    damage: Math.min(1, perShot / 110),
    fireRate: Math.min(1, def.rpm / 1100),
    dps: Math.min(1, dps / 380),
    range: def.projectile ? 0.55 : Math.min(1, def.range[1] / 120),
    accuracy: Math.max(0, Math.min(1, 1 - def.spread.ads / 5)),
    control: Math.max(0, Math.min(1, 1 - def.recoil.up / 5)),
    mobility: Math.max(0, Math.min(1, (def.moveMul - 0.75) / 0.32)),
  };
}
