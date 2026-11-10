// Project pages: one markdown file becomes one page
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { build, buildFixture, root, sharedSite, writeProject } from "./support/site.mjs";

const { output, htmlFiles, siteCss } = await sharedSite();

test("the build emits the hand-written page at its route", () => {
  const home = join(output, "index.html");
  const project = join(output, "projects", "example-project", "index.html");

  assert.equal(statSync(home).isFile(), true, "the front page is emitted");
  assert.equal(statSync(project).isFile(), true, "the project page is emitted");

  assert.match(readFileSync(home, "utf8"), /example-project/);
  assert.match(readFileSync(project, "utf8"), /<h1>Example Project<\/h1>/);
});

test("markdown is rendered without its frontmatter", () => {
  const page = readFileSync(join(output, "projects", "example-project", "index.html"), "utf8");

  assert.match(page, /<p>An example project, staged by the tests rather than read from the real content\.<\/p>/);
  assert.doesNotMatch(page, /^---$/m);
  assert.doesNotMatch(page, /^category:/m);
});

test("a project page renders its title, year, status, links and prose from one file", () => {
  const page = readFileSync(join(output, "projects", "example-project", "index.html"), "utf8");

  assert.match(page, /<h1>Example Project<\/h1>/);
  assert.match(page, /<p class="meta">games &middot; 2026 &middot; <span class="status">study<\/span><\/p>/);
  assert.match(page, /2026/);
  assert.match(page, /study/);
  assert.match(page, /href="https:\/\/example\.com\/itch"/);
  assert.match(page, /href="https:\/\/example\.com\/repo"/);
  assert.match(page, /a cover, two tags, two links/i);
});

test("a link prints its own key, so a project can carry two of the same sort", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-link-labels-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-link-labels-dist-"));
  writeProject(
    content,
    "two-repos",
    `year: 2026
status: active
category: software
links:
  live: https://example.com/site
  Frontend: https://example.com/frontend
  Backend: https://example.com/backend
  itch.io: https://example.com/itch`,
  );

  buildFixture(content, dist);

  const page = readFileSync(join(dist, "projects", "two-repos", "index.html"), "utf8");
  const links = [...page.matchAll(/<li><a href="([^"]+)">([^<]+)<\/a><\/li>/g)].map(([, href, label]) => [label, href]);
  assert.deepEqual(links, [
    ["Live", "https://example.com/site"],
    ["Frontend", "https://example.com/frontend"],
    ["Backend", "https://example.com/backend"],
    ["Itch.io", "https://example.com/itch"],
  ], "a lowercase key is capitalised, the rest is printed as written, punctuation included");
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
