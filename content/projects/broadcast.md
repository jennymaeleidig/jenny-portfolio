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
---

# Broadcast

A desert, scattered with radio towers no longer transmitting.

I built it solo for the final project of _Game Engine Techniques_, my first Unity and C# class.

The hand-built shader graphs: the sand follows [Alan Zucconi's Journey sand shader](https://www.alanzucconi.com/2019/10/08/journey-sand-shader-1/), the sky is entirely mine.

Terrain came from two techniques I wanted to learn. I imported [Pawel Worwa's Simplex Noise](https://github.com/PawelWorwa/SimplexNoise) C++ library into Unity as a native plugin and wired it up cross platform, then generated the mesh in C# following [WiseShards' procedural desert guide](https://www.wiseshards.com/blog/basic-procedural-desert-generation-and-rendering-in-unity/).

Third-party assets are credited on the [itch.io page](https://jennyl.itch.io/broadcast). Coding agents, mostly Copilot, were used for code completion and refactoring; the systems and the narrative are entirely mine.
