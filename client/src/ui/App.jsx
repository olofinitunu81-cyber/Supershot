// Root UI component.
import { S } from '../state.js';
import { Boot, Auth } from './screens/entry.jsx';
import { LobbyUI } from './screens/lobbyui.jsx';
import { MatchUI } from './screens/matchui.jsx';
import { Btn, Icon } from './components.jsx';

function Toasts() {
  return (
    <div class="toasts">
      {S.toasts.value.map((t) => (
        <div key={t.id} class={`toast toast-${t.kind}`}>
          <Icon name={t.kind === 'error' ? 'close' : t.kind === 'reward' ? 'credits' : t.kind === 'invite' ? 'users' : 'bolt'} size={16} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

function Modal() {
  const m = S.modal.value;
  if (!m) return null;
  return (
    <div class="modal-back">
      <div class="modal">
        <h2>{m.title}</h2>
        <p>{m.text}</p>
        <Btn onClick={() => { S.modal.value = null; m.onOk && m.onOk(); }}>{m.ok || 'OK'}</Btn>
      </div>
    </div>
  );
}

export function App() {
  const screen = S.screen.value;
  return (
    <>
      {screen === 'boot' && <Boot />}
      {screen === 'loading' && <Boot />}
      {screen === 'auth' && <Auth />}
      {screen === 'lobby' && S.profile.value && <LobbyUI />}
      {screen === 'match' && <MatchUI />}
      {S.conn.value === 'closed' && screen !== 'boot' && <div class="conn-banner">CONNECTION LOST — RECONNECTING…</div>}
      <Toasts />
      <Modal />
    </>
  );
}
