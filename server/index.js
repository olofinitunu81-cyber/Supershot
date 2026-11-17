// SUPERSHOT game server: static client hosting + WebSocket game protocol.

import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';
import { WebSocketServer } from 'ws';
import { PROTOCOL_VERSION, LIMITS, LOBBY_SEND_HZ } from '../shared/config.js';
import { MSG_INPUT, MSG_PING, MSG_PONG, Reader, decodeInputs } from '../shared/protocol.js';
import { DB } from './db.js';
import { Profiles, GameError } from './profiles.js';
import { Social } from './social.js';
import { LobbyManager } from './lobby.js';
import { Matchmaker } from './matchmaker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

class Client {
  constructor(server, ws, ip) {
    this.server = server;
    this.ws = ws;
    this.ip = ip;
    this.account = null;
    this.token = null;
    this.lobby = null;
    this.matchPlayer = null;
    this.queueEntry = null;
    this.room = null;
    this.alive = true;
    this.tokens = 40; // rate limit bucket
    this.lastRefill = Date.now();
    this.lastChat = 0;
    this.authBusy = false;
  }

  activity() {
    if (this.matchPlayer) return 'match';
    if (this.queueEntry) return 'queue';
    if (this.room) return 'room';
    return 'lobby';
  }

  sendRaw(str) {
    if (this.alive && this.ws.readyState === 1) this.ws.send(str);
  }

  send(obj) {
    this.sendRaw(JSON.stringify(obj));
  }

  sendBin(bytes) {
    if (!this.alive || this.ws.readyState !== 1) return;
    // drop realtime data for clients that can't keep up instead of buffering forever
    if (this.ws.bufferedAmount > 512 * 1024) return;
    this.ws.send(bytes, { binary: true });
  }

  allow(cost = 1) {
    const now = Date.now();
    this.tokens = Math.min(60, this.tokens + ((now - this.lastRefill) / 1000) * 30);
    this.lastRefill = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

export class GameServer {
  constructor(opts = {}) {
    this.port = opts.port ?? Number(process.env.PORT || 3000);
    this.dataDir = opts.dataDir || process.env.DATA_DIR || join(ROOT, 'data');
    this.staticDir = opts.staticDir || join(ROOT, 'dist');
    this.db = new DB(opts.dbFile || join(this.dataDir, 'supershot.db'));
    this.profiles = new Profiles(this.db);
    this.clients = new Set();
    this.clientsByAccount = new Map();
    this.social = new Social(this);
    this.lobby = new LobbyManager(this);
    this.matchmaker = new Matchmaker(this);
    this.staticCache = new Map();
    this.quiet = !!opts.quiet;
  }

  log(...a) {
    if (!this.quiet) console.log('[supershot]', ...a);
  }

  start() {
    this.http = http.createServer((req, res) => this._http(req, res));
    this.wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 64 * 1024 });
    this.http.on('upgrade', (req, socket, head) => {
      if (!req.url.startsWith('/ws')) { socket.destroy(); return; }
      this.wss.handleUpgrade(req, socket, head, (ws) => this._onConnection(ws, req));
    });
    this.db.q.pruneSessions.run(Date.now() - 1000 * 60 * 60 * 24 * 60);
    this._startLoops();
    return new Promise((resolve) => {
      this.http.listen(this.port, () => {
        this.port = this.http.address().port;
        this.log(`listening on http://localhost:${this.port}`);
        resolve(this);
      });
    });
  }

  _startLoops() {
    // 60 Hz simulation with drift correction
    const tickMs = 1000 / 60;
    let next = performance.now();
    const loop = () => {
      if (this.stopped) return;
      const now = performance.now();
      let steps = 0;
      while (now >= next && steps < 5) {
        this.matchmaker.stepMatches();
        next += tickMs;
        steps++;
      }
      if (now - next > 250) next = now; // we fell way behind; don't spiral
      this.loopTimer = setTimeout(loop, Math.max(0, next - performance.now() - 0.5));
    };
    loop();
    this.lobbyTimer = setInterval(() => this.lobby.tick(), 1000 / LOBBY_SEND_HZ);
    this.mmTimer = setInterval(() => this.matchmaker.tick(), 500);
    this.statsTimer = setInterval(() => {
      const msg = JSON.stringify({ t: 'online', n: this.clientsByAccount.size, matches: this.matchmaker.matches.size });
      for (const c of this.clients) if (c.account) c.sendRaw(msg);
    }, 10000);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.loopTimer);
    clearInterval(this.lobbyTimer);
    clearInterval(this.mmTimer);
    clearInterval(this.statsTimer);
    for (const c of [...this.clients]) {
      this._onClose(c);
      try { c.ws.close(1001, 'server shutting down'); } catch { /* ignore */ }
    }
    return new Promise((resolve) => {
      this.wss.close();
      this.http.close(() => { this.db.close(); resolve(); });
      setTimeout(() => { try { this.db.close(); } catch { /* already closed */ } resolve(); }, 1500);
    });
  }

  // ───────────────────────── HTTP ─────────────────────────

  _http(req, res) {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, online: this.clientsByAccount.size, matches: this.matchmaker.matches.size, lobbies: this.lobby.instances.length }));
      return;
    }
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';
    const file = normalize(join(this.staticDir, path));
    if (!file.startsWith(this.staticDir)) { res.writeHead(403); res.end(); return; }
    let target = file;
    if (!existsSync(target) || statSync(target).isDirectory()) {
      if (extname(path)) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
      target = join(this.staticDir, 'index.html');
      if (!existsSync(target)) {
        res.writeHead(503, { 'content-type': 'text/plain' });
        res.end('Client not built. Run `npm run build` first.');
        return;
      }
    }
    const ext = extname(target);
    let entry = this.staticCache.get(target);
    const mtime = statSync(target).mtimeMs;
    if (!entry || entry.mtime !== mtime) {
      const raw = readFileSync(target);
      const compressible = /\.(html|js|css|json|svg|txt|webmanifest)$/.test(target);
      entry = {
        mtime, raw,
        gz: compressible ? gzipSync(raw, { level: 9 }) : null,
        br: compressible ? brotliCompressSync(raw, { params: { [zc.BROTLI_PARAM_QUALITY]: 9 } }) : null,
      };
      this.staticCache.set(target, entry);
    }
    const ae = req.headers['accept-encoding'] || '';
    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : (target.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'),
      'x-content-type-options': 'nosniff',
    };
    let body = entry.raw;
    if (entry.br && ae.includes('br')) { body = entry.br; headers['content-encoding'] = 'br'; }
    else if (entry.gz && ae.includes('gzip')) { body = entry.gz; headers['content-encoding'] = 'gzip'; }
    headers['content-length'] = body.length;
    headers.vary = 'accept-encoding';
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  // ───────────────────────── WebSocket ─────────────────────────

  _onConnection(ws, req) {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    const client = new Client(this, ws, ip);
    this.clients.add(client);
    ws.on('message', (data, isBinary) => {
      try {
        if (isBinary) this._onBinary(client, data);
        else this._onText(client, data.toString());
      } catch (e) {
        if (e instanceof GameError) client.send({ t: 'err', code: e.code, msg: e.message });
        else { console.error('[ws] handler error', e); client.send({ t: 'err', code: 'server', msg: 'Something went wrong.' }); }
      }
    });
    ws.on('close', () => this._onClose(client));
    ws.on('error', () => {});
    client.send({ t: 'hello', v: PROTOCOL_VERSION });
  }

  _onClose(client) {
    if (client.closed) return;
    client.closed = true;
    client.alive = false;
    this.clients.delete(client);
    if (!client.account) return;
    const acc = client.account;
    this.matchmaker.onDisconnect(client);
    this.lobby.leave(client);
    this.social.onDisconnect(client);
    this.profiles.save(acc);
    if (this.clientsByAccount.get(acc.id) === client) {
      this.clientsByAccount.delete(acc.id);
      this.profiles.evict(acc.id);
      this.social.notifyPresence(acc.id);
    }
  }

  _onBinary(client, data) {
    if (!client.account) return;
    const r = new Reader(data);
    const type = r.u8();
    if (type === MSG_INPUT) {
      const mp = client.matchPlayer;
      if (!mp) return;
      const match = this.matchmaker.matches.get(this._matchIdOf(client));
      if (!match) return;
      match.queueInputs(mp, decodeInputs(r));
    } else if (type === MSG_PING) {
      const t = r.f64();
      const buf = new ArrayBuffer(9);
      const dv = new DataView(buf);
      dv.setUint8(0, MSG_PONG);
      dv.setFloat64(1, t, true);
      client.ws.send(new Uint8Array(buf), { binary: true });
    }
  }

  _matchIdOf(client) {
    const mp = client.matchPlayer;
    if (!mp) return null;
    if (mp._matchId) return mp._matchId;
    for (const m of this.matchmaker.matches.values()) {
      if (m.players.get(mp.pid) === mp) { mp._matchId = m.id; return m.id; }
    }
    return null;
  }

  _matchOf(client) {
    const id = this._matchIdOf(client);
    return id ? this.matchmaker.matches.get(id) : null;
  }

  async _authed(client, account, token) {
    // single session per account
    const prev = this.clientsByAccount.get(account.id);
    if (prev && prev !== client) {
      prev.send({ t: 'kicked', reason: 'You signed in from another window.' });
      this._onClose(prev);
      try { prev.ws.close(4000, 'replaced'); } catch { /* ignore */ }
    }
    client.account = account;
    client.token = token;
    this.clientsByAccount.set(account.id, client);
    this.profiles.cache.set(account.id, account);
    client.send({ t: 'auth.ok', token, profile: this.profiles.profileView(account), online: this.clientsByAccount.size });
    this.lobby.join(client);
    this.social.sendFriends(client);
    this.social.notifyPresence(account.id);
    this.log(`auth ${account.username} (#${account.id})`);
  }

  _onText(client, text) {
    if (text.length > 8192) return;
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!client.allow(m.t === 'lobby.move' ? 0.25 : 1)) return;

    // ── unauthenticated ──
    if (!client.account) {
      if (client.authBusy) return;
      const done = (p) => {
        client.authBusy = true;
        p.then((r) => this._authed(client, r.account, r.token))
          .catch((e) => client.send({ t: 'auth.err', code: e.code || 'error', msg: e instanceof GameError ? e.message : 'Authentication failed.' }))
          .finally(() => { client.authBusy = false; });
      };
      switch (m.t) {
        case 'resume': {
          const acc = this.profiles.resume(m.token);
          if (acc) this._authed(client, acc, m.token);
          else client.send({ t: 'auth.err', code: 'expired', msg: 'Session expired. Please sign in again.' });
          return;
        }
        case 'register': return done(this.profiles.register(m.username, m.password));
        case 'login': return done(this.profiles.login(m.username, m.password));
        case 'guest': return done(Promise.resolve(this.profiles.createGuest()));
        default: return;
      }
    }

    const acc = client.account;
    const P = this.profiles;
    const sendProfile = () => client.send({ t: 'profile', profile: P.profileView(acc) });
    switch (m.t) {
      case 'logout':
        P.logout(client.token);
        client.send({ t: 'logged.out' });
        client.ws.close(1000, 'logout');
        return;
      case 'claim':
        client.authBusy = true;
        P.claim(acc, m.username, m.password)
          .then(() => { client.send({ t: 'claim.ok' }); sendProfile(); this.lobby.avatarChanged(client); })
          .catch((e) => client.send({ t: 'err', code: e.code || 'error', msg: e.message, ctx: 'claim' }))
          .finally(() => { client.authBusy = false; });
        return;
      case 'profile.get': return sendProfile();
      case 'shop.buy': {
        const r = P.buy(acc, m.item);
        client.send({ t: 'shop.ok', item: r.item, price: r.price });
        return sendProfile();
      }
      case 'loadout.set': P.setLoadout(acc, m.loadout); return sendProfile();
      case 'camo.set': P.setCamo(acc, m.weapon, m.camo); return sendProfile();
      case 'avatar.set':
        P.setAvatar(acc, m.avatar);
        sendProfile();
        this.lobby.avatarChanged(client);
        return;
      case 'daily.claim': {
        const r = P.claimDaily(acc);
        client.send({ t: 'daily.ok', reward: r.reward, streak: r.streak });
        return sendProfile();
      }
      case 'mission.claim': {
        const r = P.claimMission(acc, m.id);
        client.send({ t: 'mission.ok', id: m.id, reward: r.reward });
        return sendProfile();
      }
      case 'lb.get': {
        const board = ['xp', 'kills', 'wins'].includes(m.board) ? m.board : 'xp';
        client.send({ t: 'lb', ...P.leaderboard(board, acc) });
        return;
      }
      case 'friends.get': return this.social.sendFriends(client);
      case 'friend.request': this.social.request(client, m.name); client.send({ t: 'ok', ctx: 'friend.request' }); return;
      case 'friend.accept': this.social.accept(client, m.id | 0); return;
      case 'friend.decline': this.social.decline(client, m.id | 0); return;
      case 'friend.remove': this.social.remove(client, m.id | 0); return;
      case 'party.invite': this.social.invite(client, m.id | 0); client.send({ t: 'ok', ctx: 'party.invite' }); return;
      case 'party.accept': this.social.acceptInvite(client, m.partyId | 0); return;
      case 'party.decline': this.social.declineInvite(client, m.partyId | 0); return;
      case 'party.leave': this.social.leave(client); return;
      case 'party.kick': this.social.kick(client, m.id | 0); return;
      case 'mm.queue': this.matchmaker.queue(client, m.mode); return;
      case 'mm.cancel': this.matchmaker.cancel(client); return;
      case 'room.create': this.matchmaker.createRoom(client, m.settings); return;
      case 'room.join': this.matchmaker.joinRoom(client, m.code); return;
      case 'room.leave': this.matchmaker.leaveRoom(client); return;
      case 'room.settings': this.matchmaker.updateRoom(client, m.settings); return;
      case 'room.team': this.matchmaker.setRoomTeam(client, m.team); return;
      case 'room.start': this.matchmaker.startRoom(client); return;
      case 'room.kick': this.matchmaker.kickFromRoom(client, m.id | 0); return;
      case 'lobby.move': this.lobby.move(client, m); return;
      case 'lobby.emote': this.lobby.emote(client, m.id); return;
      case 'match.leave': this.matchmaker.leaveMatch(client); return;
      case 'ping': if (client.matchPlayer && Number.isFinite(m.ms)) client.matchPlayer.ping = Math.max(0, Math.min(999, m.ms)); return;
      case 'chat': {
        const now = Date.now();
        if (now - client.lastChat < 700) return;
        client.lastChat = now;
        const text = String(m.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, LIMITS.chatMax);
        if (!text) return;
        if (m.ch === 'party') return this.social.partyChat(client, text);
        if (client.matchPlayer) {
          const match = this._matchOf(client);
          if (match) match.chat(client.matchPlayer, text, m.ch === 'team');
          return;
        }
        if (m.ch === 'room' && client.room) {
          for (const id of client.room.members) {
            const c = this.clientsByAccount.get(id);
            if (c) c.send({ t: 'chat', ch: 'room', from: acc.username, text });
          }
          return;
        }
        return this.lobby.chat(client, text);
      }
      default:
        return;
    }
  }
}

// run directly
if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const server = new GameServer();
  server.start();
  const shutdown = () => {
    server.log('shutting down…');
    server.stop().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
