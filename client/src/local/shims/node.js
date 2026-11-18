// Empty stand-ins for the Node-only modules the server imports (HTTP, WebSocket server,
// files, compression). The offline build never calls them.
const noop = () => {};
export const createServer = noop;
export class WebSocketServer {}
export class DatabaseSync {}
export const readFileSync = noop;
export const existsSync = () => false;
export const statSync = () => ({ isDirectory: () => false, mtimeMs: 0 });
export const mkdirSync = noop;
export const join = (...p) => p.filter(Boolean).join('/');
export const extname = (p) => { const m = /\.[^./]*$/.exec(p || ''); return m ? m[0] : ''; };
export const normalize = (p) => p;
export const dirname = (p) => String(p || '').replace(/\/[^/]*$/, '') || '/';
export const fileURLToPath = (u) => String(u || '');
export const gzipSync = noop;
export const brotliCompressSync = noop;
export const constants = {};
export default { createServer };
