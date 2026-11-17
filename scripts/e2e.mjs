// End-to-end browser test: boots the real server, drives the client in
// headless Chromium (guest login, lobby, every panel, a match), and saves
// screenshots. Usage: node scripts/e2e.mjs [outDir]
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
console.log('server', url);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const shot = async (name) => { await page.screenshot({ path: join(out, `${name}.png`) }); console.log('shot', name); };
const wait = (ms) => page.waitForTimeout(ms);
const quality = process.env.Q || 'medium';
await page.addInitScript((q) => { localStorage.setItem('supershot.settings.v1', JSON.stringify({ quality: q, fpsCap: 0 })); }, quality);

try {
  await page.goto(url);
  await page.waitForSelector('.auth', { timeout: 60000 });
  await wait(800);
  await shot('01-auth');
  await page.click('text=PLAY AS GUEST');
  await page.waitForSelector('.lobby-ui', { timeout: 120000 });
  await wait(2500);
  await shot('02-lobby');
  const panels = ['armory', 'locker', 'shop', 'inventory', 'missions', 'leaderboard', 'friends', 'play', 'settings', 'profile'];
  for (const p of panels) {
    await page.evaluate((p) => window.__supershot.app.openPanel(p), p);
    await wait(p === 'shop' || p === 'locker' || p === 'inventory' ? 3500 : 1600);
    await shot(`03-panel-${p}`);
  }
  await page.evaluate(() => window.__supershot.app.closePanel());
  // claim daily + buy something
  await page.evaluate(() => window.__supershot.app.openPanel('missions'));
  await wait(500);
  await page.click('text=/CLAIM \\d+ CREDITS/');
  await wait(800);
  await page.evaluate(() => window.__supershot.app.closePanel());
  // start a private match with bots for deterministic testing
  await page.evaluate(() => window.__supershot.app.openPanel('play'));
  await wait(500);
  await page.click('text=PRIVATE MATCH');
  await wait(300);
  await page.click('text=CREATE ROOM');
  await page.waitForSelector('.room-code', { timeout: 10000 });
  await wait(600);
  await shot('04-room');
  await page.click('text=START MATCH');
  await page.waitForFunction(() => window.__supershot.S.screen.value === 'match', null, { timeout: 120000 });
  await wait(1500);
  await shot('05-match-pause');
  // fake pointer lock so the HUD/game are visible
  await page.evaluate(() => {
    const { S, app } = window.__supershot;
    S.paused.value = false;
  });
  await wait(6500);
  await shot('06-match-live');
  await page.evaluate(() => { const m = window.__supershot.app.match; m.yaw += 1.6; });
  await wait(2500);
  await shot('07-match-look');
  await page.keyboard.down('Tab');
  await wait(600);
  await shot('08-scoreboard');
  await page.keyboard.up('Tab');
  console.log('match players', await page.evaluate(() => window.__supershot.app.match.players.size));
} catch (e) {
  console.error('E2E FAILURE', e);
  await shot('99-failure').catch(() => {});
  errors.push(String(e));
}
await browser.close();
await server.stop();
if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  for (const e of errors.slice(0, 20)) console.log(' -', e.slice(0, 600));
  process.exitCode = 1;
} else console.log('E2E OK');
