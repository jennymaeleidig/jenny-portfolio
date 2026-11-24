# jenny-portfolio

My portfolio: a static site at `https://portfolio.jenny-page.online`.

## Writing content

Two formats, one per kind of file:

- [`docs/project.md`](docs/project.md) — `content/projects/<slug>.md`: its
  frontmatter, the required fields, the status and category vocabularies, and
  the body.
- [`docs/career.md`](docs/career.md) — `content/career/`: experience,
  volunteering, education and skills.

## Local development

Install the build dependencies:

```sh
# macOS
brew install cmark-gfm gawk gnu-sed grep coreutils

# Debian or Ubuntu
sudo apt-get install cmark-gfm
```

```sh
npm install  # ESLint, Prettier, Husky, lint-staged and the editor language servers

make build   # writes dist/, the same tree CI deploys
make test    # builds into a temporary directory and checks the emitted files
make clean
```

Node.js 20.17 or newer is required for the tests and the tooling.

### Formatting

Prettier owns the formatting of Markdown, CSS, JavaScript and the config
files. Markdown frontmatter is written with single quotes, the house style, and
the build also reads the double-quoted scalars a formatter may produce, so a
save cannot break a link. Fenced examples in the docs are left as written. Run
it by hand with:

```sh
npm run format        # rewrite the tree
npm run format:check  # fail if anything is unformatted
```

### Linting

ESLint checks JavaScript and the ESM modules under `assets/`, `scripts/`
and `tests/` with browser and Node globals as appropriate. Run it by hand
with:

```sh
npm run lint      # report findings
npm run lint:fix  # apply fixes
```

Husky runs ESLint and Prettier through lint-staged on commit.

### Theme

The palette strip in the header and footer switches between the light and dark
palettes. The choice is stored in `localStorage` under `theme`; light is the
default and the site does not follow `prefers-color-scheme`. The dark sky keeps
the clouds and adds stars in the clear band. `assets/sky-poster-dark.svg` is
the no-canvas fallback, while the share card stays the light poster.

### Build modes

There are two ways to build, and the only difference is the sky's tuning
panel. Everything else (content, routes, CSS, the sky itself) is identical.

|                         | `make build` (production) | `make dev` (development)               |
| ----------------------- | ------------------------- | -------------------------------------- |
| `dist/`                 | the tree CI deploys       | the same tree plus the panel           |
| `<body>`                | `<body>`                  | `<body data-sky-levers>`               |
| script tag              | none                      | `/assets/sky-levers.mjs` on every page |
| `assets/sky-levers.mjs` | not emitted               | emitted                                |
| `globalThis.skyLevers`  | never published           | published by `assets/sky.js`           |

```sh
make dev                      # dist/ with the panel
make dev DIST=/tmp/sky-dev    # ...somewhere else
```

### Launching with the panel

The output is static, so any file server will do. Build with the flag and point
a server at it:

```sh
make dev
python3 -m http.server -d dist 8000
```

Then open `http://localhost:8000/` in a browser.

## Deployment

A push to `main` runs `.github/workflows/deploy.yml`: install, format check, lint, build, test, upload the Pages artifact, deploy. The workflow does not commit a `CNAME` file; the custom domain is configured in the repository's Pages settings.
