# SALTWORKS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Fanyway/threejs-fps-02-/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Fanyway/threejs-fps-02-/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

[![threejs-fps-02](https://img.shields.io/badge/make.fun-threejs--fps--02-orange)](https://make.fun)
[![three.js 0.187.0](https://img.shields.io/badge/three.js-0.187.0-blue)](https://threejs.org)

A tactical FPS in three.js: 5v5 bomb-plant rounds on an original map — a
decommissioned saltworks at dusk. You are the Breakers' bomb carrier. Plant the
charge at Crusher Hall (A) or the Silo Yard (B), or clear the Wardens first.

## How it plays

- **Rounds:** buy 12 s → live 100 s → round end 5 s. First to 5 rounds takes the
  match (max 9). The bomb plants in 3 s, defuses in 5 s, detonates after a 40 s fuse.
- **Economy:** $800 to start, +$3250 for a round win, +$300 per elimination,
  +$300 for the plant. Spend it in the buy menu (B, buy phase only) on the
  Hornet-9 SMG, Marauder AR, Harpoon.50 sniper, Popper HE, Haze smoke, Flare
  flash, or a vest.
- **Gunplay:** four weapons with their own recoil, spread and fire rate; headshots
  deal extra damage; firing on the move blooms your spread. Crouch (Ctrl),
  jump (Space), reload (R), throw a grenade (G).
- **Bots:** four attacker teammates and five defenders follow waypoint routes,
  hold angles, react to sight and to gunfire, rotate to a planted bomb, and
  defuse. If you die carrying the charge, a teammate picks it up.
- **Map:** two sites, a mid causeway, salt mounds, ponds, crates and a conveyor
  arch — built from an original layout, never a copy of a commercial map.

## Run it

```sh
node serve.ts   # http://localhost:8080
```

Static files only — no build step. three.js 0.187.0 is vendored in
`game/vendor/three/`. Screenshots are deterministic renders of the game's own
code: `?shot=start|buy|play|end&seed=N`.
