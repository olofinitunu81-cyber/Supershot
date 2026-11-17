// Shared social lobby instances: players walk around a 3D hangar together,
// emote and interact with stations. Positions are client-authoritative
// (no combat) but clamped to the lobby bounds.

import { LOBBY } from '../shared/config.js';
import { getItem } from '../shared/items.js';

export class LobbyManager {
  constructor(server) {
    this.server = server;
    this.instances = [];
    this.nextId = 1;
  }

  _instanceFor(client) {
    // prefer an instance with a party member or friend
    const party = this.server.social.partyOf(client.account.id);
    if (party) {
      for (const inst of this.instances) {
        if (inst.players.size < LOBBY.maxPerInstance && party.members.some((id) => inst.players.has(id))) return inst;
      }
    }
    let best = null;
    for (const inst of this.instances) {
      if (inst.players.size < LOBBY.maxPerInstance && (!best || inst.players.size > best.players.size)) best = inst;
    }
    if (best) return best;
    const inst = { id: this.nextId++, players: new Map(), dirty: new Set() };
    this.instances.push(inst);
    return inst;
  }

  _view(entry) {
    const acc = entry.client.account;
    return { id: acc.id, name: acc.username, level: acc.level, avatar: acc.data.avatar, x: entry.x, y: entry.y, z: entry.z, yaw: entry.yaw, a: entry.anim };
  }

  join(client) {
    if (client.lobby) return;
    const inst = this._instanceFor(client);
    const spawnA = Math.random() * Math.PI * 2;
    const entry = { client, x: Math.cos(spawnA) * 3, y: 0, z: 4 + Math.sin(spawnA) * 2, yaw: Math.PI, anim: 0 };
    inst.players.set(client.account.id, entry);
    client.lobby = inst;
    client.send({ t: 'lobby.state', id: inst.id, you: client.account.id, players: [...inst.players.values()].map((e) => this._view(e)) });
    this._broadcast(inst, { t: 'lobby.add', p: this._view(entry) }, client.account.id);
  }

  leave(client) {
    const inst = client.lobby;
    if (!inst) return;
    inst.players.delete(client.account.id);
    inst.dirty.delete(client.account.id);
    client.lobby = null;
    this._broadcast(inst, { t: 'lobby.remove', id: client.account.id });
    if (inst.players.size === 0) this.instances = this.instances.filter((i) => i !== inst);
  }

  move(client, m) {
    const inst = client.lobby;
    if (!inst) return;
    const e = inst.players.get(client.account.id);
    if (!e) return;
    const b = LOBBY.bounds;
    const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    e.x = Math.max(b.minX, Math.min(b.maxX, num(m.x, e.x)));
    e.z = Math.max(b.minZ, Math.min(b.maxZ, num(m.z, e.z)));
    e.y = Math.max(0, Math.min(6, num(m.y, e.y)));
    e.yaw = num(m.yaw, e.yaw);
    e.anim = Math.max(0, Math.min(15, num(m.a, 0) | 0));
    inst.dirty.add(client.account.id);
  }

  emote(client, id) {
    const inst = client.lobby;
    if (!inst) return;
    const item = getItem(id);
    if (!item || item.cat !== 'emote' || !client.account.owns(id)) return;
    this._broadcast(inst, { t: 'lobby.emote', id: client.account.id, e: id });
  }

  avatarChanged(client) {
    const inst = client.lobby;
    if (!inst) return;
    this._broadcast(inst, { t: 'lobby.avatar', id: client.account.id, avatar: client.account.data.avatar, level: client.account.level, name: client.account.username });
  }

  chat(client, text) {
    const inst = client.lobby;
    if (!inst) return;
    this._broadcast(inst, { t: 'chat', ch: 'lobby', from: client.account.username, id: client.account.id, text });
  }

  tick() {
    for (const inst of this.instances) {
      if (!inst.dirty.size) continue;
      const list = [];
      for (const id of inst.dirty) {
        const e = inst.players.get(id);
        if (e) list.push([id, Math.round(e.x * 100) / 100, Math.round(e.y * 100) / 100, Math.round(e.z * 100) / 100, Math.round(e.yaw * 1000) / 1000, e.anim]);
      }
      inst.dirty.clear();
      if (list.length) this._broadcast(inst, { t: 'lobby.moves', l: list });
    }
  }

  _broadcast(inst, obj, exceptId) {
    const str = JSON.stringify(obj);
    for (const [id, e] of inst.players) {
      if (id !== exceptId) e.client.sendRaw(str);
    }
  }

  get count() {
    let n = 0;
    for (const i of this.instances) n += i.players.size;
    return n;
  }
}
