import { buildNeon } from './neon.js';
import { buildSkyport } from './skyport.js';
import { buildDunes } from './dunes.js';
import { buildCryo } from './cryo.js';
import { buildCore } from './core.js';

const BUILDERS = { neon: buildNeon, skyport: buildSkyport, dunes: buildDunes, cryo: buildCryo, core: buildCore };
const cache = {};

export const MAP_IDS = Object.keys(BUILDERS);

export function getMap(id) {
  if (!BUILDERS[id]) return null;
  if (!cache[id]) cache[id] = BUILDERS[id]();
  return cache[id];
}

export function mapInfo(id) {
  const m = getMap(id);
  return m ? { id: m.id, name: m.name, desc: m.desc, modes: m.modes } : null;
}
