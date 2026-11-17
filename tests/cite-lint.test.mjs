// cite-lint, run as a subprocess against synthetic trees: what is
// asserted is the exit code and the findings it reports, never its
// internals. The trees live in the fixtures area and carry invented
// names, so nothing here depends on the site's own notices.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const citeLint = join(root, "scripts", "cite-lint.mjs");
const fixtures = join(root, "tests", "fixtures", "provenance");

function lint(tree) {
  const result = spawnSync(process.execPath, [citeLint, tree], {
    encoding: "utf8",
  });
  return { status: result.status, report: JSON.parse(result.stdout) };
}

function lintFixture(name) {
  return lint(join(fixtures, name));
}

function findingCodes(report) {
  return report.findings.map((finding) => finding.code);
}

test("a tree with valid snippet blocks, licenses, citation, and REUSE config passes", () => {
  const { status, report } = lintFixture("valid");
  assert.equal(status, 0);
  assert.equal(report.ok, true);
  assert.deepEqual(report.findings, []);
});

test("a tree without citation metadata passes", () => {
  const bare = mkdtempSync(join(tmpdir(), "cite-lint-bare-"));
  const { status, report } = lint(bare);
  assert.equal(status, 0);
  assert.equal(report.ok, true);
});

test("snippet blocks pass when no LICENSES directory exists", () => {
  const { status, report } = lintFixture("no-licenses");
  assert.equal(status, 0);
  assert.deepEqual(report.findings, []);
});

test("the tree's tests/fixtures subtree is never scanned", () => {
  const { status, report } = lintFixture("skipped-fixtures");
  assert.equal(status, 0);
  assert.deepEqual(report.findings, []);
});

test("a snippet block left open fails, naming the file and line", () => {
  const { status, report } = lintFixture("unpaired-begin");
  assert.equal(status, 1);
  assert.equal(report.ok, false);
  const finding = report.findings.find(
    (candidate) => candidate.code === "snippet-begin-without-end",
  );
  assert.ok(finding, `codes were: ${findingCodes(report).join(", ")}`);
  assert.equal(finding.path, "src/borrowed.js");
  assert.equal(finding.line, 1);
});

test("a closing marker with no open block fails", () => {
  const { status, report } = lintFixture("unpaired-end");
  assert.equal(status, 1);
  const finding = report.findings.find(
    (candidate) => candidate.code === "snippet-end-without-begin",
  );
  assert.ok(finding, `codes were: ${findingCodes(report).join(", ")}`);
  assert.equal(finding.path, "src/borrowed.js");
});

test("a second begin inside an open block fails", () => {
  const { status, report } = lintFixture("nested-begin");
  assert.equal(status, 1);
  const finding = report.findings.find(
    (candidate) => candidate.code === "snippet-nested-begin",
  );
  assert.ok(finding, `codes were: ${findingCodes(report).join(", ")}`);
  assert.equal(finding.line, 7);
});

test("a missing source field fails, naming the field", () => {
  const { status, report } = lintFixture("missing-field");
  assert.equal(status, 1);
  const finding = report.findings.find(
    (candidate) => candidate.code === "snippet-missing-field",
  );
  assert.ok(finding, `codes were: ${findingCodes(report).join(", ")}`);
  assert.match(finding.message, /SourceURL/);
});

test("an empty required field fails, naming the field", () => {
  const { status, report } = lintFixture("empty-field");
  assert.equal(status, 1);
  const finding = report.findings.find(
    (candidate) => candidate.code === "snippet-empty-field",
  );
  assert.ok(finding, `codes were: ${findingCodes(report).join(", ")}`);
  assert.match(finding.message, /SourceVersion/);
});

test("a malformed license identifier fails", () => {
  const { status, report } = lintFixture("malformed-license");
  assert.equal(status, 1);
  const finding = report.findings.find(
    (candidate) => candidate.code === "license-malformed",
  );
  assert.ok(finding, `codes were: ${findingCodes(report).join(", ")}`);
  assert.equal(finding.path, "src/borrowed.js");
});

test("compound SPDX license expressions pass when every identifier resolves", () => {
  const { status, report } = lintFixture("valid-expressions");
  assert.equal(status, 0);
  assert.equal(report.ok, true);
  assert.deepEqual(report.findings, []);
});

test("license expressions that do not parse fail as malformed, naming each value", () => {
  const { status, report } = lintFixture("malformed-expression");
  assert.equal(status, 1);
  assert.deepEqual(findingCodes(report), [
    "license-malformed",
    "license-malformed",
    "license-malformed",
    "license-malformed",
    "license-malformed",
  ]);
  const messages = report.findings.map((finding) => finding.message);
  for (const value of [
    "MIT License",
    "MIT AND",
    "(MIT OR Apache-2.0",
    "LicenseRef-",
    "MIT and Apache-2.0",
  ]) {
    assert.ok(
      messages.some((message) => message.includes(`"${value}"`)),
      `a finding must name "${value}"`,
    );
  }
});

test("unknown identifiers are unresolved, not malformed", () => {
  const { status, report } = lintFixture("unresolved-identifier");
  assert.equal(status, 1);
  assert.deepEqual(findingCodes(report), [
    "license-unresolved",
    "license-unresolved",
  ]);
  assert.match(report.findings[0].message, /Foo-Bar/);
  assert.match(report.findings[1].message, /LicenseRefVendored/);
});

test("a license with no matching file under LICENSES fails, naming the identifier", () => {
  const { status, report } = lintFixture("unresolved-license");
  assert.equal(status, 1);
  const finding = report.findings.find(
    (candidate) => candidate.code === "license-unresolved",
  );
  assert.ok(finding, `codes were: ${findingCodes(report).join(", ")}`);
  assert.match(finding.message, /MIT/);
});

test("an unparsable CITATION.cff fails", () => {
  const { status, report } = lintFixture("bad-citation");
  assert.equal(status, 1);
  const finding = report.findings.find(
    (candidate) => candidate.code === "citation-unparsable",
  );
  assert.ok(finding, `codes were: ${findingCodes(report).join(", ")}`);
  assert.equal(finding.path, "CITATION.cff");
});

test("an unparsable REUSE.toml fails", () => {
  const { status, report } = lintFixture("bad-reuse");
  assert.equal(status, 1);
  const finding = report.findings.find(
    (candidate) => candidate.code === "reuse-unparsable",
  );
  assert.ok(finding, `codes were: ${findingCodes(report).join(", ")}`);
  assert.equal(finding.path, "REUSE.toml");
});

test("the linter's help text states the snippet-block schema", () => {
  const result = spawnSync(process.execPath, [citeLint, "--help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  for (const key of [
    "SPDX-SnippetBegin",
    "SPDX-SnippetCopyrightText",
    "SPDX-License-Identifier",
    "Source:",
    "SourceVersion:",
    "SourceURL:",
    "SPDX-SnippetEnd",
  ]) {
    assert.ok(result.stdout.includes(key), `help must name ${key}`);
  }
});
