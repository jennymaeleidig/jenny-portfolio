import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSelection, toSearch } from "../assets/resume-selector-core.mjs";

const ALL_IDS = [
  "resume-summary",
  "resume-experience",
  "experience-a",
  "experience-b",
  "resume-projects",
  "resume-skills",
];
const DEFAULT_OMITTED = ["experience-b"];
const OPTIONS = { allIds: ALL_IDS, defaultOmitted: DEFAULT_OMITTED };
const DEFAULT_INCLUDED = [
  "resume-summary",
  "resume-experience",
  "experience-a",
  "resume-projects",
  "resume-skills",
];

test("absent or empty query yields the canonical default selection", () => {
  for (const search of ["", "?"]) {
    assert.deepEqual(parseSelection(search, OPTIONS), { included: DEFAULT_INCLUDED });
  }
});

test("a missing search string yields the canonical default selection", () => {
  for (const search of [undefined, null, 42, {}]) {
    assert.deepEqual(parseSelection(search, OPTIONS), { included: DEFAULT_INCLUDED });
  }
});

test("unknown keys and unknown ids are ignored", () => {
  assert.deepEqual(parseSelection("?something-else=1", OPTIONS), { included: DEFAULT_INCLUDED });
  assert.deepEqual(parseSelection("?include=not-an-entry", OPTIONS), { included: DEFAULT_INCLUDED });
  assert.deepEqual(
    parseSelection("?include=not-an-entry,resume-summary", OPTIONS),
    { included: ["resume-summary"] },
  );
});

test("a known id toggles only itself", () => {
  assert.deepEqual(parseSelection("?include=experience-a", OPTIONS), {
    included: ["experience-a"],
  });
  assert.deepEqual(parseSelection("?include=resume-skills,experience-a", OPTIONS), {
    included: ["experience-a", "resume-skills"],
  });
});

test("parsing is independent of the order ids appear in the query", () => {
  assert.deepEqual(
    parseSelection("?include=resume-skills,experience-a,resume-summary", OPTIONS),
    parseSelection("?include=resume-summary,experience-a,resume-skills", OPTIONS),
  );
});

test("encoding a parsed selection round-trips through the query", () => {
  for (const search of [
    "",
    "?include=experience-a",
    "?include=resume-summary,resume-skills",
    "?include=not-real,resume-summary",
  ]) {
    const selection = parseSelection(search, OPTIONS);
    assert.deepEqual(parseSelection(toSearch(selection), OPTIONS), selection);
  }
});

test("an explicitly empty selection survives the query", () => {
  const selection = parseSelection("?include=none", OPTIONS);
  assert.deepEqual(selection, { included: [] });
  assert.equal(toSearch(selection), "?include=none");
  assert.deepEqual(parseSelection(toSearch(selection), OPTIONS), selection);
});

test("malformed input never throws", () => {
  for (const search of [
    "?include",
    "?include=",
    "?include=%",
    "?include=%E0%A4%A",
    "?include=,",
    "?include=experience-a,,resume-skills",
    "?include=none,experience-a",
    "?%E0%A4%A=1",
  ]) {
    assert.doesNotThrow(() => {
      const selection = parseSelection(search, OPTIONS);
      assert.ok(Array.isArray(selection.included), `${JSON.stringify(search)} yields a selection`);
    });
  }
});
