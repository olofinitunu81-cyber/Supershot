// Client settings persisted in localStorage (per device).

export const KEY_ACTIONS = [
  ['forward', 'Move forward'], ['back', 'Move back'], ['left', 'Strafe left'], ['right', 'Strafe right'],
  ['jump', 'Jump'], ['crouch', 'Crouch / slide'], ['sprint', 'Sprint'], ['fire', 'Fire'], ['ads', 'Aim down sights'],
  ['reload', 'Reload'], ['melee', 'Quick melee'], ['inspect', 'Inspect weapon'], ['primary', 'Primary weapon'],
  ['secondary', 'Secondary weapon'], ['meleeSlot', 'Melee weapon'], ['scoreboard', 'Scoreboard'], ['chat', 'Chat'],
  ['teamChat', 'Team chat'], ['interact', 'Interact (lobby)'],
];

export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', crouch: 'KeyC', sprint: 'ShiftLeft',
  fire: 'Mouse0', ads: 'Mouse2', reload: 'KeyR', melee: 'KeyV', inspect: 'KeyF', primary: 'Digit1',
  secondary: 'Digit2', meleeSlot: 'Digit3', scoreboard: 'Tab', chat: 'Enter', teamChat: 'KeyY', interact: 'KeyE',
};

export const QUALITY_PRESETS = {
  low: { label: 'LOW', pixelRatio: 0.85, shadows: 0, ao: 0, bloom: false, aa: 'none', msaa: 0, particles: 0.45, maxLights: 3, aoBake: true, weather: 0.35, decals: 24 },
  medium: { label: 'MEDIUM', pixelRatio: 1.0, shadows: 1024, ao: 0, bloom: true, aa: 'fxaa', msaa: 0, particles: 0.75, maxLights: 8, aoBake: true, weather: 0.7, decals: 48 },
  high: { label: 'HIGH', pixelRatio: 1.25, shadows: 2048, ao: 0.5, bloom: true, aa: 'smaa', msaa: 0, particles: 1, maxLights: 14, aoBake: true, weather: 1, decals: 80 },
  ultra: { label: 'ULTRA', pixelRatio: 2.0, shadows: 4096, ao: 1, bloom: true, aa: 'smaa', msaa: 4, particles: 1.35, maxLights: 20, aoBake: true, weather: 1.3, decals: 128 },
};

export const FPS_OPTIONS = [
  { v: 0, label: 'DISPLAY (VSYNC)' }, { v: 30, label: '30' }, { v: 60, label: '60' }, { v: 120, label: '120' },
  { v: 144, label: '144' }, { v: 165, label: '165' }, { v: 240, label: '240' }, { v: -1, label: 'UNLIMITED' },
];

export const DEFAULT_SETTINGS = {
  quality: 'high',
  fpsCap: 0,
  renderScale: 1,
  fov: 100,
  sensitivity: 1,
  adsSensitivity: 0.85,
  invertY: false,
  rawInput: true,
  toggleCrouch: false,
  toggleAds: false,
  autoSprint: false,
  masterVolume: 0.8,
  musicVolume: 0.45,
  sfxVolume: 0.9,
  uiVolume: 0.7,
  announcerVolume: 0.9,
  announcerVoice: true,
  crosshairStyle: 'cross',
  crosshairColor: '#19e6ff',
  crosshairSize: 1,
  crosshairDynamic: true,
  showFps: true,
  showPing: true,
  damageNumbers: true,
  hitSound: true,
  viewBob: 1,
  bloomOverride: null,
  keys: { ...DEFAULT_KEYS },
};

const STORE_KEY = 'supershot.settings.v1';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return detectDefaults();
    const s = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...s, keys: { ...DEFAULT_KEYS, ...(s.keys || {}) } };
  } catch {
    return detectDefaults();
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

function detectDefaults() {
  const s = { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS } };
  // pick a sensible starting preset from device hints
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (mobile || mem <= 4 || cores <= 4) s.quality = 'medium';
  if (mobile && navigator.maxTouchPoints > 0) { s.quality = 'low'; s.fpsCap = 60; }
  return s;
}

export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Mouse')) return ['LMB', 'MMB', 'RMB', 'MB4', 'MB5'][+code.slice(5)] || code;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = { Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', Tab: 'TAB', Enter: 'ENTER', Escape: 'ESC', CapsLock: 'CAPS', Backquote: '`' };
  return map[code] || code.replace('Arrow', '').toUpperCase();
}
