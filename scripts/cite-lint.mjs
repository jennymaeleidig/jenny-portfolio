#!/usr/bin/env node
// @ts-nocheck
// cite-lint: a deterministic, structure-only linter for provenance
// metadata. It checks shape — never truthfulness, never the network,
// never an upstream tree — and exits non-zero with structured findings
// when a tree's citation blocks, citation file, or REUSE and codemeta
// config are malformed. A tree that simply lacks these files passes:
// coverage is other tools' job, this one validates what is there.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { parse as parseToml } from "smol-toml";

const HELP = `cite-lint — provenance linter

Usage: node scripts/cite-lint.mjs [tree]

Validates one tree's citation metadata and prints a JSON report:

  { "ok": true|false, "findings": [{ "code", "path", "line", "message" }] }

The exit code is 0 when there are no findings, 1 when there are, and 2
on a usage error.

Snippet-block schema
--------------------

Borrowed code is cited in a comment block, in any comment syntax.
Each field is required and must carry a non-empty value:

  SPDX-SnippetBegin
  SPDX-SnippetCopyrightText: 2024 Example Author
  SPDX-License-Identifier: MIT
  SPDX-SnippetFileComment: Source: Example Library
  SPDX-SnippetFileComment: SourceVersion: 1.2.3
  SPDX-SnippetFileComment: SourceURL: https://example.com/library
  SPDX-SnippetEnd

Source carries the title of the upstream work, SourceVersion its version
or commit, and SourceURL where it came from. Extra
SPDX-SnippetFileComment lines are free prose and allowed.

Checks
------

  snippet-begin-without-end  a block opens but never closes
  snippet-end-without-begin  a closing marker with no open block
  snippet-nested-begin       a second begin inside an open block
  snippet-missing-field      a required field is absent
  snippet-empty-field        a required field has no value
  license-malformed         a license expression does not parse by the
                            offline SPDX grammar: identifier tokens
                            (letters, digits, and . - +), LicenseRef-*
                            references, and parenthesized groups joined
                            by AND, OR, and WITH — no license-list
                            membership check
  license-unresolved         an identifier in a well-formed expression
                            has no matching file under LICENSES/ — only
                            checked when that directory exists
  citation-unparsable        CITATION.cff is not parsable YAML mapping
  reuse-unparsable           REUSE.toml is not parsable TOML
  codemeta-unparsable        codemeta.json is not parsable JSON mapping

A missing LICENSES/, CITATION.cff, REUSE.toml, or codemeta.json passes:
this linter validates shape, not coverage.

The tree's .git, node_modules, and dist directories are never scanned,
nor is its tests/fixtures subtree: that is where this linter's own
tests keep synthetic trees, some deliberately malformed.
`;

// Directories never scanned for snippet markers.
const SKIPPED_DIRS = new Set([".git", "node_modules", "dist"]);

// Subtrees, located by path within the linted tree, never scanned: the
// synthetic trees this linter's own tests run against live there, and
// several are deliberately malformed.
const SKIPPED_SUBTREES = new Set(["tests/fixtures"]);

// Leading comment tokens stripped before a line is examined.
const COMMENT_PREFIXES = ["//", "#", "/*", "*", "<!--", "--", ";"];

// Trailing comment tokens stripped the same way.
const COMMENT_SUFFIXES = ["*/", "-->"];

// The fields every snippet block must carry, non-empty.
const REQUIRED_FIELDS = ["SnippetCopyrightText", "License-Identifier"];
const SOURCE_KEYS = ["Source", "SourceVersion", "SourceURL"];

// A single well-formed identifier token: SPDX ids and LicenseRef-*
// names alike. Anything with spaces or exotic punctuation fails.
const IDENT_TOKEN = /^[A-Za-z0-9][A-Za-z0-9.\-+]*$/;

// The operators of the SPDX expression grammar, uppercase only.
const OPERATORS = new Set(["AND", "OR", "WITH"]);

// Split a license expression into paren, operator, and word tokens on
// whitespace and the two parenthesis characters, wherever they sit.
function tokenizeExpression(value) {
  const tokens = [];
  let word = "";
  const endWord = () => {
    if (word !== "") {
      tokens.push(word);
      word = "";
    }
  };
  for (const character of value) {
    if (character === "(" || character === ")") {
      endWord();
      tokens.push(character);
    } else if (/\s/.test(character)) {
      endWord();
    } else {
      word += character;
    }
  }
  endWord();
  return tokens;
}

// A usable atom: an identifier-shaped word that is not an operator. A
// bare "LicenseRef-" prefix with nothing after it is not a reference.
function isIdentifier(token) {
  if (OPERATORS.has(token)) return false;
  if (token.startsWith("LicenseRef-") && token.length === "LicenseRef-".length)
    return false;
  return IDENT_TOKEN.test(token);
}

// Parse one license expression by the offline SPDX grammar: identifier
// tokens and LicenseRef-* references, joined by AND, OR, and WITH, with
// parenthesized groups. WITH binds tightest, then AND, then OR, and
// every operator needs a right-hand side. Membership in the SPDX
// license list is never checked — resolution against LICENSES/ is
// license-unresolved's job. Returns the expression's identifiers —
// licenses, LicenseRef-* names, and the exception after WITH alike — or
// null when the expression does not parse.
function parseLicenseExpression(value) {
  const tokens = tokenizeExpression(value);
  const identifiers = [];
  let position = 0;
  const peek = () => tokens[position];

  function parsePrimary() {
    const token = peek();
    if (token === undefined) return false;
    if (token === "(") {
      position += 1;
      if (!parseOr() || peek() !== ")") return false;
      position += 1;
      return true;
    }
    if (!isIdentifier(token)) return false;
    identifiers.push(token);
    position += 1;
    return true;
  }

  function parseWith() {
    if (!parsePrimary()) return false;
    if (peek() === "WITH") {
      position += 1;
      const exception = peek();
      if (exception === undefined || !isIdentifier(exception)) return false;
      identifiers.push(exception);
      position += 1;
    }
    return true;
  }

  function parseAnd() {
    if (!parseWith()) return false;
    while (peek() === "AND") {
      position += 1;
      if (!parseWith()) return false;
    }
    return true;
  }

  function parseOr() {
    if (!parseAnd()) return false;
    while (peek() === "OR") {
      position += 1;
      if (!parseAnd()) return false;
    }
    return true;
  }

  if (!parseOr()) return null;
  return position === tokens.length ? identifiers : null;
}

const FIELD_LINE =
  /^SPDX-(SnippetCopyrightText|License-Identifier|SnippetFileComment):\s?(.*)$/;
const SOURCE_LINE = /^(Source|SourceVersion|SourceURL):\s?(.*)$/;

function usageError(message) {
  process.stderr.write(`${message}\n\n${HELP}`);
  process.exit(2);
}

// Strip comment syntax from one line, leaving whatever an SPDX tag
// would start with at the front.
function stripComment(line) {
  let text = line.trim();
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const prefix of COMMENT_PREFIXES) {
      if (text.startsWith(prefix)) {
        text = text.slice(prefix.length).trimStart();
        stripped = true;
      }
    }
  }
  for (const suffix of COMMENT_SUFFIXES) {
    if (text.endsWith(suffix)) text = text.slice(0, -suffix.length).trimEnd();
  }
  return text;
}

function relPath(tree, path) {
  return relative(tree, path).split("\\").join("/");
}

function walkFiles(dir, rel = "") {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  );
  for (const entry of entries) {
    const path = join(dir, entry.name);
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name) && !SKIPPED_SUBTREES.has(childRel))
        files.push(...walkFiles(path, childRel));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function isTextFile(path) {
  return !readFileSync(path).subarray(0, 8192).includes(0);
}

// One required-field shape, shared by the direct SPDX fields and the
// Source keys read off SnippetFileComment lines: the field must be
// present and carry a value.
function requireField(store, key, label, report, path, startLine) {
  if (!(key in store)) {
    report(
      "snippet-missing-field",
      path,
      startLine,
      `snippet block at line ${startLine} is missing ${label}`,
    );
  } else if (store[key].value === "") {
    report(
      "snippet-empty-field",
      path,
      store[key].line,
      `${label} is empty in the snippet block at line ${startLine}`,
    );
  }
}

// Check one closed snippet block, reporting findings and collecting
// its license reference for the later resolution pass.
function checkBlockFields(fields, report, path, startLine, licenses) {
  for (const field of REQUIRED_FIELDS) {
    requireField(fields, field, `SPDX-${field}`, report, path, startLine);
  }
  for (const key of SOURCE_KEYS) {
    requireField(fields.sources, key, key, report, path, startLine);
  }

  const license = fields["License-Identifier"];
  if (license && license.value !== "") {
    licenses.push({ value: license.value, path, line: license.line });
    if (parseLicenseExpression(license.value) === null) {
      report(
        "license-malformed",
        path,
        license.line,
        `"${license.value}" is not a well-formed SPDX license expression`,
      );
    }
  }
}

// Scan one file for snippet blocks, reporting findings and collecting
// every license reference the blocks carry.
function checkSnippetFile(tree, path, report, licenses) {
  const rel = relPath(tree, path);
  const lines = readFileSync(path, "utf8").split("\n");
  let open = false;
  let startLine = null;
  let fields = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = stripComment(lines[index]);
    const number = index + 1;

    if (/^SPDX-SnippetBegin\b/.test(line)) {
      if (open) {
        report(
          "snippet-nested-begin",
          rel,
          number,
          "SPDX-SnippetBegin inside an already-open snippet block",
        );
      } else {
        open = true;
        startLine = number;
        fields = { sources: {} };
      }
      continue;
    }

    if (/^SPDX-SnippetEnd\b/.test(line)) {
      if (open) {
        checkBlockFields(fields, report, rel, startLine, licenses);
        open = false;
        fields = null;
        startLine = null;
      } else {
        report(
          "snippet-end-without-begin",
          rel,
          number,
          "SPDX-SnippetEnd with no open snippet block",
        );
      }
      continue;
    }

    if (!open) continue;
    const match = FIELD_LINE.exec(line);
    if (!match) continue;
    const [, tag, raw] = match;
    if (tag === "SnippetFileComment") {
      const source = SOURCE_LINE.exec(raw);
      if (source && !(source[1] in fields.sources)) {
        fields.sources[source[1]] = { value: source[2].trim(), line: number };
      }
    } else if (!(tag in fields)) {
      fields[tag] = { value: raw.trim(), line: number };
    }
  }

  if (open) {
    report(
      "snippet-begin-without-end",
      rel,
      startLine,
      "snippet block opened here is never closed",
    );
    checkBlockFields(fields, report, rel, startLine, licenses);
  }
}

function checkLicenseResolution(tree, licenses, report) {
  const licensesDir = join(tree, "LICENSES");
  if (!existsSync(licensesDir)) return;
  const available = new Set(
    readdirSync(licensesDir)
      .filter((name) => name.includes("."))
      .map((name) => name.slice(0, name.lastIndexOf("."))),
  );
  for (const { value, path, line } of licenses) {
    for (const identifier of parseLicenseExpression(value) ?? []) {
      if (!available.has(identifier)) {
        report(
          "license-unresolved",
          path,
          line,
          `no file under LICENSES/ matches the identifier "${identifier}"`,
        );
      }
    }
  }
}

// Parse one config file, or report it unparsable — the shape the
// citation-file and REUSE-config checks share. An absent file is not a
// finding.
function checkParsedConfig(tree, name, parser, format, shape, code, report) {
  const path = join(tree, name);
  if (!existsSync(path)) return;
  let parsed;
  try {
    parsed = parser(readFileSync(path, "utf8"));
  } catch (error) {
    report(
      code,
      name,
      1,
      `${name} is not parsable ${format}: ${error.message.split("\n")[0]}`,
    );
    return;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    report(code, name, 1, `${name} must parse to a ${shape}`);
  }
}

function checkCitationFile(tree, report) {
  checkParsedConfig(
    tree,
    "CITATION.cff",
    parseYaml,
    "YAML",
    "mapping",
    "citation-unparsable",
    report,
  );
}

function checkReuseConfig(tree, report) {
  checkParsedConfig(
    tree,
    "REUSE.toml",
    parseToml,
    "TOML",
    "table",
    "reuse-unparsable",
    report,
  );
}

function checkCodemetaFile(tree, report) {
  checkParsedConfig(
    tree,
    "codemeta.json",
    JSON.parse,
    "JSON",
    "mapping",
    "codemeta-unparsable",
    report,
  );
}

function main(argv) {
  if (argv.includes("--help")) {
    process.stdout.write(HELP);
    return 0;
  }
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  if (positional.length > 1) usageError("cite-lint takes at most one tree.");
  const tree = resolve(positional[0] ?? ".");
  if (!existsSync(tree)) usageError(`no such tree: ${tree}`);

  const findings = [];
  // Every finding enters the report through this one shape.
  const report = (code, path, line, message) => {
    findings.push({ code, path, line, message });
  };
  const licenses = [];
  const textFiles = walkFiles(tree).filter(isTextFile);
  for (const path of textFiles) checkSnippetFile(tree, path, report, licenses);
  checkLicenseResolution(tree, licenses, report);
  checkCitationFile(tree, report);
  checkReuseConfig(tree, report);
  checkCodemetaFile(tree, report);

  findings.sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.line - b.line;
  });

  const output = { ok: findings.length === 0, findings };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return findings.length === 0 ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
