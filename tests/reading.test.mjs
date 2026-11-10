// Reading the site: no JavaScript, no legacy routes, 404 and the sitemap
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { SITE_HOST, articleSlugs, build, currentNavLinks, emittedRoutes, escapeRegExp, root, sharedSite, sitemapLocs } from "./support/site.mjs";

const { output, htmlFiles, siteCss } = await sharedSite();

test("the pinned markdown parser renders CommonMark plus GFM tables and autolinks", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-parser-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-parser-dist-"));
  writeFileSync(
    join(content, "parser-fixture.md"),
    `---
year: 2026
status: shipped
category: software
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

test("every page carries its content without JavaScript", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    assert.match(html, /<main\b/i, `${relative(root, file)} must carry its content in markup`);

    for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
      assert.match(tag, /type="module"/, `${relative(root, file)} must not use a classic script`);
      assert.match(
        tag,
        /src="\/assets\/(sky|sky-levers|nav)\.js"/,
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

test("the link to the page already on screen is a no-op, not a reload", () => {
  const nav = readFileSync(join(output, "assets", "nav.js"), "utf8");

  assert.match(
    nav,
    /url\.pathname === location\.pathname && url\.search === location\.search\) return;/,
    "the click handler stops before navigating to the current URL",
  );
});

test("visited links carry no treatment of their own", () => {
  assert.doesNotMatch(siteCss, /(^|\n)\s*a:visited\s*\{/m, "no rule paints over the component colours");
});

test("no phone number appears on any page", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(html, /276\)?[.\-\s]?356[.\-\s]?4765/, `${relative(root, file)} must not carry the phone number`);
    assert.doesNotMatch(html, /\+1[.\-\s]?276/, `${relative(root, file)} must not carry the phone number`);
  }
});

test("no page header offers a legacy link", () => {
  const legacyPath = /\/resume/;
  for (const file of htmlFiles) {
    const header = readFileSync(file, "utf8").match(/<header class="site-header"[\s\S]*?<\/header>/)?.[0] ?? "";
    assert.doesNotMatch(header, legacyPath, `${relative(root, file)} header has no legacy link`);
  }
});

test("the build emits no legacy route or export and nothing references one", () => {
  for (const path of [
    join(output, "resume", "index.html"),
    join(output, "resume.md"),
    join(output, "resume.pdf"),
    join(output, "resume-print.html"),
    join(output, "resume-print.css"),
    join(output, "assets", "resume-selector.js"),
    join(output, "assets", "resume-selector-core.mjs"),
  ]) {
    assert.equal(existsSync(path), false, `${relative(output, path)} is not emitted`);
  }

  const legacyPath = /\/resume(?:\/|\.md|\.pdf)/;
  for (const file of htmlFiles) {
    assert.doesNotMatch(readFileSync(file, "utf8"), legacyPath, `${relative(root, file)} references the deleted route`);
  }
});

test("/404 says what happened, and the site header is the way back", () => {
  const page = readFileSync(join(output, "404", "index.html"), "utf8");

  assert.equal((page.match(/<h1\b/g) ?? []).length, 1, "/404 has one heading");
  assert.match(page, /does not exist/i);

  // The page itself carries no second list of routes: the header above it is
  // the way back, and it is on every page, including this one.
  for (const route of ["/", "/work/", "/about/", "/now/"]) {
    assert.match(
      page,
      new RegExp(`<header class="site-header">[\\s\\S]*<a href="${escapeRegExp(route)}"`),
      `/404 keeps the header link to ${route}`,
    );
  }
  assert.deepEqual(currentNavLinks(page), [], "/404 is not the current section of any header link");
  assert.doesNotMatch(page, /class="links"/, "/404 carries no second list of routes");
  assert.doesNotMatch(page, /href="\/404\/?(?:"|\/)/, "/404 must not link to itself");
  assert.doesNotMatch(page, /\/resume/, "the 404 offers no legacy link");
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
  assert.equal(
    locs.includes(`${SITE_HOST}/work/career/`),
    true,
    "/work/career/ is listed in the sitemap",
  );
});

test("the sitemap uses absolute same-site URLs and omits articles and deleted routes", () => {
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
  assert.equal(locs.some((loc) => loc.includes("/resume")), false, "no legacy route is in the sitemap");
});

test("robots.txt points at the absolute sitemap", () => {
  const robots = readFileSync(join(output, "robots.txt"), "utf8");

  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, new RegExp(`^Sitemap: ${escapeRegExp(SITE_HOST)}/sitemap\\.xml$`, "m"));
});
