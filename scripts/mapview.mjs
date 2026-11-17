// Renders a top-down SVG/PNG of a map for layout review: node scripts/mapview.mjs <mapId> <outDir>
import { getMap } from '../shared/maps/index.js';
import { writeFileSync } from 'node:fs';

const id = process.argv[2] || 'neon';
const out = process.argv[3] || '.';
const m = getMap(id);
const S = 10;
const { minX, maxX, minZ, maxZ } = m.extent;
const pad = 4;
const W = (maxX - minX + pad * 2) * S, H = (maxZ - minZ + pad * 2) * S;
const tx = (x) => (x - minX + pad) * S, tz = (z) => (z - minZ + pad) * S;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#111"/>`;
const sorted = [...m.boxes].sort((a, b) => a.max[1] - b.max[1]);
for (const b of sorted) {
  if (b.max[1] <= 0.01 && b.mat === 'floor') continue;
  const h = b.max[1];
  const l = Math.min(85, 20 + h * 6);
  let fill = `hsl(${b.mat === 'clip' ? 0 : b.mat === 'stairs' ? 50 : b.mat === 'rail' ? 180 : 220}, ${b.mat === 'clip' ? 80 : 25}%, ${l}%)`;
  if (b.hidden && b.mat === 'clip' && b.bullet === false) fill = 'none';
  svg += `<rect x="${tx(b.min[0])}" y="${tz(b.min[2])}" width="${(b.max[0] - b.min[0]) * S}" height="${(b.max[2] - b.min[2]) * S}" fill="${fill}" stroke="#000" stroke-width="0.6" opacity="0.92"><title>${b.mat} y${b.min[1]}-${b.max[1]}</title></rect>`;
}
for (const p of m.pads) svg += `<rect x="${tx(p.min[0])}" y="${tz(p.min[2])}" width="${(p.max[0] - p.min[0]) * S}" height="${(p.max[2] - p.min[2]) * S}" fill="#0f0" opacity="0.7"/>`;
for (const s of m.spawns) {
  const c = s.team === 0 ? '#1fd1ff' : s.team === 1 ? '#ff3d6e' : '#ffd400';
  const x = tx(s.x), y = tz(s.z);
  const dx = -Math.sin(s.yaw) * 12, dy = -Math.cos(s.yaw) * 12;
  svg += `<circle cx="${x}" cy="${y}" r="5" fill="${c}"/><line x1="${x}" y1="${y}" x2="${x + dx}" y2="${y + dy}" stroke="${c}" stroke-width="2"/>`;
}
for (const d of m.decos) {
  if (d.type === 'sign') svg += `<text x="${tx(d.x)}" y="${tz(d.z)}" fill="${d.color}" font-size="11" font-family="sans-serif">${d.text}</text>`;
}
for (let x = Math.ceil(minX / 10) * 10; x <= maxX; x += 10) svg += `<line x1="${tx(x)}" y1="0" x2="${tx(x)}" y2="${H}" stroke="#fff" stroke-opacity="0.08"/>`;
for (let z = Math.ceil(minZ / 10) * 10; z <= maxZ; z += 10) svg += `<line x1="0" y1="${tz(z)}" x2="${W}" y2="${tz(z)}" stroke="#fff" stroke-opacity="0.08"/>`;
svg += `<text x="10" y="20" fill="#fff" font-size="16" font-family="sans-serif">${m.name}  boxes:${m.boxes.length} spawns:${m.spawns.length}</text></svg>`;
writeFileSync(`${out}/${id}.svg`, svg);
const { chromium } = (await import('./pw.mjs')).loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Math.ceil(W), height: Math.ceil(H) } });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
await page.screenshot({ path: `${out}/${id}.png` });
await browser.close();
console.log(`${out}/${id}.png`, m.boxes.length, 'boxes');
