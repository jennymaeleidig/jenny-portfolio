#!/usr/bin/env node
// cite-lint: a deterministic, structure-only linter for provenance
// metadata. It checks shape — never truthfulness, never the network,
// never an upstream tree — and exits non-zero with structured findings
// when a tree's citation blocks, citation file, or REUSE config are
// malformed. A tree that simply lacks these files passes: coverage is
// other tools' job, this one validates what is there.

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
  license-malformed         a license identifier is not a single
                            well-formed token (letters, digits, and
                            . - + only), or a LicenseRef-* name
  license-unresolved         a snippet block's license has no matching
                            file under LICENSES/ — only checked when
                            that directory exists
  citation-unparsable        CITATION.cff is not parsable YAML mapping
  reuse-unparsable           REUSE.toml is not parsable TOML

A missing LICENSES/, CITATION.cff, or REUSE.toml passes: this linter
validates shape, not coverage.

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
const LICENSE_ID = /^[A-Za-z0-9][A-Za-z0-9.\-+]*$/;

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

function checkBlockFields(fields, findings, path, startLine) {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in fields)) {
      findings.push({
        code: "snippet-missing-field",
        path,
        line: startLine,
        message: `snippet block at line ${startLine} is missing SPDX-${field}`,
      });
    } else if (fields[field].value === "") {
      findings.push({
        code: "snippet-empty-field",
        path,
        line: fields[field].line,
        message: `SPDX-${field} is empty in the snippet block at line ${startLine}`,
      });
    }
  }

  for (const key of SOURCE_KEYS) {
    if (!(key in fields.sources)) {
      findings.push({
        code: "snippet-missing-field",
        path,
        line: startLine,
        message: `snippet block at line ${startLine} is missing ${key}`,
      });
    } else if (fields.sources[key].value === "") {
      findings.push({
        code: "snippet-empty-field",
        path,
        line: fields.sources[key].line,
        message: `${key} is empty in the snippet block at line ${startLine}`,
      });
    }
  }

  const license = fields["License-Identifier"];
  if (license && license.value !== "" && !LICENSE_ID.test(license.value)) {
    findings.push({
      code: "license-malformed",
      path,
      line: license.line,
      message: `"${license.value}" is not a well-formed SPDX identifier or LicenseRef-* name`,
    });
  }
}

// Scan one file for snippet blocks, appending findings.
function checkSnippetFile(tree, path, findings) {
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
        findings.push({
          code: "snippet-nested-begin",
          path: rel,
          line: number,
          message: "SPDX-SnippetBegin inside an already-open snippet block",
        });
      } else {
        open = true;
        startLine = number;
        fields = { sources: {} };
      }
      continue;
    }

    if (/^SPDX-SnippetEnd\b/.test(line)) {
      if (open) {
        checkBlockFields(fields, findings, rel, startLine);
        open = false;
        fields = null;
        startLine = null;
      } else {
        findings.push({
          code: "snippet-end-without-begin",
          path: rel,
          line: number,
          message: "SPDX-SnippetEnd with no open snippet block",
        });
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
    findings.push({
      code: "snippet-begin-without-end",
      path: rel,
      line: startLine,
      message: "snippet block opened here is never closed",
    });
    checkBlockFields(fields, findings, rel, startLine);
  }
}

// Collect every license identifier the tree's snippet blocks carry.
function collectSnippetLicenses(tree, files) {
  const licenses = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    let open = false;
    for (let index = 0; index < lines.length; index += 1) {
      const line = stripComment(lines[index]);
      if (/^SPDX-SnippetBegin\b/.test(line)) open = true;
      else if (/^SPDX-SnippetEnd\b/.test(line)) open = false;
      else if (open) {
        const match = FIELD_LINE.exec(line);
        if (match && match[1] === "License-Identifier") {
          licenses.push({
            id: match[2].trim(),
            path: relPath(tree, file),
            line: index + 1,
          });
        }
      }
    }
  }
  return licenses;
}

function checkLicenseResolution(tree, files, findings) {
  const licensesDir = join(tree, "LICENSES");
  if (!existsSync(licensesDir)) return;
  const available = new Set(
    readdirSync(licensesDir)
      .filter((name) => name.includes("."))
      .map((name) => name.slice(0, name.lastIndexOf("."))),
  );
  for (const { id, path, line } of collectSnippetLicenses(tree, files)) {
    if (id && LICENSE_ID.test(id) && !available.has(id)) {
      findings.push({
        code: "license-unresolved",
        path,
        line,
        message: `no file under LICENSES/ matches the identifier "${id}"`,
      });
    }
  }
}

function checkCitationFile(tree, findings) {
  const path = join(tree, "CITATION.cff");
  if (!existsSync(path)) return;
  let parsed;
  try {
    parsed = parseYaml(readFileSync(path, "utf8"));
  } catch (error) {
    findings.push({
      code: "citation-unparsable",
      path: "CITATION.cff",
      line: 1,
      message: `CITATION.cff is not parsable YAML: ${error.message.split("\n")[0]}`,
    });
    return;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    findings.push({
      code: "citation-unparsable",
      path: "CITATION.cff",
      line: 1,
      message: "CITATION.cff must parse to a mapping",
    });
  }
}

function checkReuseConfig(tree, findings) {
  const path = join(tree, "REUSE.toml");
  if (!existsSync(path)) return;
  let parsed;
  try {
    parsed = parseToml(readFileSync(path, "utf8"));
  } catch (error) {
    findings.push({
      code: "reuse-unparsable",
      path: "REUSE.toml",
      line: 1,
      message: `REUSE.toml is not parsable TOML: ${error.message.split("\n")[0]}`,
    });
    return;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    findings.push({
      code: "reuse-unparsable",
      path: "REUSE.toml",
      line: 1,
      message: "REUSE.toml must parse to a table",
    });
  }
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
  const textFiles = walkFiles(tree).filter(isTextFile);
  for (const path of textFiles) checkSnippetFile(tree, path, findings);
  checkLicenseResolution(tree, textFiles, findings);
  checkCitationFile(tree, findings);
  checkReuseConfig(tree, findings);

  findings.sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.line - b.line;
  });

  const report = { ok: findings.length === 0, findings };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return findings.length === 0 ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
