// Daily missions. Each UTC day every account receives 3 missions picked
// deterministically from this pool (seeded by account id + date).

import { mulberry32, hashInts, hashString } from './rng.js';

export const MISSION_POOL = [
  { id: 'play3', text: 'Play 3 matches', stat: 'matches', goal: 3, reward: 150 },
  { id: 'win2', text: 'Win 2 matches', stat: 'wins', goal: 2, reward: 250 },
  { id: 'kills15', text: 'Get 15 eliminations', stat: 'kills', goal: 15, reward: 200 },
  { id: 'kills30', text: 'Get 30 eliminations', stat: 'kills', goal: 30, reward: 320 },
  { id: 'heads5', text: 'Get 5 headshot eliminations', stat: 'headshotKills', goal: 5, reward: 220 },
  { id: 'melee3', text: 'Get 3 melee eliminations', stat: 'meleeKills', goal: 3, reward: 250 },
  { id: 'ar10', text: 'Get 10 eliminations with assault rifles', stat: 'kills_AR', goal: 10, reward: 200 },
  { id: 'smg10', text: 'Get 10 eliminations with SMGs', stat: 'kills_SMG', goal: 10, reward: 200 },
  { id: 'sg8', text: 'Get 8 eliminations with shotguns', stat: 'kills_SHOTGUN', goal: 8, reward: 220 },
  { id: 'snipe5', text: 'Get 5 eliminations with snipers or marksman rifles', stat: 'kills_LONG', goal: 5, reward: 240 },
  { id: 'pistol6', text: 'Get 6 eliminations with secondaries', stat: 'kills_SECONDARY', goal: 6, reward: 220 },
  { id: 'dmg2500', text: 'Deal 2,500 damage', stat: 'damage', goal: 2500, reward: 200 },
  { id: 'streak4', text: 'Reach a 4 elimination streak', stat: 'bestStreak', goal: 4, reward: 260, max: true },
  { id: 'assist5', text: 'Get 5 assists', stat: 'assists', goal: 5, reward: 160 },
  { id: 'tdm2', text: 'Play 2 Team Deathmatch matches', stat: 'matches_tdm', goal: 2, reward: 140 },
  { id: 'ffa2', text: 'Play 2 Free For All matches', stat: 'matches_ffa', goal: 2, reward: 140 },
];

export const MISSIONS_PER_DAY = 3;

export function missionsForDay(accountId, dayKey) {
  const rng = mulberry32(hashInts(accountId, hashString(dayKey)));
  const pool = MISSION_POOL.slice();
  const out = [];
  const usedStats = new Set();
  while (out.length < MISSIONS_PER_DAY && pool.length) {
    const i = Math.floor(rng() * pool.length);
    const m = pool.splice(i, 1)[0];
    if (usedStats.has(m.stat)) continue;
    usedStats.add(m.stat);
    out.push({ id: m.id, progress: 0, claimed: false });
  }
  return out;
}

export function missionDef(id) {
  return MISSION_POOL.find((m) => m.id === id) || null;
}

/** Converts a weapon class into mission stat keys. */
export function weaponMissionStats(def) {
  const keys = [];
  if (!def) return keys;
  if (def.kind === 'melee') return ['meleeKills'];
  if (def.cls === 'AR') keys.push('kills_AR');
  if (def.cls === 'SMG') keys.push('kills_SMG');
  if (def.cls === 'SHOTGUN') keys.push('kills_SHOTGUN');
  if (def.cls === 'SNIPER' || def.cls === 'DMR' || def.cls === 'RAIL') keys.push('kills_LONG');
  if (def.slot === 'secondary') keys.push('kills_SECONDARY');
  return keys;
}
