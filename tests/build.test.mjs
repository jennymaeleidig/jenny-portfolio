import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildScript = join(root, "scripts", "build.sh");

const RESET_SHA256 = "551206fddb1ee9ed889cc459ba4c96218edc1474299af7c02696a4f4b3f0b527";
const SKY_TOKENS = ["sky-1", "sky-2", "sky-3", "sky-4"];
const TOKENS = ["paper", "ink", "accent", "accent-bright", ...SKY_TOKENS];

let output;
let htmlFiles;
let siteCss;

function build(dist, env = {}) {
  return execFileSync(buildScript, [dist], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: "pipe",
  });
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function channel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

before(() => {
  output = mkdtempSync(join(tmpdir(), "portfolio-build-"));
  build(output);
  htmlFiles = walk(output).filter((path) => path.endsWith(".html"));
  siteCss = readFileSync(join(output, "assets", "site.css"), "utf8");
});

test("the build emits the hand-written page at its route", () => {
  const home = join(output, "index.html");
  const project = join(output, "projects", "pi-agent-harness", "index.html");

  assert.equal(statSync(home).isFile(), true, "the front page is emitted");
  assert.equal(statSync(project).isFile(), true, "the project page is emitted");

  assert.match(readFileSync(home, "utf8"), /pi-agent-harness/);
  assert.match(readFileSync(project, "utf8"), /<h1>pi-agent-harness<\/h1>/);
});

test("markdown is rendered without its frontmatter", () => {
  const page = readFileSync(join(output, "projects", "pi-agent-harness", "index.html"), "utf8");

  assert.match(page, /<p>An agent harness for running coding agents in isolated terminal panes\.<\/p>/);
  assert.doesNotMatch(page, /^---$/m);
  assert.doesNotMatch(page, /^category:/m);
});

test("every page carries its content without JavaScript", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    assert.match(html, /<main\b/i, `${relative(root, file)} must carry its content in markup`);

    for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
      assert.match(tag, /type="module"/, `${relative(root, file)} must not use a classic script`);
      assert.match(tag, /src="\/assets\/sky\.js"/, `${relative(root, file)} may only load the sky`);
    }
  }
});

test("the sky sits behind the sheet with its poster and gradient fallbacks", () => {
  const home = readFileSync(join(output, "index.html"), "utf8");

  assert.match(home, /<div class="sky" aria-hidden="true">/);
  assert.match(home, /<canvas class="sky-canvas"><\/canvas>/);
  assert.match(home, /<noscript><img[^>]*class="sky-poster"[^>]*src="\/assets\/sky-poster\.svg"[^>]*><\/noscript>/);
  assert.match(home, /<script type="module" src="\/assets\/sky\.js"><\/script>/);

  assert.match(siteCss, /\.sky\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*-1;/s);
  assert.match(siteCss, /\.sky\s*\{[^}]*linear-gradient\(180deg, var\(--sky-1\)/s);
  assert.match(siteCss, /\.sky-canvas\s*\{[^}]*image-rendering:\s*pixelated/s);
  assert.match(siteCss, /\.sky--fallback\s*\{[^}]*url\("\/assets\/sky-poster\.svg"\)/s);
  assert.match(siteCss, /\.sky--fallback\s+\.sky-canvas[^{]*\{[^}]*display:\s*none/s);

  for (const asset of ["sky.js", "sky-core.mjs", "sky-poster.svg"]) {
    assert.equal(statSync(join(output, "assets", asset)).isFile(), true, `${asset} is emitted`);
  }
});

test("every internal reference is absolute from /", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    for (const [, attribute, value] of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
      if (value.startsWith("/") || value.startsWith("#") || value.startsWith("mailto:")) {
        continue;
      }
      assert.fail(`${relative(root, file)} has a non-absolute ${attribute}: ${value}`);
    }
  }
});

test("the pinned markdown parser renders CommonMark plus GFM tables and autolinks", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-parser-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-parser-dist-"));
  writeFileSync(
    join(content, "parser-fixture.md"),
    `---
year: 2026
status: shipped
category: web
---
# Parser fixture

| Tool | Pinned |
| ---- | ------ |
| cmark-gfm | yes |

https://example.com
`,
  );

  build(dist, { CONTENT_DIR: content });

  const page = readFileSync(join(dist, "projects", "parser-fixture", "index.html"), "utf8");
  assert.match(page, /<table>/);
  assert.match(page, /href="https:\/\/example\.com"/);
});

test("the front page lists the featured projects and links to every page", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-featured-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-featured-dist-"));
  writeFileSync(
    join(content, "featured-project.md"),
    `---
year: 2026
status: shipped
category: web
featured: true
---
# featured-project

On the front page.
`,
  );
  writeFileSync(
    join(content, "quiet-project.md"),
    `---
year: 2025
status: shipped
category: sound
featured: false
---
# quiet-project

Not on the front page.
`,
  );

  build(dist, { CONTENT_DIR: content });

  const home = readFileSync(join(dist, "index.html"), "utf8");
  assert.match(home, /href="\/projects\/featured-project\/"/);
  assert.doesNotMatch(home, /quiet-project/);
  assert.equal(statSync(join(dist, "projects", "quiet-project", "index.html")).isFile(), true);
});

test("the build fails when a project page is not emitted", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-unemitted-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-unemitted-dist-"));
  writeFileSync(
    join(content, "future-page.md"),
    `---
year: 9999
status: shipped
category: web
---
# future-page

This page is scheduled, so jenny skips it.
`,
  );

  const result = spawnSync(buildScript, [dist], {
    cwd: root,
    env: { ...process.env, CONTENT_DIR: content },
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0, "the build must fail when a page is missing");
  assert.match(result.stderr, /future-page/);
});

test("every page has one h1 and real landmarks", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    const h1s = html.match(/<h1\b/g) ?? [];
    assert.equal(h1s.length, 1, `${relative(root, file)} must have exactly one h1`);
    for (const landmark of ["header", "nav", "main", "footer"]) {
      assert.match(html, new RegExp(`<${landmark}\\b`), `${relative(root, file)} needs a ${landmark} landmark`);
    }
  }
});

test("every page preloads the self-hosted font", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    assert.match(html, /<link[^>]*rel="preload"[^>]*>/);
    assert.match(html, /href="\/assets\/fonts\/CommitMonoV143-VF\.woff2"/);
    assert.match(html, /as="font"/);
    assert.match(html, /type="font\/woff2"/);
    assert.match(html, /href="\/assets\/reset\.css"/);
    assert.match(html, /href="\/assets\/site\.css"/);
  }
});

test("the reset is carried over verbatim", () => {
  const reset = readFileSync(join(output, "assets", "reset.css"));
  assert.equal(
    createHash("sha256").update(reset).digest("hex"),
    RESET_SHA256,
  );
});

test("the stylesheet is a light-only fork with the grid and its fallbacks", () => {
  assert.match(siteCss, /Oskar Wickstr\u00f6m/);
  assert.match(siteCss, /the-monospace-web/);
  assert.match(siteCss, /--line-height:\s*1\.5rem/);
  assert.match(siteCss, /--column:\s*80ch/);
  assert.match(siteCss, /color-scheme:\s*light/);
  assert.match(siteCss, /@supports \(width: calc\(round\(down/);
  assert.match(siteCss, /\.grid/);
  assert.match(siteCss, /:focus-visible\s*\{[^}]*outline:/);
  assert.match(siteCss, /font-display:\s*block/);

  assert.doesNotMatch(siteCss, /@import/);
  assert.doesNotMatch(siteCss, /prefers-color-scheme/);
  assert.doesNotMatch(siteCss, /\.debug/);
  assert.doesNotMatch(siteCss, /font-display:\s*swap/);
});

test("the palette is installed and body text and links clear 4.5:1 on the paper", () => {
  const token = (name) => {
    const match = siteCss.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(match, `missing --${name}`);
    return match[1];
  };

  const paper = token("paper");
  assert.equal(paper.toLowerCase(), "#f4f4ed");
  assert.equal(token("ink").toLowerCase(), "#14140f");
  assert.equal(token("accent").toLowerCase(), "#b83d05");
  assert.equal(token("accent-bright").toLowerCase(), "#ff9767");
  for (const sky of SKY_TOKENS) {
    assert.ok(token(sky));
  }

  assert.ok(contrast(token("ink"), paper) >= 4.5);
  assert.ok(contrast(token("accent"), paper) >= 4.5);

  for (const name of TOKENS) {
    const uses = siteCss.match(new RegExp(`var\\(--${name}\\)`, "g")) ?? [];
    assert.ok(uses.length > 0, `--${name} must appear outside its declaration`);
  }
});

test("the font and its licence sit beside each other", () => {
  const font = join(output, "assets", "fonts", "CommitMonoV143-VF.woff2");
  const licence = join(output, "assets", "fonts", "LICENSE-FONT");

  assert.equal(statSync(font).isFile(), true);
  assert.equal(statSync(licence).isFile(), true);
  assert.match(readFileSync(licence, "utf8"), /SIL OPEN FONT LICENSE Version 1\.1/);
});

test("the build cleans its output directory before generating", () => {
  const dist = mkdtempSync(join(tmpdir(), "portfolio-clean-"));
  build(dist);
  writeFileSync(join(dist, "stale.html"), "left over from an earlier build");

  build(dist);

  assert.equal(readdirSync(dist).includes("stale.html"), false);
  assert.equal(statSync(join(dist, "index.html")).isFile(), true);
});

test("the build fails, naming the file, when a project cannot be staged", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-content-"));
  writeFileSync(join(content, "broken.md"), "# No frontmatter\n\nThis project cannot be dated.\n");
  const dist = mkdtempSync(join(tmpdir(), "portfolio-broken-"));

  const result = spawnSync(buildScript, [dist], {
    cwd: root,
    env: { ...process.env, CONTENT_DIR: content },
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0, "the build must fail");
  assert.match(result.stderr, /broken\.md/);
});

function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  } catch {
    return null;
  }
}

const tracked = trackedFiles();

test("no binary files are committed except the self-hosted font", { skip: tracked === null && "not a git checkout" }, () => {
  const font = "assets/fonts/CommitMonoV143-VF.woff2";

  assert.ok(tracked.includes(font), "the self-hosted font is committed");

  for (const file of tracked) {
    const contents = readFileSync(join(root, file));
    if (file === font) {
      assert.equal(contents.includes(0), true, "the font is binary");
      continue;
    }
    assert.equal(contents.includes(0), false, `${file} contains a NUL byte`);
  }
});
