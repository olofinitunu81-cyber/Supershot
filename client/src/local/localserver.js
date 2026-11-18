// Hosts the real game server for the single-file build and gives the client a
// WebSocket-shaped connection to it. The server runs in a Web Worker (its own thread)
// when the browser allows it, otherwise inside the page.
/* global __WORKER_SRC__ */
import './env.js';
import { GameServer } from '../../../server/index.js';
import { TOUCH } from '../input.js';
import { useSmallMatches } from './smallmatches.js';

const KEY = 'supershot.local.db.v1';
if (TOUCH) useSmallMatches(); // keep the page's mode info in step with the server

let backend = null; // { open(id), send(id, data), close(id) }
let mode = 'starting';
const waiting = [];
const conns = new Map();
let nextId = 1;
let inlineServer = null;

function ready(b, m) {
  backend = b; mode = m;
  for (const f of waiting.splice(0)) f();
}

function startInline() {
  inlineServer = new GameServer({ quiet: true, dbFile: 'local' });
  inlineServer._startLoops();
  const sides = new Map();
  ready({
    open(id) {
      const handlers = {};
      const c = conns.get(id);
      const side = {
        readyState: 1, bufferedAmount: 0,
        on(ev, fn) { (handlers[ev] ||= []).push(fn); },
        send(data) {
          if (side.readyState !== 1) return;
          const d = typeof data === 'string' ? data : (data instanceof Uint8Array ? data : new Uint8Array(data)).slice().buffer;
          queueMicrotask(() => c.deliver(d));
        },
        close() { if (side.readyState !== 1) return; side.readyState = 3; (handlers.close || []).forEach((f) => f()); queueMicrotask(() => c.closed()); },
      };
      sides.set(id, { side, handlers });
      inlineServer._onConnection(side, { headers: {}, socket: { remoteAddress: 'local' } });
    },
    send(id, data) {
      const s = sides.get(id);
      if (!s) return;
      const bin = typeof data !== 'string';
      const payload = bin ? (data instanceof Uint8Array ? data : new Uint8Array(data)).slice() : data;
      queueMicrotask(() => { if (s.side.readyState === 1) (s.handlers.message || []).forEach((f) => f(payload, bin)); });
    },
    close(id) {
      const s = sides.get(id);
      if (!s || s.side.readyState !== 1) return;
      s.side.readyState = 3;
      sides.delete(id);
      queueMicrotask(() => (s.handlers.close || []).forEach((f) => f()));
    },
  }, 'page');
}

function startWorker() {
  let worker;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([__WORKER_SRC__], { type: 'text/javascript' })));
  } catch { return false; }
  let ok = false;
  const fail = () => { if (ok) return; ok = true; try { worker.terminate(); } catch { /* gone */ } startInline(); };
  const timer = setTimeout(fail, 5000);
  worker.onerror = fail;
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'ready') {
      if (ok) return;
      ok = true;
      clearTimeout(timer);
      ready({
        open(id) { worker.postMessage({ type: 'open', id }); },
        send(id, data) {
          if (typeof data === 'string') { worker.postMessage({ type: 'msg', id, data }); return; }
          const buf = (data instanceof Uint8Array ? data : new Uint8Array(data)).slice().buffer;
          worker.postMessage({ type: 'msg', id, data: buf }, [buf]);
        },
        close(id) { worker.postMessage({ type: 'close', id }); },
      }, 'worker');
      return;
    }
    if (m.type === 'db') { try { localStorage.setItem(KEY, m.json); } catch { /* storage unavailable */ } return; }
    const c = conns.get(m.id);
    if (!c) return;
    if (m.type === 'msg') c.deliver(m.data);
    else if (m.type === 'close') c.closed();
  };
  let db = null;
  try { db = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  worker.postMessage({ type: 'init', db, small: TOUCH });
  return true;
}

if (!(typeof Worker !== 'undefined' && typeof __WORKER_SRC__ === 'string' && startWorker())) startInline();

function connect() {
  const id = nextId++;
  const inbox = [];
  const client = {
    readyState: 0, binaryType: 'arraybuffer', bufferedAmount: 0, onopen: null, onmessage: null, onclose: null, onerror: null,
    send(data) { if (this.readyState === 1) backend.send(id, data); },
    close() {
      if (this.readyState >= 2) return;
      this.readyState = 3;
      if (backend) backend.close(id);
      conns.delete(id);
      queueMicrotask(() => { if (client.onclose) client.onclose({ code: 1000 }); });
    },
  };
  const c = {
    deliver(d) {
      if (client.readyState === 0) inbox.push(d);
      else if (client.readyState === 1 && client.onmessage) client.onmessage({ data: d });
    },
    closed() {
      if (client.readyState === 3) return;
      client.readyState = 3;
      conns.delete(id);
      if (client.onclose) client.onclose({ code: 1000 });
    },
  };
  conns.set(id, c);
  const open = () => {
    backend.open(id);
    setTimeout(() => {
      if (client.readyState !== 0) return;
      client.readyState = 1;
      if (client.onopen) client.onopen();
      for (const d of inbox.splice(0)) c.deliver(d);
    }, 0);
  };
  if (backend) open(); else waiting.push(open);
  return client;
}

window.__SUPERSHOT_LOCAL__ = { connect, get mode() { return mode; }, get server() { return inlineServer; } };
