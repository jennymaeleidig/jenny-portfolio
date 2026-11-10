---
year: 2025
status: active
category: software
cover: /assets/projects/unofficial-homestuck-collection-web/cover.png
tags:
  - vue
  - javascript
  - node.js
  - docker
  - ruffle
  - flash emulation
links:
  repo: https://github.com/jennymaeleidig/unofficial-homestuck-collection-web
---
# The Unofficial Homestuck Collection: Web Edition

A browser port of [The Unofficial Homestuck Collection](https://github.com/GiovanH/unofficial-homestuck-collection): the whole archive, its Flash animations and its interactive games, running from a server instead of an Electron desktop app.

I forked GiovanH's collection in August 2025 and spent a month turning the desktop app into something you can open in a tab. It is his archive and his interface; my work is the architecture underneath it. The goal was to change as little as possible while making the thing work over HTTP.

The biggest change is subtraction: no Electron. That alone unblocks builds on Apple Silicon, and it forces everything the desktop app had quietly borrowed from the local filesystem — the asset pack, the Flash runtime, the save data — to become something a server actually serves. The asset pack is a separate download from the Internet Archive, restructured so it can be served over HTTP, and the Python asset server sits in front of it.

Flash was the part that had to be chosen rather than ported. I committed the collection to Ruffle as the only emulation path and routed its requests through our own server, then worked through the pages that broke: Openbound, Cascade, Alternia Bound. Most of the story pages now behave; the big interactive pieces are still the places it hurts.

Progress needed somewhere to live, so there's an Express and SQLite auth server with JWT sessions, bcrypt-hashed credentials and session files that clean themselves up hourly. Log in and the collection remembers where you were across devices, which is what the new Continue button reads. On top of that I streamlined the settings menu, turned the bundled mods off, and pushed mobile support about as far as it goes — interactive portions and large animations are still rough on a phone.

The whole stack comes up with `make serve` or one `docker compose` file: the Vue app, the asset server and the auth server behind nginx, with ports, paths and hostnames kept in the environment. Dev and prod compose files diverge only in their builds.

It hasn't shipped anywhere public — the repo, the packing notes and the compose files are the deliverable, and the rest of the work is bug-hunting in Flash.
