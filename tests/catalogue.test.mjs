// The catalogue: order, filters and the tab bar
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { CAREER_SECTIONS, build, careerHeadings, careerSection, catalogueRows, currentFilters, currentNavLinks, currentTabs, escapeRegExp, filterLabels, filters, root, sharedSite, tabBar, writeProject } from "./support/site.mjs";

const { output, htmlFiles, siteCss } = await sharedSite();

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
publication: https://example.com/article-one`,
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

  for (const section of CAREER_SECTIONS) {
    const page = readFileSync(join(output, "work", "career", section, "index.html"), "utf8");
    const label = section[0].toUpperCase() + section.slice(1);
    assert.match(page, new RegExp(`<h1>${label}</h1>`), `/work/career/${section}/ is titled ${label}`);
    assert.deepEqual(
      careerHeadings(page),
      [],
      `/work/career/${section}/ does not repeat its own name above the disclosures`,
    );
    assert.doesNotMatch(
      page,
      /career-section-ruled/,
      `/work/career/${section}/ repeats neither its heading nor the rule under it`,
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
  assert.match(
    siteCss,
    /\na:hover\s*\{[^}]*color:\s*var\(--ink\)/s,
    "every link answers hover in ink, the way the nav does",
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
