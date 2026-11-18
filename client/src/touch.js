// On-screen controls for phones and tablets. Left thumb: move stick (push to the edge to
// sprint). Right thumb: drag anywhere to look; buttons to fire, aim, jump and more. They
// drive the same input state as keyboard and mouse, so the game code is shared.
import { input, TOUCH } from './input.js';
import { S } from './state.js';

const LOOK_GAIN = 2.6; // touch pixels → mouse counts
const STICK_R = 56; // stick travel in px
const key = (action) => S.settings.value.keys[action];

class TouchControls {
  init(app) {
    if (!TOUCH || this.el) return;
    this.app = app;
    document.documentElement.classList.add('touch');
    const el = document.createElement('div');
    el.id = 'touch';
    el.dataset.mode = 'off';
    el.innerHTML = `
<div class="tc-look"></div>
<div class="tc-stickzone"></div>
<div class="tc-stick"><i></i></div>
<div class="tc-pad tc-match">
  <button class="tc-b tc-fire" data-act="fire" data-look>FIRE</button>
  <button class="tc-b tc-ads" data-act="ads" data-look>AIM</button>
  <button class="tc-b tc-jump" data-act="jump">JUMP</button>
  <button class="tc-b tc-crouch" data-act="crouch">CROUCH</button>
  <button class="tc-b tc-reload" data-act="reload">RELOAD</button>
  <button class="tc-b tc-swap" data-act="swap">SWAP</button>
  <button class="tc-b tc-melee" data-act="melee">MELEE</button>
</div>
<div class="tc-top tc-match">
  <button class="tc-b tc-small" data-act="scoreboard">SCORES</button>
  <button class="tc-b tc-small" data-act="pause">PAUSE</button>
</div>
<div class="tc-pad tc-lobby">
  <button class="tc-b tc-jump" data-act="jump">JUMP</button>
  <button class="tc-b tc-use" data-act="interact">USE</button>
</div>`;
    document.body.appendChild(el);
    const rot = document.createElement('div');
    rot.id = 'rotate-hint';
    rot.innerHTML = '<b>SUPERSHOT</b><span>Turn your phone sideways to play.</span>';
    document.body.appendChild(rot);
    this.el = el;
    this.stick = el.querySelector('.tc-stick');
    this.knob = this.stick.querySelector('i');
    this.ptrs = new Map();
    this.moveKeys = new Set();
    this.mode = 'off';
    el.addEventListener('pointerdown', (e) => this._down(e));
    window.addEventListener('pointermove', (e) => this._move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', (e) => this._up(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this._home());
    this._home();
    const upd = () => this._update();
    for (const sig of [S.screen, S.paused, S.panel, S.matchEnd, S.interactHint, S.modal]) sig.subscribe(upd);
    // go fullscreen on the first tap where the browser allows it (hides the address bar)
    window.addEventListener('pointerup', () => {
      const d = document.documentElement;
      if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }, { once: true });
  }

  _update() {
    const scr = S.screen.value;
    let mode = 'off';
    if (scr === 'match' && !S.paused.value && !S.matchEnd.value) mode = 'match';
    else if (scr === 'lobby' && !S.panel.value && !S.modal.value) mode = 'lobby';
    if (mode !== this.mode) { this._releaseAll(); this.mode = mode; }
    this.el.dataset.mode = mode;
    this.el.classList.toggle('can-use', !!S.interactHint.value);
  }

  _home() {
    if (!this.stick || this.ptrs && [...this.ptrs.values()].some((p) => p.kind === 'stick')) return;
    this.stick.style.transform = `translate(${Math.max(96, window.innerWidth * 0.13)}px, ${window.innerHeight - 100}px)`;
  }

  _down(e) {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    const b = e.target.closest('[data-act]');
    if (b) {
      b.classList.add('on');
      this.ptrs.set(e.pointerId, { kind: 'btn', act: b.dataset.act, b, x: e.clientX, y: e.clientY, look: b.hasAttribute('data-look') });
      this._act(b.dataset.act, true);
      return;
    }
    if (e.target.closest('.tc-stickzone')) {
      this.ptrs.set(e.pointerId, { kind: 'stick', ox: e.clientX, oy: e.clientY });
      this.stick.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.stick.classList.add('on');
      this._stick(0, 0);
      return;
    }
    this.ptrs.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
  }

  _move(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.kind === 'stick') {
      let dx = e.clientX - p.ox, dy = e.clientY - p.oy;
      const l = Math.hypot(dx, dy);
      if (l > STICK_R * 1.25) { // drag the base along so the thumb never runs out of room
        const k = 1 - (STICK_R * 1.25) / l;
        p.ox += dx * k; p.oy += dy * k;
        this.stick.style.transform = `translate(${p.ox}px, ${p.oy}px)`;
        dx = e.clientX - p.ox; dy = e.clientY - p.oy;
      }
      this._stick(Math.max(-1, Math.min(1, dx / STICK_R)), Math.max(-1, Math.min(1, dy / STICK_R)));
      return;
    }
    if (p.kind === 'look' || p.look) {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.mode === 'match') { input.dx += dx * LOOK_GAIN; input.dy += dy * LOOK_GAIN; }
      else if (this.mode === 'lobby' && this.app.lobby) this.app.lobby.touchLook(dx, dy);
    }
  }

  _up(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (p.kind === 'stick') { this._stick(0, 0); this.stick.classList.remove('on'); this._home(); }
    else if (p.kind === 'btn') { p.b.classList.remove('on'); this._act(p.act, false); }
  }

  _stick(nx, ny) {
    this.knob.style.transform = `translate(${nx * STICK_R}px, ${ny * STICK_R}px)`;
    const want = new Set();
    const l = Math.hypot(nx, ny);
    if (l > 0.25) {
      const ax = nx / l, ay = ny / l;
      if (ay < -0.38) want.add(key('forward'));
      if (ay > 0.38) want.add(key('back'));
      if (ax < -0.38) want.add(key('left'));
      if (ax > 0.38) want.add(key('right'));
      if (l > 0.92 && ay < -0.7) want.add(key('sprint'));
    }
    for (const k of this.moveKeys) if (!want.has(k)) input.release(k);
    for (const k of want) if (!this.moveKeys.has(k)) input.press(k);
    this.moveKeys = want;
  }

  _act(act, on) {
    if (act === 'swap') { if (on) input.wheel += 1; return; }
    if (act === 'pause') { if (on) input.unlock(); return; }
    if (on) input.press(key(act)); else input.release(key(act));
  }

  _releaseAll() {
    for (const p of this.ptrs.values()) if (p.kind === 'btn') { p.b.classList.remove('on'); this._act(p.act, false); }
    this.ptrs.clear();
    this._stick(0, 0);
    this.stick.classList.remove('on');
    this._home();
  }
}

export const touch = new TouchControls();
