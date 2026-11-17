// Settings: graphics, controls, keybinds, audio, gameplay/crosshair, account.
import { useState, useEffect } from 'preact/hooks';
import { S, updateSettings } from '../../state.js';
import { app } from '../../app.js';
import { Panel, Btn, Tabs, Slider, Toggle, Choice } from '../components.jsx';
import { QUALITY_PRESETS, FPS_OPTIONS, KEY_ACTIONS, DEFAULT_KEYS, keyLabel, DEFAULT_SETTINGS } from '../../settings.js';
import { audio } from '../../engine/audio.js';

function KeyBinds() {
  const s = S.settings.value;
  const [listening, setListening] = useState(null);
  useEffect(() => {
    if (!listening) return;
    const onKey = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.code !== 'Escape') updateSettings({ keys: { ...S.settings.value.keys, [listening]: e.code } });
      setListening(null);
    };
    const onMouse = (e) => {
      e.preventDefault(); e.stopPropagation();
      updateSettings({ keys: { ...S.settings.value.keys, [listening]: 'Mouse' + e.button } });
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    setTimeout(() => window.addEventListener('mousedown', onMouse, true), 50);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('mousedown', onMouse, true); };
  }, [listening]);
  const dupes = new Set(Object.values(s.keys).filter((v, i, a) => a.indexOf(v) !== i));
  return (
    <div class="keybinds">
      {KEY_ACTIONS.map(([id, label]) => (
        <div class="kb-row" key={id}>
          <span>{label}</span>
          <button class={`kb-key ${listening === id ? 'listening' : ''} ${dupes.has(s.keys[id]) ? 'dupe' : ''}`} onClick={() => setListening(id)}>
            {listening === id ? 'PRESS A KEY…' : keyLabel(s.keys[id])}
          </button>
        </div>
      ))}
      <Btn variant="ghost" small onClick={() => updateSettings({ keys: { ...DEFAULT_KEYS } })}>RESET TO DEFAULTS</Btn>
    </div>
  );
}

function CrosshairPreview() {
  const s = S.settings.value;
  return (
    <div class="xhair-preview">
      <div class="hud-cross" data-style={s.crosshairStyle} style={{ '--cc': s.crosshairColor, '--cs': s.crosshairSize, '--gap': '8px', position: 'relative', left: 'auto', top: 'auto', transform: 'none' }}>
        <i class="c-t" /><i class="c-b" /><i class="c-l" /><i class="c-r" /><i class="c-dot" /><i class="c-circle" />
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const s = S.settings.value;
  const [tab, setTab] = useState('graphics');
  const set = (patch) => updateSettings(patch);
  const refresh = app.engine ? app.engine.refreshHz : 60;
  return (
    <Panel title="SETTINGS" sub={`DISPLAY ${refresh} HZ · ${app.engine ? app.engine.fps : 0} FPS`} onClose={() => (app.match ? (S.panel.value = null) : app.closePanel())}>
      <Tabs tabs={[{ id: 'graphics', label: 'GRAPHICS' }, { id: 'controls', label: 'CONTROLS' }, { id: 'keys', label: 'KEYBINDS' }, { id: 'audio', label: 'AUDIO' }, { id: 'gameplay', label: 'GAMEPLAY' }, { id: 'account', label: 'ACCOUNT' }]} value={tab} onChange={setTab} small />
      {tab === 'graphics' && (
        <div class="settings-body">
          <Choice label="QUALITY PRESET" value={s.quality} options={Object.entries(QUALITY_PRESETS).map(([k, v]) => ({ v: k, label: v.label }))} onChange={(v) => set({ quality: v })} />
          <div class="preset-desc muted small">
            {{ low: 'No shadows or post-processing. Maximum frame rate on any hardware.', medium: 'Soft shadows, bloom and FXAA.', high: 'High-res shadows, ambient occlusion, bloom and SMAA.', ultra: '4K shadows, full-res ambient occlusion, MSAA ×4 + SMAA and extra particles.' }[s.quality]}
          </div>
          <Choice label="FPS LIMIT" value={s.fpsCap} options={FPS_OPTIONS} onChange={(v) => set({ fpsCap: v })} />
          <div class="preset-desc muted small">Detected display refresh: <b>{refresh} Hz</b>. Limits above your refresh rate (or UNLIMITED) render as fast as possible for the lowest input latency.</div>
          <Slider label="RENDER SCALE" min={0.5} max={1} step={0.05} value={s.renderScale} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ renderScale: v })} />
          <Slider label="FIELD OF VIEW" min={70} max={120} step={1} value={s.fov} format={(v) => `${v}°`} onChange={(v) => set({ fov: v })} />
          <Choice label="BLOOM" value={s.bloomOverride} options={[{ v: null, label: 'PRESET' }, { v: true, label: 'ON' }, { v: false, label: 'OFF' }]} onChange={(v) => set({ bloomOverride: v })} />
          <Slider label="VIEW BOB" min={0} max={1} step={0.05} value={s.viewBob} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ viewBob: v })} />
          <Toggle label="SHOW FPS" value={s.showFps} onChange={(v) => set({ showFps: v })} />
          <Toggle label="SHOW PING" value={s.showPing} onChange={(v) => set({ showPing: v })} />
        </div>
      )}
      {tab === 'controls' && (
        <div class="settings-body">
          <Slider label="MOUSE SENSITIVITY" min={0.1} max={4} step={0.01} value={s.sensitivity} format={(v) => v.toFixed(2)} onChange={(v) => set({ sensitivity: v })} />
          <Slider label="ADS SENSITIVITY" min={0.2} max={1.5} step={0.01} value={s.adsSensitivity} format={(v) => `×${v.toFixed(2)}`} onChange={(v) => set({ adsSensitivity: v })} />
          <Toggle label="INVERT Y AXIS" value={s.invertY} onChange={(v) => set({ invertY: v })} />
          <Toggle label="RAW MOUSE INPUT" hint="Bypasses OS acceleration (where supported)" value={s.rawInput} onChange={(v) => set({ rawInput: v })} />
          <Toggle label="TOGGLE CROUCH" value={s.toggleCrouch} onChange={(v) => set({ toggleCrouch: v })} />
          <Toggle label="TOGGLE AIM" value={s.toggleAds} onChange={(v) => set({ toggleAds: v })} />
          <Toggle label="AUTO SPRINT" value={s.autoSprint} onChange={(v) => set({ autoSprint: v })} />
        </div>
      )}
      {tab === 'keys' && <KeyBinds />}
      {tab === 'audio' && (
        <div class="settings-body">
          <Slider label="MASTER" min={0} max={1} value={s.masterVolume} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ masterVolume: v })} />
          <Slider label="EFFECTS" min={0} max={1} value={s.sfxVolume} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ sfxVolume: v })} />
          <Slider label="MUSIC" min={0} max={1} value={s.musicVolume} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ musicVolume: v })} />
          <Slider label="INTERFACE" min={0} max={1} value={s.uiVolume} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => { set({ uiVolume: v }); audio.ui('uiClick'); }} />
          <Slider label="ANNOUNCER" min={0} max={1} value={s.announcerVolume} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ announcerVolume: v })} />
          <Toggle label="ANNOUNCER VOICE" value={s.announcerVoice} onChange={(v) => set({ announcerVoice: v })} />
          <Btn variant="secondary" small onClick={() => { audio.unlock(); audio.announce('Supershot'); }}>TEST ANNOUNCER</Btn>
        </div>
      )}
      {tab === 'gameplay' && (
        <div class="settings-body">
          <CrosshairPreview />
          <Choice label="CROSSHAIR" value={s.crosshairStyle} options={[{ v: 'cross', label: 'CROSS' }, { v: 'dot', label: 'DOT' }, { v: 'plusdot', label: 'CROSS + DOT' }, { v: 'circle', label: 'CIRCLE' }, { v: 'tee', label: 'T-SHAPE' }]} onChange={(v) => set({ crosshairStyle: v })} />
          <Choice label="COLOR" value={s.crosshairColor} options={['#19e6ff', '#ffffff', '#3dff6a', '#ffd400', '#ff2fa6', '#ff3b3b'].map((c) => ({ v: c, label: <i class="cc-dot" style={{ background: c }} /> }))} onChange={(v) => set({ crosshairColor: v })} />
          <Slider label="SIZE" min={0.6} max={1.8} step={0.05} value={s.crosshairSize} format={(v) => `×${v.toFixed(2)}`} onChange={(v) => set({ crosshairSize: v })} />
          <Toggle label="DYNAMIC SPREAD" value={s.crosshairDynamic} onChange={(v) => set({ crosshairDynamic: v })} />
          <Toggle label="DAMAGE NUMBERS" value={s.damageNumbers} onChange={(v) => set({ damageNumbers: v })} />
          <Toggle label="HITMARKER SOUND" value={s.hitSound} onChange={(v) => set({ hitSound: v })} />
        </div>
      )}
      {tab === 'account' && (
        <div class="settings-body">
          <p>Signed in as <b>{S.profile.value.username}</b>{S.profile.value.guest ? ' (guest)' : ''}.</p>
          {S.profile.value.guest && <Btn onClick={() => app.openPanel('profile')}>SECURE GUEST ACCOUNT</Btn>}
          <Btn variant="ghost" onClick={() => updateSettings({ ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS } })}>RESET ALL SETTINGS</Btn>
          <Btn variant="danger" icon="door" onClick={() => app.logout()}>SIGN OUT</Btn>
        </div>
      )}
    </Panel>
  );
}
