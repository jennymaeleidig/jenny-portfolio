import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { POSTER, posterHash } from "../scripts/sky-poster.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildScript = join(root, "scripts", "build.sh");

const RESET_SHA256 = "551206fddb1ee9ed889cc459ba4c96218edc1474299af7c02696a4f4b3f0b527";
const SKY_TOKENS = ["sky-1", "sky-2", "sky-3", "sky-4"];
const TOKENS = ["paper", "ink", "accent", "accent-bright", ...SKY_TOKENS];

let output;
let htmlFiles;
let siteCss;
let resumePrintHtml;

function build(dist, env = {}) {
  return execFileSync(buildScript, [dist], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: "pipe",
  });
}

function buildFixture(content, dist) {
  return spawnSync(buildScript, [dist], {
    cwd: root,
    env: { ...process.env, CONTENT_DIR: content, RESUME_PDF: "0" },
    encoding: "utf8",
  });
}

function writeProject(content, slug, frontmatter, body) {
  writeFileSync(
    join(content, `${slug}.md`),
    `---\n${frontmatter.trim()}\n---\n${body ?? `# ${slug}\n\nProse for ${slug}.\n`}`,
  );
}

function catalogueRows(html) {
  const table = html.match(/<table class="catalogue"[\s\S]*?<\/table>/)?.[0] ?? "";
  return [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map(([, row]) => row.match(/<a href="([^"]+)"/)?.[1])
    .filter(Boolean);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function pdfPageCount(bytes) {
  const counts = [...bytes.toString("latin1").matchAll(/\/Count\s+(\d+)/g)].map(([, count]) => Number(count));
  return Math.max(...counts);
}

before(() => {
  output = mkdtempSync(join(tmpdir(), "portfolio-build-"));
  resumePrintHtml = join(mkdtempSync(join(tmpdir(), "portfolio-print-")), "resume-print.html");
  build(output, { RESUME_PRINT_COPY: resumePrintHtml });
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

test("a project page renders its title, year, status, links and prose from one file", () => {
  const page = readFileSync(join(output, "projects", "broadcast", "index.html"), "utf8");

  assert.match(page, /<h1>Broadcast<\/h1>/);
  assert.match(page, /<p class="meta">games &middot; 2025 &middot; <span class="status">shipped<\/span><\/p>/);
  assert.match(page, /2025/);
  assert.match(page, /shipped/);
  assert.match(page, /href="https:\/\/jennyleidig\.itch\.io\/broadcast"/);
  assert.match(page, /a transmission you have to keep alive/i);
});

test("a project marked wip says so on its page", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-wip-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-wip-dist-"));
  writeProject(
    content,
    "half-built",
    `year: 2026
status: wip
category: games`,
  );

  buildFixture(content, dist);

  const page = readFileSync(join(dist, "projects", "half-built", "index.html"), "utf8");
  assert.match(page, /work in progress/i);
  assert.doesNotMatch(page, />wip</i);
});

test("tags render on the project page", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-tags-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-tags-dist-"));
  writeProject(
    content,
    "tagged",
    `year: 2026
status: shipped
category: web
tags: [agents, terminal]`,
  );

  buildFixture(content, dist);

  const page = readFileSync(join(dist, "projects", "tagged", "index.html"), "utf8");
  const tags = page.match(/<ul class="tags"[^>]*>([\s\S]*?)<\/ul>/);
  assert.ok(tags, "the project page carries a tag list");
  assert.match(tags[1], /<li>agents<\/li>/);
  assert.match(tags[1], /<li>terminal<\/li>/);
});

test("a cover renders when declared, and absent covers leave no image", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-cover-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-cover-dist-"));
  writeProject(
    content,
    "covered",
    `year: 2026
status: shipped
category: web
cover: /assets/sky-poster.svg`,
  );
  writeProject(
    content,
    "uncovered",
    `year: 2026
status: shipped
category: web`,
  );

  buildFixture(content, dist);

  const covered = readFileSync(join(dist, "projects", "covered", "index.html"), "utf8");
  const uncovered = readFileSync(join(dist, "projects", "uncovered", "index.html"), "utf8");
  const article = (page) => page.match(/<article[^>]*>([\s\S]*?)<\/article>/)?.[1] ?? "";

  assert.match(article(covered), /<img[^>]+src="\/assets\/sky-poster\.svg"/);
  assert.doesNotMatch(article(uncovered), /<img\b/);
});

test("the build fails, naming the file, when a declared cover is missing", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-cover-missing-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-cover-missing-dist-"));
  writeProject(
    content,
    "broken-cover",
    `year: 2026
status: shipped
category: web
cover: /assets/covers/does-not-exist.png`,
  );

  const result = buildFixture(content, dist);

  assert.notEqual(result.status, 0, "the build must fail");
  assert.match(result.stderr, /broken-cover\.md/);
  assert.match(result.stderr, /does-not-exist\.png/);
});

test("the build fails, naming the file, when a required field is missing", () => {
  for (const missing of ["year", "status", "category"]) {
    const content = mkdtempSync(join(tmpdir(), "portfolio-missing-"));
    const dist = mkdtempSync(join(tmpdir(), "portfolio-missing-dist-"));
    const fields = { year: "2026", status: "shipped", category: "web" };
    delete fields[missing];
    writeProject(
      content,
      `missing-${missing}`,
      Object.entries(fields)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n"),
    );

    const result = buildFixture(content, dist);
    assert.notEqual(result.status, 0, `the build must fail without ${missing}`);
    assert.match(result.stderr, new RegExp(`missing-${missing}\\.md`));
  }
});

test("the build fails when a project is CV-visible without a blurb", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-cv-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-cv-dist-"));
  writeProject(
    content,
    "cv-no-blurb",
    `year: 2026
status: shipped
category: web
cv: true`,
  );

  const result = buildFixture(content, dist);

  assert.notEqual(result.status, 0, "the build must fail");
  assert.match(result.stderr, /cv-no-blurb\.md/);
  assert.match(result.stderr, /cv_blurb/);
});

test("the build fails on a filename jenny would eval unsafely", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-filename-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-filename-dist-"));
  writeProject(content, "Broadcast Live", `year: 2026
status: shipped
category: games`);

  const result = buildFixture(content, dist);

  assert.notEqual(result.status, 0, "the build must fail");
  assert.match(result.stderr, /Broadcast Live\.md/);
});

test("every page carries its content without JavaScript", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    assert.match(html, /<main\b/i, `${relative(root, file)} must carry its content in markup`);

    for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
      assert.match(tag, /type="module"/, `${relative(root, file)} must not use a classic script`);
      assert.match(
        tag,
        /src="\/assets\/(sky|nav|resume-selector)\.js"/,
        `${relative(root, file)} may only load the site's own modules`,
      );
    }
  }
});

test("client-side navigation is a progressive enhancement", () => {
  const home = readFileSync(join(output, "index.html"), "utf8");
  const nav = readFileSync(join(output, "assets", "nav.js"), "utf8");

  assert.match(home, /<script type="module" src="\/assets\/nav\.js"><\/script>/);
  assert.match(nav, /history\.pushState/);
  assert.match(nav, /location\.href = url/);
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

  for (const asset of ["sky.js", "sky-core.mjs", "sky-poster.svg", "nav.js"]) {
    assert.equal(statSync(join(output, "assets", asset)).isFile(), true, `${asset} is emitted`);
  }
});

test("every internal reference is absolute from /", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    for (const [, attribute, value] of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
      const external = attribute === "href" && (value.startsWith("https://") || value.startsWith("http://"));
      if (value.startsWith("/") || value.startsWith("#") || value.startsWith("mailto:") || external) {
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

  build(dist, { CONTENT_DIR: content, RESUME_PDF: "0" });

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

  build(dist, { CONTENT_DIR: content, RESUME_PDF: "0" });

  const home = readFileSync(join(dist, "index.html"), "utf8");
  assert.match(home, /href="\/projects\/featured-project\/"/);
  assert.doesNotMatch(home, /quiet-project/);
  assert.equal(statSync(join(dist, "projects", "quiet-project", "index.html")).isFile(), true);
});

test("/work lists every project, newest first, with order pinning above newer work", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-catalogue-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-catalogue-dist-"));
  writeProject(content, "alpha", `year: 2024
status: shipped
category: games`);
  writeProject(content, "beta", `year: 2026
status: shipped
category: web`);
  writeProject(content, "pinned", `year: 2020
status: shipped
category: sound
order: 1`);

  build(dist, { CONTENT_DIR: content, RESUME_PDF: "0" });

  const catalogue = readFileSync(join(dist, "work", "index.html"), "utf8");
  assert.deepEqual(catalogueRows(catalogue), [
    "/projects/pinned/",
    "/projects/beta/",
    "/projects/alpha/",
  ]);
});

test("each category filter lists exactly its own projects", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-categories-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-categories-dist-"));
  writeProject(content, "game-one", `year: 2024
status: shipped
category: games`);
  writeProject(content, "game-two", `year: 2026
status: shipped
category: games`);
  writeProject(content, "sound-one", `year: 2025
status: shipped
category: sound`);
  writeProject(content, "web-one", `year: 2023
status: shipped
category: web`);
  writeProject(
    content,
    "article-one",
    `year: 2022
status: shipped
category: articles
links:
  paper: https://example.com/article-one`,
  );

  build(dist, { CONTENT_DIR: content, RESUME_PDF: "0" });

  const all = readFileSync(join(dist, "work", "index.html"), "utf8");
  assert.equal(catalogueRows(all).length, 5, "the catalogue lists every project once");

  const expected = {
    games: ["game-two", "game-one"],
    sound: ["sound-one"],
    hardware: [],
    web: ["web-one"],
    articles: ["https://example.com/article-one"],
  };

  for (const [category, slugs] of Object.entries(expected)) {
    const page = readFileSync(join(dist, "work", category, "index.html"), "utf8");
    const hrefs = catalogueRows(page).map((href) => href.replace(/^\/projects\/|\/$/g, ""));
    assert.deepEqual(hrefs, slugs, `/work/${category}/ carries exactly ${category}`);
  }
});

test("the front page shows exactly the featured projects as cards with category and year", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-front-page-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-front-page-dist-"));
  writeProject(content, "featured-game", `year: 2026
status: shipped
category: games
featured: true`);
  writeProject(content, "featured-sound", `year: 2024
status: shipped
category: sound
featured: true`);
  writeProject(content, "quiet-web", `year: 2025
status: shipped
category: web`);

  build(dist, { CONTENT_DIR: content, RESUME_PDF: "0" });

  const home = readFileSync(join(dist, "index.html"), "utf8");
  assert.match(home, /<ul class="grid featured">/);

  const cards = [...home.matchAll(/<li class="card">([\s\S]*?)<\/li>/g)].map(([, card]) => card);
  assert.equal(cards.length, 2, "only the featured projects are cards");
  assert.match(cards[0], /href="\/projects\/featured-game\/"/);
  assert.match(cards[0], /games/);
  assert.match(cards[0], /2026/);
  assert.match(cards[1], /href="\/projects\/featured-sound\/"/);
  assert.match(cards[1], /sound/);
  assert.match(cards[1], /2024/);
  assert.doesNotMatch(home, /quiet-web/);
});

test("article rows link out to the publication and have no detail page", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-articles-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-articles-dist-"));
  writeProject(
    content,
    "a-paper",
    `year: 2026
status: shipped
category: articles
featured: true
links:
  paper: https://example.com/a-paper`,
  );
  writeProject(
    content,
    "a-live-piece",
    `year: 2025
status: shipped
category: articles
links:
  live: https://example.com/a-live-piece`,
  );
  writeProject(content, "a-project", `year: 2024
status: shipped
category: web`);

  build(dist, { CONTENT_DIR: content, RESUME_PDF: "0" });

  assert.equal(statSync(join(dist, "projects", "a-paper"), { throwIfNoEntry: false }), undefined);
  assert.equal(statSync(join(dist, "projects", "a-live-piece"), { throwIfNoEntry: false }), undefined);
  assert.equal(statSync(join(dist, "projects", "a-project", "index.html")).isFile(), true);

  const catalogue = readFileSync(join(dist, "work", "index.html"), "utf8");
  assert.deepEqual(catalogueRows(catalogue), [
    "https://example.com/a-paper",
    "https://example.com/a-live-piece",
    "/projects/a-project/",
  ]);

  const home = readFileSync(join(dist, "index.html"), "utf8");
  assert.match(home, /<a href="https:\/\/example\.com\/a-paper">/);
});

test("the build fails, naming the file, when an article has no publication link", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-article-link-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-article-link-dist-"));
  writeProject(content, "orphan-article", `year: 2026
status: shipped
category: articles`);

  const result = buildFixture(content, dist);

  assert.notEqual(result.status, 0, "the build must fail");
  assert.match(result.stderr, /orphan-article\.md/);
  assert.match(result.stderr, /paper|live/);
});

test("the catalogue is a three-column table with a header for each column", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-headers-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-headers-dist-"));
  writeProject(content, "headered", `year: 2026
status: shipped
category: games`);

  build(dist, { CONTENT_DIR: content, RESUME_PDF: "0" });

  const catalogue = readFileSync(join(dist, "work", "index.html"), "utf8");
  const headers = [...catalogue.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(([, text]) => text);
  assert.equal(headers.length, 3, "the catalogue has one header per column");
  assert.match(headers[0], /categor/i);
  assert.match(headers[1], /project/i);

  const row = catalogue.match(/<tbody>[\s\S]*?<tr>([\s\S]*?)<\/tr>/)?.[1] ?? "";
  assert.match(row, /<td class="meta">games<br>2026<\/td>/);
  assert.match(row, /<td class="catalogue-title"><a href="\/projects\/headered\/">headered<\/a><\/td>/);
  assert.match(row, /<td class="catalogue-blurb"><p>Prose for headered\.<\/p><\/td>/);
});

test("catalogue blurbs render inline markdown instead of showing its syntax", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-blurb-markdown-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-blurb-markdown-dist-"));
  writeProject(
    content,
    "styled",
    `year: 2026
status: shipped
category: games
featured: true`,
    "# Styled\n\nA *quiet* game with a [link](https://example.com).\n",
  );

  build(dist, { CONTENT_DIR: content, RESUME_PDF: "0" });

  const catalogue = readFileSync(join(dist, "work", "index.html"), "utf8");
  assert.match(catalogue, /<td class="catalogue-blurb"><p>A <em>quiet<\/em> game with a <a href="https:\/\/example\.com">link<\/a>\.<\/p><\/td>/);
  assert.doesNotMatch(catalogue, /\*quiet\*|\[link\]/);

  const home = readFileSync(join(dist, "index.html"), "utf8");
  assert.match(home, /<div class="card-blurb"><p>A <em>quiet<\/em> game/);
});

test("About renders three paragraphs, a photo, primary links, elsewhere and the contribution line", () => {
  const about = readFileSync(join(output, "about", "index.html"), "utf8");

  assert.match(about, /<h1>About<\/h1>/);

  const prose = about.match(/<div class="prose">([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.equal((prose.match(/<p>/g) ?? []).length, 3, "About carries three paragraphs");

  assert.match(about, /<img class="portrait" src="\/assets\/portrait\.svg" alt="Jenny Leidig"/);

  const primary = about.match(/<ul class="links primary-links"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? "";
  assert.match(primary, /<a href="mailto:jennymaeleidig@gmail\.com">Email<\/a>/);
  assert.ok(
    primary.indexOf("mailto:") < primary.indexOf("https://github.com/"),
    "email is the first primary link",
  );
  for (const href of [
    "https://github.com/jennymaeleidig",
    "https://www.linkedin.com/in/jleidig/",
    "https://jennyleidig.itch.io/",
  ]) {
    assert.match(primary, new RegExp(`href="${escapeRegExp(href)}"`));
  }

  const elsewhere = about.match(/<ul class="links elsewhere"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? "";
  for (const name of ["lazy sundays", "56 kbit/s", "x86 Soundscape", "WRIR", "PagedOut!"]) {
    assert.match(elsewhere, new RegExp(escapeRegExp(name)), `${name} is in the elsewhere list`);
  }

  assert.match(about, /Unofficial Homestuck Collection/i);
  assert.match(about, /href="https:\/\/github\.com\/jennymaeleidig\/unofficial-homestuck-collection-web"/);
});

test("the photo appears only on About", () => {
  for (const file of htmlFiles) {
    if (file === join(output, "about", "index.html")) {
      continue;
    }
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(html, /portrait/, `${relative(root, file)} must not show the photo`);
  }
});

test("Now carries a visible update date and its five sections, without an archive or a cadence", () => {
  const now = readFileSync(join(output, "now", "index.html"), "utf8");

  assert.match(now, /<h1>Now<\/h1>/);
  assert.match(now, /Last updated/);

  const updated = readFileSync(join(root, "content", "now.md"), "utf8").match(/^updated:\s*(.+)$/m)?.[1]?.trim();
  assert.ok(updated, "Now declares when it was last updated");
  assert.match(now, new RegExp(escapeRegExp(updated)));

  const headings = [...now.matchAll(/<h2>([^<]+)<\/h2>/g)].map(([, text]) => text.toLowerCase());
  assert.deepEqual(headings, ["making", "reading", "listening", "watching", "not doing"]);

  assert.doesNotMatch(now, /archive/i);
  assert.doesNotMatch(now, /weekly|monthly|every week|every month|cadence/i);
});

test("no phone number appears on any page", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(html, /276\)?[.\-\s]?356[.\-\s]?4765/, `${relative(root, file)} must not carry the phone number`);
    assert.doesNotMatch(html, /\+1[.\-\s]?276/, `${relative(root, file)} must not carry the phone number`);
  }
});

function resumeSection(name, base = output) {
  const resume = readFileSync(join(base, "resume", "index.html"), "utf8");
  return resume.match(
    new RegExp(`<section class="resume-section" aria-labelledby="resume-${name}"[^>]*>([\\s\\S]*?)</section>`),
  )?.[1] ?? "";
}

// The default selection's one source of truth is the print selection, not a
// second hand-kept list in the test.
function printOmittedIds() {
  const print = readFileSync(join(root, "content", "resume", "print.sh"), "utf8");
  const block = print.match(/PRINT_OMIT_ENTRIES=\(([\s\S]*?)\)/)?.[1] ?? "";
  return block
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
}

test("the resume carries every role, CV project and publication", () => {
  const resume = readFileSync(join(output, "resume", "index.html"), "utf8");

  for (const heading of ["Summary", "Experience", "Projects", "Publications", "Volunteering", "Education", "Skills"]) {
    assert.match(resume, new RegExp(`<h2[^>]*>${heading}</h2>`), `${heading} is a resume section`);
  }

  for (const role of [
    "Sales Associate &amp; Website Designer",
    "Software Engineer - Consultant",
    "Software Engineer - Associate Consultant",
    "Software Assistance Triage (SWAT) Technician",
    "Co-Chair, Music Programming Committee",
  ]) {
    assert.match(resume, new RegExp(escapeRegExp(role)), `${role} is on the resume`);
  }

  for (const institution of ["CapTech Consulting", "Chadwick &amp; Son Orchids", "WRIR-LP 97.3FM", "University of Oklahoma", "Virginia Tech"]) {
    assert.match(resume, new RegExp(escapeRegExp(institution)), `${institution} is on the resume`);
  }

  const projects = resumeSection("projects");
  const cvProjects = readdirSync(join(root, "content", "projects"))
    .filter((name) => name.endsWith(".md"))
    .filter((name) => /^cv:\s*true$/m.test(readFileSync(join(root, "content", "projects", name), "utf8")))
    .map((name) => name.replace(/\.md$/, ""));
  assert.equal(
    (projects.match(/<div class="resume-entry"/g) ?? []).length,
    cvProjects.length,
    "the project section carries every CV-visible project and no others",
  );
  for (const slug of cvProjects) {
    assert.match(projects, new RegExp(`href="/projects/${escapeRegExp(slug)}/"`), `${slug} is on the resume`);
  }

  const publications = resumeSection("publications");
  assert.match(publications, /Dreamcast Repair: A Journey of a Thousand Parts/);
  assert.match(publications, /PagedOut!/);
  assert.match(publications, /Issue 008, p\. 67/);
});

test("the resume is chronological, newest first, within each section", () => {
  const experience = resumeSection("experience");

  const order = [
    "Chadwick &amp; Son Orchids",
    "September 2025",
    "April 2025",
    "September 2023",
    "August 2019",
  ];
  const positions = order.map((text) => experience.indexOf(text));
  for (const position of positions) {
    assert.notEqual(position, -1, "every dated role is present");
  }
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "experience runs newest first");

  const projects = resumeSection("projects");
  assert.ok(projects.indexOf("2026") < projects.indexOf("2025"), "projects run newest first");

  const education = resumeSection("education");
  assert.ok(
    education.indexOf("University of Oklahoma") < education.indexOf("Virginia Tech"),
    "education runs newest first",
  );
});

test("the resume has no phone, photo, image, canvas or sky, and one same-origin selector script", () => {
  const resume = readFileSync(join(output, "resume", "index.html"), "utf8");

  assert.doesNotMatch(resume, /276\)?[.\-\s]?356[.\-\s]?4765/);
  assert.doesNotMatch(resume, /\+1[.\-\s]?276/);
  assert.doesNotMatch(resume, /portrait/);
  assert.doesNotMatch(resume, /<(?:img|picture|svg|canvas)\b/i);
  assert.doesNotMatch(resume, /class="sky"/);

  // The markup is the complete record without JavaScript. The single script
  // is the progressive selector, loaded from this site and nowhere else.
  assert.equal((resume.match(/<section class="resume-section"/g) ?? []).length, 7);
  assert.match(resume, /<h1>Resume<\/h1>/);
  assert.match(resume, /id="experience-virginia-tech-swat"/);

  const scripts = [...resume.matchAll(/<script\b[^>]*>/gi)].map(([tag]) => tag);
  assert.equal(scripts.length, 1, "the resume loads exactly one script");
  assert.match(scripts[0], /type="module"/);
  assert.match(scripts[0], /src="\/assets\/resume-selector\.js"/);
  assert.doesNotMatch(scripts[0], /https?:\/\//);
});

test("the resume defaults to exactly the selection the PDF prints", () => {
  const omitted = printOmittedIds();
  const resume = readFileSync(join(output, "resume", "index.html"), "utf8");
  const printHtml = readFileSync(resumePrintHtml, "utf8");

  const entryIds = [...resume.matchAll(/<div class="resume-entry" id="([^"]+)"/g)].map(([, id]) => id);
  const hidden = [
    ...resume.matchAll(/<div class="resume-entry" id="([^"]+)"[^>]*\bhidden\b/g),
  ].map(([, id]) => id);

  assert.deepEqual([...hidden].sort(), [...omitted].sort(), "only the PDF omissions start hidden");
  for (const id of omitted) {
    assert.ok(entryIds.includes(id), `${id} is still in the page markup without JavaScript`);
    assert.doesNotMatch(printHtml, new RegExp(`id="${escapeRegExp(id)}"`), `${id} is not printed`);
  }

  const printed = entryIds.filter((id) => !omitted.includes(id));
  assert.ok(printed.length > 0, "the print copy carries the selected entries");
  assert.match(printHtml, new RegExp(`id="${escapeRegExp(printed[0])}"`));
});

test("the resume selector sits beside the section or entry it controls", () => {
  const resume = readFileSync(join(output, "resume", "index.html"), "utf8");
  const omitted = printOmittedIds();

  assert.doesNotMatch(resume, /<form class="resume-selector"/, "there is no separate overview block");
  assert.doesNotMatch(resume, /Choose what appears/, "there is no overview heading");
  assert.equal((resume.match(/<h1\b/g) ?? []).length, 1, "the page keeps one heading");
  assert.match(
    resume,
    /<p class="resume-selector-note" data-resume-selector data-default-omitted="[^"]*">/,
  );

  const sectionIds = [...resume.matchAll(/data-resume-section="([^"]+)"/g)].map(([, id]) => id);
  assert.deepEqual(sectionIds, [
    "resume-summary",
    "resume-experience",
    "resume-projects",
    "resume-publications",
    "resume-volunteering",
    "resume-education",
    "resume-skills",
  ]);

  const entryIds = [...resume.matchAll(/<div class="resume-entry" id="([^"]+)"/g)].map(([, id]) => id);
  const experienceIds = [...resume.matchAll(/<div class="resume-entry" id="(experience-[^"]+)"/g)].map(
    ([, id]) => id,
  );
  const inputs = [
    ...resume.matchAll(/<input type="checkbox" name="include" value="([^"]+)"([^>]*)>/g),
  ].map(([, id, attrs]) => ({ id, checked: /\schecked(?:\s|=|$)/.test(attrs) }));

  const known = new Set([...sectionIds, ...entryIds]);
  for (const input of inputs) {
    assert.ok(known.has(input.id), `${input.id} maps to a section or entry on the page`);
  }

  const expected = [...sectionIds, ...experienceIds].filter((id) => !omitted.includes(id));
  const checked = inputs.filter((input) => input.checked).map((input) => input.id);
  assert.deepEqual([...checked].sort(), [...expected].sort(), "the controls start at the PDF selection");

  assert.equal(
    (resume.match(/<label class="resume-toggle"><input[^>]*aria-label="[^"]+"><\/label>/g) ?? []).length,
    inputs.length,
    "every control is a labelled toggle wrapping its input",
  );

  for (const id of sectionIds) {
    const section =
      resume.match(
        new RegExp(`<section class="resume-section" aria-labelledby="${id}"[\\s\\S]*?</section>`),
      )?.[0] ?? "";
    assert.match(
      section,
      new RegExp(
        `<div class="resume-section-head">\\s*<label class="resume-toggle"><input[^>]*value="${id}"[^>]*></label>\\s*<h2 id="${id}">`,
      ),
      `${id} has its toggle beside its heading, inside that section`,
    );
  }

  for (const id of experienceIds) {
    const entry =
      resume.match(new RegExp(`<div class="resume-entry" id="${id}"[^>]*>[\\s\\S]*?</div>`))?.[0] ?? "";
    assert.match(
      entry,
      new RegExp(
        `<div class="resume-entry-head">\\s*<label class="resume-toggle"><input[^>]*value="${id}"[^>]*></label>\\s*<p class="resume-entry-title">`,
      ),
      `${id} has its toggle beside its title, inside that entry`,
    );
  }
});

test("the resume selector is the site's own module and its core is emitted", () => {
  assert.equal(statSync(join(output, "assets", "resume-selector.js")).isFile(), true);
  assert.equal(statSync(join(output, "assets", "resume-selector-core.mjs")).isFile(), true);

  const browser = readFileSync(join(output, "assets", "resume-selector.js"), "utf8");
  assert.match(browser, /from "\/assets\/resume-selector-core\.mjs"/);
  assert.match(browser, /history\.replaceState/);
  assert.doesNotMatch(browser, /https?:\/\//, "the selector fetches nothing from another origin");
});

test("print styles hide the toggles and whatever the selection hides", () => {
  assert.match(siteCss, /\[hidden\]\s*\{[^}]*display:\s*none/s);
  assert.match(siteCss, /@media print[\s\S]*\.resume-toggle,[\s\S]*?\.resume-selector-note\s*\{[^}]*display:\s*none/s);
  assert.match(siteCss, /@media print[\s\S]*\.resume-entry\[hidden\][^{]*\{[^}]*display:\s*none/s);
});

test("the resume's project section is exactly the CV-visible projects", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-resume-projects-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-resume-projects-dist-"));
  writeProject(
    content,
    "cv-visible-older",
    `year: 2024
status: shipped
category: web
cv: true
cv_blurb: An older project the CV still carries.
order: 1`,
  );
  writeProject(
    content,
    "cv-visible-newer",
    `year: 2026
status: shipped
category: games
cv: true
cv_blurb: A newer project the CV carries.
`,
  );
  writeProject(
    content,
    "not-on-the-cv",
    `year: 2025
status: shipped
category: sound
featured: true
cv: false`,
  );

  build(dist, { CONTENT_DIR: content, RESUME_PDF: "0" });

  const projects = resumeSection("projects", dist);

  assert.match(projects, /cv-visible-newer/);
  assert.match(projects, /A newer project the CV carries\./);
  assert.match(projects, /cv-visible-older/);
  assert.match(projects, /An older project the CV still carries\./);
  assert.doesNotMatch(projects, /not-on-the-cv/);
  assert.ok(
    projects.indexOf("cv-visible-newer") < projects.indexOf("cv-visible-older"),
    "the resume ignores catalogue pinning and stays chronological",
  );
});

test("the resume has print styles for a clean browser print", () => {
  assert.match(siteCss, /@media print\s*\{/);
  assert.match(siteCss, /\.site-header,\s*\.site-footer\s*\{[^}]*display:\s*none/s);
  assert.match(siteCss, /\.resume-entry,\s*\.resume-group\s*\{[^}]*break-inside:\s*avoid/s);
  assert.match(siteCss, /@page\s*\{[^}]*size:\s*letter/s);
});

test("the build emits the resume markdown and a two-page PDF export", () => {
  const markdown = join(output, "resume.md");
  const pdf = join(output, "resume.pdf");

  assert.equal(statSync(markdown).isFile(), true, "resume.md is emitted");
  assert.equal(statSync(pdf).isFile(), true, "resume.pdf is emitted");

  const bytes = readFileSync(pdf);
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "%PDF");
  const pages = pdfPageCount(bytes);
  assert.ok(pages >= 1, "the PDF has a page count");
  assert.ok(pages <= 2, `resume.pdf is ${pages} pages, not more than two`);

  assert.equal(tracked.includes("dist/resume.pdf"), false, "the PDF is not committed");
  assert.equal(tracked.includes("dist/resume.md"), false, "the markdown is not committed");
});

test("resume.md carries the complete record and no phone number", () => {
  const markdown = readFileSync(join(output, "resume.md"), "utf8");

  assert.match(markdown, /^# Jenny Mae Leidig$/m);
  for (const text of [
    "Chadwick & Son Orchids",
    "CapTech Consulting",
    "Virginia Tech College of Engineering",
    "Software Assistance Triage (SWAT) Technician",
    "April 2025 – July 2025",
    "Dreamcast Repair: A Journey of a Thousand Parts",
    "WRIR-LP 97.3FM",
    "University of Oklahoma",
    "## Skills",
  ]) {
    assert.match(markdown, new RegExp(escapeRegExp(text)), `${text} is in resume.md`);
  }

  assert.doesNotMatch(markdown, /276\)?[.\-\s]?356[.\-\s]?4765/);
  assert.doesNotMatch(markdown, /\+1[.\-\s]?276/);
});

test("the PDF source carries the phone number and only the selected entries", () => {
  const contact = readFileSync(join(root, "content", "resume", "contact.sh"), "utf8");
  const phone = contact.match(/^PHONE=(.+)$/m)?.[1] ?? "";
  const printHtml = readFileSync(resumePrintHtml, "utf8");

  assert.match(phone, /276\)?[.\-\s]?356[.\-\s]?4765/);
  assert.match(printHtml, /276\)?[.\-\s]?356[.\-\s]?4765/, "the print copy carries the phone");
  assert.doesNotMatch(printHtml, /<script\b/i, "the print copy carries no script");
  assert.match(printHtml, /id="experience-captech-2025-09"/);
  assert.doesNotMatch(printHtml, /id="experience-virginia-tech-swat"/);
  assert.doesNotMatch(printHtml, /id="experience-captech-2025-04"/);

  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(html, /276\)?[.\-\s]?356[.\-\s]?4765/, `${relative(root, file)} must not carry the phone`);
  }
  assert.doesNotMatch(readFileSync(join(output, "resume.md"), "utf8"), /276\)?[.\-\s]?356[.\-\s]?4765/);
});

test("the build fails when the resume PDF exceeds two pages", () => {
  const resume = mkdtempSync(join(tmpdir(), "portfolio-resume-long-"));
  mkdirSync(join(resume, "experience"));
  for (const file of ["summary.md", "skills.md", "contact.sh", "print.sh"]) {
    copyFileSync(join(root, "content", "resume", file), join(resume, file));
  }
  for (let i = 1; i <= 20; i += 1) {
    writeFileSync(
      join(resume, "experience", `role-${String(i).padStart(2, "0")}.md`),
      `---
employer: Employer ${i}
location: Richmond, VA
title: Software Engineer ${i}
start: 20${String(i).padStart(2, "0")}-01
end: present
---
- Shipped a system with a long enough description to take real space on the printed page
- Led another project with a second line of detail for the PDF page count
`,
    );
  }
  const dist = mkdtempSync(join(tmpdir(), "portfolio-resume-long-dist-"));

  const result = spawnSync(buildScript, [dist], {
    cwd: root,
    env: { ...process.env, RESUME_DIR: resume, RESUME_PDF: "1" },
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0, "the build must fail when the PDF overflows");
  assert.match(result.stderr, /resume\.pdf is \d+ pages/);
  assert.equal(existsSync(join(dist, "resume.pdf")), false, "the overflowing PDF is not published");
  assert.equal(existsSync(join(dist, "resume-print.html")), false, "the print copy is cleaned up");
});

test("identity links come from one source that every page reads", () => {
  const identity = join(mkdtempSync(join(tmpdir(), "portfolio-identity-")), "identity.sh");
  writeFileSync(
    identity,
    `FULL_NAME="Hello Example"
TAGLINE="Test Tagline"
EMAIL=hello@example.com
GITHUB=https://example.com/github
LINKEDIN=https://example.com/linkedin
ITCH=https://example.com/itch
HOMESTUCK=https://example.com/homestuck
PRIMARY_LINKS=("Email=mailto:hello@example.com" "GitHub=https://example.com/github" "LinkedIn=https://example.com/linkedin" "itch.io=https://example.com/itch")
ELSEWHERE_LINKS=("lazy sundays=https://example.com/lazy" "56 kbit/s=https://example.com/56" "x86 Soundscape=https://example.com/x86" "WRIR=https://example.com/wrir" "PagedOut!=https://example.com/pagedout")
`,
  );
  const dist = mkdtempSync(join(tmpdir(), "portfolio-identity-dist-"));

  build(dist, { IDENTITY_FILE: identity, RESUME_PDF: "0" });

  const about = readFileSync(join(dist, "about", "index.html"), "utf8");
  const home = readFileSync(join(dist, "index.html"), "utf8");
  assert.match(about, /hello@example\.com/);
  assert.match(about, /https:\/\/example\.com\/github/);
  assert.doesNotMatch(about, /jennymaeleidig@gmail\.com/);
  assert.match(home, /mailto:hello@example\.com/);
  assert.doesNotMatch(home, /jennymaeleidig@gmail\.com/);
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
    env: { ...process.env, CONTENT_DIR: content, RESUME_PDF: "0" },
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

test("the committed poster is a static frame of the current sky", () => {
  const svg = readFileSync(join(root, "assets", "sky-poster.svg"), "utf8");

  assert.match(svg, new RegExp(`sha256:${posterHash()} cell:${POSTER.cellPx}`));

  const [, base64] = svg.match(/base64,([A-Za-z0-9+/=]+)/) ?? [];
  assert.ok(base64, "the poster embeds its PNG frame");

  const png = Buffer.from(base64, "base64");
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(png.readUInt32BE(16), POSTER.cols, "the poster is the shipped width");
  assert.equal(png.readUInt32BE(20), POSTER.rows, "the poster is the shipped height");
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

test("the sheet insets its content from its own border", () => {
  assert.match(siteCss, /\.sheet\s*\{[^}]*padding:\s*var\(--line-height\) 3ch/s);
  const print = siteCss.slice(siteCss.indexOf("@media print"));
  assert.match(print, /\.sheet\s*\{[^}]*padding:\s*0/s, "print drops the sheet padding");
});

test("the featured grid caps at three columns and collapses on a narrow viewport", () => {
  assert.match(siteCss, /\.grid\s*\{[^}]*--grid-cells:\s*1/s);
  assert.match(siteCss, /\.grid:has\(> :nth-child\(3\)\)\s*\{\s*--grid-cells:\s*3/);
  assert.doesNotMatch(siteCss, /:nth-child\([4-9]\)\)\s*\{\s*--grid-cells/);
  assert.match(
    siteCss,
    /@media screen and \(max-width: 760px\)\s*\{\s*\.grid > \*\s*\{\s*flex-basis:\s*100%/s,
  );
});

test("the catalogue and the header stay readable on a narrow viewport", () => {
  assert.match(
    siteCss,
    /@media screen and \(max-width: 560px\)\s*\{[\s\S]*?\.site-header\s*\{[^}]*flex-direction:\s*column/s,
  );
  assert.match(
    siteCss,
    /@media screen and \(max-width: 640px\)\s*\{[\s\S]*?\.catalogue thead\s*\{\s*display:\s*none/s,
  );
  assert.match(
    siteCss,
    /@media screen and \(max-width: 640px\)\s*\{[\s\S]*?\.catalogue td\s*\{[^}]*display:\s*block/s,
  );
});

test("print keeps employers and roles apart", () => {
  const print = siteCss.slice(siteCss.indexOf("@media print"));
  assert.match(print, /\.resume-group \+ \.resume-group\s*\{\s*margin-top:\s*0\.75rem/);
  assert.match(print, /\.resume-entry \+ \.resume-entry\s*\{\s*margin-top:\s*0\.5rem/);
});

test("every page declares the favicon the build ships", () => {
  assert.equal(existsSync(join(output, "assets", "favicon.svg")), true, "the icon is emitted");
  for (const file of htmlFiles) {
    assert.match(
      readFileSync(file, "utf8"),
      /<link rel="icon" href="\/assets\/favicon\.svg" type="image\/svg\+xml">/,
      `${relative(root, file)} declares the icon`,
    );
  }
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
  build(dist, { RESUME_PDF: "0" });
  writeFileSync(join(dist, "stale.html"), "left over from an earlier build");

  build(dist, { RESUME_PDF: "0" });

  assert.equal(readdirSync(dist).includes("stale.html"), false);
  assert.equal(statSync(join(dist, "index.html")).isFile(), true);
});

test("the build fails, naming the file, when a project cannot be staged", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-content-"));
  writeFileSync(join(content, "broken.md"), "# No frontmatter\n\nThis project cannot be dated.\n");
  const dist = mkdtempSync(join(tmpdir(), "portfolio-broken-"));

  const result = spawnSync(buildScript, [dist], {
    cwd: root,
    env: { ...process.env, CONTENT_DIR: content, RESUME_PDF: "0" },
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0, "the build must fail");
  assert.match(result.stderr, /broken\.md/);
});

const SITE_HOST = "https://portfolio.jenny-page.online";

// The route set as a visitor could enumerate it: every index.html under the
// dist tree, with the Pages 404 fallback and the /404 route itself excluded.
// This walks the emitted filesystem rather than reading the sitemap, so a page
// with no sitemap entry and a sitemap entry with no page both fail below.
function emittedRoutes(base) {
  const routes = [];
  for (const file of walk(base)) {
    if (!file.endsWith(".html")) {
      continue;
    }
    const rel = relative(base, file);
    if (rel === "404.html") {
      continue;
    }
    if (rel === "index.html") {
      routes.push("/");
    } else if (rel.endsWith("/index.html")) {
      const route = `/${rel.slice(0, -"index.html".length)}`;
      if (route !== "/404/") {
        routes.push(route);
      }
    }
  }
  return routes.sort();
}

function sitemapLocs(base) {
  const xml = readFileSync(join(base, "sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc);
}

function articleSlugs() {
  return readdirSync(join(root, "content", "projects"))
    .filter((name) => name.endsWith(".md"))
    .filter((name) =>
      /^category:\s*articles\s*$/m.test(readFileSync(join(root, "content", "projects", name), "utf8")),
    )
    .map((name) => name.replace(/\.md$/, ""));
}

test("/404 renders, offers the way back, and does not link to itself", () => {
  const page = readFileSync(join(output, "404", "index.html"), "utf8");

  assert.equal((page.match(/<h1\b/g) ?? []).length, 1, "/404 has one heading");
  assert.match(page, /does not exist/i);

  for (const route of ["/", "/work/", "/resume/", "/about/", "/now/"]) {
    assert.match(
      page,
      new RegExp(`<a href="${escapeRegExp(route)}"`),
      `/404 links back to ${route}`,
    );
  }
  assert.doesNotMatch(page, /href="\/404\/?(?:"|\/)/, "/404 must not link to itself");
});

test("the root 404.html is the same page as /404", () => {
  const route = readFileSync(join(output, "404", "index.html"), "utf8");
  const fallback = readFileSync(join(output, "404.html"), "utf8");

  assert.equal(fallback, route, "GitHub Pages' fallback carries the same page");
});

test("sitemap.xml lists exactly the routes the build emitted", () => {
  const locs = sitemapLocs(output);
  const expected = emittedRoutes(output).map((route) => `${SITE_HOST}${route}`);

  assert.deepEqual([...locs].sort(), [...expected].sort());
  assert.equal(locs[0], `${SITE_HOST}/`, "the root route comes first");
  assert.deepEqual(locs.slice(1), [...locs.slice(1)].sort(), "the rest are sorted");
  assert.equal(new Set(locs).size, locs.length, "no loc is repeated");
  assert.equal(locs.some((loc) => loc.endsWith("/404") || loc.endsWith("/404/")), false);
});

test("the sitemap uses absolute same-site URLs and omits articles and exports", () => {
  const locs = sitemapLocs(output);

  for (const loc of locs) {
    assert.ok(loc.startsWith(`${SITE_HOST}/`), `${loc} is absolute on the site host`);
  }
  for (const slug of articleSlugs()) {
    assert.equal(
      locs.some((loc) => loc.startsWith(`${SITE_HOST}/projects/${slug}/`)),
      false,
      `${slug} is an article with no page and must not be in the sitemap`,
    );
  }
  assert.equal(locs.some((loc) => loc.endsWith("/resume.md")), false);
  assert.equal(locs.some((loc) => loc.endsWith("/resume.pdf")), false);
});

test("robots.txt points at the absolute sitemap", () => {
  const robots = readFileSync(join(output, "robots.txt"), "utf8");

  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, new RegExp(`^Sitemap: ${escapeRegExp(SITE_HOST)}/sitemap\\.xml$`, "m"));
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
