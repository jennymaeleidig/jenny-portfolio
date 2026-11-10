import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The shell modules are tested through the same interface a layout crosses:
// source lib.sh, call the accessor, read the output. Nothing here knows whether
// vocabulary is a file or a table, or how a record stream is represented.
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
  { domain: "statuses", words: ["active", "shipped", "wip", "archived", "study"] },
  { domain: "categories", words: ["games", "sound", "hardware", "software", "articles"] },
  { domain: "career-sections", words: ["experience", "volunteering", "education", "skills"] },
];

for (const vocabulary of VOCABULARIES) {
  test(`${vocabulary.domain} come from one file, in canonical order`, () => {
    const expected = vocabulary.words.map((word) => `${word}\n`).join("");
    assert.equal(shell(`vocabulary_words ${vocabulary.domain}`), expected);
  });

  test(`${vocabulary.domain}: every word is accepted and carries a label`, () => {
    for (const word of vocabulary.words) {
      assert.equal(shell(`vocabulary_has ${vocabulary.domain} ${word} && echo yes`), "yes\n", `${word} belongs`);
      assert.notEqual(shell(`vocabulary_label ${vocabulary.domain} ${word}`), "", `${word} has a label`);
    }
  });
}

test("an unknown word is rejected and carries no label", () => {
  for (const vocabulary of VOCABULARIES) {
    assert.equal(shell(`vocabulary_has ${vocabulary.domain} nonsense || echo no`), "no\n", vocabulary.domain);
    assert.equal(shell(`vocabulary_label ${vocabulary.domain} nonsense`), "", vocabulary.domain);
  }
});

test("a link label is its key, with a lowercase first letter capitalised", () => {
  assert.equal(shell("link_label Repo"), "Repo\n", "a written label is kept as written");
  assert.equal(shell("link_label repo"), "Repo\n", "a lowercase key is capitalised for the writer");
  assert.equal(shell("link_label itch.io"), "Itch.io\n", "the rest of the key is untouched");
  assert.equal(shell("link_label 'Program doc'"), "Program doc\n");
});

test("only http and https are links", () => {
  assert.equal(shell("is_http_url https://example.com/a && echo yes"), "yes\n");
  assert.equal(shell("is_http_url http://example.com && echo yes"), "yes\n");
  assert.equal(shell("is_http_url ftp://example.com || echo no"), "no\n", "another scheme is not");
  assert.equal(shell("is_http_url example.com || echo no"), "no\n", "a bare host is not");
  assert.equal(shell("is_http_url 'https://example.com/a b' || echo no"), "no\n", "a space is not");
});

test("a label may differ from its word, and a comment or blank line is not an entry", () => {
  assert.equal(shell("vocabulary_label statuses wip"), "work in progress\n");
  assert.equal(shell("vocabulary_label categories games"), "Games\n");
  assert.equal(shell("vocabulary_label career-sections skills"), "Skills\n");

  const dir = mkdtempSync(join(tmpdir(), "vocabulary-"));
  writeFileSync(join(dir, "toys"), "# a comment\n\nblocks=Blocks # trailing\n");

  assert.equal(shell("vocabulary_words toys", { VOCABULARY_DIR: dir }), "blocks\n");
  assert.equal(shell("vocabulary_label toys blocks", { VOCABULARY_DIR: dir }), "Blocks\n");
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
