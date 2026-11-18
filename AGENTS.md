## Agent skills

### Issue tracker

Issues live as GitHub issues in `jennymaeleidig/jenny-portfolio`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

### Warden scope

The active local rules live in `warden-local-rules.md`, loaded through the user's `rules.files`; the project's audit exclusions are configured in `.pi/pi-warden.json`, and the source extensions in the user's `auditExtensions`. The convention those rules enforce is documented in `docs/citation-machine.md`.
