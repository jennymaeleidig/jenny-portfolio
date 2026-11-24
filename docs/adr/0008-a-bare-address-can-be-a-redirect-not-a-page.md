# A bare address can be a redirect, not a page

The catalogue lives at `/work/projects/`, the same shape as `/work/career/`,
and the bare `/work/` address forwards to it. A redirect is a route that is
deliberately not a page: its layout emits a meta-refresh page whose target
is the route's own `argument`, it carries `indexable=false`, and its
canonical URL points at the target so a search engine follows the move
instead of listing both addresses.

## Why

The route table said a route is a page, so the bare `/work/` had to be the
catalogue itself, and the address named no section while its two real
sections — `/work/projects/` and `/work/career/` — were peers only in the
tab bar. Giving the catalogue its own peer address fixes that, and the bare
address stays valid for every existing link to it.

A redirect route is the route-table way to express this: the address is a
real row, the sitemap skips it through the one `indexable=false` fact, and
the 404's precedent — a route that claims no address of its own — already
existed. A server-side 3xx was not an option: GitHub Pages serves static
files only.

## Consequences

- The `argument` field means the category or section for the `work` and
  `career` layouts, and the target address for the `redirect` layout. The
  target is spelled in the redirect's row rather than asked of
  `route_address`, which reads the same table and would re-enter it.
- The route-enumeration test skips a redirect page by what the redirect
  layout emits (the refresh directive), not by a broad `noindex` match, so
  a real page that accidentally asks not to be indexed still fails the
  test.
- Adding a second redirect later is one row and one target address; the
  layout needs no change.
