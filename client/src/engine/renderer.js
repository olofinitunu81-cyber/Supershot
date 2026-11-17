// WebGL renderer, post-processing chain and the frame scheduler (VSync,
// fixed FPS caps above/below display refresh, and unlimited mode).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { QUALITY_PRESETS } from '../settings.js';
import { S } from '../state.js';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true, preserveDrawingBuffer: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.info.autoReset = true;
    this.renderer = renderer;
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.scene = null;
    this.camera = null;
    this.vmScene = null;
    this.vmCamera = null;
    this.composer = null;
    this.q = QUALITY_PRESETS.high;
    this.qualityName = 'high';
    this.width = 1; this.height = 1;
    this.fps = 0;
    this.frameMs = 0;
    this.refreshHz = 60;
    this.onFrame = null;
    this._last = performance.now();
    this._fpsAcc = 0; this._fpsCount = 0;
    this.mode = 'raf';
    this.exposure = 1;
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this._reschedule());
    this.resize();
  }

  get quality() { return this.q; }

  applySettings(settings) {
    const name = QUALITY_PRESETS[settings.quality] ? settings.quality : 'high';
    const changed = name !== this.qualityName || this.renderScale !== settings.renderScale || this.bloomOverride !== settings.bloomOverride;
    this.qualityName = name;
    this.q = QUALITY_PRESETS[name];
    this.renderScale = settings.renderScale || 1;
    this.bloomOverride = settings.bloomOverride;
    this.fpsCap = settings.fpsCap;
    this.renderer.shadowMap.enabled = this.q.shadows > 0;
    if (changed) { this.resize(); this._buildComposer(); }
    this._reschedule();
  }

  setView(scene, camera, vmScene = null, vmCamera = null) {
    this.scene = scene;
    this.camera = camera;
    this.vmScene = vmScene;
    this.vmCamera = vmCamera;
    this._buildComposer();
    this.resize();
  }

  _buildComposer() {
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    this.gtao = null; this.bloom = null;
    if (!this.scene) return;
    const q = this.q;
    const usePost = q.bloom || q.ao > 0 || q.aa !== 'none' || q.msaa > 0;
    if (!usePost) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    const composer = new EffectComposer(this.renderer, rt);
    composer.setPixelRatio(this.renderer.getPixelRatio());
    composer.setSize(this.width, this.height);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (q.ao > 0) {
      const g = new GTAOPass(this.scene, this.camera, this.width, this.height);
      g.output = GTAOPass.OUTPUT.Default;
      g.blendIntensity = 0.85;
      g.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: q.ao >= 1 ? 16 : 8, distanceFallOff: 1 });
      g.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: q.ao >= 1 ? 16 : 8 });
      composer.addPass(g);
      this.gtao = g;
    }
    if (this.vmScene) {
      const vm = new RenderPass(this.vmScene, this.vmCamera);
      vm.clear = false;
      vm.clearDepth = true;
      composer.addPass(vm);
    }
    const bloomOn = this.bloomOverride === null || this.bloomOverride === undefined ? q.bloom : this.bloomOverride;
    if (bloomOn) {
      const bp = this.bloomParams || [0.55, 0.45, 0.82];
      const b = new UnrealBloomPass(new THREE.Vector2(this.width / 2, this.height / 2), bp[0], bp[1], bp[2]);
      composer.addPass(b);
      this.bloom = b;
    }
    composer.addPass(new OutputPass());
    if (q.aa === 'smaa') composer.addPass(new SMAAPass());
    else if (q.aa === 'fxaa') composer.addPass(new FXAAPass());
    this.composer = composer;
  }

  setBloom(strength, radius, threshold) {
    this.bloomParams = [strength, radius, threshold];
    if (!this.bloom) return;
    if (strength !== undefined) this.bloom.strength = strength;
    if (radius !== undefined) this.bloom.radius = radius;
    if (threshold !== undefined) this.bloom.threshold = threshold;
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio) * (this.renderScale || 1);
    this.renderer.setPixelRatio(Math.max(0.35, dpr));
    this.renderer.setSize(this.width, this.height, false);
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(this.width, this.height);
    }
    for (const cam of [this.camera, this.vmCamera]) {
      if (cam && cam.isPerspectiveCamera) { cam.aspect = this.width / this.height; cam.updateProjectionMatrix(); }
    }
    if (this.onResize) this.onResize(this.width, this.height);
  }

  render() {
    if (!this.scene || !this.camera) return;
    this.renderer.toneMappingExposure = this.exposure;
    if (this.composer) {
      this.composer.render();
    } else {
      const r = this.renderer;
      r.autoClear = true;
      r.render(this.scene, this.camera);
      if (this.vmScene) {
        r.autoClear = false;
        r.clearDepth();
        r.render(this.vmScene, this.vmCamera);
        r.autoClear = true;
      }
    }
  }

  // ───────────── frame scheduling ─────────────

  /** Measures display refresh rate from rAF timings. */
  measureRefresh() {
    return new Promise((resolve) => {
      const times = [];
      const step = (t) => {
        times.push(t);
        if (times.length < 40) requestAnimationFrame(step);
        else {
          const d = [];
          for (let i = 10; i < times.length; i++) d.push(times[i] - times[i - 1]);
          d.sort((a, b) => a - b);
          const hz = 1000 / d[Math.floor(d.length / 2)];
          const common = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 170, 175, 180, 200, 240, 280, 360];
          this.refreshHz = common.reduce((a, b) => (Math.abs(b - hz) < Math.abs(a - hz) ? b : a), 60);
          resolve(this.refreshHz);
        }
      };
      requestAnimationFrame(step);
    });
  }

  start(onFrame) {
    this.onFrame = onFrame;
    if (!this.channel) {
      this.channel = new MessageChannel();
      this.channel.port1.onmessage = () => this._mcTick();
    }
    this._reschedule();
  }

  _reschedule() {
    const cap = this.fpsCap ?? 0;
    const hidden = document.hidden;
    let mode = 'raf';
    if (!hidden && (cap === -1 || cap > this.refreshHz + 3)) mode = 'mc';
    this.interval = cap > 0 ? 1000 / cap : 0;
    if (mode === this.mode && this._running) return;
    this.mode = mode;
    this._running = true;
    this._gen = (this._gen || 0) + 1;
    const gen = this._gen;
    if (mode === 'raf') {
      const loop = (t) => {
        if (gen !== this._gen) return;
        requestAnimationFrame(loop);
        const now = performance.now();
        if (this.interval > 0) {
          const el = now - this._nextDue;
          if (el < -1.2) return;
          this._nextDue = Math.max(this._nextDue + this.interval, now - this.interval);
        }
        this._frame(now);
        void t;
      };
      this._nextDue = performance.now();
      requestAnimationFrame(loop);
    } else {
      this._mcGen = gen;
      this._nextDue = performance.now();
      this.channel.port2.postMessage(0);
    }
  }

  _mcTick() {
    if (this._mcGen !== this._gen || this.mode !== 'mc') return;
    if (document.hidden) { this._reschedule(); return; }
    const now = performance.now();
    if (this.interval <= 0 || now >= this._nextDue) {
      if (this.interval > 0) this._nextDue = Math.max(this._nextDue + this.interval, now - this.interval);
      this._frame(now);
    }
    this.channel.port2.postMessage(0);
  }

  _frame(now) {
    const dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    this._fpsAcc += dt; this._fpsCount++;
    if (this._fpsAcc >= 0.5) {
      this.fps = Math.round(this._fpsCount / this._fpsAcc);
      this.frameMs = (this._fpsAcc / this._fpsCount) * 1000;
      this._fpsAcc = 0; this._fpsCount = 0;
    }
    if (this.onFrame) this.onFrame(dt, now);
  }
}

export function qualitySettings() {
  return QUALITY_PRESETS[S.settings.value.quality] || QUALITY_PRESETS.high;
}
