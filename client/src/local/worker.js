// Web Worker that hosts the game server for the single-file build, so the 60 Hz
// simulation and the bots never compete with rendering on the page's main thread.
import './env.js';
import { GameServer } from '../../../server/index.js';
import { useSmallMatches } from './smallmatches.js';

let server = null;
const conns = new Map();

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    if (m.small) useSmallMatches();
    globalThis.__SUPERSHOT_DB__ = { init: m.db, save: (json) => self.postMessage({ type: 'db', json }) };
    server = new GameServer({ quiet: true, dbFile: 'local' });
    server._startLoops();
    self.postMessage({ type: 'ready' });
  } else if (m.type === 'open') {
    const id = m.id, handlers = {};
    const side = {
      readyState: 1, bufferedAmount: 0,
      on(ev, fn) { (handlers[ev] ||= []).push(fn); },
      send(data) {
        if (side.readyState !== 1) return;
        if (typeof data === 'string') { self.postMessage({ type: 'msg', id, data }); return; }
        const buf = (data instanceof Uint8Array ? data : new Uint8Array(data)).slice().buffer;
        self.postMessage({ type: 'msg', id, data: buf }, [buf]);
      },
      close() {
        if (side.readyState !== 1) return;
        side.readyState = 3;
        conns.delete(id);
        (handlers.close || []).forEach((f) => f());
        self.postMessage({ type: 'close', id });
      },
    };
    conns.set(id, { side, handlers });
    server._onConnection(side, { headers: {}, socket: { remoteAddress: 'local' } });
  } else if (m.type === 'msg') {
    const c = conns.get(m.id);
    if (!c) return;
    const bin = typeof m.data !== 'string';
    (c.handlers.message || []).forEach((f) => f(bin ? new Uint8Array(m.data) : m.data, bin));
  } else if (m.type === 'close') {
    const c = conns.get(m.id);
    if (!c) return;
    c.side.readyState = 3;
    conns.delete(m.id);
    (c.handlers.close || []).forEach((f) => f());
  }
};
