// The front page, About and Now: what a visitor meets
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  build,
  escapeRegExp,
  root,
  sharedSite,
  writeProject,
} from "./support/site.mjs";

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
  assert.equal(
    statSync(join(dist, "projects", "quiet-project", "index.html")).isFile(),
    true,
  );
});

test("the front page shows exactly the featured projects as cards with category and year", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-front-page-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-front-page-dist-"));
  writeProject(
    content,
    "featured-game",
    `year: 2026
status: shipped
category: games
featured: true`,
  );
  writeProject(
    content,
    "featured-sound",
    `year: 2024
status: shipped
category: sound
featured: true`,
  );
  writeProject(
    content,
    "quiet-web",
    `year: 2025
status: shipped
category: software`,
  );

  build(dist, { CONTENT_DIR: content });

  const home = readFileSync(join(dist, "index.html"), "utf8");
  assert.match(home, /<ul class="grid featured">/);

  const cards = [...home.matchAll(/<li class="card">([\s\S]*?)<\/li>/g)].map(
    ([, card]) => card,
  );
  assert.equal(cards.length, 2, "only the featured projects are cards");
  assert.doesNotMatch(
    home,
    /card-last/,
    "no card carries a closing rule of its own",
  );
  assert.match(cards[0], /href="\/projects\/featured-game\/"/);
  assert.match(cards[0], /games/);
  assert.match(cards[0], /2026/);
  assert.match(cards[1], /href="\/projects\/featured-sound\/"/);
  assert.match(cards[1], /sound/);
  assert.match(cards[1], /2024/);
  assert.doesNotMatch(home, /quiet-web/);
});

// About and Now are hand-written pages, so these tests give the build their
// own files rather than asserting on the fixture site's copy. One build serves
// both pages.
let editorial;
function editorialSite() {
  if (editorial) return editorial;
  const dir = mkdtempSync(join(tmpdir(), "portfolio-editorial-"));
  const aboutFile = join(dir, "about.md");
  const nowFile = join(dir, "now.md");
  writeFileSync(
    aboutFile,
    `---
photo: /assets/sky-poster.svg
---

First paragraph.

Second paragraph.

Third paragraph.
`,
  );
  writeFileSync(
    nowFile,
    `---
updated: 1 January 2030
---

## Making

One line of prose.

## Not doing

Nothing at all.
`,
  );
  const dist = mkdtempSync(join(tmpdir(), "portfolio-editorial-dist-"));
  build(dist, { ABOUT_FILE: aboutFile, NOW_FILE: nowFile });
  editorial = dist;
  return dist;
}

test("About renders its prose, a photo and the primary links", () => {
  const about = readFileSync(
    join(editorialSite(), "about", "index.html"),
    "utf8",
  );

  assert.match(about, /<h1>About<\/h1>/);

  const prose = about.match(/<div class="prose">([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.equal(
    (prose.match(/<p>/g) ?? []).length,
    3,
    "About renders one paragraph per block of prose",
  );

  assert.match(
    about,
    /<img class="portrait" src="\/assets\/sky-poster\.svg" alt="Example Name"/,
  );

  const primary =
    about.match(/<ul class="links primary-links"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ??
    "";
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
});

test("the photo appears only on About", () => {
  for (const file of htmlFiles) {
    if (file === join(output, "about", "index.html")) {
      continue;
    }
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(
      html,
      /portrait/,
      `${relative(root, file)} must not show the photo`,
    );
  }
});

test("Now renders a visible update date and one row per section", () => {
  const now = readFileSync(join(editorialSite(), "now", "index.html"), "utf8");

  assert.match(now, /<h1>Now<\/h1>/);
  assert.match(now, /Last updated 1 January 2030/);

  const headers = [...now.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(
    ([, text]) => text,
  );
  assert.deepEqual(headers, ["Doing", "Blurb"], "Now is a two-column table");

  const doing = [...now.matchAll(/<td class="now-doing">([^<]+)<\/td>/g)].map(
    ([, text]) => text,
  );
  assert.deepEqual(doing, ["Making", "Not doing"]);

  assert.doesNotMatch(
    now,
    /<td class="now-doing"><\/td>/,
    "the blank line after the frontmatter is not an empty row",
  );

  assert.match(
    now,
    /<td class="catalogue-blurb">\s*<p>One line of prose\.<\/p>/,
    "each section's prose sits in the Blurb column",
  );
});
