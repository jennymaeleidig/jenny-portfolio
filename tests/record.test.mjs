// The record: catalogue rows, blurbs and articles that link out
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, buildFixture, catalogueRows, writeProject } from "./support/site.mjs";

test("the catalogue is a three-column table with a header for each column", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-headers-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-headers-dist-"));
  writeProject(content, "headered", `year: 2026
status: shipped
category: games`);

  build(dist, { CONTENT_DIR: content });

  const catalogue = readFileSync(join(dist, "work", "index.html"), "utf8");
  const headers = [...catalogue.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(([, text]) => text);
  assert.deepEqual(headers, ["Project", "Blurb", "Category", "Year"], "the whole catalogue names each row's category");

  const row = catalogue.match(/<tbody>[\s\S]*?<tr>([\s\S]*?)<\/tr>/)?.[1] ?? "";
  assert.match(row, /<td class="catalogue-title"><a href="\/projects\/headered\/">headered<\/a><\/td>/);
  assert.match(row, /<td class="catalogue-blurb"><p>Prose for headered\.<\/p><\/td>/);
  assert.match(row, /<td class="catalogue-category">Games<\/td>/);
  assert.match(row, /<td class="meta">2026<\/td>/);

  // A category page already says it in its heading and its filter, so it does
  // not repeat it on every row.
  const games = readFileSync(join(dist, "work", "games", "index.html"), "utf8");
  assert.deepEqual(
    [...games.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(([, text]) => text),
    ["Project", "Blurb", "Year"],
    "a category page carries no category column",
  );
  assert.doesNotMatch(games, /catalogue-category/);
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

  build(dist, { CONTENT_DIR: content });

  const catalogue = readFileSync(join(dist, "work", "index.html"), "utf8");
  assert.match(catalogue, /<td class="catalogue-blurb"><p>A <em>quiet<\/em> game with a <a href="https:\/\/example\.com">link<\/a>\.<\/p><\/td>/);
  assert.doesNotMatch(catalogue, /\*quiet\*|\[link\]/);

  const home = readFileSync(join(dist, "index.html"), "utf8");
  assert.match(home, /<div class="card-blurb"><p>A <em>quiet<\/em> game/);
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
publication: https://example.com/a-paper`,
  );
  writeProject(
    content,
    "a-live-piece",
    `year: 2025
status: shipped
category: articles
publication: https://example.com/a-live-piece`,
  );
  writeProject(content, "a-project", `year: 2024
status: shipped
category: software`);

  build(dist, { CONTENT_DIR: content });

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

test("the build fails, naming the file, when an article has no publication", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-article-link-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-article-link-dist-"));
  writeProject(content, "orphan-article", `year: 2026
status: shipped
category: articles`);

  const result = buildFixture(content, dist);

  assert.notEqual(result.status, 0, "the build must fail");
  assert.match(result.stderr, /orphan-article\.md/);
  assert.match(result.stderr, /publication/);
});
