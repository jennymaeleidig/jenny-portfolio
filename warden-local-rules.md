# Tests derive expectations from fixtures, not the live site

paths: tests/**

A test added or changed in this diff must not read `content/`, `dist/`, the git index, or a network URL, and must not assert licence, credit, attribution, personal data, or exact editorial copy carried by the site. Build the expected pages from `tests/fixtures/` or temp files the test writes; reading repo `assets/`, `layouts/`, and `scripts/` to exercise the code under test is fine.

# Borrowed code carries a citation block

paths: assets/**, layouts/**, scripts/**, content/**
source: docs/citation-machine.md:187

Code added or changed in this diff that is copied or adapted from an upstream work must carry an SPDX snippet block on or beside the borrowed code: `SPDX-SnippetBegin` and `SPDX-SnippetEnd` markers around `SPDX-SnippetCopyrightText`, `SPDX-License-Identifier`, and `SPDX-SnippetFileComment` lines for `Source`, `SourceVersion`, and `SourceURL` — the schema the `cite-lint` script validates. Judge the rule from what the changed file itself shows: a comment, heading, or name citing an upstream work — "borrowed from", "adapted from", "based on", a bare "sources:" list — sitting over or beside added code with no snippet block in sight is the violation. The citation's own words must state copying status honestly: "adapted from" only where expression was actually taken, never over code whose upstream was only read for reference, and a bare "sources:" heading only where code was actually copied — code that took ideas alone names what inspired it without implying copying.
