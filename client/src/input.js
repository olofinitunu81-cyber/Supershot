// Keyboard / mouse input with rebindable actions and raw pointer lock.
// On touch devices the on-screen controls (touch.js) feed the same state.
import { S } from './state.js';

export const TOUCH = typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)
  && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const fakeEvent = { preventDefault() {}, stopPropagation() {} };

class Input {
  constructor() {
    this.down = new Set();
    this.pressedQ = new Set();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.listeners = new Set();
    this.enabled = true;
    this.locked = false;
    this.target = null;
  }

  attach(target) {
    this.target = target;
    const kd = (e) => {
      if (this._isTyping(e)) return;
      if (e.code === 'Tab' || (e.code === 'Space' && this.locked)) e.preventDefault();
      if (this.locked && /^(Key[WASDCERFVQ]|Digit[1-9]|Space|ShiftLeft|ControlLeft|AltLeft)$/.test(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressedQ.add(e.code);
      this.down.add(e.code);
      for (const l of this.listeners) l('keydown', e.code, e);
    };
    const ku = (e) => {
      this.down.delete(e.code);
      for (const l of this.listeners) l('keyup', e.code, e);
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', () => { this.down.clear(); });
    const md = (e) => {
      const code = 'Mouse' + e.button;
      if (!this.down.has(code)) this.pressedQ.add(code);
      this.down.add(code);
      for (const l of this.listeners) l('mousedown', code, e);
    };
    const mu = (e) => {
      this.down.delete('Mouse' + e.button);
      for (const l of this.listeners) l('mouseup', 'Mouse' + e.button, e);
    };
    target.addEventListener('mousedown', md);
    window.addEventListener('mouseup', mu);
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // ignore absurd spikes some browsers emit when (re)locking
      if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    window.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === target;
      S.pointerLocked.value = this.locked;
      if (!this.locked) { this.down.delete('Mouse0'); this.down.delete('Mouse2'); }
      for (const l of this.listeners) l('lock', this.locked);
    });
  }

  _isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  _setLocked(v) {
    if (this.locked === v) return;
    this.locked = v;
    S.pointerLocked.value = v;
    if (!v) this.down.clear();
    for (const l of this.listeners) l('lock', v);
  }

  /** Press / release an input code from the on-screen controls. */
  press(code) {
    if (!code) return;
    if (!this.down.has(code)) this.pressedQ.add(code);
    this.down.add(code);
    for (const l of this.listeners) l(code.startsWith('Mouse') ? 'mousedown' : 'keydown', code, fakeEvent);
  }

  release(code) {
    if (!code || !this.down.has(code)) return;
    this.down.delete(code);
    for (const l of this.listeners) l(code.startsWith('Mouse') ? 'mouseup' : 'keyup', code, fakeEvent);
  }

  async lock() {
    if (TOUCH) { this._setLocked(true); return; }
    if (!this.target || this.locked) return;
    try {
      await this.target.requestPointerLock({ unadjustedMovement: S.settings.value.rawInput });
    } catch {
      try { await this.target.requestPointerLock(); } catch { /* user gesture required */ }
    }
  }

  unlock() {
    if (TOUCH) { this._setLocked(false); return; }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  isAction(action) {
    const code = S.settings.value.keys[action];
    return !!code && this.down.has(code);
  }

  /** True once per press of the action's key (consumes the press). */
  pressed(action) {
    const code = S.settings.value.keys[action];
    if (code && this.pressedQ.has(code)) { this.pressedQ.delete(code); return true; }
    return false;
  }

  key(code) { return this.down.has(code); }

  takeMouse() {
    const r = { dx: this.dx, dy: this.dy };
    this.dx = 0; this.dy = 0;
    return r;
  }

  takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  endFrame() {
    this.pressedQ.clear();
  }
}

export const input = new Input();
