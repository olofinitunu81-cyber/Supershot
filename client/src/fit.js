// Scales the whole interface down on small screens (phones, small windows) so the
// desktop layout fits: the UI is laid out on a virtual screen of at least ~1080x640.
export function fitUI() {
  const w = window.innerWidth, h = window.innerHeight;
  const s = Math.max(0.4, Math.min(1, h / 640, w / 1080));
  const r = document.documentElement;
  r.style.setProperty('--uis', String(s));
  r.style.setProperty('--vw', `${w / s / 100}px`);
  r.style.setProperty('--vh', `${h / s / 100}px`);
  r.classList.toggle('ui-scaled', s < 0.999);
}
