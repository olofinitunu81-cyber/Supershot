// Player hitboxes (yaw-oriented boxes) and ray tests. Used by the server for
// authoritative hit detection and by the client for cosmetic hit prediction.

export const HIT_HEAD = 0, HIT_TORSO = 1, HIT_LIMB = 2;

// Local-space boxes relative to the feet: [cx, cy, cz, hx, hy, hz, zone]
const STAND = [
  [0, 1.645, 0, 0.235, 0.205, 0.235, HIT_HEAD],
  [0, 1.1, 0, 0.32, 0.345, 0.19, HIT_TORSO],
  [-0.46, 1.1, 0.0, 0.14, 0.34, 0.16, HIT_LIMB],
  [0.46, 1.1, 0.0, 0.14, 0.34, 0.16, HIT_LIMB],
  [0, 0.38, 0, 0.3, 0.38, 0.17, HIT_LIMB],
];
const CROUCH = [
  [0, 1.13, 0, 0.235, 0.205, 0.235, HIT_HEAD],
  [0, 0.6, 0.02, 0.32, 0.32, 0.2, HIT_TORSO],
  [-0.46, 0.6, 0.05, 0.14, 0.3, 0.16, HIT_LIMB],
  [0.46, 0.6, 0.05, 0.14, 0.3, 0.16, HIT_LIMB],
  [0, 0.15, -0.05, 0.3, 0.15, 0.32, HIT_LIMB],
];

export function hitboxSet(crouched) {
  return crouched ? CROUCH : STAND;
}

/**
 * Ray vs player. Ray origin (ox,oy,oz), normalized dir (dx,dy,dz).
 * Player at feet (px,py,pz) with yaw. Returns { t, zone } or null.
 */
export function rayPlayer(ox, oy, oz, dx, dy, dz, maxDist, px, py, pz, yaw, crouched) {
  // quick reject with a bounding sphere around the player
  const cx = px - ox, cy = py + 0.9 - oy, cz = pz - oz;
  const proj = cx * dx + cy * dy + cz * dz;
  if (proj < -1.5 || proj > maxDist + 1.5) return null;
  const d2 = cx * cx + cy * cy + cz * cz - proj * proj;
  if (d2 > 1.6 * 1.6) return null;

  // transform ray into player local space (rotate by -yaw around Y)
  const c = Math.cos(-yaw), s = Math.sin(-yaw);
  const lx = ox - px, ly = oy - py, lz = oz - pz;
  const rox = lx * c + lz * s, roz = -lx * s + lz * c, roy = ly;
  const rdx = dx * c + dz * s, rdz = -dx * s + dz * c, rdy = dy;
  const ix = Math.abs(rdx) > 1e-12 ? 1 / rdx : 1e30;
  const iy = Math.abs(rdy) > 1e-12 ? 1 / rdy : 1e30;
  const iz = Math.abs(rdz) > 1e-12 ? 1 / rdz : 1e30;
  let best = maxDist, zone = -1;
  const set = crouched ? CROUCH : STAND;
  for (let i = 0; i < set.length; i++) {
    const b = set[i];
    let t1 = (b[0] - b[3] - rox) * ix, t2 = (b[0] + b[3] - rox) * ix;
    let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
    t1 = (b[1] - b[4] - roy) * iy; t2 = (b[1] + b[4] - roy) * iy;
    tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
    t1 = (b[2] - b[5] - roz) * iz; t2 = (b[2] + b[5] - roz) * iz;
    tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmax >= Math.max(0, tmin) && tmin < best) {
      // prefer head when boxes are hit at (nearly) the same depth
      if (tmin < best - 1e-4 || b[6] === HIT_HEAD) { best = Math.max(0, tmin); zone = b[6]; }
    }
  }
  return zone >= 0 ? { t: best, zone } : null;
}

/** Center of mass point for line-of-sight / melee checks. */
export function chestPoint(px, py, pz, crouched) {
  return [px, py + (crouched ? 0.7 : 1.15), pz];
}

export function headPoint(px, py, pz, crouched) {
  return [px, py + (crouched ? 1.13 : 1.645), pz];
}
