// In-match HUD (direct DOM for zero-overhead per-frame updates).
import { WEAPONS, weaponByIndex, CLASS_NAMES } from '../../../shared/weapons.js';
import { TEAM_NAMES, NO_TEAM } from '../../../shared/config.js';
import { formatTime } from '../../../shared/math.js';
import { S } from '../state.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class HUD {
  constructor(container, ctx) {
    this.ctx = ctx; // { selfPid, team, teams, mode, scoreLimit, players: Map }
    const el = document.createElement('div');
    el.className = 'hud';
    el.innerHTML = `
      <div class="hud-vignette"></div>
      <div class="hud-dmg-flash"></div>
      <div class="hud-scope"><div class="scope-ring"></div><div class="scope-h"></div><div class="scope-v"></div></div>
      <div class="hud-top">
        <div class="hud-team hud-team-a"><div class="tname"></div><div class="tscore">0</div><div class="tbar"><i></i></div></div>
        <div class="hud-clock"><div class="clock-time">0:00</div><div class="clock-mode"></div></div>
        <div class="hud-team hud-team-b"><div class="tname"></div><div class="tscore">0</div><div class="tbar"><i></i></div></div>
      </div>
      <div class="hud-stats"><span class="fps"></span><span class="ping"></span></div>
      <div class="hud-killfeed"></div>
      <div class="hud-cross"><i class="c-t"></i><i class="c-b"></i><i class="c-l"></i><i class="c-r"></i><i class="c-dot"></i><i class="c-circle"></i></div>
      <div class="hud-hitmarker"><i></i><i></i><i></i><i></i></div>
      <div class="hud-dmgind"></div>
      <div class="hud-numbers"></div>
      <div class="hud-center">
        <div class="hud-announce"></div>
        <div class="hud-banner"></div>
      </div>
      <div class="hud-countdown"></div>
      <div class="hud-protect">SPAWN PROTECTION</div>
      <div class="hud-bottom-left">
        <div class="hud-chat"><div class="chat-lines"></div><input class="chat-input" maxlength="140" placeholder="Press Enter to chat…" /></div>
        <div class="hud-health"><div class="hp-label">HP</div><div class="hp-num">100</div><div class="hp-bar"><i></i><b></b></div></div>
      </div>
      <div class="hud-bottom-right">
        <div class="hud-slots"><div class="slot s0"><b>1</b><span></span></div><div class="slot s1"><b>2</b><span></span></div><div class="slot s2"><b>3</b><span></span></div></div>
        <div class="hud-ammo"><div class="wname"></div><div class="ammo-row"><span class="mag">30</span><span class="sep">/</span><span class="res">120</span></div><div class="reload-bar"><i></i></div></div>
      </div>
      <div class="hud-death"><div class="death-title">ELIMINATED</div><div class="death-by"></div><div class="death-weapon"></div><div class="death-timer"></div></div>
      <div class="hud-scoreboard"></div>
      <div class="hud-hint"></div>
    `;
    container.appendChild(el);
    this.el = el;
    const $ = (s) => el.querySelector(s);
    this.$ = $;
    this.r = {
      vignette: $('.hud-vignette'), flash: $('.hud-dmg-flash'), scope: $('.hud-scope'),
      teamA: $('.hud-team-a'), teamB: $('.hud-team-b'), clock: $('.clock-time'), mode: $('.clock-mode'),
      fps: $('.fps'), ping: $('.ping'), feed: $('.hud-killfeed'), cross: $('.hud-cross'), hit: $('.hud-hitmarker'),
      dmgind: $('.hud-dmgind'), numbers: $('.hud-numbers'), announce: $('.hud-announce'), banner: $('.hud-banner'),
      countdown: $('.hud-countdown'), protect: $('.hud-protect'), chatLines: $('.chat-lines'), chatInput: $('.chat-input'),
      hpNum: $('.hp-num'), hpBar: $('.hp-bar i'), hpGhost: $('.hp-bar b'), health: $('.hud-health'),
      slots: [$('.s0'), $('.s1'), $('.s2')], wname: $('.wname'), mag: $('.mag'), res: $('.res'), reload: $('.reload-bar i'), ammo: $('.hud-ammo'),
      death: $('.hud-death'), deathBy: $('.death-by'), deathWeapon: $('.death-weapon'), deathTimer: $('.death-timer'),
      board: $('.hud-scoreboard'), hint: $('.hud-hint'),
    };
    this.r.mode.textContent = ctx.mode === 'tdm' ? 'TEAM DEATHMATCH' : 'FREE FOR ALL';
    this.last = {};
    this.hitT = 0;
    this.annT = 0;
    this.bannerT = 0;
    this.hpGhostV = 100;
    this.chatOpen = false;
    this.scores = { teams: [0, 0], rows: [] };
    this.applyCrosshair();
  }

  applyCrosshair() {
    const s = S.settings.value;
    const c = this.r.cross;
    c.dataset.style = s.crosshairStyle;
    c.style.setProperty('--cc', s.crosshairColor);
    c.style.setProperty('--cs', s.crosshairSize);
  }

  set(key, value, fn) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    fn(value);
  }

  // ───────────── per frame ─────────────
  frame(dt, st) {
    // st: { hp, mag, reserve, def, slot, slots, reloadP, spreadPx, scoped, adsT, phase, phaseTime, fps, ping, protect, alive, sprint }
    this.set('hp', Math.ceil(st.hp), (v) => {
      this.r.hpNum.textContent = v;
      this.r.hpBar.style.transform = `scaleX(${v / 100})`;
      this.r.health.classList.toggle('low', v <= 35);
    });
    this.hpGhostV += (st.hp - this.hpGhostV) * Math.min(1, dt * 3);
    this.r.hpGhost.style.transform = `scaleX(${Math.max(st.hp, this.hpGhostV) / 100})`;
    const lowK = st.alive ? Math.max(0, (40 - st.hp) / 40) : 0;
    this.set('vig', Math.round(lowK * 20), (v) => { this.r.vignette.style.opacity = v / 20; });
    const def = st.def;
    if (def) {
      this.set('wname', def.name, (v) => { this.r.wname.textContent = v; });
      const isGun = def.kind === 'gun';
      this.set('ammo', isGun ? `${st.mag}|${st.reserve}` : 'melee', () => {
        if (!isGun) { this.r.mag.textContent = '∞'; this.r.res.textContent = ''; this.r.ammo.classList.add('melee'); }
        else {
          this.r.ammo.classList.remove('melee');
          this.r.mag.textContent = st.mag;
          this.r.res.textContent = st.reserve;
          this.r.mag.classList.toggle('low', st.mag <= Math.max(1, Math.floor(def.mag * 0.25)));
        }
      });
    }
    this.set('reload', st.reloadP > 0 ? Math.round(st.reloadP * 50) : -1, (v) => {
      this.r.ammo.classList.toggle('reloading', v >= 0);
      if (v >= 0) this.r.reload.style.transform = `scaleX(${v / 50})`;
    });
    this.set('slot', st.slot, (v) => this.r.slots.forEach((s, i) => s.classList.toggle('active', i === v)));
    this.set('slotnames', st.slots.map((s) => s.id).join(','), () => st.slots.forEach((s, i) => { this.r.slots[i].querySelector('span').textContent = WEAPONS[s.id].short; }));
    // crosshair
    const showCross = st.alive && !st.scoped && !(st.adsT > 0.6 && def && def.kind === 'gun') && !st.sprint;
    this.set('crossVis', showCross, (v) => this.r.cross.classList.toggle('hidden', !v));
    this.set('spread', Math.round(st.spreadPx), (v) => this.r.cross.style.setProperty('--gap', `${v}px`));
    this.set('scope', st.scoped, (v) => this.r.scope.classList.toggle('on', v));
    // hitmarker fade
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.r.hit.className = 'hud-hitmarker'; }
    if (this.annT > 0) { this.annT -= dt; if (this.annT <= 0) this.r.announce.classList.remove('show'); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.r.banner.classList.remove('show'); }
    // clock
    this.set('clock', Math.ceil(st.phaseTime), (v) => { this.r.clock.textContent = formatTime(v); this.r.clock.classList.toggle('urgent', st.phase === 1 && v <= 30); });
    this.set('countdown', st.phase === 0 ? Math.ceil(st.phaseTime) : 0, (v) => {
      this.r.countdown.textContent = v > 0 ? v : '';
      this.r.countdown.classList.toggle('show', v > 0);
      if (v > 0) { this.r.countdown.classList.remove('pop'); void this.r.countdown.offsetWidth; this.r.countdown.classList.add('pop'); }
    });
    this.set('protect', st.protect && st.alive, (v) => this.r.protect.classList.toggle('show', v));
    const s = S.settings.value;
    this.set('fps', s.showFps ? st.fps : -1, (v) => { this.r.fps.textContent = v >= 0 ? `${v} FPS` : ''; });
    this.set('ping', s.showPing ? Math.round(st.ping) : -1, (v) => { this.r.ping.textContent = v >= 0 ? `${v} MS` : ''; });
    // damage indicators & numbers decay
    for (const d of [...this.r.dmgind.children]) {
      const t = (d._t = (d._t || 0) + dt);
      d.style.opacity = Math.max(0, 1 - t / 1.4);
      if (t > 1.4) d.remove();
      else if (d._update) d._update();
    }
    for (const n of [...this.r.numbers.children]) {
      n._t += dt;
      if (n._t > 0.9) { n.remove(); continue; }
      n.style.transform = `translate(${n._x}px, ${n._y - n._t * 50}px) scale(${n._t < 0.1 ? 1 + (0.1 - n._t) * 6 : 1})`;
      n.style.opacity = 1 - Math.max(0, (n._t - 0.5) / 0.4);
    }
  }

  // ───────────── events ─────────────
  hitmarker(kind) {
    const h = this.r.hit;
    h.className = 'hud-hitmarker';
    void h.offsetWidth;
    h.className = `hud-hitmarker show ${kind}`;
    this.hitT = kind === 'kill' ? 0.45 : 0.22;
  }

  damageFlash(amount) {
    const f = this.r.flash;
    f.style.opacity = Math.min(0.75, 0.2 + amount / 80);
    f.classList.remove('fade'); void f.offsetWidth; f.classList.add('fade');
  }

  damageIndicator(getAngle) {
    const d = document.createElement('div');
    d.className = 'dmg-arc';
    d._update = () => { d.style.transform = `translate(-50%,-50%) rotate(${getAngle()}rad)`; };
    d._update();
    this.r.dmgind.appendChild(d);
    while (this.r.dmgind.children.length > 6) this.r.dmgind.firstChild.remove();
  }

  damageNumber(x, y, amount, head) {
    if (!S.settings.value.damageNumbers) return;
    const n = document.createElement('div');
    n.className = 'dmg-num' + (head ? ' head' : '');
    n.textContent = Math.round(amount);
    n._x = x + (Math.random() - 0.5) * 30; n._y = y - 20; n._t = 0;
    n.style.transform = `translate(${n._x}px, ${n._y}px)`;
    this.r.numbers.appendChild(n);
    while (this.r.numbers.children.length > 14) this.r.numbers.firstChild.remove();
  }

  announce(text, kind = '', dur = 2.2) {
    const a = this.r.announce;
    a.textContent = text;
    a.className = `hud-announce ${kind}`;
    void a.offsetWidth;
    a.classList.add('show');
    this.annT = dur;
  }

  banner(html, dur = 1.8) {
    const b = this.r.banner;
    b.innerHTML = html;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    this.bannerT = dur;
  }

  name(pid) {
    const p = this.ctx.players.get(pid);
    return p ? p.info.name : '???';
  }

  teamOf(pid) {
    const p = this.ctx.players.get(pid);
    return p ? p.info.team : NO_TEAM;
  }

  killfeed(k) {
    const row = document.createElement('div');
    row.className = 'kf-row';
    const self = this.ctx.selfPid;
    if (k.k === self || k.v === self) row.classList.add('me');
    const wd = weaponByIndex(k.w);
    const cls = (pid) => {
      const t = this.teamOf(pid);
      if (pid === self) return 'kf-name self';
      if (!this.ctx.teams) return 'kf-name enemy';
      return `kf-name ${t === this.ctx.team ? 'ally' : 'enemy'}`;
    };
    const icon = k.r === 'fall' ? 'FELL' : wd ? wd.short : '☠';
    row.innerHTML = `${k.k ? `<span class="${cls(k.k)}">${esc(this.name(k.k))}</span>` : ''}<span class="kf-weapon">${esc(icon)}</span>${k.h ? '<span class="kf-head">◎</span>' : ''}<span class="${cls(k.v)}">${esc(this.name(k.v))}</span>`;
    this.r.feed.prepend(row);
    setTimeout(() => row.classList.add('out'), 6000);
    setTimeout(() => row.remove(), 6600);
    while (this.r.feed.children.length > 6) this.r.feed.lastChild.remove();
  }

  notice(text) {
    const row = document.createElement('div');
    row.className = 'kf-row notice';
    row.textContent = text;
    this.r.feed.prepend(row);
    setTimeout(() => row.remove(), 4000);
  }

  showDeath(killerName, weaponDef, respawnIn, reason) {
    this.r.death.classList.add('show');
    this.r.deathBy.innerHTML = reason === 'fall' ? 'YOU FELL TO YOUR DEATH' : killerName ? `BY <b>${esc(killerName)}</b>` : '';
    this.r.deathWeapon.textContent = weaponDef ? `${weaponDef.name} · ${CLASS_NAMES[weaponDef.cls] || ''}` : '';
    this.deathUntil = performance.now() + respawnIn * 1000;
    clearInterval(this.deathTimer);
    const tick = () => {
      const left = Math.max(0, (this.deathUntil - performance.now()) / 1000);
      this.r.deathTimer.textContent = left > 0 ? `RESPAWNING IN ${left.toFixed(1)}` : 'RESPAWNING…';
    };
    tick();
    this.deathTimer = setInterval(tick, 100);
  }

  hideDeath() {
    this.r.death.classList.remove('show');
    clearInterval(this.deathTimer);
  }

  setScores(sc) {
    this.scores = sc;
    const ctx = this.ctx;
    if (ctx.teams) {
      const mine = ctx.team === 1 ? 1 : 0;
      const a = sc.teams[mine], b = sc.teams[1 - mine];
      this._team(this.r.teamA, `${TEAM_NAMES[mine]}`, a, mine, true);
      this._team(this.r.teamB, `${TEAM_NAMES[1 - mine]}`, b, 1 - mine, false);
    } else {
      const rows = [...sc.rows].sort((x, y) => y[1] - x[1] || y[4] - x[4]);
      const me = rows.find((r) => r[0] === ctx.selfPid);
      const leader = rows[0];
      const second = rows.find((r) => r[0] !== ctx.selfPid) || [0, 0];
      const meIsLeader = leader && me && leader[0] === me[0];
      this._team(this.r.teamA, 'YOU', me ? me[1] : 0, 0, true);
      this._team(this.r.teamB, meIsLeader ? this.name(second[0]) : `${this.name(leader ? leader[0] : 0)}`, meIsLeader ? second[1] : (leader ? leader[1] : 0), 1, false);
    }
    if (this.boardOpen) this.renderBoard();
  }

  _team(el, name, score, teamIdx, mine) {
    el.querySelector('.tname').textContent = name;
    el.querySelector('.tscore').textContent = score;
    el.querySelector('.tbar i').style.transform = `scaleX(${Math.min(1, score / this.ctx.scoreLimit)})`;
    el.dataset.team = this.ctx.teams ? teamIdx : (mine ? 0 : 1);
  }

  toggleBoard(open) {
    this.boardOpen = open;
    this.r.board.classList.toggle('show', open);
    if (open) this.renderBoard();
  }

  renderBoard() {
    const ctx = this.ctx;
    const rows = [...this.scores.rows].sort((a, b) => b[4] - a[4] || b[1] - a[1]);
    const row = (r, i) => {
      const p = ctx.players.get(r[0]);
      const info = p ? p.info : { name: '?', level: 1, bot: false };
      return `<tr class="${r[0] === ctx.selfPid ? 'me' : ''}"><td class="rk">${i + 1}</td><td class="nm">${info.bot ? '<span class="bot">BOT</span>' : `<span class="lvl">${info.level}</span>`}${esc(info.name)}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${r[6] || 0}</td><td class="pg">${info.bot ? '—' : r[5]}</td></tr>`;
    };
    const head = '<tr><th>#</th><th>PLAYER</th><th>K</th><th>D</th><th>A</th><th>SCORE</th><th>DMG</th><th>PING</th></tr>';
    if (ctx.teams) {
      const t = (team) => rows.filter((r) => (ctx.players.get(r[0])?.info.team) === team);
      const block = (team) => `<div class="sb-team" data-team="${team}"><div class="sb-head"><span>${TEAM_NAMES[team]}</span><b>${this.scores.teams[team]}</b></div><table>${head}${t(team).map(row).join('')}</table></div>`;
      const mine = ctx.team === 1 ? 1 : 0;
      this.r.board.innerHTML = `<div class="sb-title">SCOREBOARD <span>FIRST TO ${ctx.scoreLimit}</span></div>${block(mine)}${block(1 - mine)}`;
    } else {
      this.r.board.innerHTML = `<div class="sb-title">SCOREBOARD <span>FIRST TO ${ctx.scoreLimit} ELIMINATIONS</span></div><div class="sb-team" data-team="ffa"><table>${head}${rows.map(row).join('')}</table></div>`;
    }
  }

  addChat(m) {
    const line = document.createElement('div');
    line.className = `chat-line ch-${m.ch}`;
    const tag = m.ch === 'team' ? '[TEAM] ' : m.ch === 'party' ? '[PARTY] ' : '';
    line.innerHTML = `<b>${esc(tag + m.from)}:</b> ${esc(m.text)}`;
    this.r.chatLines.appendChild(line);
    setTimeout(() => line.classList.add('old'), 8000);
    while (this.r.chatLines.children.length > 8) this.r.chatLines.firstChild.remove();
  }

  openChat(team) {
    this.chatOpen = true;
    this.chatTeam = team;
    const i = this.r.chatInput;
    this.el.classList.add('chatting');
    i.placeholder = team ? 'Team chat…' : 'Say something…';
    i.value = '';
    i.focus();
  }

  closeChat() {
    this.chatOpen = false;
    this.el.classList.remove('chatting');
    this.r.chatInput.blur();
  }

  hint(text) {
    this.set('hint', text || '', (v) => { this.r.hint.textContent = v; this.r.hint.classList.toggle('show', !!v); });
  }

  dispose() {
    clearInterval(this.deathTimer);
    this.el.remove();
  }
}
