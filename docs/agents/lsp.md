# LSP setup

pi-lens launches the language servers; there is no separate LSP client to
configure. Project settings live in `.pi-lens.json`; the server installs live in
`package.json` so a fresh clone resolves them from `node_modules/.bin`.

## Buckets and servers

| Files                                                                     | Language   | Server                        | Install       | Root             |
| ------------------------------------------------------------------------- | ---------- | ----------------------------- | ------------- | ---------------- |
| `assets/**/*.js`, `assets/**/*.mjs`, `scripts/**/*.mjs`, `tests/**/*.mjs` | JavaScript | `typescript-language-server`  | project-local | `jsconfig.json`  |
| `**/*.md`                                                                 | Markdown   | `marksman`                    | PATH          | `.git`           |
| `**/*.sh`                                                                 | Shell      | `bash-language-server`        | project-local | file's directory |
| `**/*.css`                                                                | CSS        | `vscode-css-language-server`  | project-local | file's directory |
| `**/*.json`                                                               | JSON       | `vscode-json-language-server` | project-local | file's directory |
| `**/*.yml`, `**/*.yaml`                                                   | YAML       | `yaml-language-server`        | project-local | file's directory |

Install the project-local servers, plus types for the Node-facing scripts:

```sh
npm install
```

The packages are already in `package.json`. `marksman` is not an npm package;
install it on PATH with the usual package manager (`brew install marksman` on
macOS).

`jsconfig.json` turns on `checkJs` and maps the browser's root-relative
`/assets/*` imports back into the repository, so the editor checks the shipped
JavaScript without a build step. The file is also the root marker that keeps a
single TypeScript project at the repository root.

## Ignored paths

`vendor/` is ignored in `.pi-lens.json` because it is a vendored generator, not
hand-edited source. `dist/`, `build/`, `node_modules/`, `.pi/`, and
`.playwright-mcp/` are already ignored by `.gitignore`. Probe files go under
`tmp/`, which is ignored.

Binary assets (`*.jpg`, `*.png`, `*.woff2`, `*.svg`) are not language buckets.

## Verified buckets

Verified against `typescript@5.9.3`, `typescript-language-server@6.1.0`,
`bash-language-server@5.8.1`, `vscode-langservers-extracted@4.10.0`,
`yaml-language-server@2.0.0`, and `marksman 2026-02-08`.

| Language   | Probe       | Result                                            |
| ---------- | ----------- | ------------------------------------------------- |
| JavaScript | diagnostics | `[typescript]` 2339, property does not exist      |
| Markdown   | diagnostics | `[Marksman]` link to a missing document           |
| Shell      | navigation  | `documentSymbol` returns the function in the file |
| CSS        | diagnostics | `[css]` property value expected                   |
| JSON       | diagnostics | `[json]` 519, trailing comma                      |
| YAML       | diagnostics | `[YAML]` compact-mapping syntax error             |

Shell is verified by navigation because `bash-language-server` relays
shellcheck-derived diagnostics, which pi-lens deduplicates under the
`[shellcheck]` runner tag. The documented symbol is the attribution: no other
server handles `.sh`.

## Unsupported buckets

| Files                                                            | Why                                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Makefile`                                                       | No Make language server in the pi-lens registry.                                                  |
| `.husky/pre-commit`, `.husky/pre-push`, `vendor/jenny/bin/jenny` | Extensionless shell; server selection is by extension. `shellcheck` can still lint them directly. |
| `vendor/jenny/share/jenny/lib/md2html.awk`                       | No awk language server.                                                                           |
| `vocabulary/*`, `vendor/jenny/VERSION`, `LICENSE.txt`            | Not source languages.                                                                             |

## Re-probing

After changing `jsconfig.json`, `.pi-lens.json`, or a server version, restart the
pi session: a warm server keeps its old root and configuration. Then write one
one-error file per bucket under `tmp/lsp-probe/` and query it:

```json
lens_diagnostics {
  "source": "lsp",
  "scope": "paths",
  "paths": ["tmp/lsp-probe/p.css"],
  "waitMs": 20000,
  "severity": "all"
}
```

For JavaScript, put the probe under `tests/` (included by `jsconfig.json`) so
`checkJs` applies. For shell, write a file with a function and require
`lsp_navigation` with `operation: "documentSymbol"`. Delete the probe after
reading the result; a probe left behind becomes a fixture by accident.
