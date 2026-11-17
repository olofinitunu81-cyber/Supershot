// Friends, presence and parties.

import { LIMITS } from '../shared/config.js';
import { levelFromXp } from '../shared/progression.js';
import { GameError } from './profiles.js';

export class Social {
  constructor(server) {
    this.server = server;
    this.db = server.db;
    this.parties = new Map();
    this.nextParty = 1;
    this.invites = new Map(); // accountId → Map(partyId → {from, fromName, at})
  }

  // ───────────── presence ─────────────

  activityOf(accountId) {
    const c = this.server.clientsByAccount.get(accountId);
    if (!c) return { online: false, activity: 'offline' };
    return { online: true, activity: c.activity() };
  }

  friendsView(acc) {
    const rows = this.db.q.friendsOf.all(acc.id, acc.id, acc.id);
    return rows.map((r) => {
      let status;
      if (r.status === 'accepted') status = 'friend';
      else status = r.a === acc.id ? 'outgoing' : 'incoming';
      const pres = this.activityOf(r.other_id);
      let avatar = null;
      try { avatar = JSON.parse(r.data).avatar; } catch { /* ignore */ }
      return { id: r.other_id, name: r.username, level: levelFromXp(r.xp).level, status, avatar, ...pres };
    });
  }

  sendFriends(client) {
    if (!client.account) return;
    client.send({ t: 'friends', list: this.friendsView(client.account) });
  }

  /** Re-sends friend lists to every online friend of `accountId` (presence change). */
  notifyPresence(accountId) {
    const rows = this.db.q.friendsOf.all(accountId, accountId, accountId);
    for (const r of rows) {
      const c = this.server.clientsByAccount.get(r.other_id);
      if (c) this.sendFriends(c);
    }
  }

  areFriends(a, b) {
    const r1 = this.db.q.friendRow.get(a, b);
    const r2 = this.db.q.friendRow.get(b, a);
    return (r1 && r1.status === 'accepted') || (r2 && r2.status === 'accepted');
  }

  // ───────────── friends ─────────────

  request(client, name) {
    const me = client.account;
    const other = this.server.profiles.findByName(String(name || ''));
    if (!other) throw new GameError('no_user', 'No player with that name.');
    if (other.id === me.id) throw new GameError('self', "You can't add yourself.");
    const mine = this.db.q.friendRow.get(me.id, other.id);
    const theirs = this.db.q.friendRow.get(other.id, me.id);
    if ((mine && mine.status === 'accepted') || (theirs && theirs.status === 'accepted')) throw new GameError('already', 'You are already friends.');
    if (this.db.q.friendCount.get(me.id, me.id).n >= LIMITS.maxFriends) throw new GameError('limit', 'Friend list is full.');
    if (theirs && theirs.status === 'pending') return this.accept(client, other.id);
    if (mine) throw new GameError('pending', 'Friend request already sent.');
    this.db.q.friendInsert.run(me.id, other.id, 'pending', Date.now());
    this.sendFriends(client);
    const oc = this.server.clientsByAccount.get(other.id);
    if (oc) {
      this.sendFriends(oc);
      oc.send({ t: 'notify', kind: 'friend', text: `${me.username} sent you a friend request.` });
    }
    return { ok: true };
  }

  accept(client, otherId) {
    const me = client.account;
    const row = this.db.q.friendRow.get(otherId, me.id);
    if (!row || row.status !== 'pending') throw new GameError('no_request', 'No pending request from that player.');
    this.db.q.friendDelete.run(otherId, me.id, me.id, otherId);
    this.db.q.friendInsert.run(otherId, me.id, 'accepted', Date.now());
    this.sendFriends(client);
    const oc = this.server.clientsByAccount.get(otherId);
    if (oc) {
      this.sendFriends(oc);
      oc.send({ t: 'notify', kind: 'friend', text: `${me.username} accepted your friend request.` });
    }
    return { ok: true };
  }

  decline(client, otherId) {
    const me = client.account;
    this.db.q.friendDelete.run(otherId, me.id, me.id, otherId);
    this.sendFriends(client);
    const oc = this.server.clientsByAccount.get(otherId);
    if (oc) this.sendFriends(oc);
  }

  remove(client, otherId) {
    this.decline(client, otherId);
  }

  // ───────────── parties ─────────────

  partyView(party) {
    if (!party) return null;
    return {
      id: party.id,
      leader: party.leader,
      members: party.members.map((id) => {
        const c = this.server.clientsByAccount.get(id);
        const acc = c ? c.account : this.server.profiles.get(id);
        return { id, name: acc ? acc.username : '?', level: acc ? acc.level : 1, avatar: acc ? acc.data.avatar : null, online: !!c, activity: c ? c.activity() : 'offline' };
      }),
    };
  }

  broadcastParty(party) {
    const view = this.partyView(party);
    for (const id of party.members) {
      const c = this.server.clientsByAccount.get(id);
      if (c) c.send({ t: 'party', party: view });
    }
  }

  partyOf(accountId) {
    for (const p of this.parties.values()) if (p.members.includes(accountId)) return p;
    return null;
  }

  invite(client, friendId) {
    const me = client.account;
    if (!this.areFriends(me.id, friendId)) throw new GameError('not_friend', 'You can only invite friends.');
    const fc = this.server.clientsByAccount.get(friendId);
    if (!fc) throw new GameError('offline', 'That friend is offline.');
    let party = this.partyOf(me.id);
    if (!party) {
      party = { id: this.nextParty++, leader: me.id, members: [me.id] };
      this.parties.set(party.id, party);
      this.broadcastParty(party);
    }
    if (party.members.includes(friendId)) throw new GameError('in_party', 'Already in your party.');
    if (party.members.length >= LIMITS.partyMax) throw new GameError('party_full', 'Party is full.');
    let inv = this.invites.get(friendId);
    if (!inv) { inv = new Map(); this.invites.set(friendId, inv); }
    inv.set(party.id, { from: me.id, fromName: me.username, at: Date.now() });
    fc.send({ t: 'party.invite', partyId: party.id, from: me.id, fromName: me.username });
    return { ok: true };
  }

  acceptInvite(client, partyId) {
    const me = client.account;
    const inv = this.invites.get(me.id);
    const rec = inv && inv.get(partyId);
    if (!rec || Date.now() - rec.at > 5 * 60 * 1000) throw new GameError('no_invite', 'That invite has expired.');
    const party = this.parties.get(partyId);
    if (!party) throw new GameError('no_party', 'That party no longer exists.');
    if (party.members.length >= LIMITS.partyMax) throw new GameError('party_full', 'Party is full.');
    inv.delete(partyId);
    this.leave(client, true);
    party.members.push(me.id);
    this.broadcastParty(party);
    this.server.matchmaker.onPartyChanged(party);
    return { ok: true };
  }

  declineInvite(client, partyId) {
    const inv = this.invites.get(client.account.id);
    if (inv) inv.delete(partyId);
  }

  leave(client, silent = false) {
    const me = client.account;
    const party = this.partyOf(me.id);
    if (!party) { if (!silent) client.send({ t: 'party', party: null }); return; }
    party.members = party.members.filter((id) => id !== me.id);
    client.send({ t: 'party', party: null });
    if (party.members.length <= 1) {
      this.parties.delete(party.id);
      for (const id of party.members) {
        const c = this.server.clientsByAccount.get(id);
        if (c) c.send({ t: 'party', party: null });
      }
    } else {
      if (party.leader === me.id) party.leader = party.members[0];
      this.broadcastParty(party);
    }
    this.server.matchmaker.onPartyChanged(party);
  }

  kick(client, memberId) {
    const party = this.partyOf(client.account.id);
    if (!party || party.leader !== client.account.id) throw new GameError('not_leader', 'Only the party leader can kick.');
    const c = this.server.clientsByAccount.get(memberId);
    if (c) this.leave(c);
    else {
      party.members = party.members.filter((id) => id !== memberId);
      this.broadcastParty(party);
    }
  }

  partyChat(client, text) {
    const party = this.partyOf(client.account.id);
    if (!party) return;
    for (const id of party.members) {
      const c = this.server.clientsByAccount.get(id);
      if (c) c.send({ t: 'chat', ch: 'party', from: client.account.username, text });
    }
  }

  onDisconnect(client) {
    // keep party membership briefly? Simpler: leave the party on disconnect.
    if (this.partyOf(client.account.id)) this.leave(client, true);
    this.invites.delete(client.account.id);
  }
}
