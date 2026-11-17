// Cosmetic catalogue: avatar parts, outfits, weapon camos and emotes.
// Weapons are also sold in the shop — they are pulled in from weapons.js.

import { WEAPON_LIST } from './weapons.js';

export const RARITY = {
  common: { name: 'COMMON', color: '#9fb0c8' },
  rare: { name: 'RARE', color: '#36a3ff' },
  epic: { name: 'EPIC', color: '#b45cff' },
  legendary: { name: 'LEGENDARY', color: '#ffb321' },
};

export const CATEGORIES = [
  { id: 'outfit', name: 'OUTFITS', slot: 'outfit' },
  { id: 'head', name: 'HEADS', slot: 'head' },
  { id: 'face', name: 'FACES', slot: 'face' },
  { id: 'hair', name: 'HAIR', slot: 'hair' },
  { id: 'hat', name: 'HATS', slot: 'hat' },
  { id: 'faceacc', name: 'FACE GEAR', slot: 'faceAcc' },
  { id: 'shirt', name: 'TOPS', slot: 'shirt' },
  { id: 'pants', name: 'BOTTOMS', slot: 'pants' },
  { id: 'back', name: 'BACK', slot: 'back' },
  { id: 'camo', name: 'WEAPON CAMOS', slot: null },
  { id: 'emote', name: 'EMOTES', slot: null },
];

const it = (cat, id, name, price, rarity = 'common', data = {}) => ({ id, cat, name, price, rarity, data });

export const COSMETICS = [
  // ── OUTFITS (full-body skins; override top/bottom/skin look) ──
  it('outfit', 'outfit_none', 'NO OUTFIT', 0),
  it('outfit', 'outfit_ninja', 'CYBER NINJA', 1800, 'epic', { body: '#15161c', trim: '#ff2f6d', skin: '#15161c', glow: true, ninja: true }),
  it('outfit', 'outfit_mecha', 'MECHA UNIT', 2400, 'legendary', { body: '#d8dde6', trim: '#ff8a1f', skin: '#9aa3b1', robot: true, glow: true }),
  it('outfit', 'outfit_ghost', 'NEON GHOST', 2200, 'legendary', { body: '#1ad8ff', trim: '#ffffff', skin: '#1ad8ff', ghost: true, glow: true }),
  it('outfit', 'outfit_gold', 'GOLDEN LEGEND', 3000, 'legendary', { body: '#f5c040', trim: '#fff2b0', skin: '#f5c040', metal: true }),
  it('outfit', 'outfit_ops', 'SHADOW OPS', 1200, 'rare', { body: '#2b3326', trim: '#9bd14b', skin: null, tactical: true }),
  it('outfit', 'outfit_astro', 'ASTRONAUT', 1600, 'epic', { body: '#eef2f7', trim: '#2f7bff', skin: null, astro: true }),
  it('outfit', 'outfit_punk', 'PIXEL PUNK', 1000, 'rare', { body: '#ff3fa4', trim: '#30ffcf', skin: null, glow: true }),
  it('outfit', 'outfit_lava', 'MAGMA CORE', 2600, 'legendary', { body: '#2a1410', trim: '#ff5a14', skin: '#2a1410', lava: true, glow: true }),

  // ── HEADS ──
  it('head', 'head_block', 'CLASSIC BLOCK', 0),
  it('head', 'head_round', 'ROUNDED', 0),
  it('head', 'head_cyl', 'CAPSULE', 250),
  it('head', 'head_wide', 'WIDE BOY', 300, 'rare'),
  it('head', 'head_tv', 'TV HEAD', 1400, 'epic', { screen: true }),
  it('head', 'head_orb', 'ORB', 900, 'rare'),

  // ── FACES ──
  it('face', 'face_smile', 'CLASSIC SMILE', 0),
  it('face', 'face_grin', 'BIG GRIN', 0),
  it('face', 'face_chill', 'CHILL', 0),
  it('face', 'face_angry', 'FURIOUS', 200),
  it('face', 'face_smug', 'SMUG', 250),
  it('face', 'face_wink', 'WINK', 250),
  it('face', 'face_shock', 'SHOCKED', 200),
  it('face', 'face_determined', 'DETERMINED', 350, 'rare'),
  it('face', 'face_kitty', 'KITTY', 450, 'rare'),
  it('face', 'face_shades', 'SHADES', 600, 'rare'),
  it('face', 'face_robot', 'LED VISOR', 900, 'epic'),
  it('face', 'face_star', 'STAR EYES', 800, 'epic'),
  it('face', 'face_skull', 'SKULL', 1200, 'legendary'),
  it('face', 'face_beast', 'BEAST MODE', 700, 'rare'),

  // ── HAIR ──
  it('hair', 'hair_none', 'BALD', 0),
  it('hair', 'hair_buzz', 'BUZZ CUT', 0),
  it('hair', 'hair_spiky', 'SPIKY', 0),
  it('hair', 'hair_mohawk', 'MOHAWK', 400, 'rare'),
  it('hair', 'hair_bob', 'BOB', 300),
  it('hair', 'hair_long', 'LONG FLOW', 450, 'rare'),
  it('hair', 'hair_ponytail', 'PONYTAIL', 400),
  it('hair', 'hair_afro', 'AFRO', 500, 'rare'),
  it('hair', 'hair_swoop', 'SWOOP', 350),
  it('hair', 'hair_buns', 'SPACE BUNS', 550, 'epic'),
  it('hair', 'hair_flame', 'FLAME HAIR', 1500, 'legendary', { glow: '#ff7a1a' }),

  // ── HATS ──
  it('hat', 'hat_none', 'NO HAT', 0),
  it('hat', 'hat_cap', 'SNAPBACK', 0),
  it('hat', 'hat_beanie', 'BEANIE', 200),
  it('hat', 'hat_headphones', 'HEADPHONES', 450, 'rare'),
  it('hat', 'hat_tophat', 'TOP HAT', 600, 'rare'),
  it('hat', 'hat_crown', 'ROYAL CROWN', 2500, 'legendary'),
  it('hat', 'hat_horns', 'DEMON HORNS', 900, 'epic'),
  it('hat', 'hat_halo', 'HALO', 1200, 'epic', { glow: '#fff3a0' }),
  it('hat', 'hat_cat', 'CAT EARS', 400),
  it('hat', 'hat_helmet', 'TAC HELMET', 700, 'rare'),
  it('hat', 'hat_cowboy', 'COWBOY', 500, 'rare'),
  it('hat', 'hat_cone', 'TRAFFIC CONE', 300),
  it('hat', 'hat_wizard', 'WIZARD HAT', 800, 'epic'),
  it('hat', 'hat_antenna', 'ANTENNA', 350),
  it('hat', 'hat_neonband', 'NEON BAND', 650, 'rare', { glow: true }),

  // ── FACE GEAR ──
  it('faceacc', 'faceacc_none', 'NONE', 0),
  it('faceacc', 'faceacc_visor', 'NEON VISOR', 700, 'epic', { glow: true }),
  it('faceacc', 'faceacc_aviators', 'AVIATORS', 350, 'rare'),
  it('faceacc', 'faceacc_mask', 'GAS MASK', 600, 'rare'),
  it('faceacc', 'faceacc_bandana', 'BANDANA', 250),
  it('faceacc', 'faceacc_patch', 'EYE PATCH', 200),
  it('faceacc', 'faceacc_goggles', 'CYBER GOGGLES', 900, 'epic', { glow: true }),
  it('faceacc', 'faceacc_mustache', 'MUSTACHE', 150),

  // ── TOPS ──
  it('shirt', 'shirt_tee', 'TEE', 0),
  it('shirt', 'shirt_hoodie', 'HOODIE', 0),
  it('shirt', 'shirt_jacket', 'BOMBER JACKET', 400, 'rare'),
  it('shirt', 'shirt_vest', 'TACTICAL VEST', 600, 'rare'),
  it('shirt', 'shirt_stripes', 'STRIPES', 200),
  it('shirt', 'shirt_suit', 'SHARP SUIT', 800, 'epic'),
  it('shirt', 'shirt_armor', 'ARMOR PLATE', 1100, 'epic'),
  it('shirt', 'shirt_circuit', 'CIRCUIT TOP', 950, 'epic', { glow: true }),
  it('shirt', 'shirt_camo', 'CAMO SHIRT', 300),
  it('shirt', 'shirt_racer', 'RACING JACKET', 700, 'rare'),
  it('shirt', 'shirt_tank', 'TANK TOP', 150),

  // ── BOTTOMS ──
  it('pants', 'pants_jeans', 'JEANS', 0),
  it('pants', 'pants_shorts', 'SHORTS', 0),
  it('pants', 'pants_cargo', 'CARGO PANTS', 250),
  it('pants', 'pants_tactical', 'TACTICAL', 450, 'rare'),
  it('pants', 'pants_track', 'TRACK PANTS', 300),
  it('pants', 'pants_armor', 'ARMORED GREAVES', 900, 'epic'),
  it('pants', 'pants_neon', 'NEON STRIDE', 800, 'epic', { glow: true }),

  // ── BACK ──
  it('back', 'back_none', 'NONE', 0),
  it('back', 'back_pack', 'BACKPACK', 300),
  it('back', 'back_cape', 'HERO CAPE', 800, 'epic'),
  it('back', 'back_jetpack', 'JETPACK', 1400, 'epic', { glow: true }),
  it('back', 'back_wings', 'CYBER WINGS', 2400, 'legendary', { glow: true }),
  it('back', 'back_katana', 'SHEATHED BLADE', 600, 'rare'),
  it('back', 'back_guitar', 'ELECTRIC GUITAR', 900, 'rare'),
  it('back', 'back_tank', 'O2 TANKS', 500, 'rare'),

  // ── WEAPON CAMOS ──
  it('camo', 'camo_none', 'FACTORY', 0, 'common', { base: null }),
  it('camo', 'camo_arctic', 'ARCTIC', 300, 'common', { base: '#e8eef4', b: '#9fb3c8', pattern: 'blotch' }),
  it('camo', 'camo_woodland', 'WOODLAND', 300, 'common', { base: '#4d5b34', b: '#2c2416', pattern: 'blotch' }),
  it('camo', 'camo_digital', 'URBAN DIGITAL', 450, 'rare', { base: '#6d7480', b: '#2f343c', pattern: 'pixel' }),
  it('camo', 'camo_crimson', 'CRIMSON', 500, 'rare', { base: '#a3122c', b: '#2a0710', pattern: 'stripe' }),
  it('camo', 'camo_carbon', 'CARBON FIBER', 700, 'rare', { base: '#22252b', b: '#0c0d10', pattern: 'weave', rough: 0.35 }),
  it('camo', 'camo_tiger', 'TIGER', 650, 'rare', { base: '#f08a1c', b: '#1a120a', pattern: 'tiger' }),
  it('camo', 'camo_chrome', 'CHROME', 1400, 'epic', { base: '#d9dee6', b: '#9aa2ad', pattern: 'solid', metal: 1, rough: 0.08 }),
  it('camo', 'camo_neon', 'NEON CIRCUIT', 1600, 'epic', { base: '#0b0f1c', b: '#19e6ff', pattern: 'circuit', glow: true }),
  it('camo', 'camo_galaxy', 'GALAXY', 2000, 'legendary', { base: '#140a2e', b: '#ff4fd8', pattern: 'galaxy', glow: true }),
  it('camo', 'camo_lava', 'MOLTEN', 2000, 'legendary', { base: '#1c0d08', b: '#ff5a10', pattern: 'lava', glow: true }),
  it('camo', 'camo_gold', '24K GOLD', 3000, 'legendary', { base: '#f2bf3a', b: '#b8861c', pattern: 'solid', metal: 1, rough: 0.18 }),
  it('camo', 'camo_glitch', 'GLITCH', 1800, 'epic', { base: '#101010', b: '#00ff9c', pattern: 'glitch', glow: true }),

  // ── EMOTES (lobby) ──
  it('emote', 'emote_wave', 'WAVE', 0),
  it('emote', 'emote_salute', 'SALUTE', 0),
  it('emote', 'emote_cheer', 'CHEER', 0),
  it('emote', 'emote_dance', 'GROOVE', 400, 'rare'),
  it('emote', 'emote_robot', 'ROBOT', 500, 'rare'),
  it('emote', 'emote_flex', 'FLEX', 350),
  it('emote', 'emote_spin', 'VICTORY SPIN', 800, 'epic'),
  it('emote', 'emote_sit', 'TAKE A SEAT', 300),
];

/** Shop items for weapons (one per gun/melee). */
export const WEAPON_ITEMS = WEAPON_LIST.map((w) => ({
  id: w.id,
  cat: w.kind === 'melee' ? 'melee' : 'weapon',
  name: w.name,
  price: w.price,
  rarity: w.rarity,
  data: { cls: w.cls, slot: w.slot },
}));

export const ALL_ITEMS = [...WEAPON_ITEMS, ...COSMETICS];
export const ITEMS = Object.fromEntries(ALL_ITEMS.map((i) => [i.id, i]));

export const FREE_ITEMS = ALL_ITEMS.filter((i) => i.price === 0).map((i) => i.id);

export function getItem(id) {
  return ITEMS[id] || null;
}

export function itemsByCat(cat) {
  return ALL_ITEMS.filter((i) => i.cat === cat);
}

/**
 * Daily featured shop rotation — deterministic per UTC day so every player sees the
 * same deals. Featured items get a 25% discount.
 */
export function featuredForDay(dayKey) {
  let h = 2166136261;
  for (let i = 0; i < dayKey.length; i++) { h ^= dayKey.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const pool = ALL_ITEMS.filter((i) => i.price > 0);
  const out = [];
  const used = new Set();
  let s = h >>> 0;
  while (out.length < 6 && used.size < pool.length) {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    const idx = s % pool.length;
    if (used.has(idx)) continue;
    used.add(idx);
    out.push(pool[idx].id);
  }
  return out;
}

export const FEATURED_DISCOUNT = 0.25;

export function priceFor(item, dayKey) {
  if (!item) return Infinity;
  if (item.price === 0) return 0;
  const featured = featuredForDay(dayKey);
  if (featured.includes(item.id)) return Math.round((item.price * (1 - FEATURED_DISCOUNT)) / 10) * 10;
  return item.price;
}
