---
year: 2025
status: active
category: software
cover: /assets/projects/x86-soundscape/cover.png
tags:
  - angular
  - typescript
  - webamp
  - web audio
  - retro ui
links:
  Live: https://x86-soundscape.jenny-page.online/
  Repo: https://github.com/jennymaeleidig/x86-soundscape
---
# x86 Soundscape

A retro Macintosh desktop in a browser tab: an internet radio in a Winamp window, a rack of ambience sounds, a WeatherStar readout, a video surfer pulling from archive.org, and a CRT over the top of it all.

I started it in 2025 as a place to put the kind of software I like looking at — System 6 menus, olive desktop, dithered grey — while doing something real underneath. It's Angular and TypeScript, with `system.css` for the period furniture and [Webamp](https://github.com/captbaritone/webamp) as the only audio engine, decided in an ADR on the grounds that a playlist, skin support and a visualizer for free beat writing a player.

Stations are internet radio: WRIR, SomaFM, a few others, each with the metadata parser its stream needs — ICY, Icecast stats, Azuracast. Now Playing is its own poll chain, parked and resumed rather than duplicated, and an adapter writes the same facts to the browser's Media Session so the OS controls work. Tuning is a rule, not an accident: nothing opens a stream until a listener actually asks for one.

The desktop is where the structure shows. Windows cascade, only one per feature may be open, and the pop-ups share a single mount module with the windows — the ADR exists because the two had already drifted once. Weather is a third-party iframe by choice: WeatherStar 4000+ and RetroCast, with a toggle between sources, on the trade of no styling control for no maintenance. The surfer searches archive.org and plays what it finds.

It has been live on GitHub Pages at its own domain since 2025, and it's documented like a project rather than a demo: seven ADRs, a glossary, and a harness that measures the desktop's edges.
