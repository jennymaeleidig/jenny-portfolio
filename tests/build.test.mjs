import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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

// The build reads one site, and the tests read a fixture site rather than the
// real content: what a test asserts never depends on what Jenny has written
// this week. Each test that cares writes its own projects into a temp
// directory and passes them as CONTENT_DIR.
const fixtureSite = join(root, "tests", "fixtures", "site");
const FIXTURE_ENV = {
  CONTENT_DIR: join(fixtureSite, "projects"),
  CAREER_DIR: join(fixtureSite, "career"),
  IDENTITY_FILE: join(fixtureSite, "identity.sh"),
  ABOUT_FILE: join(fixtureSite, "about.md"),
  NOW_FILE: join(fixtureSite, "now.md"),
};

function build(dist, env = {}) {
  return execFileSync(buildScript, [dist], {
    cwd: root,
    env: { ...process.env, ...FIXTURE_ENV, ...env },
    encoding: "utf8",
    stdio: "pipe",
  });
}

function buildFixture(content, dist) {
  return spawnSync(buildScript, [dist], {
    cwd: root,
    env: { ...process.env, ...FIXTURE_ENV, CONTENT_DIR: content },
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

function tabBar(html) {
  return html.match(/<nav class="tab-bar" aria-label="Work sections">([\s\S]*?)<\/nav>/)?.[1] ?? "";
}

function currentTabs(html) {
  return [...tabBar(html).matchAll(/<a href="([^"]+)"[^>]*aria-current="page"/g)].map(([, href]) => href);
}

function currentNavLinks(html) {
  const nav = html.match(/<nav aria-label="Primary">([\s\S]*?)<\/nav>/)?.[1] ?? "";
  return [...nav.matchAll(/<a href="([^"]+)"[^>]*aria-current="page"/g)].map(([, href]) => href);
}

const CAREER_SECTIONS = ["experience", "volunteering", "education", "skills"];

function filters(html) {
  return html.match(/<nav aria-label="(?:Categories|Career sections)">([\s\S]*?)<\/nav>/)?.[1] ?? "";
}

function filterLabels(html) {
  return [...filters(html).matchAll(/<a href="[^"]+"[^>]*>([^<]+)<\/a>/g)].map(([, label]) => label);
}

function currentFilters(html) {
  return [...filters(html).matchAll(/<a href="([^"]+)"[^>]*aria-current="page"/g)].map(([, href]) => href);
}

function careerHeadings(html) {
  return [...html.matchAll(/<h2 id="career-[^"]+">([^<]+)<\/h2>/g)].map(([, text]) => text);
}

function careerSection(html, name) {
  const start = html.indexOf(`<h2 id="career-${name}">`);
  if (start < 0) return "";
  const next = html.indexOf('<h2 id="career-', start + 1);
  return html.slice(start, next < 0 ? undefined : next);
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
category: software
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
category: software
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
    const fields = { year: "2026", status: "shipped", category: "software" };
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

test("the sky's levers are a development tool, not a shipped one", () => {
  const home = readFileSync(join(output, "index.html"), "utf8");
  const sky = readFileSync(join(output, "assets", "sky.js"), "utf8");

  assert.doesNotMatch(home, /sky-levers/, "no production page points at the panel");
  assert.equal(
    existsSync(join(output, "assets", "sky-levers.mjs")),
    false,
    "the panel is not emitted without the flag",
  );
  assert.match(
    sky,
    /document\.body\.hasAttribute\("data-sky-levers"\)/,
    "the live config is published only when the build marks the body",
  );
});

test("a SKY_LEVERS=1 build carries the levers on every page", () => {
  const dist = mkdtempSync(join(tmpdir(), "portfolio-levers-"));
  build(dist, { SKY_LEVERS: "1" });

  const pages = walk(dist).filter((path) => path.endsWith(".html"));
  assert.ok(pages.length > 0, "the development build emits pages");

  for (const file of pages) {
    const html = readFileSync(file, "utf8");
    assert.match(html, /<body data-sky-levers>/, `${relative(root, file)} marks the body`);
    assert.match(
      html,
      /<script type="module" src="\/assets\/sky-levers\.mjs"><\/script>/,
      `${relative(root, file)} loads the panel after the sky`,
    );
  }

  const levers = readFileSync(join(dist, "assets", "sky-levers.mjs"), "utf8");
  for (const key of [
    "cell",
    "scale",
    "tones",
    "gain",
    "speed",
    "falloff",
    "dither",
    "sky",
    "stark",
    "evolve",
    "evolveSpeed",
    "warp",
    "warpSpeed",
  ]) {
    assert.match(levers, new RegExp(`key: "${key}"`), `${key} has a lever`);
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

test("/work lists every project, newest first, with order pinning above newer work", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-catalogue-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-catalogue-dist-"));
  writeProject(content, "alpha", `year: 2024
status: shipped
category: games`);
  writeProject(content, "beta", `year: 2026
status: shipped
category: software`);
  writeProject(content, "pinned", `year: 2020
status: shipped
category: sound
order: 1`);

  build(dist, { CONTENT_DIR: content });

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
category: software`);
  writeProject(
    content,
    "article-one",
    `year: 2022
status: shipped
category: articles
links:
  paper: https://example.com/article-one`,
  );

  build(dist, { CONTENT_DIR: content });

  const all = readFileSync(join(dist, "work", "index.html"), "utf8");
  assert.equal(catalogueRows(all).length, 5, "the catalogue lists every project once");

  const expected = {
    games: ["game-two", "game-one"],
    sound: ["sound-one"],
    hardware: [],
    software: ["web-one"],
    articles: ["https://example.com/article-one"],
  };

  for (const [category, slugs] of Object.entries(expected)) {
    const page = readFileSync(join(dist, "work", category, "index.html"), "utf8");
    const hrefs = catalogueRows(page).map((href) => href.replace(/^\/projects\/|\/$/g, ""));
    assert.deepEqual(hrefs, slugs, `/work/${category}/ carries exactly ${category}`);
  }
});

test("the work pages carry Projects and Career tabs, marking only the current page", () => {
  const routes = [
    [join(output, "work", "index.html"), "/work/"],
    [join(output, "work", "career", "index.html"), "/work/career/"],
    ...CAREER_SECTIONS.map((section) => [join(output, "work", "career", section, "index.html"), "/work/career/"]),
    ...["games", "sound", "hardware", "software", "articles"].map((category) => [
      join(output, "work", category, "index.html"),
      "/work/",
    ]),
  ];

  for (const [file, current] of routes) {
    const html = readFileSync(file, "utf8");
    const bar = tabBar(html);
    assert.match(bar, /<a href="\/work\/"[^>]*>Projects<\/a>/, `${relative(root, file)} links to Projects`);
    assert.match(bar, /<a href="\/work\/career\/"[^>]*>Career<\/a>/, `${relative(root, file)} links to Career`);
    assert.deepEqual(currentTabs(html), [current], `${relative(root, file)} marks only ${current} as current`);
  }

  // The filters are each side's own: projects filter by category, the career
  // record filters by section, and neither borrows the other's.
  const career = readFileSync(join(output, "work", "career", "index.html"), "utf8");
  assert.doesNotMatch(career, /<nav aria-label="Categories"/, "category filters stay on the Projects side");
  assert.deepEqual(filterLabels(career), ["All", "Experience", "Volunteering", "Education", "Skills"]);

  const projects = readFileSync(join(output, "work", "index.html"), "utf8");
  assert.deepEqual(filterLabels(projects), ["All", "Games", "Sound", "Hardware", "Software", "Articles"]);
});

test("each career filter lists exactly its own section, and All lists every one", () => {
  const all = readFileSync(join(output, "work", "career", "index.html"), "utf8");
  assert.deepEqual(careerHeadings(all), ["Experience", "Volunteering", "Education", "Skills"]);
  assert.doesNotMatch(all, /career-section-ruled/, "the whole record rules each section off under its heading");

  for (const section of CAREER_SECTIONS) {
    const page = readFileSync(join(output, "work", "career", section, "index.html"), "utf8");
    const label = section[0].toUpperCase() + section.slice(1);
    assert.match(page, new RegExp(`<h1>${label}</h1>`), `/work/career/${section}/ is titled ${label}`);
    assert.deepEqual(
      careerHeadings(page),
      [],
      `/work/career/${section}/ does not repeat its own name above the disclosures`,
    );
    assert.match(
      page,
      /<section class="career-section career-section-ruled"/,
      `/work/career/${section}/ opens on the rule its heading would have carried`,
    );
    assert.deepEqual(
      currentFilters(page),
      [`/work/career/${section}/`],
      `/work/career/${section}/ marks only its own filter`,
    );
  }

  assert.deepEqual(currentFilters(all), ["/work/career/"], "the whole record marks All as current");
});

test("the page header marks the current section, and current links stay ink", () => {
  const routes = [
    [join(output, "index.html"), ["/"]],
    [join(output, "404.html"), []],
    [join(output, "work", "index.html"), ["/work/"]],
    [join(output, "work", "career", "index.html"), ["/work/"]],
    ...CAREER_SECTIONS.map((section) => [join(output, "work", "career", section, "index.html"), ["/work/"]]),
    ...["games", "sound", "hardware", "software", "articles"].map((category) => [
      join(output, "work", category, "index.html"),
      ["/work/"],
    ]),
    [join(output, "projects", "example-project", "index.html"), ["/work/"]],
    [join(output, "about", "index.html"), ["/about/"]],
    [join(output, "now", "index.html"), ["/now/"]],
  ];

  for (const [file, current] of routes) {
    const html = readFileSync(file, "utf8");
    assert.deepEqual(currentNavLinks(html), current, `${relative(root, file)} marks only its section as current`);
  }

  const rules = [
    /\.site-header a\[aria-current="page"\][^{]*\{[^}]*color:\s*var\(--ink\)/s,
    /\.tab-bar a\[aria-current="page"\]\s*\{[^}]*color:\s*var\(--ink\)/s,
  ];
  for (const rule of rules) {
    assert.match(siteCss, rule, "selected links are the plain ink colour, not a bright accent");
  }

  // The header rests in the accent and answers hover in ink, so the one ink
  // link is the section the reader is on.
  assert.match(
    siteCss,
    /\.site-header a,[^{]*\{[^}]*color:\s*var\(--accent\)/s,
    "header links rest in the accent colour",
  );
  assert.match(
    siteCss,
    /\.site-header a:hover,[^{]*\{[^}]*color:\s*var\(--ink\)/s,
    "header links answer hover in ink",
  );
});

test("/work/career is a normal-shell career page with one heading and only the narrow record", () => {
  const career = readFileSync(join(output, "work", "career", "index.html"), "utf8");

  assert.equal((career.match(/<h1\b/g) ?? []).length, 1, "the career page has one heading");
  assert.match(career, /<h1>Career<\/h1>/);
  assert.match(career, /<canvas class="sky-canvas"><\/canvas>/);
  assert.match(career, /<script type="module" src="\/assets\/sky\.js"><\/script>/);
  assert.match(career, /<script type="module" src="\/assets\/nav\.js"><\/script>/);

  const headings = [...career.matchAll(/<h2 id="career-[^"]+">([^<]+)<\/h2>/g)].map(([, text]) => text);
  assert.deepEqual(headings, ["Experience", "Volunteering", "Education", "Skills"]);

  const experience = careerSection(career, "experience");
  const summaries = [...experience.matchAll(/<summary>([^<]+)<\/summary>/g)].map(([, text]) => text);
  assert.deepEqual(summaries, [
    "Software Engineer - Consultant - Example Employer",
    "Associate Consultant - Example Employer",
    "Web Designer - Other Workshop",
  ]);

  const roleDates = ["2018", "2016"].map((date) => experience.indexOf(date));
  for (const position of roleDates) {
    assert.notEqual(position, -1, "every role carries its dates");
  }
  assert.deepEqual([...roleDates].sort((a, b) => a - b), roleDates, "roles run newest first");
  assert.ok(
    experience.indexOf("Software Engineer - Consultant") < experience.indexOf("Web Designer"),
    "roles run newest first",
  );
  assert.equal(
    (experience.match(/<details class="career-disclosure">/g) ?? []).length,
    summaries.length,
    "each role is its own disclosure",
  );
  assert.doesNotMatch(experience, /<details[^>]*\bopen\b/, "roles start closed");

  const volunteering = careerSection(career, "volunteering");
  assert.match(
    volunteering,
    /<summary>Volunteer Coordinator - Example Nonprofit<\/summary>/,
    "volunteering is summarised like the roles: title, then organization",
  );
  assert.doesNotMatch(volunteering, /<details[^>]*\bopen\b/, "volunteering starts closed");

  const education = careerSection(career, "education");
  assert.ok(
    education.indexOf("Master of Fine Arts") < education.indexOf("Bachelor of Science"),
    "education runs newest first",
  );
  assert.match(
    education,
    /<summary>Master of Fine Arts \(MFA\), Art and Technology - Example University<\/summary>/,
  );
  assert.match(education, /<summary>Bachelor of Science \(BS\), Computer Science - Second College<\/summary>/);

  const skills = careerSection(career, "skills");
  for (const group of ["Languages", "Data and cloud", "Tools"]) {
    assert.match(
      skills,
      new RegExp(`<summary>${escapeRegExp(group)}</summary>`),
      `${group} is a skill group summary`,
    );
  }
  assert.match(skills, /<li>Apache Spark<\/li>/, "each skill is its own list item");
  assert.match(
    skills,
    /<li>AWS \(S3, EMR, DynamoDB\)<\/li>/,
    "a comma inside parentheses does not split one skill in two",
  );
  assert.equal(
    (skills.match(/<ul class="skill-list">/g) ?? []).length,
    3,
    "every skill group carries its own list",
  );

  assert.doesNotMatch(career, /example-project/, "projects stay on the Projects tab");
  assert.doesNotMatch(career, /Example Project/, "projects stay on the Projects tab");

  assert.doesNotMatch(career, /portrait/, "the career page has no photo");
  assert.doesNotMatch(career, /<(?:picture|svg)\b/i, "the career page has no image");
  const images = [...career.matchAll(/<img\b[^>]*>/g)].map(([tag]) => tag);
  assert.deepEqual(
    images.filter((tag) => !/class="sky-poster"/.test(tag)),
    [],
    "the only image is the sky's no-JavaScript poster",
  );
  assert.doesNotMatch(career, /type="checkbox"/, "the career page has no selector");
  assert.doesNotMatch(career, /name="include"/, "the career page has no query selection");
});

test("print leaves paper, hides the tab bar and keeps roles apart", () => {
  const print = siteCss.slice(siteCss.indexOf("@media print"));
  assert.match(
    print,
    /\.sky,\s*\.tab-bar,\s*\.site-header,\s*\.site-footer\s*\{[^}]*display:\s*none/s,
    "print hides the sky, the site chrome and the tab bar",
  );
  assert.match(print, /\.career-disclosure[^{]*\{[^}]*break-inside:\s*avoid/s);
  assert.match(print, /\.career-disclosure \+ \.career-disclosure\s*\{\s*margin-top:\s*0\.5rem/);
  assert.match(
    print,
    /details::details-content\s*\{\s*content-visibility:\s*visible/,
    "print opens closed disclosures",
  );
  assert.match(print, /details > \*:not\(summary\)\s*\{\s*display:\s*block/);
  assert.match(print, /@page\s*\{[^}]*size:\s*letter/s);
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

  const cards = [...home.matchAll(/<li class="card(?: card-last)?">([\s\S]*?)<\/li>/g)].map(([, card]) => card);
  assert.equal(cards.length, 2, "only the featured projects are cards");
  assert.equal(
    (home.match(/<li class="card card-last">/g) ?? []).length,
    2,
    "both cards are in the last row, so both rule off their bottom",
  );
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

test("no phone number appears on any page", () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(html, /276\)?[.\-\s]?356[.\-\s]?4765/, `${relative(root, file)} must not carry the phone number`);
    assert.doesNotMatch(html, /\+1[.\-\s]?276/, `${relative(root, file)} must not carry the phone number`);
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

test("no page header offers a legacy link", () => {
  const legacyPath = /\/resume/;
  for (const file of htmlFiles) {
    const header = readFileSync(file, "utf8").match(/<header class="site-header"[\s\S]*?<\/header>/)?.[0] ?? "";
    assert.doesNotMatch(header, legacyPath, `${relative(root, file)} header has no legacy link`);
  }
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
PRIMARY_LINKS=("Email=mailto:hello@example.com" "GitHub=https://example.com/github" "LinkedIn=https://example.com/linkedin" "itch.io=https://example.com/itch")
`,
  );
  const dist = mkdtempSync(join(tmpdir(), "portfolio-identity-dist-"));

  build(dist, { IDENTITY_FILE: identity });

  const about = readFileSync(join(dist, "about", "index.html"), "utf8");
  const home = readFileSync(join(dist, "index.html"), "utf8");
  assert.match(about, /hello@example\.com/);
  assert.match(about, /https:\/\/example\.com\/github/);
  assert.doesNotMatch(about, /jennymaeleidig@gmail\.com/);
  assert.match(home, /mailto:hello@example\.com/);
  assert.doesNotMatch(home, /jennymaeleidig@gmail\.com/);
  assert.match(home, /<p class="lede">Test Tagline<\/p>/, "the front page lede is the tagline");
});

test("the build fails when a project page is not emitted", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-unemitted-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-unemitted-dist-"));
  writeFileSync(
    join(content, "future-page.md"),
    `---
year: 9999
status: shipped
category: software
---
# future-page

This page is scheduled, so jenny skips it.
`,
  );

  const result = buildFixture(content, dist);

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
  assert.match(
    siteCss,
    /\.featured\s*\{[^}]*align-items:\s*stretch/s,
    "cards in a row share one height so the closing rules sit square",
  );
  assert.match(siteCss, /\.card\s*\{[^}]*border-top:/s, "each card opens on the light rule");
  assert.doesNotMatch(
    siteCss,
    /\.card\s*\{[^}]*border-bottom:/s,
    "a card does not rule off its own bottom",
  );
  assert.match(
    siteCss,
    /\.card-last\s*\{[^}]*border-bottom:\s*var\(--border-thickness\) solid var\(--sky-2\)/s,
    "the last row closes on the light rule",
  );
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

  const result = buildFixture(content, dist);

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
  const projects = FIXTURE_ENV.CONTENT_DIR;
  return readdirSync(projects)
    .filter((name) => name.endsWith(".md"))
    .filter((name) => /^category:\s*articles\s*$/m.test(readFileSync(join(projects, name), "utf8")))
    .map((name) => name.replace(/\.md$/, ""));
}

test("/404 renders, offers the way back, and does not link to itself", () => {
  const page = readFileSync(join(output, "404", "index.html"), "utf8");

  assert.equal((page.match(/<h1\b/g) ?? []).length, 1, "/404 has one heading");
  assert.match(page, /does not exist/i);

  for (const route of ["/", "/work/", "/work/career/", "/about/", "/now/"]) {
    assert.match(
      page,
      new RegExp(`<a href="${escapeRegExp(route)}"`),
      `/404 links back to ${route}`,
    );
  }
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

test("the only binaries committed are the self-hosted font and project images", { skip: tracked === null && "not a git checkout" }, () => {
  const font = "assets/fonts/CommitMonoV143-VF.woff2";
  // A project cover has to be a real image, so the no-binaries rule has one
  // other door: image files under assets/. Everything else stays text.
  const image = /^assets\/(?:[a-z0-9-]+\/)?[a-z0-9-]+\.(?:png|jpe?g|webp|gif)$/;

  assert.ok(tracked.includes(font), "the self-hosted font is committed");

  for (const file of tracked) {
    const contents = readFileSync(join(root, file));
    if (file === font) {
      assert.equal(contents.includes(0), true, "the font is binary");
      continue;
    }
    if (image.test(file)) {
      continue;
    }
    assert.equal(contents.includes(0), false, `${file} contains a NUL byte`);
  }
});
