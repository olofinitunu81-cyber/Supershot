// In-match overlays: click-to-play / pause menu and the end-of-match results screen.
import { useState, useEffect } from 'preact/hooks';
import { S } from '../../state.js';
import { app } from '../../app.js';
import { input, TOUCH } from '../../input.js';
import { Btn, Credits, Icon, Logo } from '../components.jsx';
import { SettingsPanel } from './settings.jsx';
import { MODES, TEAM_NAMES, MATCH } from '../../../../shared/config.js';
import { getMap } from '../../../../shared/maps/index.js';
import { levelFromXp } from '../../../../shared/progression.js';

function Pause() {
  const m = S.match.value;
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [settings, setSettings] = useState(false);
  if (!m) return null;
  const map = getMap(m.map);
  if (settings) return <div class="pause settings-overlay" onClick={(e) => e.stopPropagation()}><SettingsPanelWrap onClose={() => setSettings(false)} /></div>;
  return (
    <div class="pause">
      <div class="pause-card">
        <Logo size={46} />
        <div class="pause-meta"><b>{MODES[m.mode].name}</b><span>{map.name}{m.private ? ` · PRIVATE ${m.code}` : ''}</span></div>
        <button class="resume" onClick={() => { input.lock(); }}>
          <Icon name="play" size={26} /><span>{TOUCH ? 'TAP TO PLAY' : 'CLICK TO PLAY'}</span>
        </button>
        <div class="pause-actions">
          <Btn variant="secondary" icon="gear" onClick={() => setSettings(true)}>SETTINGS</Btn>
          {!confirmLeave ? <Btn variant="ghost" icon="door" onClick={() => setConfirmLeave(true)}>LEAVE MATCH</Btn> : (
            <div class="confirm-leave"><span>Leave now? You won't receive match rewards.</span><Btn variant="danger" small onClick={() => app.leaveMatch()}>LEAVE</Btn><Btn variant="ghost" small onClick={() => setConfirmLeave(false)}>STAY</Btn></div>
          )}
        </div>
        <div class="pause-help">
          <span><kbd>WASD</kbd> MOVE</span><span><kbd>SHIFT</kbd> SPRINT</span><span><kbd>C</kbd> CROUCH / SLIDE</span><span><kbd>SPACE</kbd> JUMP</span>
          <span><kbd>LMB</kbd> FIRE</span><span><kbd>RMB</kbd> AIM</span><span><kbd>R</kbd> RELOAD</span><span><kbd>V</kbd> MELEE</span><span><kbd>1-3</kbd> WEAPONS</span><span><kbd>TAB</kbd> SCORES</span><span><kbd>ENTER</kbd> CHAT</span>
        </div>
      </div>
    </div>
  );
}

function SettingsPanelWrap({ onClose }) {
  // reuse the settings panel; closing returns to the pause menu
  useEffect(() => {
    const prev = S.panel.value;
    S.panel.value = 'settings';
    const unsub = S.panel.subscribe((v) => { if (v === null) onClose(); });
    return () => { unsub(); if (S.panel.value === 'settings') S.panel.value = prev; };
  }, []);
  return <SettingsPanel />;
}

function CountUp({ to, dur = 1200 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    let raf;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur); setV(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{v.toLocaleString()}</>;
}

function EndScreen() {
  const e = S.matchEnd.value;
  const m = S.match.value;
  const [left, setLeft] = useState(MATCH.endDuration);
  useEffect(() => { const iv = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000); return () => clearInterval(iv); }, []);
  if (!e) return null;
  const info = e.info, you = e.you;
  const teams = MODES[info.mode].teams;
  const myTeam = m ? m.team : 0;
  const title = teams ? (info.winnerTeam === -1 ? 'DRAW' : you.won ? 'VICTORY' : 'DEFEAT') : you.place === 1 ? 'CHAMPION' : `#${you.place} PLACE`;
  const prof = e.profile;
  const lvAfter = levelFromXp(prof.xp);
  const mvp = info.board.find((b) => b.pid === info.mvp);
  return (
    <div class={`endscreen ${you.won ? 'win' : 'loss'}`}>
      <div class="end-title">
        <h1 data-text={title}>{title}</h1>
        {teams && <div class="end-teams"><span class="t0">{TEAM_NAMES[0]} {info.teamScores[0]}</span><span class="vs">—</span><span class="t1">{info.teamScores[1]} {TEAM_NAMES[1]}</span></div>}
        <div class="end-sub">{MODES[info.mode].name} · {getMap(info.map).name} · {info.reason === 'score' ? 'SCORE LIMIT REACHED' : 'TIME EXPIRED'}</div>
      </div>
      <div class="end-grid">
        <div class="end-board">
          <div class="eb-row head"><span>#</span><span>PLAYER</span><span>K</span><span>D</span><span>A</span><span>SCORE</span></div>
          {info.board.map((b) => (
            <div key={b.pid} class={`eb-row ${b.pid === you.pid ? 'me' : ''} ${teams ? (b.team === myTeam ? 'ally' : 'enemy') : ''}`}>
              <span>{b.place}</span><span class="nm">{b.pid === info.mvp && <Icon name="star" size={12} class="gold" />}{b.bot && <em class="bot">BOT</em>}{b.name}</span>
              <span>{b.kills}</span><span>{b.deaths}</span><span>{b.assists}</span><span>{b.score}</span>
            </div>
          ))}
        </div>
        <div class="end-rewards">
          {mvp && <div class="mvp"><Icon name="crown" size={22} /><div><span>MATCH MVP</span><b>{mvp.name}</b></div><small>{mvp.score} PTS</small></div>}
          <div class="reward-lines">
            {you.lines.map((l, i) => (
              <div class="rl" key={i} style={{ animationDelay: `${0.25 + i * 0.12}s` }}><span>{l.label}</span>{l.credits ? <b>+{l.credits}</b> : <b class="muted">—</b>}</div>
            ))}
          </div>
          <div class="reward-total"><span>CREDITS EARNED</span><Credits value={0} /><b class="ct"><CountUp to={you.credits} /></b></div>
          <div class="reward-xp"><span>+<CountUp to={you.xp} /> XP</span>
            <div class="xpb-track"><i style={{ width: `${lvAfter.needed ? (lvAfter.into / lvAfter.needed) * 100 : 100}%` }} /></div>
            <small>LEVEL {lvAfter.level}{you.levelAfter > you.levelBefore ? ` · LEVEL UP! +${you.levelBonus} CREDITS` : ''}</small>
          </div>
        </div>
      </div>
      <div class="end-actions">
        <span class="muted">RETURNING TO LOBBY IN {left}s</span>
        <Btn onClick={() => app.leaveMatch()} icon="door">RETURN TO LOBBY</Btn>
      </div>
    </div>
  );
}

export function MatchUI() {
  const ended = !!S.matchEnd.value;
  const paused = S.paused.value && !ended;
  return (
    <div class="screen match-ui">
      {paused && <Pause />}
      {ended && <EndScreen />}
    </div>
  );
}
