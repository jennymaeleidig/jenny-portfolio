import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
const career = join(root, "scripts", "career.sh");
const routes = join(root, "scripts", "routes.sh");
const shellModule = join(root, "layouts", "shell.sh");

function shellIn(module, script, env = {}) {
  return execFileSync(
    "bash",
    ["-c", `source "$1"\n${script}`, "modules-test", module],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...env },
    },
  );
}

function shell(script, env = {}) {
  return shellIn(lib, script, env);
}

const VOCABULARIES = [
  {
    domain: "statuses",
    words: ["active", "shipped", "wip", "archived", "study"],
  },
  {
    domain: "categories",
    words: ["games", "sound", "hardware", "software", "articles"],
  },
  {
    domain: "career-sections",
    words: ["experience", "volunteering", "education", "skills"],
  },
];

for (const vocabulary of VOCABULARIES) {
  test(`${vocabulary.domain} come from one file, in canonical order`, () => {
    const expected = vocabulary.words.map((word) => `${word}\n`).join("");
    assert.equal(shell(`vocabulary_words ${vocabulary.domain}`), expected);
  });

  test(`${vocabulary.domain}: every word is accepted and carries a label`, () => {
    for (const word of vocabulary.words) {
      assert.equal(
        shell(`vocabulary_has ${vocabulary.domain} ${word} && echo yes`),
        "yes\n",
        `${word} belongs`,
      );
      assert.notEqual(
        shell(`vocabulary_label ${vocabulary.domain} ${word}`),
        "",
        `${word} has a label`,
      );
    }
  });
}

test("markdown is rendered with the pinned table and autolink extensions", () => {
  const html = shell(
    `printf '%s\\n' '| Tool | Pinned |' '| ---- | ------ |' '| cmark-gfm | yes |' '' 'https://example.com' | render_markdown`,
  );
  assert.match(html, /<table>/);
  assert.match(html, /href="https:\/\/example\.com"/);
});

test("an unknown word is rejected and carries no label", () => {
  for (const vocabulary of VOCABULARIES) {
    assert.equal(
      shell(`vocabulary_has ${vocabulary.domain} nonsense || echo no`),
      "no\n",
      vocabulary.domain,
    );
    assert.equal(
      shell(`vocabulary_label ${vocabulary.domain} nonsense`),
      "",
      vocabulary.domain,
    );
  }
});

test("only http and https are links", () => {
  assert.equal(shell("is_http_url https://example.com/a && echo yes"), "yes\n");
  assert.equal(shell("is_http_url http://example.com && echo yes"), "yes\n");
  assert.equal(
    shell("is_http_url ftp://example.com || echo no"),
    "no\n",
    "another scheme is not",
  );
  assert.equal(
    shell("is_http_url example.com || echo no"),
    "no\n",
    "a bare host is not",
  );
  assert.equal(
    shell("is_http_url 'https://example.com/a b' || echo no"),
    "no\n",
    "a space is not",
  );
});

test("a label may differ from its word, and a comment or blank line is not an entry", () => {
  assert.equal(shell("vocabulary_label statuses wip"), "work in progress\n");
  assert.equal(shell("vocabulary_label categories games"), "Games\n");
  assert.equal(shell("vocabulary_label career-sections skills"), "Skills\n");

  const dir = mkdtempSync(join(tmpdir(), "vocabulary-"));
  writeFileSync(join(dir, "toys"), "# a comment\n\nblocks=Blocks # trailing\n");

  assert.equal(
    shell("vocabulary_words toys", { VOCABULARY_DIR: dir }),
    "blocks\n",
  );
  assert.equal(
    shell("vocabulary_label toys blocks", { VOCABULARY_DIR: dir }),
    "Blocks\n",
  );
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

test("the opening paragraph is the text after an optional H1", () => {
  assert.equal(
    shell(
      `printf '%s\\n' '# Title' '' 'First *paragraph*.' '' 'Second.' | opening_paragraph`,
    ),
    "First *paragraph*.\n",
  );
  assert.equal(
    shell(`printf '%s\\n' 'No heading.' '' 'Second.' | opening_paragraph`),
    "No heading.\n",
  );
});

test("a file's opening paragraph drops its frontmatter", () => {
  const file = page("---\nphoto: /x\n---\n\nAbout paragraph.\n\nMore.\n");
  assert.equal(shell(`lead_paragraph "${file}"`), "About paragraph.\n");
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
  assert.equal(
    shell(`frontmatter_scalars "${file}"`),
    "title\tA: title\nphoto\t/assets/me.png\n",
  );
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
    'link\tlinks\tJenny\'s "Final" Cut (#1) = C++ 🎮\thttps://example.com/final?x=1&y=2#top\n',
  );
});

test("a link may be double-quoted, as a formatter writes it", () => {
  const file = page(
    [
      "---",
      "links:",
      '  - title: "Alan Zucconi\'s Journey"',
      '    url: "https://example.com/alan"',
      '  - title: "Jenny\'s \\"Final\\" Cut"',
      '    url: "https://example.com/final"',
      '  - title: "back\\\\slash"',
      '    url: "https://example.com/path"',
      "---",
    ].join("\n"),
  );
  assert.equal(
    shell(`frontmatter_records "${file}"`),
    "link\tlinks\tAlan Zucconi's Journey\thttps://example.com/alan\n" +
      'link\tlinks\tJenny\'s "Final" Cut\thttps://example.com/final\n' +
      "link\tlinks\tback\\slash\thttps://example.com/path\n",
  );
});

test("links must be quoted, paired title and url records", () => {
  const cases = [
    [
      "unquoted title",
      ["links:", "  - title: Repo", "    url: 'https://example.com'"],
      "invalid\t  - title: Repo\ninvalid\t    url: 'https://example.com'\n",
    ],
    [
      "unquoted url",
      ["links:", "  - title: 'Repo'", "    url: https://example.com"],
      "invalid\t    url: https://example.com\n",
    ],
    [
      "url without title",
      ["links:", "    url: 'https://example.com'"],
      "invalid\t    url: 'https://example.com'\n",
    ],
    [
      "title without url",
      ["links:", "  - title: 'Repo'"],
      "invalid\t  - title: 'Repo'\n",
    ],
    [
      "unpaired quote",
      [
        "links:",
        "  - title: 'Jenny's Build'",
        "    url: 'https://example.com'",
      ],
      "invalid\t  - title: 'Jenny's Build'\ninvalid\t    url: 'https://example.com'\n",
    ],
    [
      "tab in title",
      ["links:", "  - title: 'two\twords'", "    url: 'https://example.com'"],
      "invalid\t  - title: 'two\twords'\ninvalid\t    url: 'https://example.com'\n",
    ],
    [
      "no space after title colon",
      ["links:", "  - title:'Repo'", "    url: 'https://example.com'"],
      "invalid\t  - title:'Repo'\ninvalid\t    url: 'https://example.com'\n",
    ],
    [
      "tab indentation",
      ["links:", "\t- title: 'Repo'", "\t  url: 'https://example.com'"],
      "invalid\t\t- title: 'Repo'\ninvalid\t\t  url: 'https://example.com'\n",
    ],
    [
      "control character",
      ["links:", "  - title: 'two\x01words'", "    url: 'https://example.com'"],
      "invalid\t  - title: 'two\x01words'\ninvalid\t    url: 'https://example.com'\n",
    ],
    [
      "unknown escape",
      ["links:", '  - title: "bad \\q"', "    url: 'https://example.com'"],
      "invalid\t  - title: \"bad \\q\"\ninvalid\t    url: 'https://example.com'\n",
    ],
    [
      "unescaped inner double quote",
      [
        "links:",
        '  - title: "bad "quote" here"',
        "    url: 'https://example.com'",
      ],
      'invalid\t  - title: "bad "quote" here"\ninvalid\t    url: \'https://example.com\'\n',
    ],
    [
      "unterminated double quote",
      ["links:", '  - title: "open', "    url: 'https://example.com'"],
      "invalid\t  - title: \"open\ninvalid\t    url: 'https://example.com'\n",
    ],
    [
      "escaped newline in a title",
      ["links:", '  - title: "two\\nwords"', "    url: 'https://example.com'"],
      "invalid\t  - title: \"two\\nwords\"\ninvalid\t    url: 'https://example.com'\n",
    ],
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
    shell(
      `value=$(shell_quote "a'b ~/notes"); eval "result=$value"; printf '%s' "$result"`,
    ),
    "a'b ~/notes",
  );
  assert.equal(shell(`shell_quote '~'`), "'~'");
});

const bash32 = (() => {
  try {
    return execFileSync("/bin/bash", ["--version"], {
      encoding: "utf8",
    }).includes("version 3.2");
  } catch {
    return false;
  }
})();

test(
  "a sidecar value survives the bash 3.2 quoting floor",
  { skip: bash32 ? false : "/bin/bash is not bash 3.2" },
  () => {
    const output = execFileSync(
      "/bin/bash",
      [
        "-c",
        `source "$1"\nvalue=$(shell_quote "a'b ~/notes")\neval "result=$value"\nprintf '%s' "$result"`,
        "modules-test",
        lib,
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(output, "a'b ~/notes");
  },
);

test("lists, mappings and unparseable lines keep their record shapes", () => {
  const file = page(
    [
      "---",
      "tags: [one]",
      "links:",
      "  repo: https://example.com",
      "nonsense line",
      "---",
    ].join("\n"),
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
    META_BLURB_TEXT: `'Blurb ${slug}.'`,
    META_YEAR: "2026",
    META_STATUS: "shipped",
    META_CATEGORY: "games",
    META_COVER: "''",
    META_ORDER: "''",
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
    shellIn(projects, "project_show alpha title status featured year", {
      META_DIR: dir,
    }),
    "Title alpha\u001fwip\u001ftrue\u001f2026\n",
  );
});

test("publishability follows the article rule", () => {
  const dir = projectDir();
  projectSidecar(dir, "article", {
    META_CATEGORY: "articles",
    META_PUBLICATION: "'https://example.com/article'",
  });
  projectSidecar(dir, "page", { META_CATEGORY: "software" });

  assert.equal(
    shellIn(projects, "project_show article publishable publication", {
      META_DIR: dir,
    }),
    "false\u001fhttps://example.com/article\n",
  );
  assert.equal(
    shellIn(projects, "project_show page publishable", { META_DIR: dir }),
    "true\n",
  );
});

test("a project row resolves a page to its route and an article to its publication", () => {
  const dir = projectDir();
  projectSidecar(dir, "article", {
    META_CATEGORY: "articles",
    META_PUBLICATION: "'https://example.com/article'",
  });
  projectSidecar(dir, "page", { META_CATEGORY: "software" });
  const dist = mkdtempSync(join(tmpdir(), "routes-rows-"));

  assert.equal(
    shellIn(routes, "project_row_records href slug", {
      META_DIR: dir,
      DIST: dist,
    }),
    "https://example.com/article\u001farticle\n/projects/page/\u001fpage\n",
  );
});

test("a project's blurb is available as rendered markup and as plain text", () => {
  const dir = projectDir();
  projectSidecar(dir, "alpha", {
    META_BLURB: "'<p>Guns &amp; roses.</p>'",
    META_BLURB_TEXT: "'Guns & roses.'",
  });

  assert.equal(
    shellIn(projects, "project_show alpha blurb blurb_text", { META_DIR: dir }),
    "<p>Guns &amp; roses.</p>\u001fGuns & roses.\n",
  );
});

test("links and tags are ordered record streams, not fields on a row", () => {
  const dir = projectDir();
  projectSidecar(dir, "alpha", {
    META_LINKS:
      "('First\thttps://example.com/one' 'Second\thttps://example.com/two')",
    META_TAGS: "('c++' 'narrative')",
  });

  assert.equal(
    shellIn(projects, "project_links alpha", { META_DIR: dir }),
    "First\thttps://example.com/one\nSecond\thttps://example.com/two\n",
  );
  assert.equal(
    shellIn(projects, "project_tags alpha", { META_DIR: dir }),
    "c++\nnarrative\n",
  );
});

test("an unknown project field is an error, not an empty column", () => {
  const dir = projectDir();
  projectSidecar(dir, "alpha");

  assert.throws(() =>
    shellIn(projects, "project_show alpha nonsense", { META_DIR: dir }),
  );
  assert.throws(() =>
    shellIn(projects, "project_show alpha href", { META_DIR: dir }),
  );
});

// A career entry on disk, so the career module is read the way the layout
// reads it.
function careerEntry(dir, section, name, frontmatter, body = "") {
  const folder = join(dir, section);
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, `${name}.md`),
    `---\n${frontmatter.trim()}\n---\n${body}`,
  );
}

test("roles group by employer identity and carry only disclosure facts", () => {
  const dir = mkdtempSync(join(tmpdir(), "career-roles-"));
  careerEntry(
    dir,
    "experience",
    "captech-2025",
    "employer: Captech\nlocation: Richmond, VA\ntitle: Staff Engineer\nstart: 2025-09\nend: present",
    "- Led the work.\n",
  );
  careerEntry(
    dir,
    "experience",
    "captech-2023",
    "employer: Captech\nlocation: Richmond, VA\ntitle: Engineer\nstart: 2023-09\nend: 2025-04",
  );
  careerEntry(
    dir,
    "experience",
    "other-workshop",
    "employer: Other Workshop\nlocation: Petersburg, VA\ntitle: Builder\nstart: 2024-06\nend: 2024-12",
  );

  const body = join(dir, "experience", "captech-2025.md");
  assert.equal(
    shellIn(career, `career_section_records experience "${dir}"`),
    "disclosure\u001fStaff Engineer - Captech\u001fRichmond, VA\u001fSeptember 2025 – Present\u001f\u001f" +
      body +
      "\n" +
      "disclosure\u001fEngineer - Captech\u001fRichmond, VA\u001fSeptember 2023 – April 2025\u001f\u001f" +
      join(dir, "experience", "captech-2023.md") +
      "\n" +
      "disclosure\u001fBuilder - Other Workshop\u001fPetersburg, VA\u001fJune 2024 – December 2024\u001f\u001f" +
      join(dir, "experience", "other-workshop.md") +
      "\n",
  );
});

test("education is disclosed from its own fields, newest first", () => {
  const dir = mkdtempSync(join(tmpdir(), "career-education-"));
  careerEntry(
    dir,
    "education",
    "second",
    "institution: Second College\nlocation: Blacksburg, VA\ndegree: BS, Computer Science\nstart: 2019-08\nend: 2023-05\nnote: 3.9/4.0",
  );
  careerEntry(
    dir,
    "education",
    "first",
    "institution: First School\nlocation: Roanoke, VA\ndegree: BA, English\nstart: 2014\nend: 2018",
  );

  assert.equal(
    shellIn(career, `career_section_records education "${dir}"`),
    "disclosure\u001fBS, Computer Science - Second College\u001fBlacksburg, VA\u001fAugust 2019 – May 2023\u001f3.9/4.0\u001f\n" +
      "disclosure\u001fBA, English - First School\u001fRoanoke, VA\u001f2014 – 2018\u001f\u001f\n",
  );
});

test("skills are emitted as group and item records, keeping grouped skills whole", () => {
  const dir = mkdtempSync(join(tmpdir(), "career-skills-"));
  writeFileSync(
    join(dir, "skills.md"),
    "- **Data and cloud:** AWS (S3, EMR, DynamoDB), SQL\n- **Languages:** C, Bash\n",
  );

  assert.equal(
    shellIn(career, `career_section_records skills "${dir}"`),
    "group\u001fData and cloud\n" +
      "item\u001fAWS (S3, EMR, DynamoDB)\n" +
      "item\u001fSQL\n" +
      "group\u001fLanguages\n" +
      "item\u001fC\n" +
      "item\u001fBash\n",
  );
});

test("an unknown career field fails, naming the file", () => {
  const dir = mkdtempSync(join(tmpdir(), "career-typo-"));
  careerEntry(
    dir,
    "experience",
    "typo",
    "employer: Captech\nlocation: Richmond, VA\ntitle: Engineer\nstart: 2020\nend: 2021\ncolour: blue",
  );

  assert.throws(
    () => shellIn(career, `career_section_records experience "${dir}"`),
    (error) => /typo\.md/.test(String(error.stderr ?? error.message)),
  );
});

test("the route table names every page the build emits, in one order", () => {
  const dir = projectDir();
  projectSidecar(dir, "alpha", { META_YEAR: "2024" });
  const dist = mkdtempSync(join(tmpdir(), "routes-dist-"));

  assert.equal(
    shellIn(routes, "route_records address indexable", {
      META_DIR: dir,
      DIST: dist,
    }),
    [
      "/\u001ftrue",
      "/work/\u001ftrue",
      "/work/games/\u001ftrue",
      "/work/sound/\u001ftrue",
      "/work/hardware/\u001ftrue",
      "/work/software/\u001ftrue",
      "/work/articles/\u001ftrue",
      "/work/career/\u001ftrue",
      "/work/career/experience/\u001ftrue",
      "/work/career/volunteering/\u001ftrue",
      "/work/career/education/\u001ftrue",
      "/work/career/skills/\u001ftrue",
      "/about/\u001ftrue",
      "/now/\u001ftrue",
      "/404/\u001ffalse",
      "/projects/alpha/\u001ftrue",
    ].join("\n") + "\n",
  );
});

test("a route record carries what renders it, and an article has no page route", () => {
  const dir = projectDir();
  projectSidecar(dir, "alpha", { META_YEAR: "2024" });
  projectSidecar(dir, "article", {
    META_YEAR: "2026",
    META_CATEGORY: "articles",
    META_PUBLICATION: "'https://example.com/article'",
  });
  const dist = mkdtempSync(join(tmpdir(), "routes-render-"));

  assert.equal(
    shellIn(routes, "route_records kind layout argument source", {
      META_DIR: dir,
      DIST: dist,
    }),
    [
      "layout\u001fhome\u001f\u001f",
      "layout\u001fwork\u001f\u001f",
      "layout\u001fwork\u001fgames\u001f",
      "layout\u001fwork\u001fsound\u001f",
      "layout\u001fwork\u001fhardware\u001f",
      "layout\u001fwork\u001fsoftware\u001f",
      "layout\u001fwork\u001farticles\u001f",
      "layout\u001fcareer\u001f\u001f",
      "layout\u001fcareer\u001fexperience\u001f",
      "layout\u001fcareer\u001fvolunteering\u001f",
      "layout\u001fcareer\u001feducation\u001f",
      "layout\u001fcareer\u001fskills\u001f",
      "layout\u001fabout\u001f\u001f",
      "layout\u001fnow\u001f\u001f",
      "layout\u001f404\u001f\u001f",
      `project\u001f\u001f\u001f${join(dist, "post", "alpha.html")}`,
    ].join("\n") + "\n",
  );
});

test("a route's output is its address under the dist tree", () => {
  const dir = projectDir();
  projectSidecar(dir, "alpha");
  const dist = mkdtempSync(join(tmpdir(), "routes-output-"));

  assert.equal(
    shellIn(routes, "route_records address output", {
      META_DIR: dir,
      DIST: dist,
    }),
    [
      `/\u001f${join(dist, "index.html")}`,
      `/work/\u001f${join(dist, "work", "index.html")}`,
      `/work/games/\u001f${join(dist, "work", "games", "index.html")}`,
      `/work/sound/\u001f${join(dist, "work", "sound", "index.html")}`,
      `/work/hardware/\u001f${join(dist, "work", "hardware", "index.html")}`,
      `/work/software/\u001f${join(dist, "work", "software", "index.html")}`,
      `/work/articles/\u001f${join(dist, "work", "articles", "index.html")}`,
      `/work/career/\u001f${join(dist, "work", "career", "index.html")}`,
      `/work/career/experience/\u001f${join(dist, "work", "career", "experience", "index.html")}`,
      `/work/career/volunteering/\u001f${join(dist, "work", "career", "volunteering", "index.html")}`,
      `/work/career/education/\u001f${join(dist, "work", "career", "education", "index.html")}`,
      `/work/career/skills/\u001f${join(dist, "work", "career", "skills", "index.html")}`,
      `/about/\u001f${join(dist, "about", "index.html")}`,
      `/now/\u001f${join(dist, "now", "index.html")}`,
      `/404/\u001f${join(dist, "404", "index.html")}`,
      `/projects/alpha/\u001f${join(dist, "projects", "alpha", "index.html")}`,
    ].join("\n") + "\n",
  );
});

test("a layout route's address comes from the route table", () => {
  const dist = mkdtempSync(join(tmpdir(), "routes-address-"));

  assert.equal(
    shellIn(routes, "route_address work games", { DIST: dist }),
    "/work/games/",
  );
  assert.equal(
    shellIn(routes, "route_address career", { DIST: dist }),
    "/work/career/",
  );
  assert.throws(() =>
    shellIn(routes, "route_address nonsense", { DIST: dist }),
  );
});

test("a project page asks the route table for its address and indexability", () => {
  const dir = projectDir();
  projectSidecar(dir, "alpha");
  const dist = mkdtempSync(join(tmpdir(), "routes-project-"));

  assert.equal(
    shellIn(routes, "project_route alpha address indexable", {
      META_DIR: dir,
      DIST: dist,
    }),
    "/projects/alpha/\u001ftrue\n",
  );
});

// The page head takes raw text and owns composition and escaping, so these
// tests cross page_open rather than reading six layouts' conventions.
function pageHead(script) {
  return shellIn(shellModule, script, {
    SITE_ROOT: root,
    SITE_HOST: "https://example.com",
    DIST: join(tmpdir(), "page-head-dist"),
    IDENTITY_FILE: join(root, "tests", "fixtures", "site", "identity.sh"),
  });
}

test("a page head composes the site suffix, and a site-name title stands alone", () => {
  const page = pageHead(`page_open "A & B" home "Guns & roses" /about/ true`);
  assert.match(page, /<title>A &amp; B, Example Site<\/title>/);
  assert.match(page, /<meta property="og:title" content="A &amp; B">/);
  assert.match(page, /<meta name="description" content="Guns &amp; roses">/);
  assert.match(
    page,
    /<link rel="canonical" href="https:\/\/example\.com\/about\/">/,
  );

  const home = pageHead(`page_open "Example Site" home "Test Tagline" / true`);
  assert.match(home, /<title>Example Site<\/title>/);
  assert.match(home, /<meta property="og:title" content="Example Site">/);
});

test("a non-indexable page claims no address and asks not to be indexed", () => {
  const page = pageHead(
    `page_open "404, page not found" "" "That page does not exist." /404/ false`,
  );
  assert.doesNotMatch(page, /rel="canonical"/);
  assert.doesNotMatch(page, /property="og:url"/);
  assert.match(page, /<meta name="robots" content="noindex">/);
});
