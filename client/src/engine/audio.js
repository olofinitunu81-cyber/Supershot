// Procedural audio: every sound is synthesized with Web Audio and pre-rendered
// to buffers at load. Includes positional playback, a synthwave music
// sequencer and a speech-synthesis announcer.
import { GUNS, MELEE } from '../../../shared/weapons.js';

const SR = 44100;

function distCurve(amount) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; c[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x)); }
  return c;
}

function noise(oc, dur, color = 'white') {
  const len = Math.ceil(dur * oc.sampleRate);
  const b = oc.createBuffer(1, len, oc.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  const s = oc.createBufferSource();
  s.buffer = b;
  return s;
}

function envGain(oc, t0, attack, decay, peak = 1, curve = 'exp') {
  const g = oc.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  else g.gain.linearRampToValueAtTime(0.0001, t0 + attack + decay);
  return g;
}

function filter(oc, type, freq, q = 0.7) {
  const f = oc.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  return f;
}

function impulse(oc, dur = 1.2, decay = 3) {
  const len = Math.ceil(dur * oc.sampleRate);
  const b = oc.createBuffer(2, len, oc.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

async function render(dur, build, channels = 2) {
  const oc = new OfflineAudioContext(channels, Math.ceil(dur * SR), SR);
  build(oc, oc.destination);
  return oc.startRendering();
}

// ───────────── sound recipes ─────────────
function gunshot(p) {
  return (oc, out) => {
    const pitch = p.pitch || 1;
    const master = oc.createGain(); master.gain.value = (p.gain || 1) * 0.9; master.connect(out);
    const shaper = oc.createWaveShaper(); shaper.curve = distCurve(p.suppressed ? 4 : 22); shaper.connect(master);
    const verb = oc.createConvolver(); verb.buffer = impulse(oc, 0.6 + (p.tail || 0.5), 3.2);
    const verbGain = oc.createGain(); verbGain.gain.value = p.suppressed ? 0.05 : 0.22; verb.connect(verbGain); verbGain.connect(master);
    if (!p.suppressed) {
      const n1 = noise(oc, 0.06);
      const hp = filter(oc, 'highpass', 2600 * pitch);
      const g1 = envGain(oc, 0, 0.0008, 0.025 + 0.03 * (p.crack || 0.5), 1.4 * (p.crack || 0.5) + 0.3);
      n1.connect(hp); hp.connect(g1); g1.connect(shaper); n1.start(0);
    }
    const n2 = noise(oc, 0.6);
    const bp = filter(oc, p.suppressed ? 'lowpass' : 'bandpass', (p.body || 1500) * (p.suppressed ? 0.7 : 1), p.suppressed ? 0.6 : 0.9);
    const g2 = envGain(oc, 0, 0.0015, p.decay || 0.12, p.suppressed ? 0.7 : 1.7);
    n2.connect(bp); bp.connect(g2); g2.connect(shaper); g2.connect(verb); n2.start(0);
    const o = oc.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime((p.thump || 100) * 2.2, 0);
    o.frequency.exponentialRampToValueAtTime((p.thump || 100) * 0.45, 0.14);
    const g3 = envGain(oc, 0, 0.001, 0.16, p.suppressed ? 0.6 : 1.3);
    o.connect(g3); g3.connect(shaper); o.start(0); o.stop(0.3);
    if (!p.suppressed) {
      const n3 = noise(oc, (p.tail || 0.5) + 0.3, 'brown');
      const lp = filter(oc, 'lowpass', 900 * pitch);
      const g4 = envGain(oc, 0.01, 0.02, p.tail || 0.5, 0.45);
      n3.connect(lp); lp.connect(g4); g4.connect(master); g4.connect(verb); n3.start(0);
    }
    if (p.energy) {
      const [f0, f1, d] = p.energy;
      const e = oc.createOscillator(); e.type = 'sawtooth';
      e.frequency.setValueAtTime(f0, 0); e.frequency.exponentialRampToValueAtTime(f1, d);
      const lp = filter(oc, 'lowpass', 4000);
      const g5 = envGain(oc, 0, 0.002, d, 0.55);
      e.connect(lp); lp.connect(g5); g5.connect(master); g5.connect(verb); e.start(0); e.stop(d + 0.05);
      const e2 = oc.createOscillator(); e2.type = 'square';
      e2.frequency.setValueAtTime(f0 * 1.5, 0); e2.frequency.exponentialRampToValueAtTime(f1 * 1.5, d * 0.7);
      const g6 = envGain(oc, 0, 0.002, d * 0.7, 0.18);
      e2.connect(g6); g6.connect(master); e2.start(0); e2.stop(d);
    }
  };
}

function click(freq = 3000, dur = 0.04, gain = 0.6, q = 4) {
  return (oc, out) => {
    const n = noise(oc, dur + 0.02);
    const f = filter(oc, 'bandpass', freq, q);
    const g = envGain(oc, 0, 0.0008, dur, gain);
    n.connect(f); f.connect(g); g.connect(out); n.start(0);
    const o = oc.createOscillator(); o.frequency.value = freq * 0.25;
    const g2 = envGain(oc, 0, 0.001, dur * 0.6, gain * 0.3);
    o.connect(g2); g2.connect(out); o.start(0); o.stop(dur + 0.02);
  };
}

function slide(f0, f1, dur, gain = 0.4) {
  return (oc, out) => {
    const n = noise(oc, dur + 0.05);
    const f = filter(oc, 'bandpass', f0, 2);
    f.frequency.linearRampToValueAtTime(f1, dur);
    const g = envGain(oc, 0, 0.01, dur, gain, 'lin');
    n.connect(f); f.connect(g); g.connect(out); n.start(0);
  };
}

function seq(...parts) {
  // parts: [time, recipe]
  return (oc, out) => {
    for (const [t, recipe] of parts) {
      const g = oc.createGain();
      g.connect(out);
      const delayed = oc.createDelay(2);
      delayed.delayTime.value = t;
      delayed.connect(g);
      recipe(oc, delayed);
    }
  };
}

function footstep(kind) {
  return (oc, out) => {
    const n = noise(oc, 0.15);
    const base = kind === 'metal' ? 1800 : kind === 'snow' ? 900 : kind === 'sand' ? 1300 : 600;
    const f = filter(oc, kind === 'metal' ? 'bandpass' : 'lowpass', base * (0.85 + Math.random() * 0.3), kind === 'metal' ? 6 : 0.8);
    const g = envGain(oc, 0, 0.003, kind === 'snow' ? 0.12 : 0.07, kind === 'metal' ? 0.5 : 0.8);
    n.connect(f); f.connect(g); g.connect(out); n.start(0);
    const o = oc.createOscillator(); o.frequency.setValueAtTime(kind === 'metal' ? 320 : 120, 0); o.frequency.exponentialRampToValueAtTime(60, 0.06);
    const g2 = envGain(oc, 0, 0.002, 0.06, 0.5);
    o.connect(g2); g2.connect(out); o.start(0); o.stop(0.1);
  };
}

function tone(type, f0, f1, dur, gain = 0.4, attack = 0.005) {
  return (oc, out) => {
    const o = oc.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, 0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, dur);
    const g = envGain(oc, 0, attack, dur, gain);
    o.connect(g); g.connect(out); o.start(0); o.stop(dur + 0.05);
  };
}

function chord(freqs, dur, type = 'triangle', gain = 0.2, stagger = 0) {
  return (oc, out) => {
    freqs.forEach((f, i) => {
      const o = oc.createOscillator(); o.type = type; o.frequency.value = f;
      const t0 = i * stagger;
      const g = envGain(oc, t0, 0.01, dur, gain);
      o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
    });
  };
}

function explosion() {
  return (oc, out) => {
    const master = oc.createGain(); master.gain.value = 1.1; master.connect(out);
    const sh = oc.createWaveShaper(); sh.curve = distCurve(30); sh.connect(master);
    const n = noise(oc, 2.0, 'brown');
    const lp = filter(oc, 'lowpass', 1400); lp.frequency.exponentialRampToValueAtTime(200, 1.4);
    const g = envGain(oc, 0, 0.004, 1.6, 2.2);
    n.connect(lp); lp.connect(g); g.connect(sh); n.start(0);
    const o = oc.createOscillator(); o.frequency.setValueAtTime(120, 0); o.frequency.exponentialRampToValueAtTime(28, 0.6);
    const g2 = envGain(oc, 0, 0.002, 0.7, 1.6);
    o.connect(g2); g2.connect(sh); o.start(0); o.stop(0.8);
    const n2 = noise(oc, 0.2);
    const hp = filter(oc, 'highpass', 2000);
    const g3 = envGain(oc, 0, 0.001, 0.12, 0.9);
    n2.connect(hp); hp.connect(g3); g3.connect(master); n2.start(0);
  };
}

function whoosh(rate = 1, hum = 0) {
  return (oc, out) => {
    const n = noise(oc, 0.4);
    const f = filter(oc, 'bandpass', 500 * rate, 1.4);
    f.frequency.setValueAtTime(400 * rate, 0);
    f.frequency.exponentialRampToValueAtTime(2200 * rate, 0.12);
    f.frequency.exponentialRampToValueAtTime(600 * rate, 0.3);
    const g = oc.createGain();
    g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.7, 0.1); g.gain.exponentialRampToValueAtTime(0.0001, 0.32);
    n.connect(f); f.connect(g); g.connect(out); n.start(0);
    if (hum) {
      const o = oc.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(hum, 0); o.frequency.linearRampToValueAtTime(hum * 1.6, 0.12); o.frequency.linearRampToValueAtTime(hum, 0.3);
      const lp = filter(oc, 'lowpass', 1200);
      const g2 = envGain(oc, 0, 0.03, 0.3, 0.3);
      o.connect(lp); lp.connect(g2); g2.connect(out); o.start(0); o.stop(0.4);
    }
  };
}

function meleeHit(kind) {
  return (oc, out) => {
    const n = noise(oc, 0.2);
    const f = filter(oc, kind === 'energy' ? 'highpass' : 'lowpass', kind === 'energy' ? 1800 : kind === 'chop' ? 700 : 1400);
    const g = envGain(oc, 0, 0.001, kind === 'chop' ? 0.18 : 0.1, 1.2);
    n.connect(f); f.connect(g); g.connect(out); n.start(0);
    const o = oc.createOscillator(); o.type = kind === 'energy' ? 'sawtooth' : 'sine';
    o.frequency.setValueAtTime(kind === 'energy' ? 900 : 180, 0); o.frequency.exponentialRampToValueAtTime(kind === 'energy' ? 200 : 60, 0.15);
    const g2 = envGain(oc, 0, 0.001, 0.16, 0.8);
    o.connect(g2); g2.connect(out); o.start(0); o.stop(0.2);
  };
}

const RECIPES = {
  dry: click(2500, 0.03, 0.4, 8),
  magout: seq([0, click(1400, 0.05, 0.6, 3)], [0.03, slide(800, 1600, 0.12, 0.3)]),
  magin: seq([0, slide(1600, 900, 0.1, 0.3)], [0.1, click(1100, 0.06, 0.9, 3)]),
  boltback: seq([0, click(2200, 0.04, 0.7, 5)], [0.02, slide(2000, 1200, 0.1, 0.35)]),
  boltfwd: seq([0, slide(1200, 2200, 0.08, 0.35)], [0.08, click(1800, 0.05, 0.8, 4)]),
  pump: seq([0, slide(600, 1200, 0.12, 0.5)], [0.12, click(900, 0.05, 0.9, 3)], [0.2, slide(1200, 700, 0.1, 0.4)], [0.3, click(1100, 0.05, 0.8, 3)]),
  shell: seq([0, click(1500, 0.04, 0.5, 4)], [0.05, slide(1800, 900, 0.08, 0.25)]),
  equip: seq([0, slide(500, 1500, 0.15, 0.25)], [0.14, click(1600, 0.04, 0.4, 4)]),
  charge: (oc, out) => {
    const o = oc.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(220, 0); o.frequency.exponentialRampToValueAtTime(1800, 0.55);
    const lp = filter(oc, 'lowpass', 2500, 6);
    const g = oc.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.35, 0.5); g.gain.linearRampToValueAtTime(0.0001, 0.6);
    o.connect(lp); lp.connect(g); g.connect(out); o.start(0); o.stop(0.62);
  },
  spinup: (oc, out) => {
    const o = oc.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(40, 0); o.frequency.exponentialRampToValueAtTime(320, 0.55);
    const lp = filter(oc, 'lowpass', 900, 3);
    const g = envGain(oc, 0, 0.05, 0.6, 0.25, 'lin');
    o.connect(lp); lp.connect(g); g.connect(out); o.start(0); o.stop(0.7);
  },
  hitmarker: tone('square', 2400, 2200, 0.045, 0.22, 0.001),
  hitmarkerHead: seq([0, tone('sine', 3400, 3300, 0.18, 0.4, 0.001)], [0, tone('triangle', 5100, 5000, 0.12, 0.15, 0.001)]),
  kill: seq([0, tone('square', 900, 880, 0.06, 0.18)], [0.05, tone('triangle', 1320, 1310, 0.2, 0.3)], [0.05, tone('sine', 220, 70, 0.25, 0.5)]),
  hurt: seq([0, tone('sine', 140, 60, 0.18, 0.6)], [0, click(400, 0.08, 0.5, 1)]),
  death: seq([0, tone('sawtooth', 400, 60, 0.6, 0.35)], [0, tone('sine', 200, 40, 0.7, 0.5)]),
  explosion: explosion(),
  impact: click(3200, 0.03, 0.45, 2),
  impactMetal: seq([0, click(4200, 0.03, 0.4, 6)], [0, tone('sine', 2600, 2500, 0.12, 0.1)]),
  flesh: seq([0, click(700, 0.05, 0.6, 1)], [0, tone('sine', 300, 120, 0.06, 0.3)]),
  jump: slide(300, 600, 0.12, 0.25),
  land: seq([0, footstep('concrete')], [0, tone('sine', 90, 40, 0.1, 0.4)]),
  slide: slide(1500, 500, 0.6, 0.35),
  pad: seq([0, tone('sine', 200, 900, 0.35, 0.4)], [0, slide(800, 3000, 0.3, 0.3)]),
  spawn: seq([0, tone('sine', 300, 1200, 0.4, 0.25)], [0.1, chord([660, 990], 0.4, 'triangle', 0.1)]),
  uiHover: tone('sine', 1400, 1500, 0.04, 0.08, 0.002),
  uiClick: seq([0, tone('square', 900, 880, 0.03, 0.08)], [0.03, tone('sine', 1500, 1500, 0.05, 0.12)]),
  uiBack: tone('triangle', 700, 400, 0.08, 0.15),
  uiError: seq([0, tone('square', 220, 210, 0.08, 0.15)], [0.1, tone('square', 180, 170, 0.12, 0.15)]),
  uiBuy: chord([784, 988, 1175, 1568], 0.35, 'triangle', 0.14, 0.06),
  uiNotify: chord([880, 1320], 0.25, 'sine', 0.15, 0.08),
  uiReward: chord([523, 659, 784, 1047, 1319], 0.5, 'triangle', 0.13, 0.07),
  levelUp: chord([392, 523, 659, 784, 1047, 1319], 0.8, 'sawtooth', 0.07, 0.08),
  beep: tone('square', 880, 880, 0.12, 0.15),
  go: chord([660, 880, 1320], 0.45, 'square', 0.1, 0),
  stinger: seq([0, tone('sawtooth', 110, 110, 0.5, 0.2)], [0, tone('sawtooth', 165, 165, 0.5, 0.12)], [0, slide(400, 3000, 0.4, 0.15)]),
  victory: chord([523, 659, 784, 1047, 1319, 1568], 1.4, 'sawtooth', 0.06, 0.12),
  defeat: chord([392, 349, 311, 262], 1.3, 'triangle', 0.12, 0.22),
};
for (const k of ['concrete', 'metal', 'sand', 'snow']) for (let i = 0; i < 3; i++) RECIPES[`step_${k}_${i}`] = footstep(k);
for (const w of GUNS) RECIPES[`shot_${w.id}`] = gunshot(w.snd);
for (const m of MELEE) {
  RECIPES[`swing_${m.id}`] = whoosh(m.snd.whoosh, m.snd.hum || 0);
  RECIPES[`mhit_${m.id}`] = meleeHit(m.snd.impact);
}
const DURATIONS = { explosion: 2.2, victory: 1.8, defeat: 1.8, levelUp: 1.2, pump: 0.5, charge: 0.7, spinup: 0.8, slide: 0.7, stinger: 0.6, death: 0.8 };

// ───────────── engine ─────────────
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.voices = [];
    this.ready = false;
    this.vol = { master: 0.8, music: 0.45, sfx: 0.9, ui: 0.7, announcer: 0.9 };
    this.hrtf = true;
    this.announcerVoice = true;
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12; this.comp.ratio.value = 4; this.comp.attack.value = 0.003; this.comp.release.value = 0.15;
    this.master = ctx.createGain(); this.master.connect(this.comp); this.comp.connect(ctx.destination);
    this.bus = {};
    for (const b of ['sfx', 'music', 'ui', 'announcer']) { this.bus[b] = ctx.createGain(); this.bus[b].connect(this.master); }
    this.applyVolumes();
  }

  async unlock() {
    await this.init();
    if (this.ctx && this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch { /* needs gesture */ } }
  }

  setSettings(s) {
    this.vol = { master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume, ui: s.uiVolume, announcer: s.announcerVolume };
    this.announcerVoice = s.announcerVoice;
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.bus.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.bus.ui.gain.setTargetAtTime(this.vol.ui, t, 0.05);
    this.bus.music.gain.setTargetAtTime(this.vol.music * 0.6, t, 0.05);
    this.bus.announcer.gain.setTargetAtTime(this.vol.announcer, t, 0.05);
  }

  /** Pre-renders every sound. onProgress(fraction). */
  async prepare(onProgress) {
    const names = Object.keys(RECIPES);
    let done = 0;
    const batch = 8;
    for (let i = 0; i < names.length; i += batch) {
      await Promise.all(names.slice(i, i + batch).map(async (n) => {
        const dur = DURATIONS[n] || (n.startsWith('shot_') ? 1.6 : n.startsWith('swing_') ? 0.45 : 0.5);
        try { this.buffers.set(n, await render(dur, RECIPES[n])); } catch (e) { console.warn('audio render failed', n, e); }
        done++;
      }));
      if (onProgress) onProgress(done / names.length);
    }
    this.ready = true;
  }

  get time() { return this.ctx ? this.ctx.currentTime : 0; }

  setListener(pos, fwd) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(fwd.x, t); l.forwardY.setValueAtTime(fwd.y, t); l.forwardZ.setValueAtTime(fwd.z, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
    this.listenerPos = pos;
  }

  /**
   * play(name, { vol, rate, pos, bus, lowpass, delay })
   */
  play(name, o = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return null;
    const buf = this.buffers.get(name);
    if (!buf) return null;
    const ctx = this.ctx;
    // voice limit: drop oldest
    if (this.voices.length > 40) { const v = this.voices.shift(); try { v.stop(); } catch { /* already stopped */ } }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (o.rate || 1) * (o.jitter === false ? 1 : 0.97 + Math.random() * 0.06);
    const g = ctx.createGain();
    g.gain.value = o.vol ?? 1;
    let node = src;
    if (o.lowpass) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lowpass; node.connect(f); node = f; }
    node.connect(g);
    let last = g;
    if (o.pos) {
      const p = ctx.createPanner();
      p.panningModel = this.hrtf ? 'HRTF' : 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = o.ref || 5;
      p.maxDistance = 250;
      p.rolloffFactor = o.rolloff || 1.1;
      if (p.positionX) { p.positionX.value = o.pos.x; p.positionY.value = o.pos.y; p.positionZ.value = o.pos.z; } else p.setPosition(o.pos.x, o.pos.y, o.pos.z);
      g.connect(p);
      last = p;
    }
    last.connect(this.bus[o.bus || 'sfx']);
    src.start(ctx.currentTime + (o.delay || 0));
    this.voices.push(src);
    src.onended = () => { const i = this.voices.indexOf(src); if (i >= 0) this.voices.splice(i, 1); };
    return src;
  }

  ui(name) { this.play(name, { bus: 'ui', jitter: false }); }

  /** Weapon shot: local player is non-positional & louder; remote is positional with distance muffling. */
  shot(def, pos, local) {
    if (local) { this.play(`shot_${def.id}`, { vol: 0.75 }); return; }
    let lp = null;
    if (pos && this.listenerPos) {
      const d = Math.hypot(pos.x - this.listenerPos.x, pos.y - this.listenerPos.y, pos.z - this.listenerPos.z);
      lp = Math.max(700, 18000 - d * 260);
    }
    this.play(`shot_${def.id}`, { vol: def.suppressed ? 0.5 : 1.0, pos, lowpass: lp, ref: def.suppressed ? 3 : 7 });
  }

  // ───────────── music ─────────────
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(this.bus.music);
    out.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    this.musicOut = out;
    const delay = ctx.createDelay(1); delay.delayTime.value = 60 / 104 * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400;
    delay.connect(dlp); dlp.connect(fb); fb.connect(delay); dlp.connect(out);
    this.mDelay = delay;
    const bpm = 104, beat = 60 / bpm, step = beat / 4;
    // Am - F - C - G
    const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    let next = ctx.currentTime + 0.1, i = 0;
    const self = this;
    const schedule = () => {
      if (!self.musicOn) return;
      while (next < ctx.currentTime + 0.25) {
        const bar = Math.floor(i / 16) % 4;
        const s16 = i % 16;
        const section = Math.floor(i / 64) % 4;
        const ch = prog[bar];
        const t = next;
        // drums
        if (section > 0) {
          if (s16 % 4 === 0) self._kick(out, t);
          if (s16 === 4 || s16 === 12) self._snare(out, t);
          if (s16 % 2 === 0) self._hat(out, t, s16 % 4 === 2 ? 0.08 : 0.04);
        }
        // bass (8ths)
        if (s16 % 2 === 0) self._bass(out, t, mtof(ch[0] - 24 + (s16 % 8 === 6 ? 12 : 0)), step * 1.8);
        // arp (16ths)
        if (section !== 2 || s16 % 2 === 0) self._arp(out, delay, t, mtof(ch[s16 % 3] + 12 + (s16 >= 8 ? 12 : 0)), step * 0.9);
        // pad on bar start
        if (s16 === 0) for (const n of ch) self._pad(out, t, mtof(n), beat * 4);
        next += step;
        i++;
      }
      self.musicTimer = setTimeout(schedule, 40);
    };
    schedule();
  }

  stopMusic(fade = 1) {
    if (!this.musicOn) return;
    this.musicOn = false;
    clearTimeout(this.musicTimer);
    const out = this.musicOut;
    if (out && this.ctx) {
      out.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
      setTimeout(() => out.disconnect(), fade * 1500);
    }
  }

  _kick(out, t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32);
  }
  _snare(out, t) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this._noiseBuf();
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + 0.2);
    const o = c.createOscillator(); o.frequency.value = 190; const g2 = c.createGain(); g2.gain.setValueAtTime(0.25, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g2); g2.connect(out); o.start(t); o.stop(t + 0.12);
  }
  _hat(out, t, v) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this._noiseBuf();
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + 0.06);
  }
  _bass(out, t, f, d) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(220, t + d);
    const g = c.createGain(); g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.02);
  }
  _arp(out, delay, t, f, d) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const g = c.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(lp); lp.connect(g); g.connect(out); g.connect(delay); o.start(t); o.stop(t + d + 0.02);
  }
  _pad(out, t, f, d) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + d);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
    for (const det of [-8, 8]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + d + 0.05);
    }
    lp.connect(g); g.connect(out);
  }
  _noiseBuf() {
    if (this._nb) return this._nb;
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.3, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this._nb = b;
    return b;
  }

  // ───────────── announcer ─────────────
  announce(text, { stinger = true } = {}) {
    if (stinger) this.play('stinger', { bus: 'announcer', jitter: false, vol: 0.8 });
    if (!this.announcerVoice || !('speechSynthesis' in window) || this.vol.announcer <= 0.01) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      const v = voices.find((x) => /en[-_](US|GB)/i.test(x.lang) && /male|david|daniel|alex|google uk english male/i.test(x.name)) || voices.find((x) => /^en/i.test(x.lang));
      if (v) u.voice = v;
      u.pitch = 0.55; u.rate = 1.08; u.volume = Math.min(1, this.vol.announcer * this.vol.master * 1.2);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* speech unavailable */ }
  }
}

export const audio = new AudioEngine();
