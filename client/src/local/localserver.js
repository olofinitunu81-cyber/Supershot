// Runs the real game server inside this browser tab and gives the client a
// WebSocket-shaped connection to it, so the single-file build plays offline with bots.
import { GameServer } from '../../../server/index.js';

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = {
    from(s, enc) {
      if (enc === 'hex') { const a = new Uint8Array(s.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16); return a; }
      return new TextEncoder().encode(String(s));
    },
  };
}

let server = null;
function getServer() {
  if (!server) {
    server = new GameServer({ quiet: true, dbFile: 'local' });
    server._startLoops();
  }
  return server;
}

function connect() {
  const srv = getServer();
  const handlers = {};
  const toServer = (ev, ...a) => (handlers[ev] || []).forEach((f) => f(...a));
  const copy = (data) => (data instanceof Uint8Array ? data : new Uint8Array(data)).slice();
  const client = {
    readyState: 0, binaryType: 'arraybuffer', bufferedAmount: 0, onopen: null, onmessage: null, onclose: null, onerror: null,
    send(data) {
      if (this.readyState !== 1) return;
      const bin = typeof data !== 'string';
      const payload = bin ? copy(data) : data;
      queueMicrotask(() => { if (side.readyState === 1) toServer('message', payload, bin); });
    },
    close() { side.close(); },
  };
  const side = {
    readyState: 1, bufferedAmount: 0,
    on(ev, fn) { (handlers[ev] ||= []).push(fn); },
    send(data) {
      if (client.readyState !== 1) return;
      const d = typeof data === 'string' ? data : copy(data).buffer;
      queueMicrotask(() => { if (client.readyState === 1 && client.onmessage) client.onmessage({ data: d }); });
    },
    close() {
      if (side.readyState >= 2) return;
      side.readyState = 3; client.readyState = 3;
      queueMicrotask(() => { toServer('close'); if (client.onclose) client.onclose({ code: 1000 }); });
    },
  };
  setTimeout(() => {
    client.readyState = 1;
    srv._onConnection(side, { headers: {}, socket: { remoteAddress: 'local' } });
    if (client.onopen) client.onopen();
  }, 0);
  return client;
}

window.__SUPERSHOT_LOCAL__ = { connect };
