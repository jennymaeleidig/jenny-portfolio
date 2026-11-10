---
year: 2026
status: shipped
category: sound
cover: /assets/projects/dream-desert-visualizer/cover.png
tags:
  - p5.js
  - glsl shaders
  - howler
  - audio visualization
links:
  Live: https://dream-desert-visualizer.vercel.app/
  Repo: https://github.com/jennymaeleidig/dream-desert-visualizer
---
# Dream Desert Visualizer

A visualizer for [夢の砂漠 (_dream desert_)](https://geometriclullaby.bandcamp.com/album/desert-sand-feels-warm-at-night) by desert sand feels warm at night and Secret Schools: a wireframe pyramid, a column of light and a desert of drawn lines, all in orange on black.

It began as a Processing sketch and I ported it to p5.js so it could live on the web. The look is unchanged: the sand is two textures with a gradient shader between them, sampled nearest-neighbour so the dunes keep their hard edges rather than going soft at scale, and the palette cycles through a shader of its own. Assets were recreated by hand for the port.

The sketch is split one module per element — sand, pyramid, moon, stars, beam and its particles, pulse, title, border, menu — each owning its own preload, setup and draw. Audio runs on Howler rather than p5.sound, because mobile browsers are unforgiving about unlocking audio, and the tracks stream from jukehost with their URLs kept in environment variables rather than the repo. Track titles are the album's, converted to half-width kana so the Japanese font can render them.

Controls are the keyboard: space to play and pause, up and down for volume, left and right to change track. Phones get their own transport buttons, and there's a loading screen while the textures and shaders come down.

It's live on Vercel, and it's meant to be left running — press space and let the record play.
