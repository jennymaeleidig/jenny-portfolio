---
year: 2025
status: study
category: games
cover: /assets/projects/playdate-dungeon/cover.png
tags:
  - playdate
  - lua
  - noble engine
  - crank input
  - input handling
links:
  Repo: https://github.com/jennymaeleidig/playdate-dungeon
---
# Playdate Dungeon

A dungeon crawler battle system built around the Playdate's crank: turn it to walk a target marker across three enemies, swing it to commit an attack. A proof of concept — there is a battle and nothing around it.

I made it to learn Noble Engine on the Playdate SDK, working in Lua after the PICO-8 work. The crank is the whole reason the project exists: it has no buttons, only `cranked` events that hand you a delta, so every menu in the battle is built out of accumulated ticks. Thirty ticks one way or the other and the selection moves, or the swing lands left versus right. The D-pad still opens the menus; the crank does the choosing.

Noble Engine's input handlers made the nested menus work: one handler for the battle's four options, which swaps to a handler for selecting a target, which swaps again to one that reads the crank as an attack. Each player action is a subclass of a base action carrying a name, a cost and its own input handler, plus enter and exit hooks for the menu it owns. Attack, defend, item and flee are all built that way, and each one spends from a pool of moves.

The turn loop is a queue that flips between the player and the enemies each time one ends. Enemies carry HP, attack and defence, and three of them — a slime, a gorb and a bat — sit at fixed coordinates across the top of the screen. Everything is drawn in the system font: no sprites, no art, and some of the numbers are hardcoded with a TODO to move them into a config.

It stays a study. The battle loop, the menus and the crank all work; what it would need next is the dungeon.
