# jenny-portfolio

Jenny Leidig's portfolio: a static site at `https://portfolio.jenny-page.online`, replacing `jennyleidig.straw.page`.

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

Node is only needed to run the tests. The test suite builds the full site, so
it needs no browser either.

```sh
make build   # writes dist/, the same tree CI deploys
make test    # builds into a temporary directory and checks the emitted files
make clean
```

### Build modes

There are two ways to build, and the only difference is the sky's tuning
panel. Everything else — content, routes, CSS, the sky itself — is identical.

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
make dev && python3 -m http.server -d dist 8000 && open http://localhost:8000/
```

## Deployment

A push to `main` runs `.github/workflows/deploy.yml`: build, test, upload the Pages artifact, deploy. The workflow does not commit a `CNAME` file; the custom domain is configured in the repository's Pages settings.

Enabling Pages (source: GitHub Actions) and pointing the domain at it are one-time human steps in repository settings, tracked apart from the build.
