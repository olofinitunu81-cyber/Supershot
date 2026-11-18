// WebSocket connection with automatic reconnect, JSON + binary dispatch and ping.
import { MSG_PING, MSG_PONG, Reader, encodePing, Writer } from '../../shared/protocol.js';
import { PROTOCOL_VERSION } from '../../shared/config.js';

class Net {
  constructor() {
    this.handlers = new Map();
    this.ws = null;
    this.rtt = 60;
    this.rttSamples = [];
    this.writer = new Writer(64);
    this.retry = 0;
    this.manualClose = false;
    this.ready = false;
  }

  url() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  connect() {
    this.manualClose = false;
    const local = typeof window !== 'undefined' && window.__SUPERSHOT_LOCAL__;
    const ws = local ? local.connect() : new WebSocket(this.url());
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.emit('open');
      this._ping();
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'hello' && m.v !== PROTOCOL_VERSION) this.emit('version', m);
        this.emit(m.t, m);
        this.emit('*', m);
      } else {
        const r = new Reader(ev.data);
        const type = r.u8();
        if (type === MSG_PONG) {
          const rtt = performance.now() - r.f64();
          this.rttSamples.push(rtt);
          if (this.rttSamples.length > 8) this.rttSamples.shift();
          this.rtt = this.rttSamples.reduce((a, b) => a + b, 0) / this.rttSamples.length;
          return;
        }
        this.emit(`bin:${type}`, r);
      }
    };
    ws.onclose = (ev) => {
      this.ready = false;
      this.emit('close', ev);
      if (this.manualClose) return;
      const delay = Math.min(8000, 600 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {};
  }

  _ping() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) this.ws.send(encodePing(this.writer, MSG_PING, performance.now()));
    }, 1000);
  }

  get open() {
    return this.ws && this.ws.readyState === 1;
  }

  send(obj) {
    if (this.open) this.ws.send(JSON.stringify(obj));
  }

  sendBin(bytes) {
    if (this.open) this.ws.send(bytes);
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }

  emit(type, data) {
    const hs = this.handlers.get(type);
    if (hs) for (const fn of [...hs]) {
      try { fn(data); } catch (e) { console.error(`[net] handler ${type}`, e); }
    }
  }

  /** Sends a request and resolves with the first message matching one of the reply types. */
  request(obj, replyTypes = ['profile'], timeout = 6000) {
    return new Promise((resolve, reject) => {
      const offs = [];
      const done = (fn) => (m) => { offs.forEach((o) => o()); clearTimeout(timer); fn(m); };
      for (const t of replyTypes) offs.push(this.on(t, done(resolve)));
      offs.push(this.on('err', done((m) => reject(Object.assign(new Error(m.msg), { code: m.code })))));
      const timer = setTimeout(() => { offs.forEach((o) => o()); reject(new Error('Request timed out.')); }, timeout);
      this.send(obj);
    });
  }

  close() {
    this.manualClose = true;
    if (this.ws) this.ws.close();
  }
}

export const net = new Net();
