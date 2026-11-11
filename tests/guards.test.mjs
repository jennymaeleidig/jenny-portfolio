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
import {
  build,
  buildFixture,
  root,
  sharedSite,
  tracked,
  writeProject,
} from "./support/site.mjs";

const { output, htmlFiles, siteCss } = await sharedSite();

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
    (error) => /typo\.md/.test(String(error.stderr ?? error.message)),
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

test("identity links come from one source that every page reads", () => {
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
EMAIL=hello@example.com
GITHUB=https://example.com/github
LINKEDIN=https://example.com/linkedin
ITCH=https://example.com/itch
PRIMARY_LINKS=("Email"$'\t'"mailto:hello@example.com" "GitHub"$'\t'"https://example.com/github" "LinkedIn"$'\t'"https://example.com/linkedin" "itch.io"$'\t'"https://example.com/itch")
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

test("layouts take the page contract as arguments, not ambient state", () => {
  for (const file of readdirSync(join(root, "layouts"))) {
    if (!file.endsWith(".sh")) continue;
    const source = readFileSync(join(root, "layouts", file), "utf8");
    assert.doesNotMatch(
      source,
      /PAGE_ROUTE|PAGE_INDEXABLE/,
      `${file} reads the page contract from the environment`,
    );
  }
});

test("the build cleans its output directory before generating", () => {
  const dist = mkdtempSync(join(tmpdir(), "portfolio-clean-"));
  build(dist);
  writeFileSync(join(dist, "stale.html"), "left over from an earlier build");

  build(dist);

  assert.equal(readdirSync(dist).includes("stale.html"), false);
  assert.equal(statSync(join(dist, "index.html")).isFile(), true);
});

test(
  "the only binaries committed are the self-hosted font and project images",
  { skip: tracked === null && "not a git checkout" },
  () => {
    const font = "assets/fonts/CommitMonoV143-VF.woff2";
    // A photo has to be a real image, so the no-binaries rule has one other
    // door: image files under assets/. The site icon and the About portrait are
    // the two images that sit at the root of assets/ rather than in a
    // subdirectory. Everything else stays text.
    const image =
      /^assets\/(?:favicon\.png|portrait\.jpe?g|(?:[a-z0-9-]+\/)+[a-z0-9-]+\.(?:png|jpe?g|webp|gif))$/;

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
  },
);
