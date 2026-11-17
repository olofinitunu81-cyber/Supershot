// Deterministic collision + movement shared by the client (prediction) and the
// server (authority). The world is a set of axis-aligned boxes stored in a 2D
// spatial hash (XZ). Player movement uses exact per-axis sweeps (no tunneling)
// with step-up for stairs and ground snapping for smooth descents.

import { PLAYER, BTN } from './config.js';

const EPS = 1e-7;

export class CollisionWorld {
  constructor(boxes, cellSize = 4) {
    this.cell = cellSize;
    this.boxes = boxes.map((b, i) => ({
      minX: b.min[0], minY: b.min[1], minZ: b.min[2],
      maxX: b.max[0], maxY: b.max[1], maxZ: b.max[2],
      id: i, mat: b.mat || 'concrete', bullet: b.bullet !== false,
    }));
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const b of this.boxes) {
      if (b.minX < minX) minX = b.minX;
      if (b.minZ < minZ) minZ = b.minZ;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxZ > maxZ) maxZ = b.maxZ;
    }
    if (!this.boxes.length) { minX = minZ = -10; maxX = maxZ = 10; }
    this.ox = Math.floor(minX / cellSize) * cellSize - cellSize;
    this.oz = Math.floor(minZ / cellSize) * cellSize - cellSize;
    this.cols = Math.ceil((maxX - this.ox) / cellSize) + 2;
    this.rows = Math.ceil((maxZ - this.oz) / cellSize) + 2;
    this.grid = new Array(this.cols * this.rows);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = [];
    for (const b of this.boxes) {
      const c0 = this._cx(b.minX), c1 = this._cx(b.maxX);
      const r0 = this._cz(b.minZ), r1 = this._cz(b.maxZ);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.grid[r * this.cols + c].push(b);
    }
    this.stamp = new Uint32Array(this.boxes.length);
    this.stampId = 1;
    this._tmp = [];
  }

  _cx(x) { return Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.ox) / this.cell))); }
  _cz(z) { return Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.oz) / this.cell))); }

  _nextStamp() {
    this.stampId = (this.stampId + 1) >>> 0;
    if (this.stampId === 0) { this.stamp.fill(0); this.stampId = 1; }
    return this.stampId;
  }

  /** All boxes overlapping (or touching) the given AABB. */
  query(minX, minY, minZ, maxX, maxY, maxZ, out = []) {
    out.length = 0;
    const s = this._nextStamp();
    const c0 = this._cx(minX), c1 = this._cx(maxX), r0 = this._cz(minZ), r1 = this._cz(maxZ);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = this.grid[r * this.cols + c];
        for (let i = 0; i < cell.length; i++) {
          const b = cell[i];
          if (this.stamp[b.id] === s) continue;
          this.stamp[b.id] = s;
          if (b.maxX < minX || b.minX > maxX || b.maxY < minY || b.minY > maxY || b.maxZ < minZ || b.minZ > maxZ) continue;
          out.push(b);
        }
      }
    }
    return out;
  }

  /** True if any box strictly overlaps the AABB (touching does not count). */
  overlaps(minX, minY, minZ, maxX, maxY, maxZ) {
    const list = this.query(minX, minY, minZ, maxX, maxY, maxZ, this._tmp);
    for (const b of list) {
      if (b.maxX - EPS > minX && b.minX + EPS < maxX && b.maxY - EPS > minY && b.minY + EPS < maxY && b.maxZ - EPS > minZ && b.minZ + EPS < maxZ) return true;
    }
    return false;
  }

  /**
   * Ray cast against all boxes. Direction must be normalized.
   * Returns { t, nx, ny, nz, box } of the first hit within maxDist, or null.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, bulletsOnly = false) {
    const zx = Math.abs(dx) <= 1e-12, zy = Math.abs(dy) <= 1e-12, zz = Math.abs(dz) <= 1e-12;
    const invx = zx ? 0 : 1 / dx;
    const invy = zy ? 0 : 1 / dy;
    const invz = zz ? 0 : 1 / dz;
    const s = this._nextStamp();
    let best = maxDist;
    let bestBox = null;
    let bestAxis = 0;

    const cell = this.cell;
    let cx = Math.floor((ox - this.ox) / cell);
    let cz = Math.floor((oz - this.oz) / cell);
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    let tMaxX = Math.abs(dx) > 1e-12 ? ((cx + (dx > 0 ? 1 : 0)) * cell + this.ox - ox) / dx : Infinity;
    let tMaxZ = Math.abs(dz) > 1e-12 ? ((cz + (dz > 0 ? 1 : 0)) * cell + this.oz - oz) / dz : Infinity;
    const tDX = Math.abs(dx) > 1e-12 ? cell / Math.abs(dx) : Infinity;
    const tDZ = Math.abs(dz) > 1e-12 ? cell / Math.abs(dz) : Infinity;
    let tEnter = 0;

    for (let iter = 0; iter < 512; iter++) {
      if (cx >= 0 && cx < this.cols && cz >= 0 && cz < this.rows) {
        const list = this.grid[cz * this.cols + cx];
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (this.stamp[b.id] === s) continue;
          this.stamp[b.id] = s;
          if (bulletsOnly && !b.bullet) continue;
          let tmin = -Infinity, tmax = Infinity, axis = 0, t1, t2, a, c;
          if (zx) { if (ox < b.minX || ox > b.maxX) continue; }
          else {
            t1 = (b.minX - ox) * invx; t2 = (b.maxX - ox) * invx;
            tmin = t1 < t2 ? t1 : t2; tmax = t1 < t2 ? t2 : t1;
          }
          if (zy) { if (oy < b.minY || oy > b.maxY) continue; }
          else {
            t1 = (b.minY - oy) * invy; t2 = (b.maxY - oy) * invy;
            a = t1 < t2 ? t1 : t2; c = t1 < t2 ? t2 : t1;
            if (a > tmin) { tmin = a; axis = 1; }
            if (c < tmax) tmax = c;
          }
          if (zz) { if (oz < b.minZ || oz > b.maxZ) continue; }
          else {
            t1 = (b.minZ - oz) * invz; t2 = (b.maxZ - oz) * invz;
            a = t1 < t2 ? t1 : t2; c = t1 < t2 ? t2 : t1;
            if (a > tmin) { tmin = a; axis = 2; }
            if (c < tmax) tmax = c;
          }
          if (tmax < 0 || tmin > tmax) continue;
          const th = tmin < 0 ? 0 : tmin;
          if (th < best) { best = th; bestBox = b; bestAxis = tmin < 0 ? -1 : axis; }
        }
      }
      const tExit = tMaxX < tMaxZ ? tMaxX : tMaxZ;
      if (bestBox && best <= tExit) break;
      if (tExit > maxDist) break;
      tEnter = tExit;
      if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDX; } else { cz += stepZ; tMaxZ += tDZ; }
      // left the grid entirely heading away → stop
      if ((cx < -1 && stepX < 0) || (cx > this.cols && stepX > 0) || (cz < -1 && stepZ < 0) || (cz > this.rows && stepZ > 0)) break;
    }
    void tEnter;
    if (!bestBox) return null;
    let nx = 0, ny = 0, nz = 0;
    if (bestAxis === 0) nx = dx > 0 ? -1 : 1;
    else if (bestAxis === 1) ny = dy > 0 ? -1 : 1;
    else if (bestAxis === 2) nz = dz > 0 ? -1 : 1;
    else { nx = -dx; ny = -dy; nz = -dz; }
    return { t: best, nx, ny, nz, box: bestBox };
  }

  /** Line of sight test between two points. */
  visible(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return true;
    const hit = this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len, true);
    return !hit;
  }

  /** Highest walkable surface under (x, z) at or below y. */
  groundHeight(x, z, y, maxDrop = 50) {
    const hit = this.raycast(x, y, z, 0, -1, 0, maxDrop);
    return hit ? y - hit.t : null;
  }
}

// ───────────────────────── body sweeping ─────────────────────────

const _list = [];

/**
 * Sweeps a player AABB by (dx, dy, dz) against the world using exact axis
 * clipping (Y, then X, then Z). Returns clipped deltas; does not mutate.
 */
export function sweep(world, x, y, z, height, dx, dy, dz, res) {
  const hw = PLAYER.halfWidth;
  let minX = x - hw, maxX = x + hw, minY = y, maxY = y + height, minZ = z - hw, maxZ = z + hw;
  const list = world.query(
    Math.min(minX, minX + dx) - 0.01, Math.min(minY, minY + dy) - 0.01, Math.min(minZ, minZ + dz) - 0.01,
    Math.max(maxX, maxX + dx) + 0.01, Math.max(maxY, maxY + dy) + 0.01, Math.max(maxZ, maxZ + dz) + 0.01,
    _list,
  );
  const odx = dx, ody = dy, odz = dz;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (maxX > b.minX && minX < b.maxX && maxZ > b.minZ && minZ < b.maxZ) {
      if (dy > 0 && maxY <= b.minY + EPS) { const d = b.minY - maxY; if (d < dy) dy = d; }
      else if (dy < 0 && minY >= b.maxY - EPS) { const d = b.maxY - minY; if (d > dy) dy = d; }
    }
  }
  minY += dy; maxY += dy;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (maxY > b.minY && minY < b.maxY && maxZ > b.minZ && minZ < b.maxZ) {
      if (dx > 0 && maxX <= b.minX + EPS) { const d = b.minX - maxX; if (d < dx) dx = d; }
      else if (dx < 0 && minX >= b.maxX - EPS) { const d = b.maxX - minX; if (d > dx) dx = d; }
    }
  }
  minX += dx; maxX += dx;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (maxY > b.minY && minY < b.maxY && maxX > b.minX && minX < b.maxX) {
      if (dz > 0 && maxZ <= b.minZ + EPS) { const d = b.minZ - maxZ; if (d < dz) dz = d; }
      else if (dz < 0 && minZ >= b.maxZ - EPS) { const d = b.maxZ - minZ; if (d > dz) dz = d; }
    }
  }
  res.dx = dx; res.dy = dy; res.dz = dz;
  res.hitX = dx !== odx; res.hitY = dy !== ody; res.hitZ = dz !== odz;
  return res;
}

const _r1 = {}, _r2 = {}, _r3 = {}, _r4 = {};

/** Moves the body with step-up support. Mutates p.x/y/z and returns collision flags. */
export function moveBody(world, p, dx, dy, dz, height, canStep, out) {
  const r = sweep(world, p.x, p.y, p.z, height, dx, dy, dz, _r1);
  let fx = r.dx, fy = r.dy, fz = r.dz;
  let hitX = r.hitX, hitZ = r.hitZ, hitY = r.hitY;
  if (canStep && (r.hitX || r.hitZ)) {
    const up = sweep(world, p.x, p.y, p.z, height, 0, PLAYER.stepHeight, 0, _r2);
    if (up.dy > 0.01) {
      const hor = sweep(world, p.x, p.y + up.dy, p.z, height, dx, 0, dz, _r3);
      const down = sweep(world, p.x + hor.dx, p.y + up.dy, p.z + hor.dz, height, 0, -up.dy + Math.min(0, dy), 0, _r4);
      const stepDist = hor.dx * hor.dx + hor.dz * hor.dz;
      const flatDist = r.dx * r.dx + r.dz * r.dz;
      if (stepDist > flatDist + 1e-6 && down.hitY) {
        fx = hor.dx; fz = hor.dz; fy = up.dy + down.dy;
        hitX = hor.hitX; hitZ = hor.hitZ; hitY = true;
        out.stepped = fy;
      }
    }
  }
  p.x += fx; p.y += fy; p.z += fz;
  out.hitX = hitX; out.hitY = hitY; out.hitZ = hitZ;
  out.dy = fy;
  return out;
}

// ───────────────────────── movement ─────────────────────────

function applyFriction(p, f, dt) {
  const sp = Math.hypot(p.vx, p.vz);
  if (sp < 1e-4) { p.vx = 0; p.vz = 0; return; }
  const control = sp < PLAYER.stopSpeed ? PLAYER.stopSpeed : sp;
  const drop = control * f * dt;
  const ns = Math.max(0, sp - drop) / sp;
  p.vx *= ns; p.vz *= ns;
}

function accelerate(p, wx, wz, wishspeed, accel, dt) {
  const cur = p.vx * wx + p.vz * wz;
  const add = wishspeed - cur;
  if (add <= 0) return;
  let acc = accel * dt * wishspeed;
  if (acc > add) acc = add;
  p.vx += acc * wx; p.vz += acc * wz;
}

export function playerHeight(p) {
  return p.crouched ? PLAYER.crouchHeight : PLAYER.height;
}

export function eyeHeight(p) {
  return p.crouched ? PLAYER.crouchEye : PLAYER.eye;
}

const _mv = { hitX: false, hitY: false, hitZ: false, dy: 0, stepped: 0 };

/**
 * Advances movement by one tick.
 * opts: { moveMul, adsT, wantsFire, frozen }
 * Returns event flags { jumped, landed, slideStart, padLaunch, stepped, fell }.
 */
export function stepMovement(p, inp, world, map, dt, opts, ev) {
  const P = PLAYER;
  ev.jumped = false; ev.landed = false; ev.slideStart = false; ev.padLaunch = false; ev.stepped = 0; ev.fell = false;
  const btn = inp.buttons | 0;
  let mx = opts.frozen ? 0 : inp.mx, mz = opts.frozen ? 0 : inp.mz;
  const ilen = Math.hypot(mx, mz);
  if (ilen > 1) { mx /= ilen; mz /= ilen; }
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  // forward = (-sin, -cos), right = (cos, -sin)
  let wx = -sy * mz + cy * mx;
  let wz = -cy * mz - sy * mx;
  const wlen = Math.hypot(wx, wz);
  if (wlen > 1e-6) { wx /= wlen; wz /= wlen; }
  const hasInput = wlen > 1e-6 && !opts.frozen;

  const crouchBtn = !opts.frozen && (btn & BTN.CROUCH) !== 0;
  const crouchPressed = crouchBtn && !p.crouchHeld;
  p.crouchHeld = crouchBtn;
  const jumpBtn = !opts.frozen && (btn & BTN.JUMP) !== 0;
  if (jumpBtn && !p.jumpHeld) p.jumpBuf = 0.14;
  p.jumpHeld = jumpBtn;
  if (p.jumpBuf > 0) p.jumpBuf -= dt;
  if (p.slideCd > 0) p.slideCd -= dt;
  if (p.padCd > 0) p.padCd -= dt;

  const hs = Math.hypot(p.vx, p.vz);
  const sprintBtn = (btn & BTN.SPRINT) !== 0;
  const wantsSprint = sprintBtn && mz > 0.1 && !opts.wantsFire && opts.adsT < 0.35 && !opts.noSprint;

  // slide start
  if (crouchPressed && p.onGround && !p.sliding && p.slideCd <= 0 && (p.sprinting || hs > P.walkSpeed * 1.1) && hs > P.walkSpeed * 0.8) {
    p.sliding = true;
    p.slideT = P.slideTime;
    let dx = hs > 0.5 ? p.vx / hs : wx, dz = hs > 0.5 ? p.vz / hs : wz;
    if (!(Math.abs(dx) + Math.abs(dz) > 0)) { dx = -sy; dz = -cy; }
    const sp = Math.max(hs, P.slideSpeed);
    p.vx = dx * sp; p.vz = dz * sp;
    p.crouched = true;
    p.sprinting = false;
    ev.slideStart = true;
  }

  // crouch / stand
  if (p.sliding) p.crouched = true;
  else if (crouchBtn) p.crouched = true;
  else if (p.crouched) {
    const hw = P.halfWidth;
    if (!world.overlaps(p.x - hw, p.y + 0.01, p.z - hw, p.x + hw, p.y + P.height, p.z + hw)) p.crouched = false;
  }

  p.sprinting = wantsSprint && !p.crouched && !p.sliding && (p.onGround || p.sprinting);

  let speed = P.walkSpeed * (opts.moveMul || 1);
  if (p.crouched) speed *= P.crouchMul;
  else if (p.sprinting) speed *= P.sprintMul;
  speed *= 1 + (P.adsMoveMul - 1) * (opts.adsT || 0);

  // jump
  if (p.jumpBuf > 0 && p.onGround) {
    p.jumpBuf = 0;
    p.vy = P.jumpVel;
    p.onGround = false;
    ev.jumped = true;
    if (p.sliding) { p.sliding = false; p.slideCd = P.slideCooldown; }
  }

  if (p.onGround) {
    if (p.sliding) {
      applyFriction(p, P.slideFriction, dt);
      if (hasInput) {
        const before = Math.hypot(p.vx, p.vz);
        accelerate(p, wx, wz, before, 1.6, dt);
        const after = Math.hypot(p.vx, p.vz);
        if (after > before && after > 0) { p.vx *= before / after; p.vz *= before / after; }
      }
      p.slideT -= dt;
      const sp = Math.hypot(p.vx, p.vz);
      if (p.slideT <= 0 || sp < P.walkSpeed * P.crouchMul * 1.1 || (!crouchBtn && p.slideT < P.slideTime - 0.25)) {
        p.sliding = false;
        p.slideCd = P.slideCooldown;
      }
    } else {
      applyFriction(p, P.friction, dt);
      if (hasInput) accelerate(p, wx, wz, speed, P.accel, dt);
    }
  } else {
    if (hasInput) {
      const before = Math.hypot(p.vx, p.vz);
      accelerate(p, wx, wz, speed, P.airAccel, dt);
      const after = Math.hypot(p.vx, p.vz);
      const cap = Math.max(before, speed);
      if (after > cap) { p.vx *= cap / after; p.vz *= cap / after; }
    }
  }

  // gravity
  if (!p.onGround) p.vy -= P.gravity * dt;
  else if (p.vy < 0) p.vy = 0;

  const wasGround = p.onGround;
  const height = playerHeight(p);
  const dy = (p.onGround ? -0.02 : p.vy * dt);
  moveBody(world, p, p.vx * dt, dy, p.vz * dt, height, wasGround, _mv);
  if (_mv.stepped) ev.stepped = _mv.stepped;
  if (_mv.hitX) p.vx = 0;
  if (_mv.hitZ) p.vz = 0;

  if (_mv.hitY && dy < 0) {
    if (!wasGround) ev.landed = true;
    p.onGround = true;
    if (p.vy < 0) p.vy = 0;
  } else if (_mv.hitY && dy > 0) {
    p.vy = 0;
    p.onGround = false;
  } else {
    p.onGround = false;
    // ground snapping when walking down stairs / slopes
    if (wasGround && p.vy <= 0 && !ev.jumped) {
      const r = sweep(world, p.x, p.y, p.z, height, 0, -PLAYER.stepHeight, 0, _r1);
      if (r.hitY) { p.y += r.dy; p.onGround = true; p.vy = 0; ev.stepped = r.dy; }
    }
  }
  if (!p.onGround && p.sliding) { p.sliding = false; p.slideCd = P.slideCooldown * 0.5; }

  // jump pads
  if (map && map.pads && p.padCd <= 0) {
    const hw = P.halfWidth;
    for (const pad of map.pads) {
      if (p.x + hw > pad.min[0] && p.x - hw < pad.max[0] && p.z + hw > pad.min[2] && p.z - hw < pad.max[2] && p.y < pad.max[1] + 0.05 && p.y + 0.2 > pad.min[1]) {
        if (pad.v[0] !== null) p.vx = pad.v[0];
        p.vy = pad.v[1];
        if (pad.v[2] !== null) p.vz = pad.v[2];
        p.onGround = false;
        p.padCd = 0.45;
        p.sliding = false;
        ev.padLaunch = true;
        break;
      }
    }
  }

  if (map && p.y < map.killY) ev.fell = true;
  return ev;
}

// ───────────────────────── projectiles ─────────────────────────

/** Steps a ballistic projectile. Returns world hit info or null. */
export function stepProjectile(pr, world, dt) {
  const ox = pr.x, oy = pr.y, oz = pr.z;
  pr.vy -= pr.gravity * dt;
  const nx = ox + pr.vx * dt, ny = oy + pr.vy * dt, nz = oz + pr.vz * dt;
  const dx = nx - ox, dy = ny - oy, dz = nz - oz;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len > 1e-6) {
    const hit = world.raycast(ox, oy, oz, dx / len, dy / len, dz / len, len + pr.radius);
    if (hit) {
      const t = Math.max(0, hit.t - pr.radius * 0.5);
      pr.x = ox + (dx / len) * t; pr.y = oy + (dy / len) * t; pr.z = oz + (dz / len) * t;
      return hit;
    }
  }
  pr.x = nx; pr.y = ny; pr.z = nz;
  return null;
}
