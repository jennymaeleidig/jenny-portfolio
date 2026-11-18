# A rigid, enforceable toolset for citing borrowed code

Research question: which tools let AI agents cite code they borrow in a way that is rigid, deterministic, and enforceable? Candidates investigated against primary sources: REUSE (FSFE), Citation File Format (CFF), CodeMeta, FORCE11 principles, and pi-warden as a possible enforcement layer for the gap the others leave open.

Date: 2026-11-17 (CodeMeta investigation and the validator-tooling sweep merged in the same day, live-searched via Kagi and the GitHub API). All claims below were verified against primary sources (specification pages, changelogs, source code, official docs), fetched directly. Where a source does not answer something, that is stated rather than inferred.

## What each tool actually is

### REUSE 3.3 (FSFE) — per-file license ledger, hard CI gate

A specification (current 3.3, dated 2024-11-14) plus a reference CLI for putting copyright and SPDX license metadata into every file of a repository. <https://reuse.software/spec-3.3/>, tool at <https://codeberg.org/fsfe/reuse-tool>.

- **Goal**: "comprehensive, unambiguous, human- and machine-readable copyright and licensing information for each individual file in a project… embedded into every file, so that the information is preserved when the file is copied and reused by third parties" (spec preamble).
- **Not a citation tool**: the full 3.3 spec text has zero mentions of citation, DOI, Zenodo, or bibliography. It solves legal attribution (who holds copyright, what license governs), not scholarly credit.
- **Enforcement**: `reuse lint` fails deterministically on eight criteria — bad or deprecated SPDX identifiers, missing/unmatched license files in `LICENSES/`, unused licenses, files lacking copyright and/or license info. CI integration is first-class (`fsfe/reuse-action@v6`, Docker image, pre-commit hook). <https://reuse.readthedocs.io/en/stable/man/reuse-lint.html>
- **Ceiling of enforcement**: the tool verifies _presence and license-set consistency_, not truth — any line containing "Copyright"/"©" is accepted as a valid copyright notice (`reuse(1)`, "Details").
- **REUSE.toml** (spec 3.2+): bulk-annotate whole directories by glob with `SPDX-FileCopyrightText` / `SPDX-License-Identifier` and `precedence` semantics (`closest` / `aggregate` / `override`). Replaces the deprecated `.reuse/dep5`. <https://reuse.software/dev/>
- **Borrowed code**: `SPDX-SnippetBegin`/`SPDX-SnippetEnd` blocks with `SPDX-SnippetCopyrightText` carry holder/year/license only — no title, version, or locator.
- **GitHub**: no rendering. GitHub's license detection (Licensee) compares only the root `LICENSE` file, not `LICENSES/` — a strict-REUSE repo needs a root `LICENSE` (which spec 3.3 permits and ignores) for the sidebar badge. <https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository>

### Citation File Format 1.2.0 — machine-readable whole-repo citation, GitHub-rendered

A YAML schema for one root file, `CITATION.cff`, describing the software work as a whole. <https://citation-file-format.github.io/>, schema and tools at <https://github.com/citation-file-format/citation-file-format>.

- **Captures**: `authors`, `title`, `message` (required), plus `doi`, `identifiers`, `version`, `commit`, `date-released`, `license` (SPDX enum), `keywords`, `repository-code`, `preferred-citation`, `references`.
- **Validation**: JSON Schema draft-07 with `additionalProperties: false`; `cff-version` pattern-pinned per schema release. Rigid and deterministic via `cffconvert --validate` (pre-commit hook, GitHub Actions). But it checks file _shape only_ — cffconvert does not cross-check contents against the repository (that `license` matches `LICENSE`, that DOIs resolve, that `version` matches a tag). The closest existing tool, [`code-citation-lint`](https://github.com/cmahnke/code-citation-lint), goes further — lint rules beyond schema validation (recommended fields, ORCID check digits, SPDX license list, `version`/`date-released` consistency) and cross-file consistency between `codemeta.json` and `CITATION.cff` — but still validates only the repo-level metadata files, never the repo tree.
- **Stability**: newest release is 1.2.0 (2021-08-09); 1.3.0 has been an open draft since 2021.
- **GitHub rendering**: root file on default branch produces a "Cite this repository" box exporting APA and BibTeX. GitHub's `ruby-cff` bundles exactly the 1.2.0 schema, so only `cff-version: 1.2.0` should be expected to render. <https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-citation-files>
- **Borrowed snippets**: `references` entries technically support `filename`, `loc-start`/`loc-end`, `commit`, `license`, `copyright` — but nothing validates them, nothing consumes them (cffconvert does not convert `references`), and the format is one file for one work. Per-snippet attribution is out of scope.
- **Dependencies fit in-spec (verified against the 1.2.0 JSON Schema)**: a `references` entry is a required-triple of `authors`/`title`/`type`, the `type` enum includes `software` (plus `software-code`, `software-container`, etc.), and a reference carries `version`, `commit`, `repository-code`, `license`, `year`. The spec's own README describes `references` as "works that your software or dataset builds on" — semantically correct for a vendored dependency, so a pinned, sourced dependency citation rides in the same file GitHub already renders. The cite box itself ignores `references` (top-level fields only); the entry is for whole-file consumers.
- **Overlap with REUSE**: the single repo-level `license` field (SPDX enum) duplicates REUSE's license fact at repository granularity; CFF leaves it optional and unverified.

### CodeMeta / codemeta.json — schema.org-backed whole-repo metadata, dependencies included

A "shared, minimal metadata vocabulary for software" founded in 2016 by a consortium of researchers, built on schema.org terms and JSON-LD (<https://codemeta.github.io/>). An instance is a root `codemeta.json` carrying `@context` (current release: `https://w3id.org/codemeta/4.0`) and `@type` (`SoftwareSourceCode`); property names come from schema.org plus a small set of CodeMeta-added terms (user guide, <https://codemeta.github.io/user-guide/>). The canonical definitions are the `codemeta.jsonld`/`codemeta_all.jsonld` files in the codemeta repository, not the terms table (terms page closing note, <https://codemeta.github.io/terms/>); recognized terms are restricted to that page, with further schema.org terms requiring a `schema:` prefix or context extension.

- **Its unique claim is dependencies**, the part CFF 1.2.0 cannot express at the top level: `softwareRequirements` (schema:SoftwareApplication, "Required software dependencies"). The crosswalk (<https://github.com/codemeta/codemeta/tree/master/crosswalk.csv>) maps into it from Cargo, NodeJS, and Python dependency manifests, Debian `Depends` — and CFF 1.2.0 `references`, so the two formats do not conflict. `softwareSuggestions` (optional dependencies) exists at v2/v3 only; v4 adds `relatedSoftware`, explicitly "does not imply dependency, citation, or execution requirement." Everything else duplicates `CITATION.cff` field for field (`name`←title, `author`←authors, `codeRepository`←repository-code, `license` as an SPDX URL, `identifier`←identifiers/doi, per the crosswalk) — plus `description`, which CFF 1.2.0 lacks.
- **Validation reality**: no `additionalProperties: false`-style rigid JSON Schema is published by the project. The official web generator validates v3/v2 only, not the current v4 context (tools page, <https://codemeta.github.io/tools/>); no tool on that page is marked as validating v4. A live GitHub sweep (same day) found active third-party validators for the **3.0** context — `SciCodes/pydantic-codemeta` (pip-installable Pydantic v2 models, strict `@context` validation) and `SciCodes/codemeticulous` (validation and conversion between metadata standards) — while the older candidates are dead: `caltechlibrary/convert_codemeta` is archived, the `front-matter/codemeta` Ruby gem dormant. So: automated tooling exists for 3.0, none maintained for 4.0. A v4 file's gate is therefore a purpose-built shape check.
- **Consumer reality**: GitHub does not consume it — the official citation docs list only `CITATION.cff` rendering plus a fixed set of unparsed `CITATION`/`CITATIONS` variants (<https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-citation-files>, "Other citation files"). Software Heritage's metadata indexers are a verified consumer, at context v2 (<https://docs.softwareheritage.org/devel/swh-indexer/metadata-workflow.html>). Zenodo: no official consumption stated; a community `codemeta2zenodo` Action converts to `.zenodo.json` (tools page, "Publication Pipelines"). CFF's own site documents the reverse direction — Zenodo's GitHub integration and Zotero both consume `CITATION.cff` directly.
- **JSON has no comments**, so a codemeta.json under a REUSE scheme is covered by REUSE.toml globs, not in-file tags.

### FORCE11 — citation semantics as prose, with no enforcement

The Joint Declaration of Data Citation Principles (2014, <https://force11.org/info/joint-declaration-of-data-citation-principles-final/>) is consensus prose: eight principles (Importance; Credit and Attribution; Evidence; Unique Identification; Access; Persistence; Specificity and Verifiability; Interoperability and Flexibility). It states outright: "we do not include recommendations for specific implementations." The github.com/force11 org (19 repos) contains websites, conference planning, and working-group document stores — no schema, validator, linter, or library.

- **The more relevant document** is the follow-up _Software Citation Principles_ (Smith, Katz, Niemeyer, PeerJ CS 2:e86, 2016, doi:10.7717/peerj-cs.86): six principles adapted from the data declaration; hardens Specificity into version numbers / revision pins; prescribes DOIs resolving to persistent landing pages, and a `[Software]` label in reference lists.
- **No in-code citation syntax exists anywhere in FORCE11 output.** Any comment-block convention is downstream invention. FORCE11's own developer checklist (doi:10.5281/zenodo.3482769) names CFF and CodeMeta as the appropriate machine-readable formats — so FORCE11 → CFF/CodeMeta is the intended handoff.
- **Useful separations for code**: version identity (commit SHA in the citation; the archive/DOI carries persistence — JDDCP assigns persistence to the archive, verification to the citation) and the Credit-and-Attribution split between _legal_ attribution (license-based — REUSE's territory) and _normative_ scholarly credit.
- **Named gap**: derived software is acknowledged (SCP §5.3) but resolved by "cite what you directly build on" — it does not require in-file attribution of upstream code inside a vendored file.

### pi-warden — semantic judgment at agent-writing time, not a deterministic gate

<https://github.com/DevMortimer/pi-warden/blob/main/docs/guards.md#rules>

- **Rule format**: Markdown headings with prose bodies, per-rule `paths:` globs, `severity:`, `when: edit|turn`. Enforcement is a judgment model (Jev) scoring each edit per rule (`compliant`/`violation`/`not_applicable`, cutoff 0.7) — probabilistic, never pattern matching.
- **Mechanical vs judged**: warden's deterministic parts (action-guard floors, command deny rules, path rules) act on commands and paths only — none can inspect file content. Content rules never hold a call, except via Escalation B (a second Jev confirmation ≥ 0.85 raises to destructive and holds writes).
- **No deterministic CI mode**: headless runs exist but spend judgment requests and return probabilities; if the judge is down, "the call is allowed with a warning."
- **What it can staff**: live judgment that a citation attached to borrowed code is real and complete (not a stub), end-of-turn whole-diff judgment catching code smuggled in via generators or subagent writes, and turn-start rule reminders that put the citation convention in the agent's system prompt.
- **What it cannot do**: resolve DOIs/URLs, cross-check a citation against the actual upstream tree (judge sees only a windowed sample of the write, no network), pin versions. `warden rules check` itself labels upstream-verification rules `needs_other_files` and suggests moving rigid-syntax rules to a linter.
- **This repo**: already runs warden with `warden-local-rules.md` + `~/.pi/agent/global.md` rules, `.pi/pi-warden.json` excluding/skipping `assets/reset.css`, `docs/adr/**`, `docs/agents/**`, `tests/fixtures/**`, plus the built-in `vendor/` skip (vendored `hmngwy/jenny` is never judged).

## Comparison

|                  | REUSE                          | CFF                             | CodeMeta                                         | FORCE11            | pi-warden                           |
| ---------------- | ------------------------------ | ------------------------------- | ------------------------------------------------ | ------------------ | ----------------------------------- |
| Solves           | per-file copyright + license   | whole-repo citation record      | whole-repo metadata incl. dependencies           | citation semantics | in-session agent judgment           |
| Format           | SPDX tags in files, REUSE.toml | YAML, JSON Schema               | JSON-LD, schema.org terms                        | prose              | prose rules + model                 |
| Enforcement      | `reuse lint`, binary CI gate   | cffconvert / code-citation-lint | shape check only at v4; pydantic-codemeta at 3.0 | none               | probabilistic; holds via escalation |
| Deterministic    | yes                            | yes                             | only where a validator exists (3.0)              | n/a                | content rules: no                   |
| Granularity      | per-file / snippet             | one repo                        | one repo (deps embeddable)                       | n/a                | per-edit / per-turn                 |
| GitHub rendering | none                           | "Cite this repository" box      | none                                             | n/a                | n/a                                 |

Rigidity ranking: `reuse lint` > cffconvert >> CodeMeta (v4: no external validator) >> warden content rules.

## The gap and how the stack composes

The unfilled territory is **per-snippet attribution of borrowed code**: a rigid template, carried in or near the borrowed code, enforced deterministically. REUSE's snippet blocks have no bibliographic fields; CFF's `references` locators are unvalidated and unconsumed; CodeMeta has no per-file story at all; FORCE11 prescribes nothing; warden content rules are probabilistic and see only a window of the write.

Recommended layering, no overlap:

1. **FORCE11 (specifically the Software Citation Principles)** — the semantic checklist a citation must satisfy: unique ID, version pin, access, verifiability. Guidance layer only.
2. **CITATION.cff 1.2.0** — the whole-repo record GitHub renders; validated by cffconvert in CI. Give it an `# SPDX-FileCopyrightText` / `# SPDX-License-Identifier` header (it is a covered file under REUSE; comments are legal in YAML). A vendored or built-on dependency rides along as a `references` entry (`type: software`, with `version`, `commit`, `repository-code`, `license`) — in-spec, rendered by nothing, read by whole-file consumers.
3. **REUSE 3.3** — per-file and per-snippet legal attribution, enforced by `reuse lint` as a binary CI gate. Keep a root `LICENSE` for GitHub's detector. REUSE's SPDX-Snippet blocks are the natural machine-enforceable _carrier_ for citation data on borrowed code, extended with repo-convention keys (e.g. `SPDX-SnippetFileComment: Source:` lines).
4. **pi-warden** — the unautomatable half: live judgment that citations on borrowed code are truthful and attached, whole-diff turns catching smuggled-in code, and turn-start priming of the convention. Complements the deterministic gates; cannot replace them.
5. **A small purpose-built linter** for the citation-block syntax itself (block present, fields non-empty, format rigid) — the mechanical validation neither REUSE, cffconvert, `code-citation-lint`, nor warden provides. A repo convention, not an adopted standard: the per-snippet citation schema has no owner in any of these ecosystems today (see the field survey — where it exists at all, it lives in improvised free text). The pilot implementation (`scripts/cite-lint.mjs`) pins this gap: fixture-tested, offline, shape-only.
6. **codemeta.json — optional, consumer-gated.** Ships the one fact CFF 1.2.0 cannot express at the top level: machine-readable dependencies in `softwareRequirements`, kept in step with the CFF `references` entries (the crosswalk maps one onto the other). No consumer in a GitHub-rendered pipeline reads it, and the current v4 context has no maintained external validator, so it rides the purpose-built linter (a `codemeta-unparsable` shape finding) and the REUSE globs (JSON has no comment headers). Adopt it in a rollout repo only where a consumer that reads codemeta actually exists — Software Heritage indexing, a `codemeta2zenodo` pipeline, an EOSC-style registry — at which point the 3.0 context and `pydantic-codemeta` give it a real external validator as well.

### Prior-art check (Kagi search + GitHub API, 2026-11-17)

A web sweep for existing per-snippet citation enforcement tooling found none. Closest neighbours, none sufficient:

- The SPDX Snippet class (SPDX 2.3, "Clause 9: Snippet Information", <https://spdx.github.io/spdx-spec/v2.3.1/snippet-information/>; SPDX 3.0.1, <https://spdx.github.io/spdx-spec/v3.0.1/model/Software/Classes/Snippet/>) standardizes per-snippet provenance — line ranges, source file, license — but lives in SPDX documents (SBOMs), not in-file comments, with no enforcement tooling tied to a repo tree.
- SPDX-header enforcement tools (`spdx-header-guard`, `NightOwl888/SPDX.CodeAnalysis`, `sudorook/licensetool`) check license headers only; none carry title, version, or locator fields.
- 2026 research literature on provenance and attribution of LLM-generated code is active (arXiv), confirming the problem is recognized but shipping no rigid, deterministic tool.
- A search for REUSE + CITATION.cff used together initially surfaced no combined prior art; GitHub field data below shows the pairing is in fact established practice — the layering above matches what serious projects already do, extended to per-snippet attribution.
- A live sweep for CodeMeta validation tooling (Kagi + GitHub API): validators exist for the 3.0 context (`SciCodes/pydantic-codemeta`, pip, Pydantic v2, strict `@context` checks; `SciCodes/codemeticulous`, validation and conversion) — none maintained for the 4.0 context, with `caltechlibrary/convert_codemeta` archived and the `front-matter/codemeta` Ruby gem dormant.

### Field survey (GitHub + Kagi, 2026-11-17)

GitHub code search and Kagi, run from the main session:

- **Snippet blocks are rare.** `SPDX-SnippetCopyrightText` appears in ~1,700 files across all of GitHub, and practitioners improvise bibliographic fields the spec does not define, because the block carries only holder/year/license:
  - `thu-pacman/chitu` (`chitu/ops/norm_gate.py`) adds a non-spec, typo'd key: `# SDPX—SnippetName: Qwen3NextRMSNormGated from transformers`.
  - `pagefaultgames/pokerogue` (`src/utils/color-utils.ts`) stacks two `SPDX-SnippetCopyrightText` lines (upstream Google LLC + self) and puts version context ("removed after 0.3.0") in prose comments.
  - `NVIDIA/cudf` (`cpp/include/cudf/hashing/detail/hash_functions.cuh`) pairs the snippet block with free text: source URL, author, license — a hand-rolled citation in prose.

  Every example is the same pattern: SPDX block for legal attribution, free-text prose for the bibliographic citation. The prose half is exactly what a rigid convention would have to formalize.

- **REUSE + CFF pairing is established practice.** 452 files on GitHub carry REUSE headers inside a `CITATION.cff` (the covered-file gotcha predicted above, handled in the wild). A 10-repo sample all also carry `REUSE.toml`: google/langextract, PyPSA/PyPSA, privacyguides/privacyguides.org, IObundle/iob-soc, ArcadeData/arcadedb, gnss-sdr/gnss-sdr, ADIOS2.
- **The closest existing citation linter** is `cmahnke/code-citation-lint`: validates CFF and CodeMeta against all released schema versions (bundled, offline), lint rules beyond schema shape, converts CFF ↔ CodeMeta/schema.org/Zenodo, usable as a library, CLI, and in CI. Repo-level metadata files only — no per-snippet blocks, no checks against the repo tree.
- **Kagi found no per-snippet citation linter.** Guidance for citing code is human-bibliographic (MLA, university library guides), not machine-enforceable; the 2026 research literature on LLM-code provenance (see prior-art check) remains papers, not tools.
