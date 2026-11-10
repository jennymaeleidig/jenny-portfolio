---
year: 2024
status: wip
category: games
cover: /assets/projects/pico-dragoon/cover.jpg
tags:
  - pico-8
  - lua
  - vector math
  - sprite animation
  - demake
links:
  repo: https://github.com/jennymaeleidig/pico-dragoon
---
# Pico Dragoon Mini

A PICO-8 demake of *Panzer Dragoon Mini*, the Panzer Dragoon that shipped on the Sega Game Gear and never reached the United States. One dragon, a rail over banded water, and a reticle you fly across the sky.

This was the first game I made in PICO-8 and the first in Lua, started in 2024 with very little idea of what I was doing. PICO-8 gives you a 128×128 screen, a token budget and almost nothing else, so most of the work was learning to build the parts myself — vectors, collision bounds, scene changes, the lot. It was also my first real brush with vector math, and being made to write it by hand at that level stuck with me.

The cart holds the whole game in one file per concern, stitched together with `#include`: `utils` for the vector library, drawing helpers and RLE string assets; `objects` for the player, projectiles, reticle and HUD; `lifecycles` for the menu, character select and stage. Without an engine to hang behaviour on, I settled on one object pattern and used it everywhere: a constructor that returns a table carrying its own `update` and `draw` closures, with the stage loop handing each object back to itself. Projectiles and the reticle are both built that way, and so is the player.

The stage is a trick of bands. The ground is four hand-written rows of fills that step through a keyframe every six frames, which reads as forward motion without a single sprite, and each stage sets its own palette before drawing. The dragon is three stacked sprites cycling on a twelve-frame wing beat.

The reticle was the mechanic I wanted. Tapping fire shoots at wherever it sits; holding fire charges a lock-on, and the reticle changes shape once it has charged for twenty frames. The charging is real; the pay-off is where I stopped — the locked shot still needs the stage to have something worth locking onto.

It is still a work in progress: one stage, three dragons to choose from, and no sound yet. The code has been quiet since late 2024, but I would like to come back to it now that I understand the ecosystem, and finish the lock-on and take the game past stage one.
