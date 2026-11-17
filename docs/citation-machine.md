# The citation machine

This records a machine for citing borrowed code and declaring licenses, as it
is wired into this repository — the pilot integration. It is written to be
portable: the convention is no site's property, and rolling it into the next
repo should be a copy-and-adjust job, not a re-derivation. Every fact below was
taken from the shipped tree (run the tools and compare), and the tool verdicts
were verified against primary sources — specifications, changelogs, and
official documentation, fetched directly.

## Why the machine exists

The pilot repo, like most repos that credit their upstreams honestly, kept
that credit in improvised prose no tool can verify. Meanwhile its own code and
prose declared no outbound license at all — all-rights-reserved by silence, not
by decision — and there was no machine-readable citation record for the work as
a whole. Coding agents keep editing the tree, so the credit culture was rigid
in intention but unenforceable in fact. The machine replaces the improvised
prose with four layers, each owning one slice, none overlapping. Rigidity
ranking: `reuse lint` > `cffconvert` >> warden content rules.

## The four layers and what each owns

### FORCE11 Software Citation Principles — the semantic checklist

The Joint Declaration of Data Citation Principles (2014) and the follow-up
Software Citation Principles (2016) are consensus prose: importance, credit
and attribution, evidence, unique identification, access, persistence,
specificity and verifiability, interoperability. The declaration states
outright that it includes no recommendations for specific implementations, and
the FORCE11 organization ships no schema, validator, or linter — only working
documents. Its own developer checklist names the Citation File Format and
CodeMeta as the appropriate machine-readable formats: the intended handoff is
from principles to CFF, not from principles to code comments.

What the principles contribute to the machine is a semantic checklist a
citation must satisfy — a unique identifier, a version pin, an access path,
verifiability — and two separations: legal attribution (license-based) is a
different obligation from normative scholarly credit, and version identity
lives in the citation while persistence lives in the archive. Guidance only:
nothing in this layer is machine-enforced.

### CITATION.cff 1.2.0 — the whole-repo record GitHub renders

One root YAML file describing the software work as a whole: authors, title,
message, repository-code, license (an SPDX enum), optionally version, commit,
identifiers. A root file on the default branch produces GitHub's "Cite this
repository" box, exporting APA and BibTeX.

Pin it to `cff-version: 1.2.0`. The newest released schema is 1.2.0
(2021-08-09); 1.3.0 has been an open draft since 2021; and GitHub's renderer
(`ruby-cff`) bundles exactly the 1.2.0 schema, so only 1.2.0 should be expected
to render.

`cffconvert --validate` checks file shape only, rigidly and deterministically
(JSON Schema draft-07, `additionalProperties: false`). It does not cross-check
contents against the repository — that `license` matches `LICENSE`, that DOIs
resolve, that `version` matches a tag.

The covered-file gotcha: a `CITATION.cff` is itself a file under the REUSE
scheme, and linters forget it. Comments are legal in YAML, so established
practice — confirmed by hundreds of files on GitHub — is to open the file with
`# SPDX-FileCopyrightText` and `# SPDX-License-Identifier` lines. The pilot's
file does.

### REUSE 3.3 — per-file legal attribution, binary gate

The REUSE Specification (current 3.3, dated 2024-11-14) plus its reference CLI
put copyright and SPDX license metadata into every file, so the terms travel
with any file copied out of the repo. It is not a citation tool: the full spec
text has zero mentions of citation, DOI, or bibliography. It owns legal
attribution — who holds copyright, which license governs — at per-file and
per-snippet granularity.

`reuse lint` fails deterministically: bad or deprecated SPDX identifiers,
missing or unused license files under `LICENSES/`, files lacking copyright
and/or license information. Binary exit code, first-class CI support. Its
ceiling is presence and license-set consistency, not truth — any line
containing "Copyright" or "©" is accepted as a valid notice.

`REUSE.toml` (spec 3.2+) bulk-annotates whole directories by glob with
`precedence` semantics (`closest`, `aggregate`, `override`), replacing the
deprecated `.reuse/dep5`. With closest precedence, per-file headers and
snippet blocks win over the globs, so files stay untouched and the table does
the work.

The root-LICENSE fact: GitHub's license detection (Licensee) compares only the
root `LICENSE` file, never the `LICENSES/` directory. Spec 3.3 permits and
ignores a root LICENSE, so a strict-REUSE repo keeps one there for the sidebar
badge while the canonical texts live pristine in `LICENSES/`.

### cite-lint — the deterministic validator of the schema no standard owns

The unowned gap is per-snippet citation: REUSE's snippet blocks carry
holder/year/license only — no title, version, or locator; CFF's `references`
locators are unvalidated and unconsumed; FORCE11 prescribes nothing; warden
content rules are probabilistic and see only a window of the write. The
machine extends REUSE's SPDX snippet blocks with repo-convention source keys
and validates them with a purpose-built linter, `cite-lint`: a small Node
script, one Makefile target, deterministic and structure-only. It checks block
pairing, required fields, identifier well-formedness, license resolution
against `LICENSES/`, and that `CITATION.cff` and `REUSE.toml` parse. It does no
network access and no upstream diffing — truth is the judgment layer's job.

Its report is structured JSON (`ok`, plus `findings` of `code`, `path`,
`line`, `message`) and its exit code is binary — 0 clean, 1 findings, 2 usage
error — so it composes into any future gate.

### warden — the judgment half

The half no linter can staff: live, per-edit judgment that a citation on
borrowed code is truthful and attached. The rule lives in the repo's local
warden rule file — local-first, so the convention is primed at turn start for
any agent working here; promotion to a user-global rule waits until the pilot
proves out. Warden's judgment model scores each edit per rule
(`compliant`/`violation`/`not_applicable`, cutoff 0.7); content rules are
probabilistic and hold a write only through escalation. Its deterministic
parts act on commands and paths only, never file content; there is no
deterministic CI mode (headless runs spend judgment requests, and if the judge
is down the call is allowed with a warning). It cannot resolve URLs, pin
versions, or cross-check a citation against the actual upstream tree — exactly
the checks the deterministic layers own. Together with the warden
configuration that skips the vendored tree and the fixtures area, the
deterministic gates and the judge cover disjoint mistakes: the linters catch
malformed and missing, warden catches dishonest and detached.

## The snippet-block schema

Borrowed code is cited in a comment block, in any comment syntax, exactly as
`cite-lint` validates it (`node scripts/cite-lint.mjs --help` is the
authoritative transcription; this matches it):

```
  SPDX-SnippetBegin
  SPDX-SnippetCopyrightText: 2024 Example Author
  SPDX-License-Identifier: MIT
  SPDX-SnippetFileComment: Source: Example Library
  SPDX-SnippetFileComment: SourceVersion: 1.2.3
  SPDX-SnippetFileComment: SourceURL: https://example.com/library
  SPDX-SnippetEnd
```

Each field is required and must carry a non-empty value. `Source` carries the
title of the upstream work, `SourceVersion` its version or commit, and
`SourceURL` where it came from. Extra `SPDX-SnippetFileComment` lines are free
prose and allowed.

The linter's findings, by code:

```
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
```

A missing `LICENSES/`, `CITATION.cff`, or `REUSE.toml` passes: the linter
validates shape, not coverage. The tree's `.git`, `node_modules`, and `dist`
directories are never scanned, nor is its `tests/fixtures` subtree — that is
where the linter's own tests keep synthetic trees, some deliberately
malformed.

## The warden rule

The judgment half ships as this rule, in the repo's local warden rule file,
scoped to the paths where code lands:

```
# Borrowed code carries a citation block

paths: assets/**, layouts/**, scripts/**

Code added or changed in this diff that is copied or adapted from an upstream work must carry an SPDX snippet block on or beside the borrowed code: `SPDX-SnippetBegin` and `SPDX-SnippetEnd` markers around `SPDX-SnippetCopyrightText`, `SPDX-License-Identifier`, and `SPDX-SnippetFileComment` lines for `Source`, `SourceVersion`, and `SourceURL` — the schema the `cite-lint` script validates. Judge the rule from what the changed file itself shows: a comment, heading, or name citing an upstream work — "borrowed from", "adapted from", "based on", a bare "sources:" list — sitting over or beside added code with no snippet block in sight is the violation. The citation's own words must state copying status honestly: "adapted from" only where expression was actually taken, never over code whose upstream was only read for reference, and a bare "sources:" heading only where code was actually copied — code that took ideas alone names what inspired it without implying copying.
```

The honesty clause is the rule's second, unautomatable half: the linter proves
a block exists and is well-formed; only judgment can prove the block's claims
match what actually happened.

## Gate placement as shipped

CI runs the provenance gates in the deploy workflow, after the existing
format check and before the build and deploy steps, in this order:

1. **Check REUSE provenance** — a Python venv, `pip install
"reuse[charset-normalizer]"`, then `reuse lint`.
2. **Lint provenance** — `make lint:provenance`, which runs the cite-lint
   script over the tree.
3. **Validate the citation file** — a second venv, `cffconvert --validate`.

The Makefile target is named `lint\:provenance`; the backslash keeps make from
reading the colon in the target's name as the rule separator.

The pre-push hook runs `make test` and `make lint:provenance` — fast, local,
no Python — so provenance breakage is caught before CI does. Pre-commit is
deliberately untouched: day-to-day committing stays fast, and the provenance
gates ride the slower checkpoints. The build output directory is untracked, so
every gate covers the tracked tree only.

### The fixture and REUSE interaction

An integrator who writes fixture trees for the linter's own tests will hit
this; the pilot hit it and fixed it twice over.

`reuse lint` reads every tracked file, synthetic fixture trees included, and
demands copyright and license information from each. The fixture trees are
deliberately malformed inventories, so the fix is a `REUSE.toml` annotation
over `tests/fixtures/**` with `precedence = "override"`: the table supplies
every fixture file's notice on its own, and fixture contents are never read
for tags.

The sharp edge: `reuse lint` also parses every `REUSE.toml` it finds as a
config file. A fixture that exercises the linter's unparsable-config check
needs malformed TOML in a file named `REUSE.toml` — and as a regular file,
that breaks the repo's own `reuse lint` with a hard parse error before the
fixture's purpose is ever reached. The fix as shipped: keep `REUSE.toml` as a
git-tracked symlink to a `REUSE.toml.malformed` payload. The reuse tool
ignores the symlinked config; cite-lint reads through it and reports
`reuse-unparsable` exactly as its test expects.

The same class of problem reaches prettier, which parses YAML: a deliberately
malformed `CITATION.cff` fixture would fail the format check, so that
fixture's directory is listed in `.prettierignore`.

## The worked example: honest copying-status language

The pilot's star layer — a CPU-side sky and star renderer — cites four shader
sources in its file header. A provenance comparison checked what actually
carried over: the longest verbatim token run against any upstream is four to
six tokens of pure syntax; the only shared numbers are universal constants;
every distinctive identifier, formula, and structure differs. It is an
idea-level re-implementation. The licenses were verified source by source —
one MIT, two CC0, one Apache-2.0 whose NOTICE line is quoted in the header —
and none of their obligations attach to copied expression, because none was
copied.

The verdict language is the example worth copying: the header claims
"idea-level re-implementation, no code copied" explicitly for the star
sources, names each license inline, and adds no preemptive MIT notice — a
notice not owed would assert an obligation that does not attach, and the
snippet convention plus the warden rule guard the future case where literal
code does land. That is the machine's honesty discipline in one header: state
the copying status in words a reviewer can weigh, never implying more copying
than happened.

## What the research established

The machine was derived from research verified against primary sources; two
of its findings decide the shape.

**No per-snippet citation linter exists.** The SPDX Snippet class (SPDX 2.3
and 3.0) standardizes per-snippet provenance — line ranges, source file,
license — but lives in SPDX documents (SBOMs), not in-file comments, with no
enforcement tooling tied to a repo tree. SPDX header tools check license
headers only; none carry title, version, or locator fields. The closest
citation linter validates repo-level metadata files (`CITATION.cff`,
`codemeta.json`) only, never the repo tree. The per-snippet citation schema
has no owner in any of these ecosystems; the machine is a deliberate
convention, not an adopted standard.

**The REUSE + CFF pairing is established practice; snippet blocks are rare and
improvised.** Field data shows hundreds of `CITATION.cff` files on GitHub
carrying REUSE headers — the covered-file gotcha, handled in the wild — and a
ten-repo sample of such projects all carry `REUSE.toml`. Snippet blocks appear
in roughly 1,700 files across all of GitHub, and every observed example
improvises the bibliographic half the spec does not define: non-spec keys,
stacked copyright lines, version context in prose comments, hand-rolled
citations in free text. Every example is the same pattern — an SPDX block for
legal attribution, free-text prose for the scholarly citation. The machine
formalizes the prose half. Its layering therefore matches what serious
projects already do, extended into the gap none of them fills.

What the machine deliberately leaves out: no DOI, Zenodo, or archival
registration — persistence is assigned to the archive by the citation
principles, and the pilot stays lean. No rendering or consumption of snippet
blocks exists today; the schema is repo convention until a consumer appears.

## Rolling the machine into the next repo

An ordered recipe; each step ends at a gate that must pass before the next
begins.

1. **Decide the license split.** First-party original code (the pilot chose
   CC0-1.0); editorial prose and personal images (all-rights-reserved by
   explicit declaration via a custom `LicenseRef` file, never by silence);
   third-party material tagged honestly per source — a public-domain statement
   is not a CC0 dedication and must not be labeled as one.
2. **Root `LICENSE` and `LICENSES/`.** Put the legalcode text of the
   first-party license at the root for GitHub's detector; pristine canonical
   texts under `LICENSES/` named by SPDX identifier, plus custom
   `LicenseRef-*` files for the public-domain and all-rights-reserved texts.
3. **Write `REUSE.toml`.** Bulk globs per class with explicit `precedence`;
   honest per-file entries for third-party material — a substantial fork gets
   the whole-file license and a dual copyright list with `aggregate`
   precedence; a vendored tree is bulk-annotated and left byte-identical,
   its own traveling notices staying in place.
4. **Get `reuse lint` green.** `pip install "reuse[charset-normalizer]"` in a
   venv; the tool reports every uncovered file.
5. **Write `CITATION.cff`.** Pinned to `cff-version: 1.2.0`, minimal fields,
   itself covered by `# SPDX-FileCopyrightText` and `# SPDX-License-Identifier`
   comment lines.
6. **Build cite-lint schema-first.** Decide the required snippet fields, then
   fixture trees per failure mode — a valid shape, unpaired and nested
   markers, missing and empty fields, malformed and unresolved licenses,
   unparsable config files — and test through the CLI only, asserting exit
   codes and reported findings, never internals. Give the fixtures area a
   `precedence = "override"` annotation; keep unparsable fixture configs as
   tracked symlinks; add malformed-YAML fixture directories to the format
   tool's ignore file.
7. **Wire the gates.** CI provenance steps after the format check, in order
   (`reuse lint`, the cite-lint target, `cffconvert --validate`), before
   deployment. Pre-push gains the fast local targets; pre-commit stays
   untouched.
8. **Write the warden rule, local-first.** The repo's local rule file, scoped
   to the paths where code lands, judgment half only — the deterministic
   rules already have linters.
9. **Adapt this document.** Copy it into the new repo and correct the pilot
   specifics; the layers, the schema, and the recipe stay as written.
