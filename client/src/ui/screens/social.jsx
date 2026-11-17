// Friends & party, leaderboards, daily rewards & missions, player profile.
import { useState, useEffect } from 'preact/hooks';
import { S, toast } from '../../state.js';
import { app } from '../../app.js';
import { net } from '../../net.js';
import { Panel, Btn, Tabs, Icon, Credits, Empty, Countdown, nextUtcMidnight } from '../components.jsx';
import { WEAPONS, CLASS_NAMES } from '../../../../shared/weapons.js';
import { LIMITS } from '../../../../shared/config.js';

const ACT = { lobby: 'IN LOBBY', queue: 'SEARCHING', match: 'IN MATCH', room: 'IN PRIVATE ROOM', offline: 'OFFLINE' };

export function FriendsPanel() {
  const list = S.friends.value;
  const party = S.party.value;
  const prof = S.profile.value;
  const [name, setName] = useState('');
  const friends = list.filter((f) => f.status === 'friend').sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
  const incoming = list.filter((f) => f.status === 'incoming');
  const outgoing = list.filter((f) => f.status === 'outgoing');
  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    net.request({ t: 'friend.request', name: name.trim() }, ['ok']).then(() => { toast(`Friend request sent to ${name.trim()}`, 'info'); setName(''); }).catch(() => {});
  };
  const inParty = (id) => party && party.members.some((m) => m.id === id);
  return (
    <Panel title="FRIENDS & PARTY" sub={`${friends.filter((f) => f.online).length} ONLINE · ${friends.length} FRIENDS`} onClose={() => app.closePanel()}>
      <form class="add-friend" onSubmit={add}>
        <input value={name} maxLength={LIMITS.usernameMax} placeholder="Add friend by username" onInput={(e) => setName(e.target.value)} />
        <Btn type="submit" icon="plus" small disabled={!name.trim()}>ADD</Btn>
      </form>
      {party && (
        <div class="party-card">
          <div class="sec-title">YOUR PARTY ({party.members.length}/{LIMITS.partyMax})</div>
          {party.members.map((m) => (
            <div class="friend-row" key={m.id}>
              <div class={`presence ${m.online ? 'on' : ''}`} />
              <div class="fr-main"><b>{m.name}{m.id === party.leader && <Icon name="crown" size={12} class="gold" />}</b><small>LV {m.level} · {ACT[m.activity] || ''}</small></div>
              {party.leader === prof.id && m.id !== prof.id && <button class="link danger" onClick={() => net.send({ t: 'party.kick', id: m.id })}>KICK</button>}
            </div>
          ))}
          <Btn small variant="ghost" onClick={() => net.send({ t: 'party.leave' })}>LEAVE PARTY</Btn>
        </div>
      )}
      {incoming.length > 0 && (
        <div class="fr-section">
          <div class="sec-title">REQUESTS</div>
          {incoming.map((f) => (
            <div class="friend-row" key={f.id}>
              <div class="fr-main"><b>{f.name}</b><small>LV {f.level} wants to be friends</small></div>
              <Btn small icon="check" onClick={() => net.send({ t: 'friend.accept', id: f.id })}>ACCEPT</Btn>
              <Btn small variant="ghost" onClick={() => net.send({ t: 'friend.decline', id: f.id })}>✕</Btn>
            </div>
          ))}
        </div>
      )}
      <div class="fr-section">
        <div class="sec-title">FRIENDS</div>
        {friends.length === 0 && <Empty text="No friends yet. Add someone by their username above!" />}
        {friends.map((f) => (
          <div class="friend-row" key={f.id}>
            <div class={`presence ${f.online ? 'on' : ''} ${f.activity}`} />
            <div class="fr-main"><b>{f.name}</b><small>LV {f.level} · {ACT[f.activity] || 'OFFLINE'}</small></div>
            {f.online && !inParty(f.id) && <Btn small onClick={() => net.request({ t: 'party.invite', id: f.id }, ['ok']).then(() => toast(`Party invite sent to ${f.name}`, 'info')).catch(() => {})}>INVITE</Btn>}
            <button class="link danger" title="Remove friend" onClick={() => { if (confirm(`Remove ${f.name} from friends?`)) net.send({ t: 'friend.remove', id: f.id }); }}>REMOVE</button>
          </div>
        ))}
      </div>
      {outgoing.length > 0 && (
        <div class="fr-section">
          <div class="sec-title">SENT</div>
          {outgoing.map((f) => (
            <div class="friend-row" key={f.id}>
              <div class="fr-main"><b>{f.name}</b><small>Pending…</small></div>
              <button class="link" onClick={() => net.send({ t: 'friend.decline', id: f.id })}>CANCEL</button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function LeaderboardPanel() {
  const [board, setBoard] = useState('xp');
  useEffect(() => { net.send({ t: 'lb.get', board }); }, [board]);
  const data = S.lb.value[board];
  const col = board === 'kills' ? 'kills' : board === 'wins' ? 'wins' : 'level';
  return (
    <Panel title="LEADERBOARDS" sub="THE BEST OPERATORS IN SUPERSHOT" onClose={() => app.closePanel()} wide>
      <Tabs tabs={[{ id: 'xp', label: 'LEVEL' }, { id: 'kills', label: 'ELIMINATIONS' }, { id: 'wins', label: 'WINS' }]} value={board} onChange={setBoard} />
      {!data ? <div class="loading-row">LOADING…</div> : (
        <div class="lb-table">
          <div class="lb-row head"><span>#</span><span>PLAYER</span><span>LEVEL</span><span>ELIMS</span><span>K/D</span><span>WINS</span><span>MATCHES</span></div>
          {data.rows.length === 0 && <Empty text="No ranked players yet. Finish a match to appear here!" />}
          {data.rows.map((r) => (
            <div class={`lb-row ${r.id === S.profile.value.id ? 'me' : ''} top${r.rank}`} key={r.id}>
              <span class="rk">{r.rank}</span><span class="nm">{r.name}</span><span class={col === 'level' ? 'hl' : ''}>{r.level}</span>
              <span class={col === 'kills' ? 'hl' : ''}>{r.kills.toLocaleString()}</span><span>{r.kd}</span><span class={col === 'wins' ? 'hl' : ''}>{r.wins}</span><span>{r.matches}</span>
            </div>
          ))}
          {data.you && (
            <div class="lb-row me you">
              <span class="rk">{data.you.rank ?? '—'}</span><span class="nm">YOU · {data.you.name}</span><span>{data.you.level}</span><span>{data.you.kills}</span><span>{data.you.kd}</span><span>{data.you.wins}</span><span>{data.you.matches}</span>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

export function MissionsPanel() {
  const p = S.profile.value;
  const d = p.daily;
  return (
    <Panel title="DAILY & MISSIONS" sub={<span>RESETS IN <Countdown to={nextUtcMidnight()} /></span>} onClose={() => app.closePanel()} wide>
      <div class="sec-title">DAILY LOGIN STREAK</div>
      <div class="daily-row">
        {d.rewards.map((r, i) => {
          const claimedToday = !d.canClaim;
          const doneIdx = claimedToday ? d.nextIndex : d.nextIndex - 1;
          const state = i <= doneIdx ? 'done' : i === d.nextIndex && d.canClaim ? 'ready' : 'future';
          return (
            <div class={`daily-day ${state} ${i === 6 ? 'big' : ''}`} key={i}>
              <span class="dd-label">DAY {i + 1}</span>
              <Icon name={i === 6 ? 'crown' : 'gift'} size={i === 6 ? 30 : 22} />
              <Credits value={r} />
              {state === 'done' && <span class="dd-check"><Icon name="check" size={14} /></span>}
            </div>
          );
        })}
      </div>
      <div class="daily-claim">
        {d.canClaim ? <Btn icon="gift" onClick={() => net.send({ t: 'daily.claim' })}>CLAIM {d.rewards[d.nextIndex]} CREDITS</Btn> : <span class="muted">Come back tomorrow to keep your streak alive!</span>}
      </div>
      <div class="sec-title">TODAY'S MISSIONS</div>
      <div class="missions">
        {p.missions.map((m) => {
          const done = m.progress >= m.goal;
          return (
            <div class={`mission ${done ? 'done' : ''} ${m.claimed ? 'claimed' : ''}`} key={m.id}>
              <div class="ms-main">
                <b>{m.text}</b>
                <div class="ms-bar"><i style={{ width: `${(m.progress / m.goal) * 100}%` }} /></div>
                <small>{m.progress.toLocaleString()} / {m.goal.toLocaleString()}</small>
              </div>
              <div class="ms-reward"><Credits value={m.reward} /></div>
              {m.claimed ? <span class="tag owned">CLAIMED</span> : <Btn small disabled={!done} onClick={() => net.send({ t: 'mission.claim', id: m.id })}>CLAIM</Btn>}
            </div>
          );
        })}
      </div>
      <p class="muted small">Mission progress is saved at the end of each match. New missions every day at 00:00 UTC.</p>
    </Panel>
  );
}

export function ProfilePanel() {
  const p = S.profile.value;
  const s = p.stats;
  const [u, setU] = useState('');
  const [pw, setPw] = useState('');
  const kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills;
  const hs = s.kills ? Math.round((s.headshots / Math.max(1, s.kills)) * 100) : 0;
  const fav = Object.entries(s.weaponKills || {}).sort((a, b) => b[1] - a[1])[0];
  const winRate = s.matches ? Math.round((s.wins / s.matches) * 100) : 0;
  return (
    <Panel title={p.username} sub={`LEVEL ${p.level} · ${p.xp.toLocaleString()} XP`} onClose={() => app.closePanel()}>
      <div class="xp-big"><div class="xpb-track"><i style={{ width: `${p.levelNeeded ? (p.levelInto / p.levelNeeded) * 100 : 100}%` }} /></div><span>{p.levelInto.toLocaleString()} / {p.levelNeeded.toLocaleString()} XP TO LEVEL {p.level + 1}</span></div>
      <div class="stat-grid">
        <div><b>{s.kills.toLocaleString()}</b><span>ELIMINATIONS</span></div>
        <div><b>{s.deaths.toLocaleString()}</b><span>DEATHS</span></div>
        <div><b>{kd}</b><span>K/D</span></div>
        <div><b>{s.assists.toLocaleString()}</b><span>ASSISTS</span></div>
        <div><b>{s.wins}</b><span>WINS</span></div>
        <div><b>{winRate}%</b><span>WIN RATE</span></div>
        <div><b>{s.matches}</b><span>MATCHES</span></div>
        <div><b>{hs}%</b><span>HEADSHOT KILLS</span></div>
        <div><b>{s.bestStreak}</b><span>BEST STREAK</span></div>
        <div><b>{s.meleeKills}</b><span>MELEE KILLS</span></div>
        <div><b>{Math.round(s.damage).toLocaleString()}</b><span>DAMAGE</span></div>
        <div><b>{Math.round(s.playtime / 60)}m</b><span>PLAYTIME</span></div>
      </div>
      {fav && <div class="fav-weapon">FAVORITE WEAPON <b>{WEAPONS[fav[0]] ? WEAPONS[fav[0]].name : fav[0]}</b> <span>{fav[1]} eliminations · {WEAPONS[fav[0]] ? CLASS_NAMES[WEAPONS[fav[0]].cls] : ''}</span></div>}
      {p.guest && (
        <form class="claim-form" onSubmit={(e) => { e.preventDefault(); net.send({ t: 'claim', username: u, password: pw }); }}>
          <div class="sec-title">SECURE YOUR ACCOUNT</div>
          <p class="muted small">You're playing as a guest. Choose a username and password to keep your progress and sign in from any device.</p>
          <input placeholder="Username" value={u} maxLength={LIMITS.usernameMax} onInput={(e) => setU(e.target.value)} />
          <input type="password" placeholder="Password" value={pw} onInput={(e) => setPw(e.target.value)} />
          <Btn type="submit" disabled={!u || pw.length < LIMITS.passwordMin}>CLAIM ACCOUNT</Btn>
        </form>
      )}
      <div class="profile-actions">
        <Btn variant="ghost" icon="door" onClick={() => app.logout()}>SIGN OUT</Btn>
      </div>
    </Panel>
  );
}
