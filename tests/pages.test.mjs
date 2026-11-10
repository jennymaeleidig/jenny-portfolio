// Project pages: one markdown file becomes one page
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { build, buildFixture, escapeRegExp, root, sharedSite, sitemapLocs, SITE_HOST, SITE_NAME, writeProject } from "./support/site.mjs";

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

test("a link prints its title verbatim, so a project can title any link", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-link-titles-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-link-titles-dist-"));
  writeProject(
    content,
    "titled-links",
    `year: 2026
status: active
category: software
links:
  - title: 'Live'
    url: 'https://example.com/site'
  - title: 'itch.io'
    url: 'https://example.com/itch'
  - title: 'Jenny''s "Final" Cut (#1) = C++ 🎮'
    url: 'https://example.com/final?x=1&y=2#top'
  - title: 'Live'
    url: 'https://example.com/live-again'
  - title: '~ notes'
    url: 'https://example.com/notes'`,
  );

  buildFixture(content, dist);

  const page = readFileSync(join(dist, "projects", "titled-links", "index.html"), "utf8");
  const links = [...page.matchAll(/<li><a href="([^"]+)">([^<]+)<\/a><\/li>/g)].map(([, href, label]) => [label, href]);
  assert.deepEqual(links, [
    ["Live", "https://example.com/site"],
    ["itch.io", "https://example.com/itch"],
    ["Jenny's &quot;Final&quot; Cut (#1) = C++ 🎮", "https://example.com/final?x=1&amp;y=2#top"],
    ["Live", "https://example.com/live-again"],
    ["~ notes", "https://example.com/notes"],
  ], "titles keep their text and casing, duplicates stay in order, and markup is escaped");
});

test("a project with no links leaves the link list out", () => {
  const page = readFileSync(join(output, "projects", "second-project", "index.html"), "utf8");

  assert.doesNotMatch(page, /class="links ruled"/, "no links means no link list");
});

test("every page declares the favicon the build ships", () => {
  assert.equal(existsSync(join(output, "assets", "favicon.png")), true, "the icon is emitted");
  for (const file of htmlFiles) {
    assert.match(
      readFileSync(file, "utf8"),
      /<link rel="icon" href="\/assets\/favicon\.png" type="image\/png">/,
      `${relative(root, file)} declares the icon`,
    );
  }
});

test("every page's canonical URL is the one the sitemap publishes", () => {
  const declared = htmlFiles
    .filter((file) => !relative(output, file).startsWith("404"))
    .map((file) => readFileSync(file, "utf8").match(/<link rel="canonical" href="([^"]+)">/)?.[1] ?? null);

  assert.deepEqual(
    declared.sort(),
    sitemapLocs(output).sort(),
    "a page's canonical URL and its sitemap loc are the same address",
  );
});

test("every page carries a share card built from the sky poster", () => {
  const image = `${SITE_HOST}/assets/sky-poster.png`;
  for (const file of htmlFiles) {
    const page = readFileSync(file, "utf8");
    const where = relative(root, file);
    const title = page.match(/<title>([^<]*)<\/title>/)?.[1];
    const shareTitle = title.endsWith(`, ${SITE_NAME}`) ? title.slice(0, -(`, ${SITE_NAME}`.length)) : title;

    assert.match(page, /<meta name="description" content="[^"]+">/, `${where} has a description`);
    assert.match(page, new RegExp(`<meta property="og:title" content="${escapeRegExp(shareTitle)}">`), `${where} previews its own title, not the site's`);
    assert.match(page, /<meta property="og:description" content="[^"]+">/, `${where} previews a description`);
    assert.match(page, /<meta property="og:type" content="website">/, `${where} is a website`);
    assert.match(page, new RegExp(`<meta property="og:image" content="${escapeRegExp(image)}">`), `${where} previews the poster`);
    assert.match(page, /<meta property="og:image:type" content="image\/png">/, `${where} says the card is a PNG`);
    assert.match(page, /<meta property="og:image:width" content="[0-9]+">/, `${where} gives the card's width`);
    assert.match(page, /<meta property="og:image:height" content="[0-9]+">/, `${where} gives the card's height`);
    assert.match(page, /<meta property="og:image:alt" content="[^"]+">/, `${where} describes the poster`);
    assert.match(page, /<meta name="twitter:card" content="summary_large_image">/, `${where} asks for a large card`);
    assert.match(page, new RegExp(`<meta name="twitter:image" content="${escapeRegExp(image)}">`), `${where} previews the poster on X`);
  }
});

test("the 404 asks not to be indexed and claims no address", () => {
  for (const path of ["404.html", join("404", "index.html")]) {
    const page = readFileSync(join(output, path), "utf8");
    assert.match(page, /<meta name="robots" content="noindex">/, `${path} is not indexed`);
    assert.doesNotMatch(page, /rel="canonical"/, `${path} claims no canonical URL`);
  }
});

test("a project's share description is its blurb, escaped exactly once", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-share-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-share-dist-"));
  writeProject(
    content,
    "ampersands",
    `year: 2026
status: active
category: software`,
    `# Ampersands

Guns & roses, <3 and "quoted" text.`,
  );

  buildFixture(content, dist);

  const page = readFileSync(join(dist, "projects", "ampersands", "index.html"), "utf8");
  assert.match(
    page,
    /<meta name="description" content="Guns &amp; roses, &lt;3 and &quot;quoted&quot; text\.">/,
    "the blurb reaches the meta tag as text, with each character escaped once",
  );
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
