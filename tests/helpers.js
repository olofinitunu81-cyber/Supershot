import WebSocket from 'ws';
import { GameServer } from '../server/index.js';

export async function startServer() {
  const server = new GameServer({ port: 0, dbFile: ':memory:', quiet: true });
  await server.start();
  return server;
}

export class TestClient {
  constructor(port) {
    this.port = port;
    this.msgs = [];
    this.bins = [];
    this.waiters = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`);
      this.ws.binaryType = 'arraybuffer';
      this.ws.on('message', (data, isBinary) => {
        if (isBinary) { this.bins.push(data); this._check(); return; }
        const m = JSON.parse(data.toString());
        this.msgs.push(m);
        this._check();
      });
      this.ws.on('open', () => resolve(this));
      this.ws.on('error', reject);
    });
  }
  _check() {
    for (const w of [...this.waiters]) {
      const i = this.msgs.findIndex((m, idx) => idx >= w.from && w.pred(m));
      if (i >= 0) { this.waiters.splice(this.waiters.indexOf(w), 1); clearTimeout(w.timer); w.resolve(this.msgs[i]); }
    }
  }
  send(obj) { this.ws.send(JSON.stringify(obj)); }
  sendBin(bytes) { this.ws.send(bytes); }
  /** Waits for a message matching pred that arrives after the current position (or any if fromStart). */
  wait(pred, timeout = 4000, fromStart = false) {
    if (typeof pred === 'string') { const t = pred; pred = (m) => m.t === t; }
    const from = fromStart ? 0 : this.mark ?? 0;
    const found = this.msgs.findIndex((m, idx) => idx >= from && pred(m));
    if (found >= 0) { this.mark = found + 1; return Promise.resolve(this.msgs[found]); }
    return new Promise((resolve, reject) => {
      const w = { pred, from, resolve: (m) => { this.mark = this.msgs.indexOf(m) + 1; resolve(m); } };
      w.timer = setTimeout(() => { this.waiters.splice(this.waiters.indexOf(w), 1); reject(new Error('timeout waiting for message')); }, timeout);
      this.waiters.push(w);
    });
  }
  async request(obj, pred, timeout) {
    this.mark = this.msgs.length;
    this.send(obj);
    return this.wait(pred, timeout);
  }
  close() { this.ws.close(); }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
