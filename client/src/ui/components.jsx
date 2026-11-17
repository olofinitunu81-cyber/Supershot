// Shared UI components: logo, buttons, panels, tabs, cards, controls.
import { useState, useEffect, useRef } from 'preact/hooks';
import { RARITY } from '../../../shared/items.js';
import { audio } from '../engine/audio.js';

// ───────────── SUPERSHOT logo (custom geometric letterforms) ─────────────
const W = 54, H = 78, T = 15;
const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;
const poly = (...pts) => `M${pts.map((p) => p.join(' ')).join('L')}z`;
const LETTERS = {
  S: () => [
    poly([12, 0], [W, 0], [W, T], [T, T], [T, H / 2 - T / 2], [0, H / 2 - T / 2], [0, 12]),
    rect(0, H / 2 - T / 2, W, T),
    rect(W - T, H / 2 - T / 2, T, H / 2 + T / 2 - 12),
    poly([0, H - T], [W - T, H - T], [W - T, H - 12], [W, H - 12], [W - 12, H], [0, H]),
  ],
  U: () => [poly([0, 0], [T, 0], [T, H - T], [W - T, H - T], [W - T, 0], [W, 0], [W, H], [12, H], [0, H - 12])],
  P: () => [poly([0, 0], [W - 12, 0], [W, 12], [W, H * 0.58], [T, H * 0.58], [T, H], [0, H]), `M${T} ${T}v${H * 0.58 - 2 * T}h${W - 2 * T}v${-(H * 0.58 - 2 * T)}z`],
  E: () => [rect(0, 0, W, T), rect(0, 0, T, H), rect(0, H / 2 - T / 2, W * 0.8, T), rect(0, H - T, W, T)],
  R: () => [poly([0, 0], [W - 12, 0], [W, 12], [W, H * 0.56], [T, H * 0.56], [T, H], [0, H]), `M${T} ${T}v${H * 0.56 - 2 * T}h${W - 2 * T}v${-(H * 0.56 - 2 * T)}z`, poly([W * 0.42, H * 0.5], [W * 0.42 + T * 1.25, H * 0.5], [W, H], [W - T * 1.25, H])],
  H: () => [rect(0, 0, T, H), rect(W - T, 0, T, H), rect(0, H / 2 - T / 2, W, T)],
  T: () => [rect(0, 0, W, T), rect(W / 2 - T / 2, 0, T, H)],
};

function letterPaths(ch) {
  const f = LETTERS[ch];
  return f ? f().join(' ') : '';
}

export function Logo({ size = 64, animate = false, sub = false }) {
  const word = 'SUPERSHOT';
  const gap = 10;
  let x = 0;
  const glyphs = [];
  for (const ch of word) {
    if (ch === 'O') {
      glyphs.push({ ch, x, w: H * 0.92 });
      x += H * 0.92 + gap;
    } else {
      glyphs.push({ ch, x, w: W });
      x += W + gap;
    }
  }
  const width = x - gap;
  const id = useRef(`lg${Math.random().toString(36).slice(2, 7)}`).current;
  const body = glyphs.map((g, i) => {
    if (g.ch === 'O') {
      const cx = g.w / 2, cy = H / 2, r = H / 2 - T / 2;
      return (
        <g key={i} transform={`translate(${g.x} 0)`}>
          <g class="glyph">
            <g class={animate ? 'logo-o' : ''}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={`url(#${id}g)`} stroke-width={T} />
              <rect x={cx - 3} y={-4} width={6} height={20} fill={`url(#${id}g)`} />
              <rect x={cx - 3} y={H - 16} width={6} height={20} fill={`url(#${id}g)`} />
              <rect x={-4} y={cy - 3} width={20} height={6} fill={`url(#${id}g)`} />
              <rect x={g.w - 16} y={cy - 3} width={20} height={6} fill={`url(#${id}g)`} />
              <circle cx={cx} cy={cy} r={6} fill="#ff2fa6" />
            </g>
          </g>
        </g>
      );
    }
    return <g key={i} transform={`translate(${g.x} 0)`}><path class="glyph" d={letterPaths(g.ch)} fill={`url(#${id}g)`} fill-rule="nonzero" /></g>;
  });
  const shadow = glyphs.map((g, i) => {
    if (g.ch === 'O') return <circle key={i} cx={g.x + g.w / 2} cy={H / 2} r={H / 2 - T / 2} fill="none" stroke="#ff2fa6" stroke-width={T} />;
    return <path key={i} d={letterPaths(g.ch)} transform={`translate(${g.x} 0)`} fill="#ff2fa6" fill-rule="nonzero" />;
  });
  const vbW = width + 60, vbH = H + 40;
  return (
    <svg class={`logo ${animate ? 'logo-anim' : ''}`} viewBox={`-20 -14 ${vbW} ${vbH + (sub ? 26 : 0)}`} style={{ height: size, width: 'auto' }} aria-label="SUPERSHOT">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset="0.45" stop-color="#bff6ff" />
          <stop offset="1" stop-color="#19e6ff" />
        </linearGradient>
      </defs>
      <g transform="skewX(-14) translate(14 0)">
        <g transform="translate(7 6)" opacity="0.9">{shadow}</g>
        <g class="logo-body" stroke="#07060f" stroke-width="3" paint-order="stroke">{body}</g>
        <rect x={-10} y={H + 10} width={width * 0.62} height={5} fill="#19e6ff" />
        <rect x={width * 0.64} y={H + 10} width={width * 0.2} height={5} fill="#ff2fa6" />
        <rect x={width * 0.86} y={H + 10} width={width * 0.08} height={5} fill="#ffd400" />
      </g>
      {sub && <text x={vbW / 2 - 20} y={vbH + 8} text-anchor="middle" class="logo-sub">MULTIPLAYER ARENA SHOOTER</text>}
    </svg>
  );
}

// ───────────── icons ─────────────
const ICONS = {
  credits: 'M12 2l3 3h4v4l3 3-3 3v4h-4l-3 3-3-3H5v-4l-3-3 3-3V5h4z M9 12h6 M12 9v6',
  play: 'M7 4l13 8-13 8z',
  gun: 'M2 9h15l2-2h3v4h-4l-1 1h-4l-1 4H8l1-4H2z',
  user: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M3 22c0-5 4-8 9-8s9 3 9 8',
  cart: 'M3 4h3l3 11h10l2-8H7 M10 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10',
  trophy: 'M7 4h10v4a5 5 0 0 1-10 0z M7 6H3v2a4 4 0 0 0 4 4 M17 6h4v2a4 4 0 0 1-4 4 M10 14h4v4h3v2H7v-2h3z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M1 21c0-4 3-7 8-7s8 3 8 7 M17 11a3 3 0 1 0 0-6 M19 14c2 1 4 3 4 7',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12l2-1-2-4-2 1-2-2 1-2-4-2-1 2h-2L8 2 4 4l1 2-2 2-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 2-1 2 4 2 1-2h2l1 2 4-2-1-2 2-2 2 1 2-4-2-1z',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v4 M12 18v4 M2 12h4 M18 12h4',
  gift: 'M3 9h18v4H3z M5 13h14v8H5z M12 9v12 M12 9c-2-4-6-4-6-1s4 1 6 1c2 0 6 2 6-1s-4-3-6 1',
  close: 'M5 5l14 14 M19 5L5 19',
  check: 'M4 12l5 5L20 6',
  lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
  star: 'M12 2l3 7h7l-6 5 2 7-6-4-6 4 2-7-6-5h7z',
  chat: 'M3 4h18v12H8l-5 4z',
  door: 'M5 3h10v18H5z M15 12h6 M18 9l3 3-3 3',
  plus: 'M12 4v16 M4 12h16',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
  shirt: 'M8 3l-5 4 3 4 2-1v11h8V10l2 1 3-4-5-4c-1 2-3 2-4 2s-3 0-4-2z',
  bolt: 'M13 2L4 14h7l-2 8 9-12h-7z',
  skull: 'M12 2a8 8 0 0 0-8 8c0 3 2 5 3 6v3h10v-3c1-1 3-3 3-6a8 8 0 0 0-8-8z M9 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M15 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7 M20 4v5h-5',
};

export function Icon({ name, size = 18, class: cls = '' }) {
  return (
    <svg class={`icon ${cls}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={ICONS[name] || ''} />
    </svg>
  );
}

export function Credits({ value, size = 'md' }) {
  return <span class={`credits credits-${size}`}><Icon name="credits" size={size === 'lg' ? 22 : 15} /><b>{Number(value).toLocaleString()}</b></span>;
}

// ───────────── buttons ─────────────
export function Btn({ children, onClick, variant = 'primary', disabled, small, wide, icon, title, sound = true, ...rest }) {
  return (
    <button
      class={`btn btn-${variant} ${small ? 'btn-sm' : ''} ${wide ? 'btn-wide' : ''}`}
      disabled={disabled}
      title={title}
      onMouseEnter={() => !disabled && audio.ui('uiHover')}
      onClick={(e) => { if (disabled) return; if (sound) audio.ui(variant === 'ghost' ? 'uiBack' : 'uiClick'); onClick && onClick(e); }}
      {...rest}
    >
      <span class="btn-inner">{icon && <Icon name={icon} size={small ? 14 : 18} />}{children}</span>
    </button>
  );
}

export function Panel({ title, sub, onClose, children, wide, side = 'right', class: cls = '' }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && onClose) { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div class={`panel panel-${side} ${wide ? 'panel-wide' : ''} ${cls}`}>
      <div class="panel-head">
        <div>
          <h2>{title}</h2>
          {sub && <div class="panel-sub">{sub}</div>}
        </div>
        {onClose && <button class="panel-close" onClick={() => { audio.ui('uiBack'); onClose(); }} aria-label="Close"><Icon name="close" size={20} /></button>}
      </div>
      <div class="panel-body">{children}</div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange, small }) {
  return (
    <div class={`tabs ${small ? 'tabs-sm' : ''}`}>
      {tabs.map((t) => (
        <button key={t.id} class={`tab ${value === t.id ? 'active' : ''}`} onMouseEnter={() => audio.ui('uiHover')} onClick={() => { audio.ui('uiClick'); onChange(t.id); }}>
          {t.icon && <Icon name={t.icon} size={14} />}{t.label}{t.badge ? <span class="badge">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function StatBar({ label, value, color }) {
  return (
    <div class="statbar">
      <span>{label}</span>
      <div class="statbar-track"><i style={{ width: `${Math.round(Math.max(0.04, Math.min(1, value)) * 100)}%`, background: color }} /></div>
    </div>
  );
}

export function Rarity({ r }) {
  const d = RARITY[r] || RARITY.common;
  return <span class="rarity" style={{ color: d.color, borderColor: d.color }}>{d.name}</span>;
}

export function Slider({ label, value, min, max, step = 0.01, onChange, format }) {
  return (
    <label class="ctl slider">
      <span class="ctl-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onInput={(e) => onChange(parseFloat(e.target.value))} />
      <span class="ctl-val">{format ? format(value) : value}</span>
    </label>
  );
}

export function Toggle({ label, value, onChange, hint }) {
  return (
    <label class="ctl toggle" onClick={(e) => { e.preventDefault(); audio.ui('uiClick'); onChange(!value); }}>
      <span class="ctl-label">{label}{hint && <small>{hint}</small>}</span>
      <span class={`switch ${value ? 'on' : ''}`}><i /></span>
    </label>
  );
}

export function Choice({ label, value, options, onChange }) {
  return (
    <div class="ctl choice">
      <span class="ctl-label">{label}</span>
      <div class="choice-opts">
        {options.map((o) => (
          <button key={String(o.v)} class={`chip ${o.v === value ? 'active' : ''}`} onClick={() => { audio.ui('uiClick'); onChange(o.v); }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function ColorRow({ label, value, swatches, onChange }) {
  return (
    <div class="color-row">
      <span class="ctl-label">{label}</span>
      <div class="swatches">
        {swatches.map((c) => (
          <button key={c} class={`swatch ${c.toLowerCase() === (value || '').toLowerCase() ? 'active' : ''}`} style={{ background: c }} onClick={() => { audio.ui('uiClick'); onChange(c); }} aria-label={c} />
        ))}
        <label class="swatch custom" style={{ background: value }} title="Custom color">
          <input type="color" value={value} onInput={(e) => onChange(e.target.value)} />
          <Icon name="plus" size={12} />
        </label>
      </div>
    </div>
  );
}

export function Countdown({ to }) {
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const left = Math.max(0, to - Date.now());
  const h = Math.floor(left / 3600000), m = Math.floor((left % 3600000) / 60000), s = Math.floor((left % 60000) / 1000);
  return <span class="mono">{`${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`}</span>;
}

export function nextUtcMidnight() {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

export function Empty({ text }) {
  return <div class="empty">{text}</div>;
}
