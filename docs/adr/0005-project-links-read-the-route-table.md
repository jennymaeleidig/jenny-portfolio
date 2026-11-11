# Project links read the route table

A project's page address is constructed once, in `scripts/routes.sh`. A page
that links to a project — the catalogue, the featured grid, the primary nav,
the Work tabs and the filters — asks the route table for it. `scripts/projects.sh`
keeps the project's facts and whether it has a page (`publishable`), but no
longer carries an `href`: an article's link is its `publication`, and every
other project's link is the route the table emits.

This extends [ADR-0003](0003-route-table-is-the-address-authority.md); it does
not replace it.

## Why

ADR-0003 made the route table the one address authority for emission and the
sitemap. The catalogue had stayed outside it: `projects.sh` spelled
`/projects/<slug>/` while `routes.sh` spelled it again, and the navigation bars
kept their own copy of every fixed address. The derivations agreed, but only
because nothing forced them to.

The alternative was to stage the address into a project's sidecar, or to keep
both `href` and the route table and add a drift test. Both leave two owners.
Staging puts a route fact in the content step; the drift test is the "two
derivations plus one test" that ADR-0003 already rejected for the sitemap. The
route table can join the address to a project's facts itself, so the catalogue
and the featured grid read one row instead.

## Consequences

- `project_row_records` in `scripts/routes.sh` emits `href` plus the project
  fields a caller names. `href` is the route address for a page, and the
  `publication` for an article, which has no route.
- `scripts/projects.sh` no longer has an `href` field; it owns `publishable`
  and `publication`.
- A layout that links to a route asks `route_address <layout> [argument]`; the
  primary nav, the Work tab bar, the category filters and the career filters
  no longer spell an address.
- The renderer passes the emitted address and its indexability to the layout
  as arguments, so the address a page declares is the one the table chose.
- Adding or renaming a route is one entry in the table plus its label; the
  links follow.
- A test asserts that every catalogue href is either an emitted route or an
  article's publication.

## Rejected alternatives

- **Stage the address into the sidecar.** One literal, but it moves a route
  decision into staging and leaves the route table joining on a fact it no
  longer owns.
- **Keep `href` in `projects.sh` and compare it with the route table in a
  test.** Two derivations and a guard, the shape ADR-0003 rejected for the
  sitemap.
- **Keep navigation literals.** The table would still own emission, but a
  route rename would edit the table and four layouts.
