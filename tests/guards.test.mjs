// The build's guards: the failures that must name their file
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, buildFixture, writeProject } from "./support/site.mjs";

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

test("the build fails, naming the file, on an unknown career field", () => {
  const career = mkdtempSync(join(tmpdir(), "portfolio-career-typo-"));
  mkdirSync(join(career, "experience"), { recursive: true });
  writeFileSync(
    join(career, "experience", "typo.md"),
    `---
employer: Captech
location: Richmond, VA
title: Engineer
start: 2020
end: 2021
colour: blue
---
`,
  );
  const dist = mkdtempSync(join(tmpdir(), "portfolio-career-typo-dist-"));

  assert.throws(
    () => build(dist, { CAREER_DIR: career }),
    (error) => {
      const failure = /** @type {{ stderr?: string, message?: string }} */ (
        error
      );
      return /typo\.md/.test(String(failure.stderr ?? failure.message));
    },
  );
});

test("the build fails on a filename jenny would eval unsafely", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-filename-"));
  const dist = mkdtempSync(join(tmpdir(), "portfolio-filename-dist-"));
  writeProject(
    content,
    "Broadcast Live",
    `year: 2026
status: shipped
category: games`,
  );

  const result = buildFixture(content, dist);

  assert.notEqual(result.status, 0, "the build must fail");
  assert.match(result.stderr, /Broadcast Live\.md/);
});

test("identity links come from one source that About and the front page read", () => {
  const identity = join(
    mkdtempSync(join(tmpdir(), "portfolio-identity-")),
    "identity.sh",
  );
  writeFileSync(
    identity,
    `FULL_NAME="Hello Example"
SITE_NAME="Hello Example"
PORTFOLIO=https://example.com
TAGLINE="Test Tagline"
LOCATION="Example City, EX"
EMAIL=hello@example.com
GITHUB=https://example.com/github
LINKEDIN=https://example.com/linkedin
ITCH=https://example.com/itch
PRIMARY_LINKS=("GitHub"$'\t'"https://example.com/github" "LinkedIn"$'\t'"https://example.com/linkedin" "itch.io"$'\t'"https://example.com/itch")
`,
  );
  const dist = mkdtempSync(join(tmpdir(), "portfolio-identity-dist-"));

  build(dist, { IDENTITY_FILE: identity });

  const about = readFileSync(join(dist, "about", "index.html"), "utf8");
  const home = readFileSync(join(dist, "index.html"), "utf8");
  const primary =
    about.match(/<ul class="links primary-links"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ??
    "";
  assert.doesNotMatch(primary, /mailto:/);
  assert.match(primary, /https:\/\/example\.com\/github/);
  assert.match(
    home,
    /<footer class="site-footer"><a href="mailto:hello@example\.com">hello@example\.com<\/a><span class="site-separator" aria-hidden="true">·<\/span><span class="site-location">Example City, EX<\/span>/,
    "the footer shows the email and, after a dot, the location as plain text",
  );
  assert.match(
    home,
    /<p class="lede">Test Tagline<\/p>/,
    "the front page lede is the tagline",
  );
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

  assert.notEqual(
    result.status,
    0,
    "the build must fail when a page is missing",
  );
  assert.match(result.stderr, /future-page/);
});

test("the build fails, naming the file, when a project cannot be staged", () => {
  const content = mkdtempSync(join(tmpdir(), "portfolio-content-"));
  writeFileSync(
    join(content, "broken.md"),
    "# No frontmatter\n\nThis project cannot be dated.\n",
  );
  const dist = mkdtempSync(join(tmpdir(), "portfolio-broken-"));

  const result = buildFixture(content, dist);

  assert.notEqual(result.status, 0, "the build must fail");
  assert.match(result.stderr, /broken\.md/);
});

test("the build cleans its output directory before generating", () => {
  const dist = mkdtempSync(join(tmpdir(), "portfolio-clean-"));
  build(dist);
  writeFileSync(join(dist, "stale.html"), "left over from an earlier build");

  build(dist);

  assert.equal(readdirSync(dist).includes("stale.html"), false);
  assert.equal(statSync(join(dist, "index.html")).isFile(), true);
});
