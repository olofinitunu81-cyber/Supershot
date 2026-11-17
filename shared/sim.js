// Full per-tick player simulation (movement + weapon state machine).
// Runs identically on the server (authoritative) and on the client (prediction
// + reconciliation replays). Side effects are delivered through `hooks`.

import { PLAYER, BTN } from './config.js';
import { WEAPONS, fireInterval } from './weapons.js';
import { stepMovement, eyeHeight } from './physics.js';
import { mulberry32, hashInts } from './rng.js';
import { DEG, TAU, clamp, lerp } from './math.js';

export const SLOT_NAMES = ['primary', 'secondary', 'melee'];

export function seedBaseFor(id) {
  return hashInts(id * 7919 + 13);
}

export function createPlayerState(id, loadout) {
  const p = {
    id,
    seedBase: seedBaseFor(id),
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: 0,
    onGround: false, crouched: false, sliding: false, sprinting: false,
    slideT: 0, slideCd: 0, padCd: 0, jumpBuf: 0,
    jumpHeld: false, crouchHeld: false,
    alive: true,
    slots: [
      { id: loadout.primary, mag: 0, reserve: 0 },
      { id: loadout.secondary, mag: 0, reserve: 0 },
      { id: loadout.melee, mag: 0, reserve: 0 },
    ],
    slot: 0,
    switchT: 0,
    fireCd: 0,
    reloadT: 0,
    burstLeft: 0,
    chargeT: 0,
    spin: 0,
    bloom: 0,
    adsT: 0,
    meleeT: 0,
    meleeHitT: -1,
    swingIdx: 0,
    quickMelee: false,
    returnSlot: 0,
    fireHeld: false,
    meleeHeld: false,
    reloadHeld: false,
    trigBuf: 0,
    sinceFire: 9,
    sprintOut: 0,
    shotSeq: 0,
  };
  refillAmmo(p);
  return p;
}

export function refillAmmo(p) {
  for (const s of p.slots) {
    const d = WEAPONS[s.id];
    if (d && d.kind === 'gun') { s.mag = d.mag; s.reserve = d.reserve; } else { s.mag = 0; s.reserve = 0; }
  }
}

export function respawnState(p, spawn, loadout) {
  p.x = spawn.x; p.y = spawn.y; p.z = spawn.z;
  p.vx = p.vy = p.vz = 0;
  p.yaw = spawn.yaw || 0; p.pitch = 0;
  p.onGround = false; p.crouched = false; p.sliding = false; p.sprinting = false;
  p.slideT = 0; p.slideCd = 0; p.padCd = 0; p.jumpBuf = 0;
  p.alive = true;
  if (loadout) {
    p.slots[0].id = loadout.primary; p.slots[1].id = loadout.secondary; p.slots[2].id = loadout.melee;
  }
  refillAmmo(p);
  p.slot = 0; p.switchT = 0.35; p.fireCd = 0; p.reloadT = 0; p.burstLeft = 0; p.chargeT = 0; p.spin = 0;
  p.bloom = 0; p.adsT = 0; p.meleeT = 0; p.meleeHitT = -1; p.quickMelee = false; p.returnSlot = 0;
  p.trigBuf = 0; p.sinceFire = 9; p.sprintOut = 0;
}

export function currentDef(p) {
  return WEAPONS[p.slots[p.slot].id];
}

export function computeSpread(p, def) {
  const s = def.spread;
  let v = lerp(s.hip, s.ads, p.adsT);
  const hs = Math.hypot(p.vx, p.vz);
  v += s.move * Math.min(1, hs / PLAYER.walkSpeed);
  if (!p.onGround) v += s.air;
  if (p.crouched && !p.sliding) v *= s.crouch;
  v += p.bloom * (1 - 0.45 * p.adsT);
  return v;
}

/** Deterministic pellet directions for a shot. Returns array of [dx,dy,dz]. */
export function shotDirections(yaw, pitch, spreadDeg, pellets, seed) {
  const rng = mulberry32(seed);
  const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
  const fx = -sy * cp, fy = sp, fz = -cy * cp;
  const rx = cy, ry = 0, rz = -sy;
  const ux = sy * sp, uy = cp, uz = cy * sp;
  const out = [];
  for (let i = 0; i < pellets; i++) {
    let r, a;
    if (pellets > 1) {
      if (i === 0) { r = spreadDeg * 0.12 * rng(); a = rng() * TAU; }
      else {
        const ring = i % 2 === 1 ? 1 : 0.62;
        r = spreadDeg * ring * (0.75 + 0.25 * rng());
        a = (i / (pellets - 1)) * TAU + (rng() - 0.5) * 0.7;
      }
    } else {
      r = spreadDeg * Math.sqrt(rng());
      a = rng() * TAU;
    }
    const t = Math.tan(r * DEG);
    const ca = Math.cos(a) * t, sa = Math.sin(a) * t;
    let dx = fx + rx * ca + ux * sa, dy = fy + ry * ca + uy * sa, dz = fz + rz * ca + uz * sa;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    dx /= l; dy /= l; dz /= l;
    out.push([dx, dy, dz]);
  }
  return out;
}

export function shotSeed(p, seq) {
  return hashInts(p.seedBase, seq);
}

export function eyePos(p) {
  return [p.x, p.y + eyeHeight(p), p.z];
}

function startReload(p, def, s, hooks) {
  if (def.shell) {
    p.reloadT = def.shell.start + def.shell.each;
  } else {
    p.reloadT = s.mag === 0 ? def.reloadEmpty : def.reload;
  }
  p.burstLeft = 0;
  p.chargeT = 0;
  hooks && hooks.sound && hooks.sound(p, 'reload', def, s.mag === 0 ? 1 : 0);
}

function cancelActions(p) {
  p.reloadT = 0;
  p.burstLeft = 0;
  p.chargeT = 0;
  p.meleeT = 0;
  p.meleeHitT = -1;
  p.trigBuf = 0;
}

function doSwing(p, def, hooks) {
  p.meleeT = def.swing;
  p.meleeHitT = def.hitDelay;
  p.swingIdx = (p.swingIdx + 1) & 0xff;
  if (def.lunge) {
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const cur = p.vx * -sy + p.vz * -cy;
    const add = Math.max(0, def.lunge - Math.max(0, cur));
    p.vx += -sy * add; p.vz += -cy * add;
    if (p.onGround) p.vy = Math.max(p.vy, 1.5);
  }
  hooks && hooks.sound && hooks.sound(p, 'swing', def, p.swingIdx);
}

function fireGun(p, def, s, hooks) {
  s.mag--;
  p.shotSeq = (p.shotSeq + 1) >>> 0;
  const spread = computeSpread(p, def);
  p.bloom = Math.min(def.spread.maxBloom, p.bloom + def.spread.bloom);
  p.sinceFire = 0;
  if (hooks && hooks.shot) hooks.shot(p, def, p.shotSeq, spread);
}

const _mev = {};

/**
 * Simulates one tick for player `p` given input `inp`:
 *  { mx, mz, yaw, pitch, buttons, slot }
 * ctx: { world, map, dt, frozen, hooks }
 */
export function simulateTick(p, inp, ctx) {
  const { world, map, dt, hooks } = ctx;
  if (!p.alive) return null;

  p.yaw = inp.yaw;
  p.pitch = clamp(inp.pitch, -1.55, 1.55);
  const btn = ctx.frozen ? 0 : inp.buttons | 0;
  const fire = (btn & BTN.FIRE) !== 0;
  const firePressed = fire && !p.fireHeld;
  p.fireHeld = fire;
  const meleeBtn = (btn & BTN.MELEE) !== 0;
  const meleePressed = meleeBtn && !p.meleeHeld;
  p.meleeHeld = meleeBtn;
  const reloadBtn = (btn & BTN.RELOAD) !== 0;
  const reloadPressed = reloadBtn && !p.reloadHeld;
  p.reloadHeld = reloadBtn;
  const adsBtn = (btn & BTN.ADS) !== 0;

  // ── weapon switching ──
  const want = inp.slot | 0;
  if (!p.quickMelee && want !== p.slot && want >= 0 && want <= 2 && WEAPONS[p.slots[want].id]) {
    p.slot = want;
    cancelActions(p);
    p.spin = 0;
    p.switchT = WEAPONS[p.slots[want].id].equip;
    hooks && hooks.sound && hooks.sound(p, 'equip', WEAPONS[p.slots[want].id], 0);
  }
  // quick melee
  if (meleePressed && p.slot !== 2 && !p.quickMelee) {
    p.returnSlot = p.slot;
    p.slot = 2;
    p.quickMelee = true;
    cancelActions(p);
    p.spin = 0;
    p.switchT = 0;
    p.adsT = 0;
    doSwing(p, WEAPONS[p.slots[2].id], hooks);
  }

  let def = WEAPONS[p.slots[p.slot].id];
  const s = p.slots[p.slot];
  if (p.switchT > 0) p.switchT = Math.max(0, p.switchT - dt);
  const ready = p.switchT <= 0;
  const isGun = def.kind === 'gun';

  // ── ADS ──
  const canAds = isGun && ready && p.reloadT <= 0 && !p.sprinting && !p.sliding;
  if (!isGun) p.adsT = 0;
  else if (adsBtn && canAds) p.adsT = Math.min(1, p.adsT + dt / def.ads.time);
  else p.adsT = Math.max(0, p.adsT - (dt / def.ads.time) * 1.4);

  // ── movement ──
  const wantsFire = fire && isGun && (s.mag > 0 || def.fire === 'spin');
  const mev = stepMovement(p, inp, world, map, dt, {
    moveMul: def.moveMul * (def.fire === 'spin' && p.spin > 0.1 ? 0.85 : 1) * (p.chargeT > 0 ? 0.85 : 1),
    adsT: p.adsT,
    wantsFire: wantsFire || (def.fire === 'spin' && adsBtn),
    noSprint: p.reloadT > 0 && def.fire === 'spin',
    frozen: ctx.frozen,
  }, _mev);
  if (p.sprinting) p.sprintOut = 0.1; else if (p.sprintOut > 0) p.sprintOut -= dt;
  if (hooks && hooks.move) hooks.move(p, mev);
  if (mev.fell) { hooks && hooks.fall && hooks.fall(p); return mev; }

  p.sinceFire += dt;
  if (p.trigBuf > 0) p.trigBuf -= dt;

  // ── melee weapons ──
  if (!isGun) {
    if (p.meleeT > 0) p.meleeT -= dt;
    if (p.meleeHitT > 0) {
      p.meleeHitT -= dt;
      if (p.meleeHitT <= 0) {
        p.meleeHitT = -1;
        if (hooks && hooks.melee) hooks.melee(p, def, p.swingIdx);
      }
    }
    if (p.quickMelee) {
      if (p.meleeT <= 0 && p.meleeHitT < 0) {
        p.quickMelee = false;
        p.slot = p.returnSlot;
        const nd = WEAPONS[p.slots[p.slot].id];
        p.switchT = nd.equip * 0.55;
        hooks && hooks.sound && hooks.sound(p, 'equip', nd, 1);
      }
    } else if ((fire || meleePressed) && p.meleeT <= 0 && ready) {
      doSwing(p, def, hooks);
    }
    return mev;
  }

  // ── guns ──
  if (p.fireCd > 0) p.fireCd -= dt;
  const decay = def.spread.recover * dt * (p.sinceFire > fireInterval(def) * 1.5 ? 1 : 0.2);
  p.bloom = Math.max(0, p.bloom - decay);

  // reload progress
  if (p.reloadT > 0) {
    // shotgun shell reloads can be interrupted by firing
    if (def.shell && firePressed && s.mag > 0) {
      p.reloadT = 0;
      p.fireCd = Math.max(p.fireCd, 0.1);
      hooks && hooks.sound && hooks.sound(p, 'reloadEnd', def, 0);
    } else {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        if (def.shell) {
          if (s.reserve > 0 && s.mag < def.mag) { s.mag++; s.reserve--; }
          hooks && hooks.sound && hooks.sound(p, 'shell', def, s.mag);
          if (s.mag < def.mag && s.reserve > 0) p.reloadT += def.shell.each;
          else { p.reloadT = 0; hooks && hooks.sound && hooks.sound(p, 'reloadEnd', def, 1); }
        } else {
          const take = Math.min(def.mag - s.mag, s.reserve);
          s.mag += take; s.reserve -= take;
          p.reloadT = 0;
          hooks && hooks.sound && hooks.sound(p, 'reloadEnd', def, 0);
        }
      }
      if (def.fire === 'spin') p.spin = Math.max(0, p.spin - dt / def.spinDown);
      return mev;
    }
  }

  const canFire = ready && p.reloadT <= 0 && p.sprintOut <= 0 && !p.sprinting;

  // manual reload
  if (reloadPressed && canFire && s.mag < def.mag && s.reserve > 0 && p.burstLeft === 0) {
    startReload(p, def, s, hooks);
    return mev;
  }

  // spin-up weapons
  if (def.fire === 'spin') {
    const spinning = (fire || adsBtn) && ready && !p.sprinting;
    p.spin = spinning ? Math.min(1, p.spin + dt / def.spinUp) : Math.max(0, p.spin - dt / def.spinDown);
  }

  let shotsThisTick = 0;
  const interval = fireInterval(def);

  if (canFire) {
    switch (def.fire) {
      case 'auto':
      case 'spin': {
        const spinOk = def.fire !== 'spin' || p.spin >= 1;
        if (fire && spinOk) {
          if (s.mag <= 0) {
            if (firePressed) hooks && hooks.sound && hooks.sound(p, 'dry', def, 0);
          } else {
            while (p.fireCd <= 0 && s.mag > 0 && shotsThisTick < 4) {
              fireGun(p, def, s, hooks);
              p.fireCd += interval;
              shotsThisTick++;
            }
          }
        }
        break;
      }
      case 'semi':
      case 'pump':
      case 'bolt': {
        if (firePressed) p.trigBuf = 0.18;
        if (p.trigBuf > 0 && p.fireCd <= 0) {
          p.trigBuf = 0;
          if (s.mag > 0) {
            fireGun(p, def, s, hooks);
            p.fireCd = Math.max(0, p.fireCd) + interval;
            shotsThisTick++;
            if (def.fire === 'pump' || def.fire === 'bolt') hooks && hooks.sound && hooks.sound(p, def.fire, def, 0);
          } else hooks && hooks.sound && hooks.sound(p, 'dry', def, 0);
        }
        break;
      }
      case 'burst': {
        if (firePressed) p.trigBuf = 0.18;
        if (p.burstLeft === 0 && p.trigBuf > 0 && p.fireCd <= 0) {
          p.trigBuf = 0;
          if (s.mag > 0) p.burstLeft = def.burst;
          else hooks && hooks.sound && hooks.sound(p, 'dry', def, 0);
        }
        while (p.burstLeft > 0 && p.fireCd <= 0 && s.mag > 0 && shotsThisTick < 4) {
          fireGun(p, def, s, hooks);
          p.burstLeft--;
          shotsThisTick++;
          p.fireCd += p.burstLeft > 0 ? interval : interval + def.burstDelay;
        }
        if (s.mag <= 0) p.burstLeft = 0;
        break;
      }
      case 'charge': {
        if (fire && s.mag > 0 && p.fireCd <= 0) {
          if (p.chargeT === 0) hooks && hooks.sound && hooks.sound(p, 'charge', def, 0);
          p.chargeT += dt;
          if (p.chargeT >= def.charge) {
            p.chargeT = 0;
            fireGun(p, def, s, hooks);
            p.fireCd = interval;
            shotsThisTick++;
          }
        } else {
          if (firePressed && s.mag <= 0) hooks && hooks.sound && hooks.sound(p, 'dry', def, 0);
          p.chargeT = Math.max(0, p.chargeT - dt * 2.5);
        }
        break;
      }
      default:
        break;
    }
  } else if (def.fire === 'charge') {
    p.chargeT = Math.max(0, p.chargeT - dt * 2.5);
  }

  if (p.fireCd < 0 && shotsThisTick === 0) p.fireCd = 0;
  if (p.fireCd < 0 && !fire && p.burstLeft === 0) p.fireCd = 0;

  // auto reload when empty
  if (s.mag <= 0 && s.reserve > 0 && p.reloadT <= 0 && p.fireCd <= 0 && p.burstLeft === 0 && ready) {
    startReload(p, def, s, hooks);
  }
  return mev;
}

/** Fields serialized for reconciliation (numeric). */
export const RECON_FLOATS = [
  'x', 'y', 'z', 'vx', 'vy', 'vz', 'slideT', 'slideCd', 'padCd', 'jumpBuf', 'switchT', 'fireCd', 'reloadT',
  'chargeT', 'spin', 'bloom', 'adsT', 'meleeT', 'meleeHitT', 'trigBuf', 'sinceFire', 'sprintOut',
];

export function packFlags(p) {
  return (p.onGround ? 1 : 0) | (p.crouched ? 2 : 0) | (p.sliding ? 4 : 0) | (p.sprinting ? 8 : 0) |
    (p.jumpHeld ? 16 : 0) | (p.crouchHeld ? 32 : 0) | (p.alive ? 64 : 0) | (p.quickMelee ? 128 : 0) |
    (p.fireHeld ? 256 : 0) | (p.meleeHeld ? 512 : 0) | (p.reloadHeld ? 1024 : 0);
}

export function unpackFlags(p, f) {
  p.onGround = !!(f & 1); p.crouched = !!(f & 2); p.sliding = !!(f & 4); p.sprinting = !!(f & 8);
  p.jumpHeld = !!(f & 16); p.crouchHeld = !!(f & 32); p.alive = !!(f & 64); p.quickMelee = !!(f & 128);
  p.fireHeld = !!(f & 256); p.meleeHeld = !!(f & 512); p.reloadHeld = !!(f & 1024);
}

export function copySimState(dst, src) {
  for (const k of RECON_FLOATS) dst[k] = src[k];
  dst.onGround = src.onGround; dst.crouched = src.crouched; dst.sliding = src.sliding; dst.sprinting = src.sprinting;
  dst.jumpHeld = src.jumpHeld; dst.crouchHeld = src.crouchHeld; dst.alive = src.alive; dst.quickMelee = src.quickMelee;
  dst.fireHeld = src.fireHeld; dst.meleeHeld = src.meleeHeld; dst.reloadHeld = src.reloadHeld;
  dst.slot = src.slot; dst.burstLeft = src.burstLeft; dst.swingIdx = src.swingIdx; dst.returnSlot = src.returnSlot;
  dst.shotSeq = src.shotSeq; dst.yaw = src.yaw; dst.pitch = src.pitch;
  for (let i = 0; i < 3; i++) {
    dst.slots[i].id = src.slots[i].id; dst.slots[i].mag = src.slots[i].mag; dst.slots[i].reserve = src.slots[i].reserve;
  }
}

export function cloneSimState(src) {
  const dst = { ...src, slots: src.slots.map((s) => ({ ...s })) };
  return dst;
}
