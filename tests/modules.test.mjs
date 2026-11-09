import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The shell modules are tested through the same interface a layout crosses:
// source lib.sh, call the accessor, read the output. Nothing here knows how a
// vocabulary table or a record stream is represented.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lib = join(root, "scripts", "lib.sh");

function shell(script, env = {}) {
  return execFileSync("bash", ["-c", `source "$1"\n${script}`, "modules-test", lib], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

const VOCABULARIES = [
  {
    name: "statuses",
    is: "is_status",
    label: "status_label",
    table: "STATUSES",
    words: ["active", "shipped", "wip", "archived", "study"],
  },
  {
    name: "categories",
    is: "is_category",
    label: "category_label",
    table: "CATEGORIES",
    words: ["games", "sound", "hardware", "software", "articles"],
  },
  {
    name: "career sections",
    is: "is_career_section",
    label: "career_section_label",
    table: "CAREER_SECTIONS",
    words: ["experience", "volunteering", "education", "skills"],
  },
  {
    name: "link kinds",
    is: "is_link_kind",
    label: "link_label",
    table: "LINK_KINDS",
    words: ["live", "repo", "itch", "paper", "video"],
  },
];

for (const vocabulary of VOCABULARIES) {
  test(`${vocabulary.name} come from one table, in canonical order`, () => {
    const expected = vocabulary.words.map((word) => `${word}\n`).join("");
    assert.equal(shell(`vocabulary_words "\${${vocabulary.table}[@]}"`), expected);
  });

  test(`${vocabulary.name}: every word is accepted and carries a label`, () => {
    for (const word of vocabulary.words) {
      assert.equal(shell(`${vocabulary.is} ${word} && echo yes`), "yes\n", `${word} belongs`);
      assert.notEqual(shell(`${vocabulary.label} ${word}`), "", `${word} has a label`);
    }
  });
}

test("an unknown word is rejected and carries no label", () => {
  for (const vocabulary of VOCABULARIES) {
    assert.equal(shell(`${vocabulary.is} nonsense || echo no`), "no\n", vocabulary.name);
    assert.equal(shell(`${vocabulary.label} nonsense`), "", vocabulary.name);
  }
});

test("a label may differ from its word", () => {
  assert.equal(shell("status_label wip"), "work in progress");
  assert.equal(shell("link_label itch"), "itch.io");
  assert.equal(shell("category_label games"), "Games");
  assert.equal(shell("career_section_label skills"), "Skills");
});

// A page on disk, so the frontmatter module is read the way a layout reads it.
function page(text) {
  const dir = mkdtempSync(join(tmpdir(), "frontmatter-"));
  const file = join(dir, "page.md");
  writeFileSync(file, text);
  return file;
}

test("the body is the page without its frontmatter", () => {
  const file = page("---\ntitle: A page\n---\n# A page\n\nProse.\n");
  assert.equal(shell(`frontmatter_body "${file}"`), "# A page\n\nProse.\n");
});

test("scalars unquote their values and skip lists and mappings", () => {
  const file = page(
    [
      "---",
      'title: "A: title"',
      "photo: /assets/me.png",
      "tags: [one, two]",
      "links:",
      "  repo: https://example.com",
      "---",
      "# A page",
    ].join("\n"),
  );
  assert.equal(shell(`frontmatter_scalars "${file}"`), "title\tA: title\nphoto\t/assets/me.png\n");
});

test("one scalar is read by name, and a missing key is empty", () => {
  const file = page("---\ntitle: A page\nstart: 2020-01\n---\n");
  assert.equal(shell(`frontmatter_value "${file}" start`), "2020-01\n");
  assert.equal(shell(`frontmatter_value "${file}" end`), "");
});

test("a trailing carriage return never reaches a value", () => {
  const file = page("---\nkey: value\r\n---\n");
  assert.equal(shell(`frontmatter_value "${file}" key`), "value\n");
});

test("lists, mappings and unparseable lines keep their record shapes", () => {
  const file = page(
    ["---", "tags: [one]", "links:", "  repo: https://example.com", "nonsense line", "---"].join("\n"),
  );
  assert.equal(
    shell(`frontmatter_records "${file}"`),
    "item\ttags\tone\npair\tlinks\trepo\thttps://example.com\ninvalid\tnonsense line\n",
  );
});

test("the catalogue record is an ordered list of slugs", () => {
  const dir = mkdtempSync(join(tmpdir(), "catalogue-"));
  const sidecar = (slug, year, order = "") =>
    writeFileSync(
      join(dir, `${slug}.sh`),
      `META_SLUG=${slug}\nMETA_YEAR=${year}\nMETA_ORDER=${order}\n`,
    );
  sidecar("alpha", 2024);
  sidecar("beta", 2026);
  sidecar("pinned", 2020, 1);

  assert.equal(shell("project_records", { META_DIR: dir }), "pinned\nbeta\nalpha\n");
});
