// The front page, About and Now: what a visitor meets

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { build, escapeRegExp, fixtureSite, root, sharedSite, writeProject } from "./support/site.mjs";

const { output, htmlFiles, siteCss } = await sharedSite();

test("the front page lists the featured projects and links to every page", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-featured-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-featured-dist-"));
  writeFileSync(
    join(content, "featured-project.md"),
    `---
year: 2026
status: shipped
category: software
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
category: software`);

  build(dist, { CONTENT_DIR: content });

  const home = readFileSync(join(dist, "index.html"), "utf8");
  assert.match(home, /<ul class="grid featured">/);

  const cards = [...home.matchAll(/<li class="card">([\s\S]*?)<\/li>/g)].map(([, card]) => card);
  assert.equal(cards.length, 2, "only the featured projects are cards");
  assert.doesNotMatch(home, /card-last/, "no card carries a closing rule of its own");
  assert.match(cards[0], /href="\/projects\/featured-game\/"/);
  assert.match(cards[0], /games/);
  assert.match(cards[0], /2026/);
  assert.match(cards[1], /href="\/projects\/featured-sound\/"/);
  assert.match(cards[1], /sound/);
  assert.match(cards[1], /2024/);
  assert.doesNotMatch(home, /quiet-web/);
});

test("About renders three paragraphs, a photo and the primary links", () => {
  const about = readFileSync(join(output, "about", "index.html"), "utf8");

  assert.match(about, /<h1>About<\/h1>/);

  const prose = about.match(/<div class="prose">([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.equal((prose.match(/<p>/g) ?? []).length, 3, "About carries three paragraphs");

  assert.match(about, /<img class="portrait" src="\/assets\/portrait\.svg" alt="Example Name"/);

  const primary = about.match(/<ul class="links primary-links"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? "";
  assert.match(primary, /<a href="mailto:hello@example\.com">Email<\/a>/);
  assert.ok(
    primary.indexOf("mailto:") < primary.indexOf("https://example.com/github"),
    "email is the first primary link",
  );
  for (const href of [
    "https://example.com/github",
    "https://example.com/linkedin",
    "https://example.com/itch",
  ]) {
    assert.match(primary, new RegExp(`href="${escapeRegExp(href)}"`));
  }

  assert.doesNotMatch(about, /class="links elsewhere"/, "the elsewhere list is gone");

  assert.doesNotMatch(about, /Unofficial Homestuck Collection/i, "the contribution line is gone");
  assert.doesNotMatch(about, /class="contribution"/);
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

  const updated = readFileSync(join(fixtureSite, "now.md"), "utf8").match(/^updated:\s*(.+)$/m)?.[1]?.trim();
  assert.ok(updated, "Now declares when it was last updated");
  assert.match(now, new RegExp(escapeRegExp(updated)));

  const headers = [...now.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(([, text]) => text);
  assert.deepEqual(headers, ["Doing", "Blurb"], "Now is a two-column table");

  const doing = [...now.matchAll(/<td class="now-doing">([^<]+)<\/td>/g)].map(([, text]) => text);
  assert.deepEqual(doing, ["Making", "Reading", "Listening", "Watching", "Not doing"]);

  assert.match(
    now,
    /<td class="catalogue-blurb">\s*<p>I'm rebuilding this site/,
    "each section's prose sits in the Blurb column",
  );

  assert.doesNotMatch(now, /archive/i);
  assert.doesNotMatch(now, /weekly|monthly|every week|every month|cadence/i);
});
