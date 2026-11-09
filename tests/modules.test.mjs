import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The shell modules are tested through the same interface a layout crosses:
// source lib.sh, call the accessor, read the output. Nothing here knows how a
// vocabulary table or a record stream is represented.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lib = join(root, "scripts", "lib.sh");

function shell(script) {
  return execFileSync("bash", ["-c", `source "$1"\n${script}`, "modules-test", lib], {
    cwd: root,
    encoding: "utf8",
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
