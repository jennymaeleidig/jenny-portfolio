---
year: 2024
status: shipped
category: games
cover: /assets/projects/yolked/cover.png
tags:
  - godot
  - gdscript
  - aseprite
  - physics
  - game jam
links:
  Itch.io: https://gbreadfish.itch.io/yolked
  Repo: https://github.com/lazy-sundays/fracture-game
---
# Yolked

A virtual desktop toy: an egg you fling around by shaking the game window itself. The harder you shake, the faster it flies and the more it cracks. It never ends.

I made it for the Goblin Bunker Game Jam in May 2024, the theme "Fracture", with [Evan Sooklal](https://www.lazysundays.net/authors/evan-sooklal) doing the art and the blurb and [Devin Toms](https://www.lazysundays.net/authors/devin-toms) on additional code. It was my first game jam, and my first time in Godot.

The idea came from *Animal Well*: in windowed mode, dragging the window moves the game's physics around. I wanted to know if that was reachable, so I built the egg's launch out of the window's own displacement in Godot — read how far and how fast the window moved, hand that to the rigid body, and let the cracks accumulate. Evan's sprites carry the rest, the egg swinging from delighted to mortified in a frame or two.

The build shipped with one known bug: the sound effects don't play. The music does. I left it listed on the page rather than pretend otherwise, and the source is up on GitHub if you want to fix it.

It's a prototype, Windows-only, and about as finished as a jam game gets. The itch page still has a download.
