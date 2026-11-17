// Avatar appearance schema, defaults and validation.

import { getItem } from './items.js';

export const SKIN_TONES = [
  '#ffe0c7', '#f6cfa8', '#eab68c', '#d99b6c', '#c07f50', '#9d6438',
  '#7a4a28', '#5a341b', '#3d2313', '#f5d76e', '#9be7ff', '#c9b6ff',
];

export const COLOR_SWATCHES = [
  '#ffffff', '#c9d1dc', '#7d8796', '#3a414d', '#16191f', '#000000',
  '#ff3b3b', '#ff7a1a', '#ffc21a', '#ffe95c', '#8be04b', '#1fbf6b',
  '#19e6ff', '#2f7bff', '#3b3bd6', '#8f4bff', '#ff2fa6', '#ff8fc8',
  '#7a4a28', '#b07a4a', '#e0c49a', '#2b3446', '#4d5b34', '#a3122c',
];

export const AVATAR_SLOTS = ['outfit', 'head', 'face', 'hair', 'hat', 'faceAcc', 'shirt', 'pants', 'back'];
export const SLOT_CATEGORY = {
  outfit: 'outfit', head: 'head', face: 'face', hair: 'hair', hat: 'hat',
  faceAcc: 'faceacc', shirt: 'shirt', pants: 'pants', back: 'back',
};
export const COLOR_FIELDS = ['skinTone', 'hairColor', 'shirtColor', 'pantsColor', 'accentColor'];

export const DEFAULT_AVATAR = Object.freeze({
  outfit: 'outfit_none',
  head: 'head_block',
  face: 'face_smile',
  hair: 'hair_spiky',
  hat: 'hat_none',
  faceAcc: 'faceacc_none',
  shirt: 'shirt_hoodie',
  pants: 'pants_jeans',
  back: 'back_none',
  skinTone: '#eab68c',
  hairColor: '#2a1d14',
  shirtColor: '#19e6ff',
  pantsColor: '#2b3446',
  accentColor: '#ff2fa6',
});

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Validates an avatar against the owned inventory. Unknown / unowned slots fall back to
 * defaults so a tampered client can never equip items it doesn't own.
 */
export function sanitizeAvatar(input, owned) {
  const out = { ...DEFAULT_AVATAR };
  if (!input || typeof input !== 'object') return out;
  for (const slot of AVATAR_SLOTS) {
    const id = input[slot];
    const item = typeof id === 'string' ? getItem(id) : null;
    if (item && item.cat === SLOT_CATEGORY[slot] && (item.price === 0 || owned.has(id))) out[slot] = id;
  }
  for (const f of COLOR_FIELDS) {
    if (typeof input[f] === 'string' && HEX.test(input[f])) out[f] = input[f].toLowerCase();
  }
  return out;
}

const BOT_HAIR = ['hair_none', 'hair_buzz', 'hair_spiky', 'hair_mohawk', 'hair_bob', 'hair_afro', 'hair_swoop', 'hair_ponytail', 'hair_long'];
const BOT_HAT = ['hat_none', 'hat_none', 'hat_cap', 'hat_beanie', 'hat_helmet', 'hat_headphones', 'hat_cowboy', 'hat_cat', 'hat_antenna'];
const BOT_FACE = ['face_smile', 'face_grin', 'face_chill', 'face_angry', 'face_smug', 'face_determined', 'face_shades', 'face_robot', 'face_beast'];
const BOT_SHIRT = ['shirt_tee', 'shirt_hoodie', 'shirt_jacket', 'shirt_vest', 'shirt_stripes', 'shirt_camo', 'shirt_racer', 'shirt_armor'];
const BOT_PANTS = ['pants_jeans', 'pants_cargo', 'pants_tactical', 'pants_track', 'pants_shorts'];
const BOT_ACC = ['faceacc_none', 'faceacc_none', 'faceacc_none', 'faceacc_aviators', 'faceacc_bandana', 'faceacc_mask', 'faceacc_visor'];
const BOT_BACK = ['back_none', 'back_none', 'back_pack', 'back_tank', 'back_katana'];
const BOT_OUTFIT = ['outfit_none', 'outfit_none', 'outfit_none', 'outfit_none', 'outfit_none', 'outfit_ops', 'outfit_ninja', 'outfit_mecha', 'outfit_astro'];

export function randomAvatar(rng) {
  const p = (a) => a[Math.floor(rng() * a.length) % a.length];
  return {
    outfit: p(BOT_OUTFIT),
    head: p(['head_block', 'head_block', 'head_round', 'head_cyl', 'head_wide']),
    face: p(BOT_FACE),
    hair: p(BOT_HAIR),
    hat: p(BOT_HAT),
    faceAcc: p(BOT_ACC),
    shirt: p(BOT_SHIRT),
    pants: p(BOT_PANTS),
    back: p(BOT_BACK),
    skinTone: p(SKIN_TONES.slice(0, 9)),
    hairColor: p(['#2a1d14', '#5a341b', '#e0c49a', '#16191f', '#ff7a1a', '#ff2fa6', '#19e6ff', '#ffffff']),
    shirtColor: p(COLOR_SWATCHES),
    pantsColor: p(['#2b3446', '#16191f', '#3a414d', '#4d5b34', '#7d8796', '#2f7bff', '#7a4a28']),
    accentColor: p(['#19e6ff', '#ff2fa6', '#ffc21a', '#8be04b', '#8f4bff', '#ff3b3b']),
  };
}
