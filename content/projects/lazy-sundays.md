---
year: 2023
status: active
category: software
cover: /assets/projects/lazy-sundays/cover.png
tags:
  - next.js
  - react
  - strapi
  - tailwind css
  - postgres
links:
  Live: https://www.lazysundays.net/
  Frontend: https://github.com/lazy-sundays/Lazy-Sundays-Blog-Frontend
  Backend: https://github.com/lazy-sundays/Lazy-Sundays-Blog-Backend
---
# the lazy sundays blog

A multi-author site about games, film, TV and music: a Next.js front end over a Strapi CMS, with author pages, tags, an archive, a random article button and an RSS feed. It's also where the Dreamcast repair piece first ran.

I've built and maintained the site since 2023, with [Devin Toms](https://github.com/dtoms) contributing. It's two applications: a Next.js frontend that does the rendering, and a Strapi backend that holds the writing.

The frontend is the App Router on Next 15 and React 19, styled with Tailwind, with article bodies coming down as Markdown from the CMS and rendered through remark and rehype rather than stored as HTML. Around that: generated reading times, view counts in Upstash Redis, a draft preview flow so drafts can be checked on the live site, a per-request CSP nonce in middleware, light and dark themes, a sitemap and an RSS route built from the API.

The backend is Strapi 5 on Postgres, Dockerised, with content types for articles, authors, tags, the featured article and the site's about and link pages. It runs separately from the front end and is reached over the REST API with a service token, which is what makes the preview flow and the cache tags work. Both repos carry MkDocs documentation for their setup and API.

It is in use — people other than me write on it, the archives keep growing, and it's still where anything I write about hardware tends to land first.
