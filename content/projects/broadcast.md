---
year: 2026
status: study
category: games
cover: /assets/projects/broadcast/cover.png
tags:
  - unity
  - hlsl
  - c#
  - c++
  - narrative
links:
  Itch.io: https://jennyl.itch.io/broadcast
  Repo: https://github.com/jennymaeleidig/intro-game-engine-final
  Video: https://youtu.be/H1onwPht8JU
featured: true
---
# Broadcast

A desert, a scattering of radio towers still transmitting into it, and nothing to win. You walk to each station, read what its terminal has to say, and the world explains itself in fragments.

I built it solo for the final project of *Game Engine Techniques*, my first Unity and C# class. The constraint I set myself was mood over mechanics: no win condition, no fail state, no score. Just somewhere to exist for a while, and a landscape that makes you ask how it got that way.

The dunes are procedurally generated from a static seed, so the layout is the same every session while still being built at runtime. To find a seed worth shipping I wrote a separate interactive generator that let me change the parameters and walk the result in real time instead of rebuilding.

The look is two things stacked. First a heavy dither, which fixes the render pipeline before anything else can — dithering needs the Built-in or URP pipeline, so HDRP was off the table. Then hand-built shader graphs: the sand follows [Alan Zucconi's Journey sand shader](https://www.alanzucconi.com/2019/10/08/journey-sand-shader-1/), the sky is entirely mine, and sand drifts through the air as particles.

Terrain came from two techniques I wanted to learn. I imported [Pawel Worwa's Simplex Noise](https://github.com/PawelWorwa/SimplexNoise) C++ library into Unity as a native plugin and wired it up across platforms, then generated the mesh in C# following [WiseShards' procedural desert guide](https://www.wiseshards.com/blog/basic-procedural-desert-generation-and-rendering-in-unity/).

The station interiors were the part that fought back. I tried to adapt a background model into a walkable room in ProBuilder and could not get the light bleed out of it, so I switched to a building model from the Asset Store and spent the remaining time on rendering instead.

Dialogues are driven by a small system I designed up front — terminals as static NPCs, each one handing over a piece of the world when you press E. Audio runs through a separate player, with Tim Hecker's "This Life" as the signal itself.

It remains a study rather than a game, and it is not maintained. If I went back I would push the generation further and let the world change as you explore, or add an ending.

Third-party assets are credited on the [itch.io page](https://jennyl.itch.io/broadcast). Coding agents, mostly Copilot, were used for completion and refactoring; the systems and the narrative are entirely mine.
