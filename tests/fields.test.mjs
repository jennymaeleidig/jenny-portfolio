// Project fields: links, tags, covers and status
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFixture, writeProject } from "./support/site.mjs";

test("the build refuses the old links mapping and points at the new form", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-old-links-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-old-links-dist-"));
  writeProject(
    content,
    "old-links",
    `year: 2026
status: active
category: software
links:
  Repo: https://example.com/repo`,
  );

  const result = buildFixture(content, dist);

  assert.notEqual(result.status, 0, "the build must fail");
  assert.match(result.stderr, /old-links\.md/);
  assert.match(result.stderr, /links are a list of title\/url records now/);
  assert.match(result.stderr, /docs\/project\.md/);
});

test("the build refuses a link without a valid title or http url", () => {
  const cases = [
    ["no-url", "  - title: 'Repo'", /cannot parse frontmatter line/],
    [
      "bad-url",
      "  - title: 'Repo'\n    url: 'ftp://example.com/repo'",
      /link 'Repo' must be an http\(s\) URL/,
    ],
    [
      "empty-title",
      "  - title: ''\n    url: 'https://example.com/repo'",
      /cannot parse frontmatter line/,
    ],
    [
      "unquoted-title",
      "  - title: Repo\n    url: 'https://example.com/repo'",
      /cannot parse frontmatter line/,
    ],
    [
      "tab-title",
      "  - title: 'two\twords'\n    url: 'https://example.com/repo'",
      /cannot parse frontmatter line/,
    ],
  ];

  for (const [slug, links, expected] of cases) {
    const content = mkdtempSync(join(tmpdir(), `portfolio-${slug}-`));
    const dist = mkdtempSync(join(tmpdir(), `portfolio-${slug}-dist-`));
    writeProject(
      content,
      slug,
      `year: 2026
status: active
category: software
links:
${links}`,
    );

    const result = buildFixture(content, dist);

    assert.notEqual(result.status, 0, `${slug} must fail`);
    assert.match(
      result.stderr,
      new RegExp(`${slug}\\.md`),
      `${slug} names the file`,
    );
    assert.match(result.stderr, expected, slug);
  }
});

test("the build accepts a formatter's double-quoted links", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-double-links-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-double-links-dist-"));
  writeProject(
    content,
    "double-links",
    `year: 2026
status: shipped
category: software
links:
  - title: "Alan Zucconi's Journey"
    url: "https://example.com/alan"
  - title: "Jenny's \\"Final\\" Cut"
    url: "https://example.com/final"`,
  );

  buildFixture(content, dist);

  const page = readFileSync(
    join(dist, "projects", "double-links", "index.html"),
    "utf8",
  );
  assert.match(page, /Alan Zucconi's Journey/);
  assert.match(page, /Jenny's &quot;Final&quot; Cut/);
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

  const page = readFileSync(
    join(dist, "projects", "half-built", "index.html"),
    "utf8",
  );
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
category: software
tags: [agents, terminal]`,
  );

  buildFixture(content, dist);

  const page = readFileSync(
    join(dist, "projects", "tagged", "index.html"),
    "utf8",
  );
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
category: software
cover: /assets/sky-poster.svg`,
  );
  writeProject(
    content,
    "uncovered",
    `year: 2026
status: shipped
category: software`,
  );

  buildFixture(content, dist);

  const covered = readFileSync(
    join(dist, "projects", "covered", "index.html"),
    "utf8",
  );
  const uncovered = readFileSync(
    join(dist, "projects", "uncovered", "index.html"),
    "utf8",
  );
  const article = (page) =>
    page.match(/<article[^>]*>([\s\S]*?)<\/article>/)?.[1] ?? "";

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
category: software
cover: /assets/covers/does-not-exist.png`,
  );

  const result = buildFixture(content, dist);

  assert.notEqual(result.status, 0, "the build must fail");
  assert.match(result.stderr, /broken-cover\.md/);
  assert.match(result.stderr, /does-not-exist\.png/);
});
