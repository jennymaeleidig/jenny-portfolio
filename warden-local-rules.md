# Tests derive expectations from fixtures, not the live site

paths: tests/**
A test added or changed in this diff must not read `content/`, `dist/`, the git index, or a network URL, and must not assert licence, credit, attribution, personal data, or exact editorial copy carried by the site. Build the expected pages from `tests/fixtures/` or temp files the test writes; reading repo `assets/`, `layouts/`, and `scripts/` to exercise the code under test is fine.
