// Global reactive state (Preact signals) shared by UI and game systems.
import { signal } from '@preact/signals';
import { loadSettings, saveSettings } from './settings.js';

export const S = {
  conn: signal('connecting'),
  screen: signal('boot'),
  panel: signal(null),
  panelArg: signal(null),
  profile: signal(null),
  friends: signal([]),
  party: signal(null),
  invites: signal([]),
  room: signal(null),
  mm: signal({ state: 'idle' }),
  online: signal(0),
  toasts: signal([]),
  chat: signal([]),
  loading: signal({ progress: 0, text: 'INITIALIZING' }),
  match: signal(null),
  matchEnd: signal(null),
  modal: signal(null),
  lb: signal({}),
  settings: signal(loadSettings()),
  pointerLocked: signal(false),
  interactHint: signal(null),
  paused: signal(false),
  authError: signal(''),
};

let toastId = 1;
export function toast(text, kind = 'info', ms = 3200) {
  const t = { id: toastId++, text, kind };
  S.toasts.value = [...S.toasts.value, t].slice(-5);
  setTimeout(() => { S.toasts.value = S.toasts.value.filter((x) => x.id !== t.id); }, ms);
}

export function updateSettings(patch) {
  const next = { ...S.settings.value, ...patch };
  S.settings.value = next;
  saveSettings(next);
}

export function pushChat(msg) {
  S.chat.value = [...S.chat.value.slice(-60), { ...msg, at: Date.now(), id: Math.random() }];
}

export function owns(id) {
  const p = S.profile.value;
  return !!p && p.inventory.includes(id);
}
