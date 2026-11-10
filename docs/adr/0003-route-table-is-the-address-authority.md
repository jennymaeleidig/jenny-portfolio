# The route table is the only address authority

The build decides every page's address, output path and indexability in one
route table (`scripts/routes.sh`). `post-build.sh` renders from it and
`sitemap.sh` publishes from it. Before this, the same address was derived in
four idioms — a staged href, a render-time helper, a project layout's literal,
and the sitemap's walk of the emitted files — and the 404 exception was stated
in three places. They agreed only because a test compared the results.

## Consequences

- Adding a route is one entry, not four coordinated edits.
- Project routes come from the project records, so an article — which has no
  page — never enters the table.
- The 404 is a route with `indexable=false`; no canonical URL and `noindex`
  follow from that one fact.
- The sitemap no longer enumerates the filesystem, so it cannot discover a
  page the table does not know. A test compares the emitted `index.html` set
  with the table; that is the drift guard now, rather than a second derivation.

## Rejected alternative

Keeping the sitemap's disk walk as an independent check was tempting: two
derivations are a cross-check. But they also let a new page be published at an
address the renderer never declared, and a mismatch was caught late, if at all.
One authority plus one test is the smaller surface.
