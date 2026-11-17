// Lobby overlay: navigation bar, player card, party, chat, matchmaking status and panels.
import { useState, useEffect, useRef } from 'preact/hooks';
import { S } from '../../state.js';
import { app } from '../../app.js';
import { net } from '../../net.js';
import { Logo, Btn, Icon, Credits } from '../components.jsx';
import { MODES } from '../../../../shared/config.js';
import { itemsByCat } from '../../../../shared/items.js';
import { PlayPanel } from './play.jsx';
import { ArmoryPanel } from './armory.jsx';
import { LockerPanel } from './locker.jsx';
import { ShopPanel, InventoryPanel } from './shop.jsx';
import { FriendsPanel, LeaderboardPanel, MissionsPanel, ProfilePanel } from './social.jsx';
import { SettingsPanel } from './settings.jsx';
import { keyLabel } from '../../settings.js';

const NAV = [
  { id: 'play', label: 'PLAY', icon: 'play' },
  { id: 'armory', label: 'ARMORY', icon: 'gun' },
  { id: 'locker', label: 'LOCKER', icon: 'shirt' },
  { id: 'shop', label: 'SHOP', icon: 'cart' },
  { id: 'inventory', label: 'INVENTORY', icon: 'box' },
  { id: 'missions', label: 'MISSIONS', icon: 'target' },
  { id: 'leaderboard', label: 'RANKS', icon: 'trophy' },
  { id: 'friends', label: 'FRIENDS', icon: 'users' },
];

function LevelBar({ p }) {
  const pct = p.levelNeeded ? p.levelInto / p.levelNeeded : 1;
  return (
    <div class="levelbar" title={`${p.levelInto} / ${p.levelNeeded} XP`}>
      <div class="lvl-badge">{p.level}</div>
      <div class="lvl-track"><i style={{ width: `${pct * 100}%` }} /></div>
    </div>
  );
}

function MMStatus() {
  const mm = S.mm.value;
  const [t, setT] = useState(0);
  useEffect(() => {
    if (mm.state !== 'searching') return;
    const start = Date.now() - (mm.elapsed || 0) * 1000;
    const iv = setInterval(() => setT(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(iv);
  }, [mm.state, mm.mode]);
  if (mm.state !== 'searching') return null;
  return (
    <div class="mm-status">
      <div class="mm-spinner" />
      <div class="mm-info"><b>SEARCHING · {MODES[mm.mode] ? MODES[mm.mode].name : ''}</b><span>{Math.floor(t / 60)}:{String(t % 60).padStart(2, '0')} · {mm.searching || 1} IN QUEUE</span></div>
      <Btn variant="ghost" small onClick={() => net.send({ t: 'mm.cancel' })}>CANCEL</Btn>
    </div>
  );
}

function PartyWidget() {
  const party = S.party.value;
  const prof = S.profile.value;
  if (!party) return (
    <button class="party-empty" onClick={() => app.openPanel('friends')}><Icon name="users" size={16} />INVITE FRIENDS</button>
  );
  return (
    <div class="party-widget">
      <div class="party-title">PARTY · {party.members.length}/4</div>
      {party.members.map((m) => (
        <div class={`party-member ${m.id === party.leader ? 'leader' : ''}`} key={m.id}>
          {m.id === party.leader && <Icon name="crown" size={12} />}<span>{m.name}</span><small>LV {m.level}</small>
        </div>
      ))}
      <div class="party-actions">
        {party.leader === prof.id ? <span class="muted small">You lead — queue to bring everyone</span> : <span class="muted small">Leader starts matchmaking</span>}
        <button class="link" onClick={() => net.send({ t: 'party.leave' })}>LEAVE</button>
      </div>
    </div>
  );
}

function Invites() {
  const inv = S.invites.value;
  if (!inv.length) return null;
  return (
    <div class="invites">
      {inv.map((i) => (
        <div class="invite" key={i.partyId}>
          <Icon name="users" size={16} /><span><b>{i.fromName}</b> invited you to a party</span>
          <Btn small onClick={() => { net.send({ t: 'party.accept', partyId: i.partyId }); S.invites.value = S.invites.value.filter((x) => x !== i); }}>JOIN</Btn>
          <Btn small variant="ghost" onClick={() => { net.send({ t: 'party.decline', partyId: i.partyId }); S.invites.value = S.invites.value.filter((x) => x !== i); }}>✕</Btn>
        </div>
      ))}
    </div>
  );
}

function LobbyChat() {
  const [text, setText] = useState('');
  const [ch, setCh] = useState('lobby');
  const ref = useRef();
  const lines = S.chat.value.slice(-8);
  useEffect(() => { if (ref.current) ref.current.scrollTop = 1e6; }, [lines.length]);
  const send = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    net.send({ t: 'chat', ch: S.party.value && ch === 'party' ? 'party' : 'lobby', text: t });
    setText('');
  };
  return (
    <div class="lobby-chat">
      <div class="chat-log" ref={ref}>
        {lines.length === 0 && <div class="chat-line muted">Say hi to other players in the hangar!</div>}
        {lines.map((l) => <div class={`chat-line ch-${l.ch}`} key={l.id}><b>{l.ch === 'party' ? '[PARTY] ' : ''}{l.from}:</b> {l.text}</div>)}
      </div>
      <form class="chat-form" onSubmit={send}>
        {S.party.value && <button type="button" class={`chat-ch ${ch}`} onClick={() => setCh(ch === 'lobby' ? 'party' : 'lobby')}>{ch === 'lobby' ? 'ALL' : 'PARTY'}</button>}
        <input value={text} maxLength={140} onInput={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') e.target.blur(); }} placeholder="Chat with the lobby…" />
      </form>
    </div>
  );
}

function EmoteBar() {
  const p = S.profile.value;
  const owned = itemsByCat('emote').filter((e) => p.inventory.includes(e.id));
  return (
    <div class="emote-bar" title="Emotes">
      {owned.slice(0, 8).map((e, i) => (
        <button key={e.id} class="emote-btn" onClick={() => { if (app.lobby) { app.lobby.avatar.playEmote(e.id); app.lobby.emoteT = 4; } net.send({ t: 'lobby.emote', id: e.id }); }}>
          <kbd>{i + 1}</kbd>{e.name}
        </button>
      ))}
    </div>
  );
}

const PANELS = {
  play: PlayPanel, armory: ArmoryPanel, locker: LockerPanel, shop: ShopPanel, inventory: InventoryPanel,
  missions: MissionsPanel, leaderboard: LeaderboardPanel, friends: FriendsPanel, settings: SettingsPanel, profile: ProfilePanel,
};

export function LobbyUI() {
  const p = S.profile.value;
  const panel = S.panel.value;
  const hint = S.interactHint.value;
  const P = panel && PANELS[panel];
  const daily = p.daily.canClaim;
  const missionsReady = p.missions.filter((m) => m.progress >= m.goal && !m.claimed).length;
  return (
    <div class={`screen lobby-ui ${panel ? 'has-panel' : ''}`}>
      <header class="topbar">
        <div class="topbar-left" onClick={() => app.closePanel()}><Logo size={34} /></div>
        <nav class="nav">
          {NAV.map((n) => (
            <button key={n.id} class={`nav-btn ${panel === n.id ? 'active' : ''}`} onClick={() => (panel === n.id ? app.closePanel() : app.openPanel(n.id))}>
              <Icon name={n.icon} size={16} /><span>{n.label}</span>
              {n.id === 'missions' && (daily || missionsReady > 0) && <i class="dot" />}
              {n.id === 'friends' && S.friends.value.some((f) => f.status === 'incoming') && <i class="dot" />}
            </button>
          ))}
        </nav>
        <div class="topbar-right">
          <button class="profile-chip" onClick={() => app.openPanel('profile')}>
            <div class="pc-name">{p.username}{p.guest && <span class="guest-tag">GUEST</span>}</div>
            <LevelBar p={p} />
          </button>
          <Credits value={p.credits} size="lg" />
          <button class="icon-btn" title="Settings" onClick={() => (panel === 'settings' ? app.closePanel() : app.openPanel('settings'))}><Icon name="gear" size={20} /></button>
        </div>
      </header>

      {!panel && (
        <>
          <div class="lobby-left">
            <PartyWidget />
            <Invites />
          </div>
          <div class="lobby-bottom-left"><LobbyChat /></div>
          <div class="lobby-bottom-center">
            {hint && <div class="interact-hint"><kbd>{keyLabel(S.settings.value.keys.interact)}</kbd> OPEN {hint}</div>}
            <EmoteBar />
            <div class="controls-hint">WASD MOVE · DRAG TO LOOK · SHIFT RUN · SPACE JUMP · 1–8 EMOTES</div>
          </div>
          <div class="lobby-bottom-right">
            <MMStatus />
            {S.mm.value.state !== 'searching' && (
              <button class="play-big" onClick={() => app.openPanel('play')}>
                <span class="pb-label">PLAY</span>
                <span class="pb-sub">{S.online.value} ONLINE</span>
              </button>
            )}
          </div>
          {daily && (
            <button class="daily-pop" onClick={() => app.openPanel('missions')}>
              <Icon name="gift" size={22} /><div><b>DAILY REWARD READY</b><span>Claim your free credits</span></div>
            </button>
          )}
        </>
      )}
      {panel && S.mm.value.state === 'searching' && <div class="mm-floating"><MMStatus /></div>}
      {P && <P key={panel} />}
    </div>
  );
}
