// Play panel: quick play (matchmaking), private matches (create / join / room).
import { useState } from 'preact/hooks';
import { S, toast } from '../../state.js';
import { app } from '../../app.js';
import { net } from '../../net.js';
import { Panel, Btn, Icon, Tabs, Choice, Slider } from '../components.jsx';
import { MODES, TEAM_NAMES } from '../../../../shared/config.js';
import { MAP_IDS, mapInfo } from '../../../../shared/maps/index.js';

const MAP_ART = { neon: 'linear-gradient(135deg,#2a0b3d,#ff2fa6 70%,#19e6ff)', skyport: 'linear-gradient(135deg,#1d3b8f,#f07a54 60%,#ffd08a)', dunes: 'linear-gradient(135deg,#8a5a2b,#e8c48a 60%,#8cc4ef)', cryo: 'linear-gradient(135deg,#3f5f8f,#cfe3f5 60%,#ffffff)', core: 'linear-gradient(135deg,#0a0a24,#9b5bff 60%,#ff2fa6)' };

function ModeCard({ mode, onClick, disabled }) {
  const m = MODES[mode];
  return (
    <button class={`mode-card mode-${mode}`} disabled={disabled} onClick={onClick}>
      <div class="mc-art"><span class="mc-short">{m.short}</span></div>
      <div class="mc-body">
        <h3>{m.name}</h3>
        <p>{m.desc}</p>
        <div class="mc-meta"><span>{m.maxPlayers} PLAYERS</span><span>{Math.round(m.timeLimit / 60)} MIN</span><span>FIRST TO {m.scoreLimit}</span></div>
      </div>
      <div class="mc-go"><Icon name="play" size={22} /></div>
    </button>
  );
}

function QuickPlay() {
  const mm = S.mm.value;
  const party = S.party.value;
  const prof = S.profile.value;
  const notLeader = party && party.leader !== prof.id;
  const queue = (mode) => { net.send({ t: 'mm.queue', mode }); };
  return (
    <div class="quickplay">
      {notLeader && <div class="note">You're in a party — the party leader starts matchmaking for everyone.</div>}
      <ModeCard mode="tdm" disabled={notLeader || mm.state === 'searching'} onClick={() => queue('tdm')} />
      <ModeCard mode="ffa" disabled={notLeader || mm.state === 'searching'} onClick={() => queue('ffa')} />
      {mm.state === 'searching' && (
        <div class="searching-card">
          <div class="mm-spinner big" />
          <div><b>FINDING A {MODES[mm.mode].short} MATCH…</b><p class="muted">Matches start right away — empty slots are filled with bots and swapped for real players as they join.</p></div>
          <Btn variant="ghost" onClick={() => net.send({ t: 'mm.cancel' })}>CANCEL</Btn>
        </div>
      )}
      <div class="maps-strip">
        {MAP_IDS.map((id) => { const mi = mapInfo(id); return (
          <div class="map-chip" key={id} style={{ background: MAP_ART[id] }}><b>{mi.name}</b><span>{mi.desc}</span></div>
        ); })}
      </div>
    </div>
  );
}

function PrivateMatch() {
  const [code, setCode] = useState('');
  return (
    <div class="private">
      <div class="pm-card">
        <h3><Icon name="plus" /> CREATE PRIVATE MATCH</h3>
        <p class="muted">Pick the mode, map, limits and bots. Share the 6-character code with friends.</p>
        <Btn icon="plus" onClick={() => net.send({ t: 'room.create', settings: { mode: 'tdm', map: 'random' } })}>CREATE ROOM</Btn>
      </div>
      <div class="pm-card">
        <h3><Icon name="door" /> JOIN WITH CODE</h3>
        <form class="code-form" onSubmit={(e) => { e.preventDefault(); if (code.trim().length >= 4) net.send({ t: 'room.join', code: code.trim().toUpperCase() }); }}>
          <input class="code-input" value={code} maxLength={6} placeholder="ABC123" onInput={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          <Btn type="submit" disabled={code.length < 6}>JOIN</Btn>
        </form>
      </div>
      <div class="pm-card muted small">Private matches award 50% credits and XP. Bot eliminations award reduced rewards everywhere.</div>
    </div>
  );
}

function RoomView({ room }) {
  const prof = S.profile.value;
  const isHost = room.host === prof.id;
  const s = room.settings;
  const set = (patch) => net.send({ t: 'room.settings', settings: { ...s, ...patch } });
  const maps = [{ v: 'random', label: 'RANDOM' }, ...MAP_IDS.map((id) => ({ v: id, label: mapInfo(id).name }))];
  const myTeam = room.members.find((m) => m.id === prof.id)?.team ?? 0;
  const copy = () => { try { navigator.clipboard.writeText(room.code); toast('Room code copied!', 'info'); } catch { toast(room.code, 'info'); } };
  return (
    <div class="room">
      <div class="room-code-box">
        <span>ROOM CODE</span>
        <button class="room-code" onClick={copy} title="Copy code">{room.code}</button>
        <small>{room.members.length}/{s.maxPlayers} PLAYERS · {room.inMatch ? 'MATCH IN PROGRESS' : 'WAITING'}</small>
      </div>
      <div class="room-grid">
        <div class="room-settings">
          <Choice label="MODE" value={s.mode} options={[{ v: 'tdm', label: 'TEAM DEATHMATCH' }, { v: 'ffa', label: 'FREE FOR ALL' }]} onChange={(v) => isHost && set({ mode: v })} />
          <Choice label="MAP" value={s.map} options={maps} onChange={(v) => isHost && set({ map: v })} />
          <Slider label="TIME LIMIT" min={2} max={20} step={1} value={s.timeLimit} format={(v) => `${v} MIN`} onChange={(v) => isHost && set({ timeLimit: v })} />
          <Slider label="SCORE LIMIT" min={5} max={150} step={5} value={s.scoreLimit} format={(v) => `${v}`} onChange={(v) => isHost && set({ scoreLimit: v })} />
          <Slider label="BOTS" min={0} max={11} step={1} value={s.bots} format={(v) => `${v}`} onChange={(v) => isHost && set({ bots: v })} />
          <Choice label="BOT SKILL" value={s.botDifficulty} options={[{ v: 'easy', label: 'EASY' }, { v: 'normal', label: 'NORMAL' }, { v: 'hard', label: 'HARD' }]} onChange={(v) => isHost && set({ botDifficulty: v })} />
          {!isHost && <div class="note">Only the host can change settings.</div>}
        </div>
        <div class="room-players">
          {s.mode === 'tdm' ? [0, 1].map((t) => (
            <div class={`room-team team-${t}`} key={t}>
              <div class="rt-head">{TEAM_NAMES[t]}{myTeam !== t && <button class="link" onClick={() => net.send({ t: 'room.team', team: t })}>JOIN</button>}</div>
              {room.members.filter((m) => m.team === t).map((m) => <RoomMember key={m.id} m={m} room={room} isHost={isHost} />)}
            </div>
          )) : (
            <div class="room-team">
              <div class="rt-head">PLAYERS</div>
              {room.members.map((m) => <RoomMember key={m.id} m={m} room={room} isHost={isHost} />)}
            </div>
          )}
          <div class="muted small">+ {s.bots} BOT{s.bots === 1 ? '' : 'S'} ({s.botDifficulty.toUpperCase()})</div>
        </div>
      </div>
      <div class="room-actions">
        <Btn variant="ghost" onClick={() => net.send({ t: 'room.leave' })}>LEAVE ROOM</Btn>
        {isHost ? <Btn icon="play" disabled={room.inMatch} onClick={() => net.send({ t: 'room.start' })}>START MATCH</Btn> : <span class="muted">Waiting for host to start…</span>}
      </div>
    </div>
  );
}

function RoomMember({ m, room, isHost }) {
  const prof = S.profile.value;
  return (
    <div class="room-member">
      {m.id === room.host && <Icon name="crown" size={14} class="gold" />}
      <span>{m.name}</span><small>LV {m.level}</small>
      {isHost && m.id !== prof.id && <button class="link danger" onClick={() => net.send({ t: 'room.kick', id: m.id })}>KICK</button>}
    </div>
  );
}

export function PlayPanel() {
  const room = S.room.value;
  const [tab, setTab] = useState(room ? 'private' : 'quick');
  return (
    <Panel title="PLAY" sub={room ? `PRIVATE MATCH · ${room.code}` : 'CHOOSE HOW YOU WANT TO FIGHT'} onClose={() => app.closePanel()} wide>
      {!room && <Tabs tabs={[{ id: 'quick', label: 'QUICK PLAY', icon: 'bolt' }, { id: 'private', label: 'PRIVATE MATCH', icon: 'lock' }]} value={tab} onChange={setTab} />}
      {room ? <RoomView room={room} /> : tab === 'quick' ? <QuickPlay /> : <PrivateMatch />}
    </Panel>
  );
}
