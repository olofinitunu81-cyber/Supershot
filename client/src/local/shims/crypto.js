// Browser stand-ins for the node:crypto calls the server code makes. Only used by the
// single-file offline build, where the "server" runs in the player's own tab.
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
class Bytes extends Uint8Array {
  toString(enc) {
    if (enc === 'hex') return hex(this);
    if (enc === 'base64url') return btoa(String.fromCharCode(...this)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return super.toString();
  }
}
export function randomBytes(n) {
  const b = new Bytes(n);
  crypto.getRandomValues(b);
  return b;
}
function h53(str, seed) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function digestHex(str, len) {
  let out = '';
  for (let i = 0; out.length < len; i++) out += h53(str, i).toString(16).padStart(14, '0');
  return out.slice(0, len);
}
export function createHash() {
  let data = '';
  return { update(s) { data += String(s); return this; }, digest() { return digestHex(data, 64); } };
}
export function scrypt(pw, salt, keylen, opts, cb) {
  if (typeof opts === 'function') cb = opts;
  const h = digestHex(`${salt}:${pw}`, keylen * 2);
  const b = new Bytes(keylen);
  for (let i = 0; i < keylen; i++) b[i] = parseInt(h.substr(i * 2, 2), 16);
  setTimeout(() => cb(null, b), 0);
}
export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
export default { randomBytes, createHash, scrypt, timingSafeEqual };
