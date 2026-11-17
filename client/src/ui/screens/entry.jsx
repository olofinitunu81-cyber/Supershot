// Boot/loading and authentication screens.
import { useState } from 'preact/hooks';
import { S } from '../../state.js';
import { app } from '../../app.js';
import { Logo, Btn, Tabs } from '../components.jsx';
import { LIMITS } from '../../../../shared/config.js';

export function Boot() {
  const l = S.loading.value;
  return (
    <div class="screen boot">
      <div class="boot-bg" />
      <div class="boot-center">
        <Logo size={110} animate sub />
        <div class="boot-bar"><i style={{ transform: `scaleX(${l.progress})` }} /></div>
        <div class="boot-text">{l.text}<span class="dots" /></div>
      </div>
      <div class="boot-foot">v1.0 · BUILT FOR 60–240 HZ · {S.conn.value === 'closed' ? 'RECONNECTING…' : 'ONLINE'}</div>
    </div>
  );
}

export function Auth() {
  const [tab, setTab] = useState('play');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const err = S.authError.value;
  const submit = (e) => {
    e && e.preventDefault();
    S.authError.value = '';
    if (tab === 'login') app.login(user, pass);
    else app.register(user, pass);
    setBusy(true);
    setTimeout(() => setBusy(false), 2500);
  };
  return (
    <div class="screen auth">
      <div class="auth-bg"><div class="grid-floor" /><div class="auth-glow" /></div>
      <div class="auth-wrap">
        <div class="auth-hero">
          <Logo size={120} animate sub />
          <ul class="auth-feats">
            <li><b>20</b> GUNS · <b>10</b> MELEE</li>
            <li>REAL-TIME ONLINE MATCHES</li>
            <li>TEAM DEATHMATCH · FREE FOR ALL</li>
            <li>CUSTOM AVATARS · CAMOS · CREDITS</li>
          </ul>
        </div>
        <div class="auth-card">
          <Tabs tabs={[{ id: 'play', label: 'QUICK START' }, { id: 'login', label: 'SIGN IN' }, { id: 'register', label: 'CREATE ACCOUNT' }]} value={tab} onChange={(t) => { setTab(t); S.authError.value = ''; }} />
          {tab === 'play' ? (
            <div class="auth-body">
              <p class="muted">Jump straight in with a guest account. You can claim it with a username and password any time from Settings to keep your progress.</p>
              <Btn variant="primary" wide icon="play" onClick={() => app.guest()}>PLAY AS GUEST</Btn>
              <div class="or"><span>OR</span></div>
              <Btn variant="ghost" wide onClick={() => setTab('register')}>CREATE AN ACCOUNT</Btn>
            </div>
          ) : (
            <form class="auth-body" onSubmit={submit}>
              <label class="field"><span>USERNAME</span>
                <input value={user} maxLength={LIMITS.usernameMax} autoComplete="username" onInput={(e) => setUser(e.target.value)} placeholder="3–16 letters, numbers, _" />
              </label>
              <label class="field"><span>PASSWORD</span>
                <input type="password" value={pass} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} onInput={(e) => setPass(e.target.value)} placeholder={tab === 'register' ? `At least ${LIMITS.passwordMin} characters` : ''} />
              </label>
              {err && <div class="form-err">{err}</div>}
              <Btn variant="primary" wide type="submit" disabled={busy || !user || !pass} icon={tab === 'login' ? 'door' : 'plus'}>{tab === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}</Btn>
              {tab === 'register' && <p class="muted small">New accounts start with <b class="cyan">1,000 CREDITS</b>.</p>}
            </form>
          )}
        </div>
      </div>
      <div class="auth-foot">{S.conn.value === 'open' ? <span class="ok">● SERVERS ONLINE</span> : <span class="warn">● CONNECTING…</span>}</div>
    </div>
  );
}
