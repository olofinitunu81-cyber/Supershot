import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, TestClient, sleep } from './helpers.js';
import { encodeInputs, decodeSnapshot, Reader, Writer, MSG_SNAPSHOT, MSG_SHOTS } from '../shared/protocol.js';
import { STARTING_CREDITS } from '../server/profiles.js';
import { BTN } from '../shared/config.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

async function newUser(name) {
  const c = await new TestClient(server.port).connect();
  await c.wait('hello', 2000, true);
  const r = await c.request({ t: 'register', username: name, password: 'hunter22' }, (m) => m.t === 'auth.ok' || m.t === 'auth.err');
  assert.equal(r.t, 'auth.ok', JSON.stringify(r));
  return { c, token: r.token, profile: r.profile };
}

test('register, login, resume and validation', async () => {
  const { c, token, profile } = await newUser('Alice_1');
  assert.equal(profile.username, 'Alice_1');
  assert.equal(profile.credits, STARTING_CREDITS);
  assert.ok(profile.inventory.includes('vx9'));
  c.close();
  // duplicate username
  const d = await new TestClient(server.port).connect();
  const dup = await d.request({ t: 'register', username: 'alice_1', password: 'whatever1' }, (m) => m.t.startsWith('auth.'));
  assert.equal(dup.t, 'auth.err');
  assert.equal(dup.code, 'name_taken');
  const bad = await d.request({ t: 'login', username: 'Alice_1', password: 'wrongpass' }, (m) => m.t.startsWith('auth.'));
  assert.equal(bad.code, 'bad_login');
  const ok = await d.request({ t: 'login', username: 'ALICE_1', password: 'hunter22' }, (m) => m.t.startsWith('auth.'));
  assert.equal(ok.t, 'auth.ok');
  d.close();
  const e = await new TestClient(server.port).connect();
  const res = await e.request({ t: 'resume', token }, (m) => m.t.startsWith('auth.'));
  assert.equal(res.t, 'auth.ok');
  assert.equal(res.profile.username, 'Alice_1');
  e.close();
});

test('guest accounts can be claimed', async () => {
  const c = await new TestClient(server.port).connect();
  const r = await c.request({ t: 'guest' }, (m) => m.t === 'auth.ok');
  assert.ok(r.profile.guest);
  assert.match(r.profile.username, /^Guest\d+$/);
  await c.request({ t: 'claim', username: 'ClaimedOne', password: 'secret123' }, 'claim.ok');
  const p = await c.wait('profile');
  assert.equal(p.profile.username, 'ClaimedOne');
  assert.equal(p.profile.guest, false);
  c.close();
});

test('shop purchases, loadouts, camos and avatars persist', async () => {
  const { c, token } = await newUser('Shopper');
  const daily = await c.request({ t: 'daily.claim' }, 'daily.ok');
  assert.equal(daily.reward, 100);
  // can't equip unowned weapon
  const e1 = await c.request({ t: 'loadout.set', loadout: { primary: 'ar77' } }, 'err');
  assert.equal(e1.code, 'not_owned');
  const bought = await c.request({ t: 'shop.buy', item: 'k3' }, (m) => m.t === 'shop.ok' || m.t === 'err');
  assert.equal(bought.t, 'shop.ok', JSON.stringify(bought));
  let p = (await c.wait('profile')).profile;
  assert.ok(p.inventory.includes('k3'));
  assert.equal(p.credits, STARTING_CREDITS + 100 - bought.price);
  const credits = p.credits;
  // can't buy twice
  const e2 = await c.request({ t: 'shop.buy', item: 'k3' }, 'err');
  assert.equal(e2.code, 'owned');
  // not enough credits
  const e3 = await c.request({ t: 'shop.buy', item: 'outfit_gold' }, 'err');
  assert.equal(e3.code, 'no_credits');
  p = (await c.request({ t: 'loadout.set', loadout: { primary: 'k3', melee: 'knife' } }, 'profile')).profile;
  assert.equal(p.loadout.primary, 'k3');
  // wrong slot rejected
  const e4 = await c.request({ t: 'loadout.set', loadout: { secondary: 'vx9' } }, 'err');
  assert.equal(e4.code, 'bad_loadout');
  const beanie = await c.request({ t: 'shop.buy', item: 'hat_beanie' }, 'shop.ok');
  p = (await c.request({ t: 'avatar.set', avatar: { hat: 'hat_beanie', shirtColor: '#ff0000', hair: 'hair_afro', face: 'face_skull' } }, 'profile')).profile;
  assert.equal(p.avatar.hat, 'hat_beanie');
  assert.equal(p.avatar.shirtColor, '#ff0000');
  assert.equal(p.avatar.hair, 'hair_spiky', 'unowned hair falls back to default');
  assert.equal(p.avatar.face, 'face_smile', 'unowned face falls back to default');
  const e5 = await c.request({ t: 'daily.claim' }, 'err');
  assert.equal(e5.code, 'claimed');
  c.close();
  await sleep(100);
  // reconnect → persisted
  const c2 = await new TestClient(server.port).connect();
  const r = await c2.request({ t: 'resume', token }, 'auth.ok');
  assert.equal(r.profile.loadout.primary, 'k3');
  assert.equal(r.profile.avatar.hat, 'hat_beanie');
  assert.equal(r.profile.credits, credits - beanie.price);
  assert.equal(r.profile.daily.canClaim, false);
  c2.close();
});

test('friends, presence and parties', async () => {
  const a = await newUser('FriendA');
  const b = await newUser('FriendB');
  await a.c.request({ t: 'friend.request', name: 'friendb' }, (m) => m.t === 'ok' || m.t === 'err');
  const fl = await b.c.wait((m) => m.t === 'friends' && m.list.some((f) => f.name === 'FriendA' && f.status === 'incoming'));
  const aid = fl.list.find((f) => f.name === 'FriendA').id;
  b.c.send({ t: 'friend.accept', id: aid });
  const fa = await a.c.wait((m) => m.t === 'friends' && m.list.some((f) => f.name === 'FriendB' && f.status === 'friend'));
  assert.equal(fa.list[0].online, true);
  const bid = fa.list.find((f) => f.name === 'FriendB').id;
  a.c.send({ t: 'party.invite', id: bid });
  const inv = await b.c.wait('party.invite');
  b.c.send({ t: 'party.accept', partyId: inv.partyId });
  const party = await a.c.wait((m) => m.t === 'party' && m.party && m.party.members.length === 2);
  assert.equal(party.party.leader, party.party.members[0].id);
  b.c.request({ t: 'chat', ch: 'party', text: 'hi team' }, 'chat');
  const chat = await a.c.wait((m) => m.t === 'chat' && m.ch === 'party');
  assert.equal(chat.text, 'hi team');
  b.c.send({ t: 'party.leave' });
  await a.c.wait((m) => m.t === 'party' && m.party === null);
  a.c.close(); b.c.close();
});

test('private room → match with bots, inputs, snapshots, shooting and leaving', async () => {
  const host = await newUser('HostPlayer');
  const guest = await newUser('VisitorPlayer');
  const room = (await host.c.request({ t: 'room.create', settings: { mode: 'ffa', map: 'core', bots: 2, timeLimit: 3, scoreLimit: 10 } }, 'room')).room;
  assert.equal(room.code.length, 6);
  const joined = await guest.c.request({ t: 'room.join', code: room.code.toLowerCase() }, (m) => m.t === 'room' && m.room && m.room.members.length === 2);
  assert.equal(joined.room.members.length, 2);
  const notHost = await guest.c.request({ t: 'room.start' }, 'err');
  assert.equal(notHost.code, 'not_host');
  host.c.send({ t: 'room.start' });
  const ms = await host.c.wait('match.start');
  await guest.c.wait('match.start');
  assert.equal(ms.match.mode, 'ffa');
  assert.equal(ms.match.map, 'core');
  const gs = guest.c.msgs.find((m) => m.t === 'match.start');
  assert.equal(gs.match.players.length, 4, 'two humans + two bots');
  // wait for snapshots
  await sleep(300);
  const snaps = host.c.bins.map((b) => new Reader(b)).filter((r) => r.u8() === MSG_SNAPSHOT).map((r) => decodeSnapshot(r));
  assert.ok(snaps.length > 3, 'receives snapshots');
  const last = snaps[snaps.length - 1];
  assert.ok(last.self && last.self.p.alive, 'self alive in snapshot');
  assert.equal(last.players.length, 3);
  // send inputs (walk forward + fire) — server acknowledges sequence numbers
  const w = new Writer();
  for (let i = 1; i <= 60; i++) {
    host.c.sendBin(encodeInputs(w, [{ seq: i, mx: 0, mz: 1, yaw: 0, pitch: 0, buttons: i > 20 ? BTN.FIRE : 0, slot: 0, viewTime: 0 }]));
    await sleep(16);
  }
  await sleep(250);
  const snaps2 = host.c.bins.map((b) => new Reader(b)).filter((r) => r.u8() === MSG_SNAPSHOT).map((r) => decodeSnapshot(r));
  const s2 = snaps2[snaps2.length - 1];
  assert.ok(s2.self.ack >= 50, `acked ${s2.self.ack}`);
  // countdown is 5s so the player is frozen — position unchanged but shots not fired
  assert.equal(s2.self.p.slots[0].mag, 30);
  // leave the match → back in lobby
  host.c.send({ t: 'match.leave' });
  await host.c.wait('match.close');
  await host.c.wait('lobby.state');
  // guest still in match with bots
  assert.ok(server.matchmaker.matches.size === 1);
  guest.c.send({ t: 'match.leave' });
  await guest.c.wait('match.close');
  for (let i = 0; i < 40 && server.matchmaker.matches.size; i++) await sleep(50);
  assert.equal(server.matchmaker.matches.size, 0, 'match closes when last human leaves');
  host.c.close(); guest.c.close();
});

test('public matchmaking fills with bots and shots are broadcast', async () => {
  const p1 = await newUser('Queue1');
  const p2 = await newUser('Queue2');
  p1.c.send({ t: 'mm.queue', mode: 'tdm' });
  await p1.c.wait((m) => m.t === 'mm.status' && m.state === 'searching');
  p2.c.send({ t: 'mm.queue', mode: 'tdm' });
  const m1 = await p1.c.wait('match.start', 9000);
  const m2 = await p2.c.wait('match.start', 9000);
  assert.equal(m1.match.id, m2.match.id, 'both placed into the same match');
  assert.equal(m1.match.players.length, 12, 'filled to 12 with bots');
  const teams = m1.match.players.reduce((a, p) => { a[p.team]++; return a; }, [0, 0]);
  assert.deepEqual(teams, [6, 6]);
  const match = server.matchmaker.matches.get(m1.match.id);
  // fast-forward through countdown and let bots fight
  match.phaseEnd = match.time;
  await sleep(4000);
  const shotsMsgs = p1.c.bins.filter((b) => new Uint8Array(b)[0] === MSG_SHOTS);
  assert.ok(shotsMsgs.length > 0, 'remote shots broadcast');
  p1.c.close(); p2.c.close();
  for (let i = 0; i < 40 && server.matchmaker.matches.size; i++) await sleep(50);
  assert.equal(server.matchmaker.matches.size, 0);
});
