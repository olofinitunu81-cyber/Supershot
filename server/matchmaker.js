// Public matchmaking queues (with party support and join-in-progress) and
// private rooms with join codes and host-controlled settings.

import { MODES, MATCH, NO_TEAM } from '../shared/config.js';
import { MAP_IDS, getMap } from '../shared/maps/index.js';
import { GameError } from './profiles.js';
import { Match } from './match.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class Matchmaker {
  constructor(server) {
    this.server = server;
    this.queues = { tdm: [], ffa: [] };
    this.matches = new Map();
    this.rooms = new Map();
    this.nextMatchId = 1;
    this.lastMap = { tdm: null, ffa: null };
  }

  // ───────────────────────── public queue ─────────────────────────

  _partyClients(client) {
    const party = this.server.social.partyOf(client.account.id);
    if (!party) return { party: null, clients: [client] };
    if (party.leader !== client.account.id) throw new GameError('not_leader', 'Only the party leader can start matchmaking.');
    const clients = party.members.map((id) => this.server.clientsByAccount.get(id)).filter(Boolean);
    return { party, clients };
  }

  queue(client, mode) {
    if (!MODES[mode]) throw new GameError('bad_mode', 'Unknown game mode.');
    const { party, clients } = this._partyClients(client);
    for (const c of clients) {
      if (c.matchPlayer || c.room) throw new GameError('busy', `${c.account.username} is busy.`);
      this._removeFromQueues(c);
    }
    const entry = { clients, partyId: party ? party.id : null, mode, since: Date.now() };
    this.queues[mode].push(entry);
    for (const c of clients) c.queueEntry = entry;
    this._sendStatus(entry);
    this.server.social.notifyPresence(client.account.id);
    this.tick();
  }

  cancel(client) {
    const entry = client.queueEntry;
    if (!entry) { client.send({ t: 'mm.status', state: 'idle' }); return; }
    this._dropEntry(entry);
  }

  _dropEntry(entry) {
    const q = this.queues[entry.mode];
    const i = q.indexOf(entry);
    if (i >= 0) q.splice(i, 1);
    for (const c of entry.clients) {
      if (c.queueEntry === entry) c.queueEntry = null;
      c.send({ t: 'mm.status', state: 'idle' });
    }
  }

  _removeFromQueues(client) {
    if (client.queueEntry) this._dropEntry(client.queueEntry);
  }

  onPartyChanged(party) {
    // a party roster change invalidates any queued entry for it
    for (const mode of Object.keys(this.queues)) {
      for (const e of [...this.queues[mode]]) if (e.partyId === party.id) this._dropEntry(e);
    }
  }

  _sendStatus(entry) {
    const searching = this.queues[entry.mode].reduce((n, e) => n + e.clients.length, 0);
    const elapsed = Math.floor((Date.now() - entry.since) / 1000);
    for (const c of entry.clients) c.send({ t: 'mm.status', state: 'searching', mode: entry.mode, elapsed, searching });
  }

  _pickMap(mode) {
    const ids = MAP_IDS.filter((id) => getMap(id).modes.includes(mode) && id !== this.lastMap[mode]);
    const pool = ids.length ? ids : MAP_IDS;
    const id = pool[Math.floor(Math.random() * pool.length)];
    this.lastMap[mode] = id;
    return id;
  }

  _createMatch(opts) {
    const id = this.nextMatchId++;
    const match = new Match({
      id,
      ...opts,
      onEnd: (m, info, results) => this._onMatchEnd(m, info, results),
      onClose: (m) => this._onMatchClose(m),
    });
    this.matches.set(id, match);
    return match;
  }

  _placeEntry(entry, match) {
    const team = match.teams ? match._pickTeam() : undefined;
    for (const c of entry.clients) {
      c.queueEntry = null;
      this.server.lobby.leave(c);
      match.addHuman(c, { team, partyId: entry.partyId });
      c.send({ t: 'mm.status', state: 'idle' });
      this.server.social.notifyPresence(c.account.id);
    }
  }

  tick() {
    for (const mode of Object.keys(this.queues)) {
      const q = this.queues[mode];
      if (!q.length) continue;
      // 1) fill running public matches
      for (const entry of [...q]) {
        const candidates = [...this.matches.values()]
          .filter((m) => !m.isPrivate && m.modeId === mode && m.canJoin() && m.settings.maxPlayers - m.humans.length >= entry.clients.length)
          .sort((a, b) => b.humans.length - a.humans.length);
        if (candidates.length) {
          q.splice(q.indexOf(entry), 1);
          this._placeEntry(entry, candidates[0]);
        }
      }
      if (!q.length) continue;
      // 2) start a new match when enough players are waiting or the oldest waited long enough
      const waiting = q.reduce((n, e) => n + e.clients.length, 0);
      const oldest = Math.min(...q.map((e) => e.since));
      if (waiting >= 4 || Date.now() - oldest >= MATCH.fillWaitPublic * 1000) {
        const match = this._createMatch({ mode, mapId: this._pickMap(mode), isPrivate: false });
        let slots = match.settings.maxPlayers;
        for (const entry of [...q]) {
          if (entry.clients.length > slots) continue;
          slots -= entry.clients.length;
          q.splice(q.indexOf(entry), 1);
          this._placeEntry(entry, match);
        }
        match.balanceBots();
      }
      for (const e of q) this._sendStatus(e);
    }
  }

  // ───────────────────────── private rooms ─────────────────────────

  _code() {
    for (;;) {
      let c = '';
      for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  _sanitizeSettings(s, prev) {
    const out = { ...(prev || { mode: 'tdm', map: 'neon', timeLimit: 8, scoreLimit: 50, bots: 6, botDifficulty: 'normal', maxPlayers: 12 }) };
    if (s && typeof s === 'object') {
      if (MODES[s.mode]) out.mode = s.mode;
      if (s.map === 'random' || MAP_IDS.includes(s.map)) out.map = s.map;
      if (Number.isFinite(s.timeLimit)) out.timeLimit = Math.max(2, Math.min(20, Math.round(s.timeLimit)));
      if (Number.isFinite(s.scoreLimit)) out.scoreLimit = Math.max(5, Math.min(150, Math.round(s.scoreLimit)));
      if (Number.isFinite(s.bots)) out.bots = Math.max(0, Math.min(11, Math.round(s.bots)));
      if (['easy', 'normal', 'hard'].includes(s.botDifficulty)) out.botDifficulty = s.botDifficulty;
      if (Number.isFinite(s.maxPlayers)) out.maxPlayers = Math.max(2, Math.min(12, Math.round(s.maxPlayers)));
    }
    if (out.map !== 'random' && !getMap(out.map).modes.includes(out.mode)) out.map = 'random';
    return out;
  }

  roomView(room) {
    return {
      code: room.code,
      host: room.host,
      settings: room.settings,
      inMatch: !!room.match,
      members: room.members.map((id) => {
        const c = this.server.clientsByAccount.get(id);
        return { id, name: c ? c.account.username : '?', level: c ? c.account.level : 1, team: room.teams.get(id) ?? 0, ready: true };
      }),
    };
  }

  _broadcastRoom(room) {
    const view = this.roomView(room);
    for (const id of room.members) {
      const c = this.server.clientsByAccount.get(id);
      if (c) c.send({ t: 'room', room: view });
    }
  }

  createRoom(client, settings) {
    if (client.matchPlayer) throw new GameError('busy', 'Leave your match first.');
    this.leaveRoom(client);
    this._removeFromQueues(client);
    const room = { code: this._code(), host: client.account.id, members: [client.account.id], teams: new Map([[client.account.id, 0]]), settings: this._sanitizeSettings(settings), match: null, created: Date.now() };
    this.rooms.set(room.code, room);
    client.room = room;
    this._broadcastRoom(room);
    this.server.social.notifyPresence(client.account.id);
    return room;
  }

  joinRoom(client, code) {
    if (typeof code !== 'string') throw new GameError('bad_code', 'Enter a room code.');
    const room = this.rooms.get(code.trim().toUpperCase());
    if (!room) throw new GameError('no_room', 'No private match with that code.');
    if (client.room === room) return room;
    if (client.matchPlayer) throw new GameError('busy', 'Leave your match first.');
    if (room.members.length >= room.settings.maxPlayers) throw new GameError('room_full', 'That private match is full.');
    this.leaveRoom(client);
    this._removeFromQueues(client);
    room.members.push(client.account.id);
    const t0 = [...room.teams.values()].filter((t) => t === 0).length;
    room.teams.set(client.account.id, t0 <= room.members.length / 2 - 0.5 ? 0 : 1);
    client.room = room;
    this._broadcastRoom(room);
    // join an in-progress room match
    if (room.match && !room.match.closed && room.match.canJoin()) {
      this.server.lobby.leave(client);
      room.match.addHuman(client, { team: room.teams.get(client.account.id) });
    }
    this.server.social.notifyPresence(client.account.id);
    return room;
  }

  leaveRoom(client) {
    const room = client.room;
    if (!room) return;
    room.members = room.members.filter((id) => id !== client.account.id);
    room.teams.delete(client.account.id);
    client.room = null;
    client.send({ t: 'room', room: null });
    if (!room.members.length) {
      this.rooms.delete(room.code);
    } else {
      if (room.host === client.account.id) room.host = room.members[0];
      this._broadcastRoom(room);
    }
    this.server.social.notifyPresence(client.account.id);
  }

  updateRoom(client, settings) {
    const room = client.room;
    if (!room) throw new GameError('no_room', 'Not in a private match.');
    if (room.host !== client.account.id) throw new GameError('not_host', 'Only the host can change settings.');
    room.settings = this._sanitizeSettings(settings, room.settings);
    this._broadcastRoom(room);
  }

  setRoomTeam(client, team) {
    const room = client.room;
    if (!room || (team !== 0 && team !== 1)) return;
    room.teams.set(client.account.id, team);
    this._broadcastRoom(room);
  }

  kickFromRoom(client, memberId) {
    const room = client.room;
    if (!room || room.host !== client.account.id || memberId === client.account.id) return;
    const c = this.server.clientsByAccount.get(memberId);
    if (c) {
      if (c.matchPlayer && room.match) room.match.removePlayer(c.matchPlayer.pid, 'kicked');
      this.leaveRoom(c);
      c.send({ t: 'notify', kind: 'room', text: 'You were removed from the private match.' });
      this.server.lobby.join(c);
    }
  }

  startRoom(client) {
    const room = client.room;
    if (!room) throw new GameError('no_room', 'Not in a private match.');
    if (room.host !== client.account.id) throw new GameError('not_host', 'Only the host can start the match.');
    if (room.match && !room.match.closed) throw new GameError('running', 'The match is already running.');
    const s = room.settings;
    const mapId = s.map === 'random' ? this._pickMap(s.mode) : s.map;
    const match = this._createMatch({
      mode: s.mode, mapId, isPrivate: true, code: room.code,
      timeLimit: s.timeLimit * 60, scoreLimit: s.scoreLimit, bots: s.bots, botDifficulty: s.botDifficulty,
      maxPlayers: Math.max(s.maxPlayers, room.members.length),
    });
    match.room = room;
    room.match = match;
    for (const id of room.members) {
      const c = this.server.clientsByAccount.get(id);
      if (!c) continue;
      this._removeFromQueues(c);
      this.server.lobby.leave(c);
      match.addHuman(c, { team: match.teams ? room.teams.get(id) : NO_TEAM });
      this.server.social.notifyPresence(id);
    }
    match.balanceBots();
    this._broadcastRoom(room);
  }

  // ───────────────────────── match lifecycle ─────────────────────────

  leaveMatch(client) {
    const mp = client.matchPlayer;
    if (!mp) return;
    const match = [...this.matches.values()].find((m) => m.players.get(mp.pid) === mp);
    client.matchPlayer = null;
    if (match) match.removePlayer(mp.pid, 'left');
    client.send({ t: 'match.close', reason: 'left' });
    this._returnToLobby(client);
  }

  _returnToLobby(client) {
    if (!client.alive) return;
    this.server.lobby.join(client);
    if (client.room) this._broadcastRoom(client.room);
    this.server.social.notifyPresence(client.account.id);
    client.send({ t: 'profile', profile: this.server.profiles.profileView(client.account) });
  }

  _onMatchEnd(match, info, results) {
    const profiles = this.server.profiles;
    for (const r of results) {
      const c = r.mp.client;
      const acc = c && c.account;
      if (!acc) continue;
      const lv = profiles.applyMatch(acc, r.summary);
      c.send({
        t: 'match.end',
        info,
        you: {
          pid: r.mp.pid, place: r.place, won: r.won, credits: r.summary.credits, xp: r.summary.xp, lines: r.summary.lines,
          levelBefore: lv.levelBefore, levelAfter: lv.levelAfter, levelBonus: lv.levelBonus,
        },
        profile: profiles.profileView(acc),
      });
    }
    profiles.invalidateLeaderboards();
    try {
      this.server.db.q.insertMatch.run(match.modeId, match.map.id, match.isPrivate ? 1 : 0, Date.now(), JSON.stringify({ reason: info.reason, teamScores: info.teamScores, players: info.board.length }));
    } catch { /* non-fatal */ }
  }

  _onMatchClose(match) {
    this.matches.delete(match.id);
    for (const mp of match.players.values()) {
      if (mp.client) this._returnToLobby(mp.client);
    }
    if (match.room) {
      match.room.match = null;
      if (this.rooms.has(match.room.code)) this._broadcastRoom(match.room);
    }
  }

  onDisconnect(client) {
    this._removeFromQueues(client);
    if (client.matchPlayer) {
      const mp = client.matchPlayer;
      for (const m of this.matches.values()) if (m.players.get(mp.pid) === mp) m.removePlayer(mp.pid, 'disconnected');
      client.matchPlayer = null;
    }
    this.leaveRoom(client);
  }

  stepMatches() {
    for (const m of this.matches.values()) {
      try {
        m.step();
      } catch (e) {
        console.error('[match] step error', m.id, e);
        m.close('error');
      }
    }
  }
}
