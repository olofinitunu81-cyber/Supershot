// Application controller: boot, connection, lobby/match lifecycle, panels.
import { Engine } from './engine/renderer.js';
import { audio } from './engine/audio.js';
import { LobbyScene } from './lobby/lobbyscene.js';
import { MatchClient } from './game/matchclient.js';
import { net } from './net.js';
import { input } from './input.js';
import { S, toast, pushChat } from './state.js';
import { getItem } from '../../shared/items.js';
import { WEAPONS } from '../../shared/weapons.js';

const TOKEN_KEY = 'supershot.token';
const PANEL_STATION = { play: 'play', locker: 'locker', armory: 'armory', shop: 'shop', leaderboard: 'leaderboard', missions: 'missions', friends: 'social', inventory: 'locker', profile: 'locker' };

function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } }

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

class App {
  constructor() {
    this.engine = null;
    this.lobby = null;
    this.match = null;
    this.pendingMatch = null;
  }

  async boot() {
    const canvas = document.getElementById('game');
    this.engine = new Engine(canvas);
    this.engine.applySettings(S.settings.value);
    input.attach(canvas);
    S.loading.value = { progress: 0.05, text: 'CALIBRATING DISPLAY' };
    await nextFrame();
    await this.engine.measureRefresh();
    this.engine.applySettings(S.settings.value);
    audio.setSettings(S.settings.value);
    await audio.init();
    S.loading.value = { progress: 0.15, text: 'SYNTHESIZING AUDIO' };
    await audio.prepare((f) => { S.loading.value = { progress: 0.15 + f * 0.35, text: 'SYNTHESIZING AUDIO' }; });
    S.loading.value = { progress: 0.55, text: 'CONNECTING TO SERVER' };
    this._bindNet();
    net.connect();
    this.engine.start((dt) => this.frame(dt));
    S.settings.subscribe((s) => {
      if (!this.engine) return;
      this.engine.applySettings(s);
      audio.setSettings(s);
      if (this.match) this.match.applySettings(s);
    });
    // unlock audio on first interaction
    const unlock = () => { audio.unlock().then(() => { if (S.screen.value === 'lobby') audio.startMusic(); }); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    input.on((type, locked) => {
      if (type === 'lock' && this.match) S.paused.value = !locked && !this.match.ended;
    });
  }

  _bindNet() {
    net.on('open', () => { S.conn.value = 'open'; });
    net.on('close', () => {
      S.conn.value = 'closed';
      if (this.match) this._endMatch();
    });
    net.on('hello', () => {
      const token = getToken();
      if (token) { S.loading.value = { progress: 0.6, text: 'SIGNING IN' }; net.send({ t: 'resume', token }); }
      else S.screen.value = 'auth';
    });
    net.on('auth.ok', (m) => this._onAuth(m));
    net.on('auth.err', (m) => {
      if (m.code === 'expired') { setToken(null); S.screen.value = 'auth'; return; }
      S.authError.value = m.msg;
      toast(m.msg, 'error');
      audio.ui('uiError');
      if (S.screen.value === 'boot') S.screen.value = 'auth';
    });
    net.on('profile', (m) => {
      const prevLevel = S.profile.value ? S.profile.value.level : 0;
      S.profile.value = m.profile;
      if (prevLevel && m.profile.level > prevLevel && !this.match) { toast(`LEVEL UP! You reached level ${m.profile.level}`, 'reward'); audio.ui('levelUp'); }
      if (this.lobby) this.lobby.refreshSelf();
    });
    net.on('friends', (m) => { S.friends.value = m.list; });
    net.on('party', (m) => { S.party.value = m.party; });
    net.on('party.invite', (m) => {
      S.invites.value = [...S.invites.value.filter((i) => i.partyId !== m.partyId), m];
      toast(`${m.fromName} invited you to their party`, 'invite', 6000);
      audio.ui('uiNotify');
    });
    net.on('room', (m) => { S.room.value = m.room; if (m.room && S.panel.value !== 'play' && !this.match) this.openPanel('play'); });
    net.on('mm.status', (m) => { S.mm.value = m; });
    net.on('online', (m) => { S.online.value = m.n; });
    net.on('notify', (m) => { toast(m.text, 'info'); audio.ui('uiNotify'); });
    net.on('err', (m) => { toast(m.msg, 'error'); audio.ui('uiError'); });
    net.on('kicked', (m) => { S.modal.value = { title: 'DISCONNECTED', text: m.reason, ok: 'RELOAD', onOk: () => location.reload() }; net.close(); });
    net.on('logged.out', () => { setToken(null); location.reload(); });
    net.on('lb', (m) => {
      S.lb.value = { ...S.lb.value, [m.board]: m };
      if (m.board === 'xp' && this.lobby) this.lobby.drawLeaderboard(m.rows);
    });
    net.on('shop.ok', (m) => { const it = getItem(m.item); toast(`Unlocked ${it ? it.name : m.item}!`, 'reward'); audio.ui('uiBuy'); });
    net.on('daily.ok', (m) => { toast(`Daily reward claimed: +${m.reward} credits`, 'reward'); audio.ui('uiReward'); });
    net.on('mission.ok', (m) => { toast(`Mission complete: +${m.reward} credits`, 'reward'); audio.ui('uiReward'); });
    net.on('claim.ok', () => { toast('Account secured! You can now sign in anywhere.', 'reward'); });
    net.on('chat', (m) => { if (!this.match) pushChat(m); });
    net.on('match.start', (m) => this._startMatch(m.match));
    net.on('match.close', () => this._endMatch());
    net.on('version', () => toast('A new version of SUPERSHOT is available — refresh to update.', 'info', 8000));
  }

  async _onAuth(m) {
    setToken(m.token);
    S.profile.value = m.profile;
    S.online.value = m.online;
    if (this.lobby) { S.screen.value = this.match ? 'match' : 'lobby'; return; }
    S.screen.value = 'boot';
    S.loading.value = { progress: 0.7, text: 'BUILDING HANGAR' };
    await nextFrame();
    this.lobby = new LobbyScene(this);
    S.loading.value = { progress: 0.95, text: 'READY' };
    await nextFrame();
    if (!this.match) {
      this.lobby.activate();
      S.screen.value = 'lobby';
      audio.startMusic();
    }
    net.send({ t: 'lb.get', board: 'xp' });
    if (this.pendingMatch) { const pm = this.pendingMatch; this.pendingMatch = null; this._startMatch(pm); }
  }

  // ───────────── auth actions ─────────────
  login(username, password) { net.send({ t: 'login', username, password }); }
  register(username, password) { net.send({ t: 'register', username, password }); }
  guest() { net.send({ t: 'guest' }); }
  logout() { net.send({ t: 'logout' }); }

  // ───────────── panels ─────────────
  openPanel(panel, stationId) {
    if (this.match) return;
    S.panel.value = panel;
    if (this.lobby) this.lobby.setFocus(stationId || PANEL_STATION[panel] || null);
    if (panel === 'leaderboard') net.send({ t: 'lb.get', board: 'xp' });
    if (panel === 'friends') net.send({ t: 'friends.get' });
  }

  closePanel() {
    S.panel.value = null;
    if (this.lobby) {
      this.lobby.setFocus(null);
      const p = S.profile.value;
      if (p) { this.lobby.previewAvatar(p.avatar); this.lobby.previewWeapon(p.loadout.primary, p.camos[p.loadout.primary]); }
    }
  }

  focus(stationId) { if (this.lobby) this.lobby.setFocus(stationId); }
  previewAvatar(app) { if (this.lobby) this.lobby.previewAvatar(app); }
  previewWeapon(id, camo) { if (this.lobby) this.lobby.previewWeapon(id, camo); }

  // ───────────── matches ─────────────
  async _startMatch(info) {
    if (!this.lobby) { this.pendingMatch = info; return; }
    if (this.match) this.match.dispose();
    S.panel.value = null;
    this.lobby.setFocus(null);
    S.matchEnd.value = null;
    S.screen.value = 'loading';
    S.loading.value = { progress: 0.3, text: 'DEPLOYING' };
    audio.stopMusic(0.6);
    // roster changes that arrive while the map loads must not be lost
    const offs = [
      net.on('pjoin', (m) => { if (!info.players.some((p) => p.pid === m.p.pid)) info.players.push(m.p); }),
      net.on('pleave', (m) => { info.players = info.players.filter((p) => p.pid !== m.pid); }),
      net.on('scores', (m) => { info.teamScores = m.teams; info.scores = m.rows; }),
    ];
    await nextFrame();
    offs.forEach((off) => off());
    try {
      this.match = new MatchClient(this, info);
    } catch (e) {
      console.error(e);
      toast('Failed to load the match.', 'error');
      net.send({ t: 'match.leave' });
      return;
    }
    S.screen.value = 'match';
    S.paused.value = !input.locked;
    audio.play('stinger', { bus: 'announcer', jitter: false });
    if (info.phase === 'countdown') audio.announce('Get ready', { stinger: false });
  }

  _endMatch() {
    if (this.match) { this.match.dispose(); this.match = null; }
    input.unlock();
    S.matchEnd.value = null;
    S.paused.value = false;
    if (this.lobby) {
      this.lobby.activate();
      S.screen.value = 'lobby';
      audio.startMusic();
      net.send({ t: 'lb.get', board: 'xp' });
    }
  }

  leaveMatch() {
    if (this.match) this.match.leave();
  }

  // ───────────── frame ─────────────
  frame(dt) {
    if (this.match && (S.screen.value === 'match')) this.match.frame(dt);
    else if (this.lobby && S.screen.value === 'lobby') this.lobby.frame(dt);
    this.engine.render();
  }

  equipCost(id) {
    const def = WEAPONS[id];
    return def ? def.price : 0;
  }
}

export const app = new App();
