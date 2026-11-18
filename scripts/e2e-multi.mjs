// Two real browser clients play against each other through the server:
// lobby presence, private room by code, live match, server-side hit detection.
// Usage: node scripts/e2e-multi.mjs [outDir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { GameServer } from '../server/index.js';
import { loadPlaywright } from './pw.mjs';

const out = process.argv[2] || 'screenshots';
mkdirSync(out, { recursive: true });
const { chromium } = loadPlaywright();
const server = new GameServer({ port: 0, dbFile: ':memory:', quiet: true });
await server.start();
const url = `http://127.0.0.1:${server.port}/`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function player(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await page.addInitScript(() => localStorage.setItem('supershot.settings.v1', JSON.stringify({ quality: 'low' })));
  await page.goto(url);
  await page.waitForSelector('.auth', { timeout: 60000 });
  await page.click('text=PLAY AS GUEST');
  await page.waitForSelector('.lobby-ui', { timeout: 120000 });
  return page;
}
const check = (cond, msg) => { if (!cond) { errors.push(`CHECK FAILED: ${msg}`); console.log('✗', msg); } else console.log('✓', msg); };

try {
  const A = await player('A');
  const B = await player('B');
  await A.waitForTimeout(1500);
  const lobbySeen = await A.evaluate(() => window.__supershot.app.lobby.others.size);
  check(lobbySeen >= 1, `A sees B in the shared lobby (${lobbySeen} other player)`);
  // B walks forward in the lobby; A should see B's avatar move
  const before = await A.evaluate(() => { const o = [...window.__supershot.app.lobby.others.values()][0]; return o.avatar.root.position.z; });
  await B.keyboard.down('KeyW'); await B.waitForTimeout(1200); await B.keyboard.up('KeyW');
  await A.waitForTimeout(800);
  const after = await A.evaluate(() => { const o = [...window.__supershot.app.lobby.others.values()][0]; return o.avatar.root.position.z; });
  check(Math.abs(after - before) > 1, `B's lobby movement replicated to A (moved ${Math.abs(after - before).toFixed(2)} m)`);
  await A.screenshot({ path: join(out, 'multi-01-lobby-A.png') });

  // lobby chat between players
  await B.evaluate(() => window.__supershot.net.send({ t: 'chat', ch: 'lobby', text: 'gl hf!' }));
  await A.waitForFunction(() => window.__supershot.S.chat.value.some((c) => c.text === 'gl hf!'), null, { timeout: 5000 });
  check(true, 'lobby chat delivered from B to A');

  // friends + party
  const nameA = await A.evaluate(() => window.__supershot.S.profile.value.username);
  const nameB = await B.evaluate(() => window.__supershot.S.profile.value.username);
  await A.evaluate((n) => window.__supershot.net.send({ t: 'friend.request', name: n }), nameB);
  await B.waitForFunction(() => window.__supershot.S.friends.value.some((f) => f.status === 'incoming'), null, { timeout: 5000 });
  await B.evaluate(() => { const f = window.__supershot.S.friends.value.find((x) => x.status === 'incoming'); window.__supershot.net.send({ t: 'friend.accept', id: f.id }); });
  await A.waitForFunction(() => window.__supershot.S.friends.value.some((f) => f.status === 'friend' && f.online), null, { timeout: 5000 });
  check(true, `${nameA} and ${nameB} became friends`);

  // private room by code
  await A.evaluate(() => window.__supershot.net.send({ t: 'room.create', settings: { mode: 'ffa', map: 'core', bots: 0, timeLimit: 5, scoreLimit: 3 } }));
  await A.waitForFunction(() => window.__supershot.S.room.value, null, { timeout: 5000 });
  const code = await A.evaluate(() => window.__supershot.S.room.value.code);
  await B.evaluate((c) => window.__supershot.net.send({ t: 'room.join', code: c }), code);
  await A.waitForFunction(() => window.__supershot.S.room.value && window.__supershot.S.room.value.members.length === 2, null, { timeout: 5000 });
  check(true, `B joined room ${code}`);
  await A.screenshot({ path: join(out, 'multi-02-room.png') });
  await A.evaluate(() => window.__supershot.net.send({ t: 'room.start' }));
  await A.waitForFunction(() => window.__supershot.S.screen.value === 'match', null, { timeout: 60000 });
  await B.waitForFunction(() => window.__supershot.S.screen.value === 'match', null, { timeout: 60000 });
  for (const p of [A, B]) await p.evaluate(() => { window.__supershot.S.paused.value = false; window.__supershot.input.locked = true; });
  check(true, 'both players loaded into the match');
  await A.waitForTimeout(6500); // countdown
  const seeEach = await A.evaluate(() => { const m = window.__supershot.app.match; return [...m.players.values()].filter((p) => !p.isSelf && p.alive).length; });
  check(seeEach === 1, 'A sees B alive in the match');

  // place both players in an open lane (server-authoritative teleport; clients reconcile)
  {
    const match = [...server.matchmaker.matches.values()][0];
    const [pa, pb] = [...match.players.values()];
    Object.assign(pa.sim, { x: 10, y: 0, z: -16, vx: 0, vy: 0, vz: 0 });
    Object.assign(pb.sim, { x: 10, y: 0, z: -4, vx: 0, vy: 0, vz: 0 });
    pa.protectUntil = 0; pb.protectUntil = 0;
  }
  await A.waitForTimeout(1200);
  // A hunts B: aim at B's chest every 80 ms, walk closer, ADS + fire
  const t0 = Date.now();
  await A.evaluate(() => window.__supershot.input.down.add('Mouse2'));
  let kills = 0;
  while (Date.now() - t0 < 25000 && kills === 0) {
    const st = await A.evaluate(() => {
      const { app, input } = window.__supershot;
      const m = app.match;
      const b = [...m.players.values()].find((p) => !p.isSelf);
      if (!b || !b.state || !b.alive) { input.down.delete('Mouse0'); input.down.delete('KeyW'); return { dist: -1 }; }
      const ex = m.pred.x, ey = m.pred.y + 1.6, ez = m.pred.z;
      const dx = b.state.x - ex, dy = b.state.y + 1.1 - ey, dz = b.state.z - ez;
      m.yaw = Math.atan2(-dx, -dz);
      m.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const dist = Math.hypot(dx, dz);
      const vis = m.world.visible(ex, ey, ez, b.state.x, b.state.y + 1.1, b.state.z);
      if (dist > 12 || !vis) input.down.add('KeyW'); else input.down.delete('KeyW');
      if (vis) input.down.add('Mouse0'); else input.down.delete('Mouse0');
      return { dist, vis };
    });
    await A.waitForTimeout(80);
    kills = await A.evaluate(() => { const m = window.__supershot.app.match; return m && m.scores ? (m.scores.rows.find((r) => r[0] === m.selfPid) || [0, 0])[1] : 0; });
    void st;
  }
  await A.screenshot({ path: join(out, 'multi-03-A-fighting.png') });
  await B.screenshot({ path: join(out, 'multi-04-B-view.png') });
  const match = [...server.matchmaker.matches.values()][0];
  const stats = match ? [...match.players.values()].map((p) => ({ name: p.name, kills: p.stats.kills, dmg: p.stats.damage, deaths: p.stats.deaths })) : [];
  console.log('server stats', JSON.stringify(stats));
  const aStats = stats.find((s) => s.name === nameA);
  check(aStats && aStats.dmg > 0, `server registered A's hits on B (${aStats ? aStats.dmg : 0} damage)`);
  check(aStats && aStats.kills >= 1, `A eliminated B (${aStats ? aStats.kills : 0} kills)`);
  const bHurt = await B.evaluate(() => window.__supershot.app.match ? window.__supershot.app.match.health : -1);
  console.log('B health now', bHurt);
  await A.evaluate(() => { window.__supershot.input.down.clear(); });
  // finish the match → results screen → rewards persisted → back to lobby
  const creditsBefore = await A.evaluate(() => window.__supershot.S.profile.value.credits);
  { const match = [...server.matchmaker.matches.values()][0]; match._end('score'); }
  await A.waitForSelector('.endscreen', { timeout: 10000 });
  await A.waitForTimeout(2500);
  await A.screenshot({ path: join(out, 'multi-05-endscreen-A.png') });
  await B.screenshot({ path: join(out, 'multi-06-endscreen-B.png') });
  const end = await A.evaluate(() => window.__supershot.S.matchEnd.value);
  check(end && end.you.place === 1 && end.you.credits > 0, `A placed #1 and earned ${end ? end.you.credits : 0} credits / ${end ? end.you.xp : 0} XP`);
  // either click RETURN TO LOBBY or let the server's auto-return (12 s) take us back
  await A.click('text=RETURN TO LOBBY', { timeout: 4000 }).catch(() => {});
  await A.waitForSelector('.lobby-ui', { timeout: 30000 });
  const creditsAfter = await A.evaluate(() => window.__supershot.S.profile.value.credits);
  check(creditsAfter > creditsBefore, `credits persisted (${creditsBefore} → ${creditsAfter})`);
  const career = await A.evaluate(() => window.__supershot.S.profile.value.stats);
  check(career.kills >= 1 && career.matches === 1, `career stats updated (kills ${career.kills}, matches ${career.matches})`);
} catch (e) {
  errors.push(String(e && e.stack || e));
}
await browser.close();
await server.stop();
if (errors.length) { console.log(`\n${errors.length} problem(s):`); errors.slice(0, 15).forEach((e) => console.log(' -', e.slice(0, 1500))); process.exitCode = 1; }
else console.log('\nMULTIPLAYER E2E OK');
