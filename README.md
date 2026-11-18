# SUPERSHOT

**A fast, stylish online multiplayer first-person shooter that runs in the browser.**

20 guns, 10 melee weapons, Roblox-inspired customizable avatars, a walkable 3D social lobby,
a credits economy with a shop, daily rewards and missions, and real online matches
(Team Deathmatch and Free For All) on an authoritative game server with lag-compensated hit detection.

Every model, texture, sound effect and music track is generated procedurally at runtime: no
third-party art or audio assets are used. Fonts are bundled from Fontsource (SIL Open Font License).

---

## Quick start

Requirements: **Node.js 22.13+** (uses the built-in `node:sqlite`) and a WebGL 2 capable browser.

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

Open <http://localhost:3000>. To play with friends on your network, they open `http://<your-ip>:3000`.

Development mode (rebuilds the client and restarts the server on change):

```bash
npm run dev
```

### Configuration

| Variable   | Default        | Purpose                                           |
| ---------- | -------------- | ------------------------------------------------- |
| `PORT`     | `3000`         | HTTP + WebSocket port                             |
| `DATA_DIR` | `./data`       | Where the SQLite database (`supershot.db`) lives  |

---

## Deploying online

SUPERSHOT is a single Node process that serves both the web client and the WebSocket game
server on the same port, so it deploys anywhere that runs a Docker container or Node 22.
Mount a persistent volume at `DATA_DIR` so accounts, credits and purchases survive restarts.

**Docker**

```bash
docker build -t supershot .
```

```bash
docker run -p 3000:3000 -v supershot-data:/data supershot
```

**Render**: `render.yaml` is included. Create a new Blueprint from this repository and it
provisions the service with a persistent disk.

**Fly.io / Railway / any VPS**: deploy the Dockerfile and attach a volume at `/data`. Put it
behind HTTPS (the client automatically uses `wss://` when served over HTTPS). The server
respects `X-Forwarded-For` and exposes `GET /healthz`.

---

## Features

### Combat
- **20 guns** across assault rifles, SMGs, shotguns, snipers, a DMR, a railgun, LMGs, a minigun,
  pistols, a machine pistol and a grenade launcher. Fire modes: full-auto, semi, 3-round burst,
  pump, bolt-action, charge (railgun pierces through players) and spin-up (minigun). Each gun has
  its own model, recoil pattern, spread/bloom, damage falloff, head/limb multipliers, reload
  (magazine, per-shell, break-action, revolver) and synthesized sound.
- **10 melee weapons**: knife, karambit, twin daggers, machete, katana, tomahawk, battle axe,
  plasma saber, nanoblade and reaper scythe, with unique swing animations, trails, lunges and
  backstab bonuses. Quick-melee on `V` with any weapon.
- Movement: sprint, jump (with buffered input), crouch, **slide**, stairs, jump pads, ADS,
  weapon switching (keys or mouse wheel), inspect.
- Spawn protection, health regeneration, assists, multi-kills, streaks, first blood, revenge,
  scavenger ammo, fall deaths, explosion knockback.

### Online multiplayer
- **Authoritative server** at 60 Hz. Clients send compact binary input commands; the server
  simulates every player with the same shared movement and weapon code.
- **Client-side prediction + reconciliation** with smoothed error correction for instant controls.
- **Lag-compensated, server-side hit detection**: the server rewinds player hitboxes (head/torso/limbs)
  to what the shooter saw. Pellet patterns use a shared deterministic RNG so client effects match
  server results.
- 30 Hz binary snapshots with entity interpolation, plus per-tick shot events for remote gunfire.
- **Matchmaking** for TDM (6v6) and FFA (10 players) with join-in-progress; empty slots are filled
  with clearly labelled bots (navmesh pathfinding, reaction times, aim error, strafing) that are
  swapped out as real players join.
- **Private matches** with 6-character codes: mode, map, time and score limits, bot count and
  skill, team selection and kicking.
- **Friends** (requests, presence: lobby, searching, in match), **parties** (up to 4, queue together)
  and chat (lobby, party, match, team).

### Avatars & progression
- Blocky, Roblox-inspired avatars: 9 outfits, 6 head shapes, 14 faces, 11 hairstyles, 15 hats,
  8 face gear items, 11 tops, 7 bottoms, 8 back items and 8 emotes, with free color customization
  for skin, hair, top, bottoms and accent. Live 3D preview on the Locker turntable.
- **Credits** earned from matches (kills, assists, headshots, wins/placement), daily login streak
  rewards and three daily missions. Spend them in the **Shop** (daily featured items at 25% off)
  on weapons, 13 weapon camos and cosmetics. Everything is validated and persisted server-side.
- XP and levels with level-up bonuses, career stats and **leaderboards** (level, eliminations, wins).

### Lobby & UI
- Walkable 3D hangar shared with other online players: deploy gate, locker, armory weapon wall,
  shop kiosk, leaderboard screen, daily/missions and social terminals, emotes, smooth camera
  flights between stations.
- Custom SUPERSHOT logo and bold italic typography (Exo 2, Chakra Petch, Rajdhani, Teko).
  The interface uses animated panels, 3D item thumbnails, and an esports-style HUD with a
  scoreboard, kill feed, hitmarkers, damage numbers and directional damage indicators.

### Graphics & performance
- Low / Medium / High / Ultra presets: PCF shadows (up to 4096²), GTAO ambient occlusion,
  baked per-vertex AO, bloom, SMAA/FXAA and MSAA, PMREM reflections, procedural skies and weather.
- **Frame pacing** for 60/120/144/165/240 Hz displays: VSync, fixed caps (including caps above the
  display refresh) and an **Unlimited** mode. The display refresh rate is detected automatically.
- Static map geometry is merged per material, so a whole map takes about 15 draw calls. Snapshots are
  roughly 14 KB/s per client, and a 12-player match costs under 0.1 ms of server CPU per tick.

### Maps
| Map | Theme | Notes |
| --- | --- | --- |
| **Neon District** | Rainy cyberpunk downtown at night | Three lanes, shops, rooftops, footbridges |
| **Skyport** | Floating docks at sunset | Bridges, jump pads, lethal drops |
| **Dune Outpost** | Desert compound | Sniper flanks, courtyard CQB, watchtowers |
| **Cryo Labs** | Arctic facility in snowfall | Lab interiors, mezzanine, catwalks |
| **The Core** | Reactor arena | Compact 4-way symmetric FFA arena |

Team maps are rotationally symmetric for balance. Every spawn is validated as reachable by the navmesh.

---

## Controls

| Action | Default |
| --- | --- |
| Move / Jump | `W A S D` / `Space` |
| Sprint / Crouch & slide | `Shift` / `C` |
| Fire / Aim | Left / right mouse |
| Reload / Quick melee / Inspect | `R` / `V` / `F` |
| Weapons | `1` `2` `3` or mouse wheel |
| Scoreboard / Chat / Team chat | `Tab` / `Enter` / `Y` |
| Lobby: interact / emotes | `E` / `1`–`8` |

All bindings (including mouse buttons) are rebindable in **Settings → Keybinds**, along with
sensitivity, ADS sensitivity, FOV, toggle crouch/aim, crosshair style and color, and volume buses.

---

## Testing

```bash
npm test
```

This runs the unit tests for shared physics, weapons, hitboxes, protocol and maps, plus the
server integration tests over real WebSocket connections.

Browser end-to-end tests drive the real client in headless Chromium via Playwright:

```bash
node scripts/e2e.mjs screenshots
```

```bash
node scripts/e2e-multi.mjs screenshots
```

`e2e-multi` launches two separate browsers that see each other in the lobby, chat, become
friends, join a private match by code and fight. It verifies server-side hit registration, end-of-match
rewards and persistence.

---

## Project layout

```
shared/   Deterministic game code used by both client and server
          config, physics (collision + movement), sim (weapon state machine), weapons,
          items, avatar, missions, progression, hitbox, protocol, maps/ (DSL + 5 maps + lobby)
server/   index (HTTP + WebSocket), db (SQLite), profiles (accounts & economy), social,
          lobby, matchmaker, match (authoritative simulation), bots, nav (navmesh + A*)
client/   src/engine (renderer, textures, materials, map builder, props, weapon models,
          avatars, effects, audio), src/game (match client, viewmodel, HUD),
          src/lobby, src/ui (Preact screens), styles
scripts/  build, dev, map viewer, end-to-end tests
tests/    node:test suites
```
