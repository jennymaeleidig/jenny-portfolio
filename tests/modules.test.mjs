import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The shell modules are tested through the same interface a layout crosses:
// source the module, call the accessor, read the output. Nothing here knows
// whether vocabulary is a file or a table, or how a record stream is
// represented.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lib = join(root, "scripts", "lib.sh");
const projects = join(root, "scripts", "projects.sh");

function shellIn(module, script, env = {}) {
  return execFileSync("bash", ["-c", `source "$1"\n${script}`, "modules-test", module], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function shell(script, env = {}) {
  return shellIn(lib, script, env);
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

test("a links list yields a title and url record per link", () => {
  const file = page(
    [
      "---",
      "links:",
      "  - title: 'Dreamcast: Repair'",
      "    url: 'https://example.com/dreamcast'",
      "  - title: 'Jenny''s Build'",
      "    url: 'https://example.com/build'",
      "---",
    ].join("\n"),
  );
  assert.equal(
    shell(`frontmatter_records "${file}"`),
    "link\tlinks\tDreamcast: Repair\thttps://example.com/dreamcast\n" +
      "link\tlinks\tJenny's Build\thttps://example.com/build\n",
  );
});

test("a link title may carry any single-line text, and a quote is doubled", () => {
  const file = page(
    [
      "---",
      "links:",
      "  - title: 'Jenny''s \"Final\" Cut (#1) = C++ 🎮'",
      "    url: 'https://example.com/final?x=1&y=2#top'",
      "---",
    ].join("\n"),
  );
  assert.equal(
    shell(`frontmatter_records "${file}"`),
    "link\tlinks\tJenny's \"Final\" Cut (#1) = C++ 🎮\thttps://example.com/final?x=1&y=2#top\n",
  );
});

test("links must be quoted, paired title and url records", () => {
  const cases = [
    ["unquoted title", ["links:", "  - title: Repo", "    url: 'https://example.com'"], "invalid\t  - title: Repo\ninvalid\t    url: 'https://example.com'\n"],
    ["unquoted url", ["links:", "  - title: 'Repo'", "    url: https://example.com"], "invalid\t    url: https://example.com\n"],
    ["url without title", ["links:", "    url: 'https://example.com'"], "invalid\t    url: 'https://example.com'\n"],
    ["title without url", ["links:", "  - title: 'Repo'"], "invalid\t  - title: 'Repo'\n"],
    ["unpaired quote", ["links:", "  - title: 'Jenny's Build'", "    url: 'https://example.com'"], "invalid\t  - title: 'Jenny's Build'\ninvalid\t    url: 'https://example.com'\n"],
    ["tab in title", ["links:", "  - title: 'two\twords'", "    url: 'https://example.com'"], "invalid\t  - title: 'two\twords'\ninvalid\t    url: 'https://example.com'\n"],
    ["no space after title colon", ["links:", "  - title:'Repo'", "    url: 'https://example.com'"], "invalid\t  - title:'Repo'\ninvalid\t    url: 'https://example.com'\n"],
    ["tab indentation", ["links:", "\t- title: 'Repo'", "\t  url: 'https://example.com'"], "invalid\t\t- title: 'Repo'\ninvalid\t\t  url: 'https://example.com'\n"],
    ["control character", ["links:", "  - title: 'two\x01words'", "    url: 'https://example.com'"], "invalid\t  - title: 'two\x01words'\ninvalid\t    url: 'https://example.com'\n"],
  ];
  for (const [name, lines, expected] of cases) {
    const file = page(["---", ...lines, "---"].join("\n"));
    assert.equal(shell(`frontmatter_records "${file}"`), expected, name);
  }
});

test("a title missing its url blames the title line, not the next link", () => {
  const file = page(
    [
      "---",
      "links:",
      "  - title: 'First'",
      "  - title: 'Second'",
      "    url: 'https://example.com/second'",
      "---",
    ].join("\n"),
  );
  assert.equal(
    shell(`frontmatter_records "${file}"`),
    "invalid\t  - title: 'First'\nlink\tlinks\tSecond\thttps://example.com/second\n",
  );
});

test("a sidecar value is shell-quoted so a leading tilde cannot expand", () => {
  assert.equal(
    shell(`value=$(shell_quote "a'b ~/notes"); eval "result=$value"; printf '%s' "$result"`),
    "a'b ~/notes",
  );
  assert.equal(shell(`shell_quote '~'`), "'~'");
});

const bash32 = (() => {
  try {
    return execFileSync("/bin/bash", ["--version"], { encoding: "utf8" }).includes("version 3.2");
  } catch {
    return false;
  }
})();

test("a sidecar value survives the bash 3.2 quoting floor", { skip: bash32 ? false : "/bin/bash is not bash 3.2" }, () => {
  const output = execFileSync(
    "/bin/bash",
    ["-c", `source "$1"\nvalue=$(shell_quote "a'b ~/notes")\neval "result=$value"\nprintf '%s' "$result"`, "modules-test", lib],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(output, "a'b ~/notes");
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

// A project sidecar is the module's storage, not its interface. These tests
// write one so the module can be read the way a layout reads it.
function projectDir() {
  return mkdtempSync(join(tmpdir(), "projects-"));
}

function projectSidecar(dir, slug, overrides = {}) {
  const facts = {
    META_SLUG: `'${slug}'`,
    META_TITLE: `'Title ${slug}'`,
    META_BLURB: `'<p>Blurb ${slug}.</p>'`,
    META_YEAR: "2026",
    META_STATUS: "shipped",
    META_CATEGORY: "games",
    META_COVER: "''",
    META_ORDER: "''",
    META_HREF: `'/projects/${slug}/'`,
    META_PUBLICATION: "''",
    META_FEATURED: "''",
    META_TAGS: "()",
    META_LINKS: "()",
    ...overrides,
  };
  writeFileSync(
    join(dir, `${slug}.sh`),
    Object.entries(facts)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
}

test("project records come in catalogue order and answer the fields a caller names", () => {
  const dir = projectDir();
  projectSidecar(dir, "alpha", { META_YEAR: "2024" });
  projectSidecar(dir, "beta", { META_YEAR: "2026" });
  projectSidecar(dir, "pinned", { META_YEAR: "2020", META_ORDER: "1" });

  assert.equal(
    shellIn(projects, "project_records slug title year", { META_DIR: dir }),
    "pinned\u001fTitle pinned\u001f2020\nbeta\u001fTitle beta\u001f2026\nalpha\u001fTitle alpha\u001f2024\n",
  );
});

test("one project's facts are read by name, never by sidecar variable", () => {
  const dir = projectDir();
  projectSidecar(dir, "alpha", { META_FEATURED: "true", META_STATUS: "wip" });

  assert.equal(
    shellIn(projects, "project_show alpha title status featured year", { META_DIR: dir }),
    "Title alpha\u001fwip\u001ftrue\u001f2026\n",
  );
});

test("publishability and href follow the article rule in one place", () => {
  const dir = projectDir();
  projectSidecar(dir, "article", {
    META_CATEGORY: "articles",
    META_HREF: "'https://example.com/article'",
    META_PUBLICATION: "'https://example.com/article'",
  });
  projectSidecar(dir, "page", { META_CATEGORY: "software" });

  assert.equal(
    shellIn(projects, "project_show article publishable href", { META_DIR: dir }),
    "false\u001fhttps://example.com/article\n",
  );
  assert.equal(
    shellIn(projects, "project_show page publishable href", { META_DIR: dir }),
    "true\u001f/projects/page/\n",
  );
});

test("a project's blurb is available as rendered markup and as plain text", () => {
  const dir = projectDir();
  projectSidecar(dir, "alpha", { META_BLURB: "'<p>Guns &amp; roses.</p>'" });

  assert.equal(
    shellIn(projects, "project_show alpha blurb blurb_text", { META_DIR: dir }),
    "<p>Guns &amp; roses.</p>\u001fGuns & roses.\n",
  );
});

test("links and tags are ordered record streams, not fields on a row", () => {
  const dir = projectDir();
  projectSidecar(dir, "alpha", {
    META_LINKS: "('First\thttps://example.com/one' 'Second\thttps://example.com/two')",
    META_TAGS: "('c++' 'narrative')",
  });

  assert.equal(
    shellIn(projects, "project_links alpha", { META_DIR: dir }),
    "First\thttps://example.com/one\nSecond\thttps://example.com/two\n",
  );
  assert.equal(shellIn(projects, "project_tags alpha", { META_DIR: dir }), "c++\nnarrative\n");
});

test("an unknown project field is an error, not an empty column", () => {
  const dir = projectDir();
  projectSidecar(dir, "alpha");

  assert.throws(() => shellIn(projects, "project_show alpha nonsense", { META_DIR: dir }));
});
