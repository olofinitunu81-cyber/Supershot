// Global gameplay & networking constants shared by client and server.

export const GAME_NAME = 'SUPERSHOT';
export const PROTOCOL_VERSION = 3;

// Simulation runs at a fixed tick on both client (prediction) and server (authority).
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY = 2; // server sends a snapshot every N ticks (30 Hz)
export const LOBBY_SEND_HZ = 12;

// Lag compensation / interpolation
export const MAX_REWIND_MS = 300;
export const INTERP_DELAY_MS = 90;

export const PLAYER = {
  halfWidth: 0.34,
  height: 1.82,
  crouchHeight: 1.28,
  eye: 1.64,
  crouchEye: 1.12,
  walkSpeed: 6.4,
  sprintMul: 1.42,
  crouchMul: 0.52,
  adsMoveMul: 0.66,
  accel: 11,
  airAccel: 2.4,
  friction: 7.5,
  stopSpeed: 2.2,
  gravity: 24,
  jumpVel: 7.9,
  stepHeight: 0.56,
  slideSpeed: 12.2,
  slideTime: 0.85,
  slideFriction: 1.15,
  slideCooldown: 0.55,
  maxHealth: 100,
  regenDelay: 4.5,
  regenRate: 34,
  spawnProtect: 1.75,
};

export const BTN = {
  JUMP: 1,
  CROUCH: 2,
  SPRINT: 4,
  FIRE: 8,
  ADS: 16,
  RELOAD: 32,
  MELEE: 64,
  INSPECT: 128,
};

export const MODES = {
  tdm: {
    id: 'tdm', name: 'TEAM DEATHMATCH', short: 'TDM', teams: true,
    maxPlayers: 12, timeLimit: 480, scoreLimit: 60, respawn: 3,
    desc: 'Two squads. One objective: out-frag the other team. First to the score limit wins.',
  },
  ffa: {
    id: 'ffa', name: 'FREE FOR ALL', short: 'FFA', teams: false,
    maxPlayers: 10, timeLimit: 420, scoreLimit: 25, respawn: 2.5,
    desc: 'Every player for themselves. First to the kill limit takes the crown.',
  },
};

export const MATCH = {
  countdown: 5,
  endDuration: 12,
  minHumansPublic: 1,
  fillWaitPublic: 6, // seconds the matchmaker waits for more humans before filling with bots
  joinInProgressMinTime: 45,
  assistWindow: 10,
  assistMinDamage: 20,
  multiKillWindow: 4.5,
};

export const TEAM_COLORS = [0x1fd1ff, 0xff3d6e]; // 0 = CYAN team, 1 = CRIMSON team
export const TEAM_NAMES = ['CYAN', 'CRIMSON'];
export const NO_TEAM = 255;

export const LOBBY = {
  maxPerInstance: 24,
  bounds: { minX: -29, maxX: 29, minZ: -21, maxZ: 21 },
};

export const LIMITS = {
  usernameMin: 3,
  usernameMax: 16,
  passwordMin: 6,
  chatMax: 140,
  maxFriends: 100,
  partyMax: 4,
};
