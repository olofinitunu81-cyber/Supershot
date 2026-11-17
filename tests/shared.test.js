import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld, stepMovement } from '../shared/physics.js';
import { createPlayerState, simulateTick, shotDirections, computeSpread } from '../shared/sim.js';
import { GUNS, MELEE, WEAPONS, WEAPON_LIST, falloff, fireInterval } from '../shared/weapons.js';
import { ALL_ITEMS, ITEMS, featuredForDay, priceFor } from '../shared/items.js';
import { sanitizeAvatar, DEFAULT_AVATAR } from '../shared/avatar.js';
import { rayPlayer, HIT_HEAD, HIT_TORSO } from '../shared/hitbox.js';
import { Writer, Reader, encodeInputs, decodeInputs, encodeSnapshot, decodeSnapshot, encodeShots, decodeShots } from '../shared/protocol.js';
import { BTN, PLAYER, TICK_DT } from '../shared/config.js';
import { MAP_IDS, getMap } from '../shared/maps/index.js';
import { NavGrid } from '../server/nav.js';
import { levelFromXp, computeMatchRewards } from '../shared/progression.js';
import { missionsForDay } from '../shared/missions.js';

const LOADOUT = { primary: 'vx9', secondary: 'sidekick', melee: 'knife' };
const flat = () => new CollisionWorld([{ min: [-50, -1, -50], max: [50, 0, 50] }]);
const input = (o = {}) => ({ mx: 0, mz: 0, yaw: 0, pitch: 0, buttons: 0, slot: 0, ...o });
const run = (p, world, inp, ticks, hooks = null, map = null) => {
  for (let i = 0; i < ticks; i++) simulateTick(p, typeof inp === 'function' ? inp(i) : inp, { world, map, dt: TICK_DT, hooks });
};

test('catalogue has exactly 20 guns and 10 melee weapons with unique ids', () => {
  assert.equal(GUNS.length, 20);
  assert.equal(MELEE.length, 10);
  assert.equal(new Set(WEAPON_LIST.map((w) => w.id)).size, 30);
  for (const w of GUNS) {
    assert.ok(w.rpm > 0 && w.mag > 0 && w.reserve > 0, w.id);
    assert.ok(['primary', 'secondary'].includes(w.slot), w.id);
  }
  for (const m of MELEE) assert.ok(m.damage > 0 && m.swing > 0 && m.range > 1.5, m.id);
  assert.equal(new Set(ALL_ITEMS.map((i) => i.id)).size, ALL_ITEMS.length, 'item ids unique');
});

test('player walks, stops, jumps and lands on flat ground', () => {
  const w = flat();
  const p = createPlayerState(1, LOADOUT);
  p.y = 0.5;
  run(p, w, input(), 30);
  assert.ok(p.onGround, 'lands');
  assert.ok(Math.abs(p.y) < 1e-6);
  run(p, w, input({ mz: 1 }), 60);
  const sp = Math.hypot(p.vx, p.vz);
  assert.ok(Math.abs(sp - PLAYER.walkSpeed) < 0.05, `walk speed ${sp}`);
  assert.ok(p.z < -5, 'moved forward (-Z)');
  run(p, w, input({ mz: 1, buttons: BTN.SPRINT }), 40);
  assert.ok(Math.hypot(p.vx, p.vz) > PLAYER.walkSpeed * 1.3, 'sprint is faster');
  run(p, w, input({ buttons: BTN.JUMP }), 1);
  assert.ok(!p.onGround && p.vy > 0, 'jumped');
  let maxY = 0;
  run(p, w, (i) => { maxY = Math.max(maxY, p.y); return input(); }, 80);
  assert.ok(maxY > 1.1 && maxY < 1.5, `jump height ${maxY}`);
  assert.ok(p.onGround);
});

test('walls block movement and stairs are climbable', () => {
  const boxes = [{ min: [-50, -1, -50], max: [50, 0, 50] }, { min: [-5, 0, -3], max: [5, 3, -2] }];
  for (let i = 0; i < 10; i++) boxes.push({ min: [10, 0, -1 - i * 0.42 - 0.42], max: [12, 0.3 * (i + 1), -1 - i * 0.42] });
  const w = new CollisionWorld(boxes);
  const p = createPlayerState(1, LOADOUT);
  run(p, w, input({ mz: 1 }), 120);
  assert.ok(p.z > -2 + PLAYER.halfWidth - 1e-3 && p.z < -1, `stopped at wall z=${p.z}`);
  const q = createPlayerState(2, LOADOUT);
  q.x = 11; q.z = 0;
  let top = 0;
  run(q, w, () => { top = Math.max(top, q.y); return input({ mz: 1 }); }, 150);
  assert.ok(top > 2.9, `climbed stairs to ${top}`);
});

test('crouch reduces speed and blocks standing under low ceilings; slide boosts speed', () => {
  const w = new CollisionWorld([{ min: [-50, -1, -50], max: [50, 0, 50] }, { min: [-2, 1.5, -10], max: [2, 2, -6] }]);
  const p = createPlayerState(1, LOADOUT);
  run(p, w, input({ buttons: BTN.CROUCH }), 5);
  run(p, w, input({ mz: 1, buttons: BTN.CROUCH }), 60);
  assert.ok(p.crouched);
  assert.ok(Math.hypot(p.vx, p.vz) < PLAYER.walkSpeed * 0.6);
  run(p, w, input({ mz: 1, buttons: BTN.CROUCH }), 60);
  // under the low ceiling now: releasing crouch must keep us crouched
  if (p.z < -6 && p.z > -10) {
    run(p, w, input(), 3);
    assert.ok(p.crouched, 'cannot stand under ceiling');
  }
  const s = createPlayerState(3, LOADOUT);
  s.x = 20;
  run(s, w, input({ mz: 1, buttons: BTN.SPRINT }), 60);
  run(s, w, input({ mz: 1, buttons: BTN.SPRINT | BTN.CROUCH }), 1);
  assert.ok(s.sliding, 'slide started');
  assert.ok(Math.hypot(s.vx, s.vz) >= PLAYER.slideSpeed - 0.5);
});

test('fire rates, magazines and reloads behave per weapon', () => {
  const w = flat();
  for (const id of ['vx9', 'wasp', 'titan', 'hornet']) {
    const def = WEAPONS[id];
    const p = createPlayerState(1, { ...LOADOUT, primary: def.slot === 'primary' ? id : 'vx9', secondary: def.slot === 'secondary' ? id : 'sidekick' });
    const slot = def.slot === 'primary' ? 0 : 1;
    let shots = 0;
    const hooks = { shot: () => shots++ };
    run(p, w, input({ slot }), 60);
    run(p, w, input({ slot, buttons: BTN.FIRE }), 60, hooks);
    const expected = Math.min(def.mag, Math.floor(1 / fireInterval(def)) + 1);
    assert.ok(Math.abs(shots - expected) <= 1, `${id}: ${shots} shots in 1s, expected ~${expected}`);
  }
  // semi-auto requires trigger releases
  const p = createPlayerState(1, LOADOUT);
  let shots = 0;
  run(p, w, input({ slot: 1 }), 30);
  run(p, w, input({ slot: 1, buttons: BTN.FIRE }), 60, { shot: () => shots++ });
  assert.equal(shots, 1, 'holding fire on a pistol fires once');
  // reload refills magazine from reserve
  const r = createPlayerState(1, LOADOUT);
  run(r, w, input(), 30);
  run(r, w, input({ buttons: BTN.FIRE }), 30);
  const magBefore = r.slots[0].mag;
  assert.ok(magBefore < 30);
  run(r, w, input({ buttons: BTN.RELOAD }), 1);
  assert.ok(r.reloadT > 0);
  run(r, w, input(), Math.ceil(WEAPONS.vx9.reload / TICK_DT) + 2);
  assert.equal(r.slots[0].mag, 30);
  assert.equal(r.slots[0].reserve, 150 - (30 - magBefore));
});

test('burst rifle fires 3-round bursts; shotgun fires all pellets', () => {
  const w = flat();
  const p = createPlayerState(1, { ...LOADOUT, primary: 'k3' });
  let shots = 0;
  run(p, w, input(), 30);
  run(p, w, (i) => input({ buttons: i < 2 ? BTN.FIRE : 0 }), 20, { shot: () => shots++ });
  assert.equal(shots, 3);
  const dirs = shotDirections(0, 0, WEAPONS.breacher.spread.hip, WEAPONS.breacher.pellets, 1234);
  assert.equal(dirs.length, 8);
  const again = shotDirections(0, 0, WEAPONS.breacher.spread.hip, WEAPONS.breacher.pellets, 1234);
  assert.deepEqual(dirs, again, 'deterministic pellet pattern');
  for (const d of dirs) assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9);
});

test('spread grows when moving and shrinks when aiming', () => {
  const p = createPlayerState(1, LOADOUT);
  p.onGround = true;
  const def = WEAPONS.vx9;
  const still = computeSpread(p, def);
  p.vx = 6;
  const moving = computeSpread(p, def);
  p.vx = 0; p.adsT = 1;
  const ads = computeSpread(p, def);
  assert.ok(moving > still && ads < still);
  assert.equal(falloff(def, 5), 1);
  assert.ok(falloff(def, 500) === def.minDmg);
});

test('hitboxes register head and torso hits and respect yaw', () => {
  const head = rayPlayer(0, 1.645, 5, 0, 0, -1, 100, 0, 0, 0, 0, false);
  assert.equal(head.zone, HIT_HEAD);
  assert.ok(Math.abs(head.t - (5 - 0.235)) < 1e-6);
  const torso = rayPlayer(0, 1.1, 5, 0, 0, -1, 100, 0, 0, 0, 0.7, false);
  assert.equal(torso.zone, HIT_TORSO);
  assert.equal(rayPlayer(2, 1.1, 5, 0, 0, -1, 100, 0, 0, 0, 0, false), null, 'miss to the side');
  const crouchedHead = rayPlayer(0, 1.645, 5, 0, 0, -1, 100, 0, 0, 0, 0, true);
  assert.equal(crouchedHead, null, 'crouching ducks under a head-height shot');
});

test('binary protocol round-trips inputs, snapshots and shots', () => {
  const w = new Writer();
  const inputs = [{ seq: 42, mx: 1, mz: -1, yaw: 1.25, pitch: -0.3, buttons: BTN.FIRE | BTN.ADS, slot: 2, viewTime: 123456 }];
  const back = decodeInputs(new Reader(encodeInputs(w, inputs).slice(1)));
  assert.equal(back[0].seq, 42);
  assert.equal(back[0].buttons, BTN.FIRE | BTN.ADS);
  assert.ok(Math.abs(back[0].yaw - 1.25) < 1e-6);
  const p = createPlayerState(7, LOADOUT);
  p.x = 3.5; p.slots[0].mag = 17;
  const snap = { tick: 9, time: 5000, phase: 1, phaseTime: 100, self: { ack: 41, p, health: 77, protect: true }, players: [{ id: 3, x: 1, y: 2, z: 3, vx: 1, vy: 0, vz: -2, yaw: 2, pitch: 0.1, weapon: 4, health: 50, flags: 17, swing: 3 }], projectiles: [{ id: 5, owner: 3, kind: 19, x: 0, y: 1, z: 2, vx: 3, vy: 4, vz: 5 }] };
  const ds = decodeSnapshot((() => { const r = new Reader(encodeSnapshot(w, snap)); r.u8(); return r; })());
  assert.equal(ds.self.ack, 41);
  assert.equal(ds.self.health, 77);
  assert.equal(ds.self.p.slots[0].mag, 17);
  assert.ok(Math.abs(ds.self.p.x - 3.5) < 1e-5);
  assert.equal(ds.players[0].id, 3);
  assert.ok(Math.abs(ds.players[0].yaw - 2) < 1e-3);
  assert.equal(ds.projectiles[0].kind, 19);
  const shots = [{ shooter: 2, weapon: 1, seq: 99, ox: 1, oy: 2, oz: 3, yaw: 0.5, pitch: 0, spread: 2, results: [{ t: 12.34, kind: 1 }] }];
  const sb = decodeShots((() => { const r = new Reader(encodeShots(w, shots)); r.u8(); return r; })());
  assert.equal(sb[0].seq, 99);
  assert.ok(Math.abs(sb[0].results[0].t - 12.34) < 0.03);
});

test('avatar sanitizer rejects unowned items and bad colors', () => {
  const owned = new Set(['hat_crown']);
  const a = sanitizeAvatar({ hat: 'hat_crown', hair: 'hair_flame', shirtColor: 'red', pantsColor: '#ABCDEF', outfit: 'nope' }, owned);
  assert.equal(a.hat, 'hat_crown');
  assert.equal(a.hair, DEFAULT_AVATAR.hair);
  assert.equal(a.shirtColor, DEFAULT_AVATAR.shirtColor);
  assert.equal(a.pantsColor, '#abcdef');
  assert.equal(a.outfit, 'outfit_none');
});

test('shop rotation, discounts, progression and missions are deterministic', () => {
  const day = '2026-11-17';
  const f = featuredForDay(day);
  assert.equal(f.length, 6);
  assert.deepEqual(f, featuredForDay(day));
  const it = ITEMS[f[0]];
  assert.ok(priceFor(it, day) < it.price);
  assert.equal(levelFromXp(0).level, 1);
  assert.equal(levelFromXp(900).level, 2);
  const r = computeMatchRewards({ kills: 10, botKills: 4, assists: 2, headshots: 3, won: true, place: 1, completed: true }, { mode: 'tdm', isPrivate: false });
  assert.ok(r.credits > 0 && r.xp > 0);
  const priv = computeMatchRewards({ kills: 10, botKills: 4, assists: 2, headshots: 3, won: true, place: 1, completed: true }, { mode: 'tdm', isPrivate: true });
  assert.ok(priv.credits < r.credits);
  assert.deepEqual(missionsForDay(5, day), missionsForDay(5, day));
  assert.equal(missionsForDay(5, day).length, 3);
});

test('every map has valid spawns and fully connected navigation', () => {
  for (const id of MAP_IDS) {
    const m = getMap(id);
    const w = new CollisionWorld(m.boxes);
    const hw = PLAYER.halfWidth;
    for (const s of m.spawns) {
      assert.ok(!w.overlaps(s.x - hw, s.y, s.z - hw, s.x + hw, s.y + PLAYER.height, s.z + hw), `${id} spawn inside geometry ${JSON.stringify(s)}`);
      const g = w.groundHeight(s.x, s.z, s.y + 0.1, 5);
      assert.ok(g !== null && s.y - g < 0.5, `${id} spawn floating`);
    }
    assert.ok(m.spawns.filter((s) => s.team === 0).length >= 4, `${id} team 0 spawns`);
    assert.ok(m.spawns.filter((s) => s.team === 1).length >= 4, `${id} team 1 spawns`);
    const nav = new NavGrid(m, w);
    const pts = m.spawns.map((s) => nav.nearest(s.x, s.y, s.z));
    for (const a of pts) for (const b of pts) assert.ok(nav.path(a, b), `${id}: path between spawns`);
  }
});

test('jump pads launch players', () => {
  const m = getMap('core');
  const w = new CollisionWorld(m.boxes);
  const pad = m.pads[0];
  const p = createPlayerState(1, LOADOUT);
  p.x = (pad.min[0] + pad.max[0]) / 2; p.z = (pad.min[2] + pad.max[2]) / 2; p.y = pad.max[1];
  let launched = false;
  run(p, w, input(), 120, { move: (pl, ev) => { if (ev.padLaunch) launched = true; } }, m);
  assert.ok(launched);
  assert.ok(p.y > 3.5, `landed on the dais (y=${p.y})`);
});

void stepMovement;
