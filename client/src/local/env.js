// Node globals the server code expects, for running it in a browser tab or worker.
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = {
    from(s, enc) {
      if (enc === 'hex') { const a = new Uint8Array(s.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16); return a; }
      return new TextEncoder().encode(String(s));
    },
  };
}
