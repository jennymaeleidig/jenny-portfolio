# jenny-portfolio

The vocabulary of Jenny's portfolio: the projects she has made, the record of
her career, and the page furniture that carries them.

## Language

**Project**:
One piece of work, written as `content/projects/<slug>.md` and published at
`/projects/<slug>/`.
_Avoid_: post, entry, item, work (for one project)

**Article**:
A project whose category is `articles`: writing published elsewhere, linked out
to rather than given a page.
_Avoid_: paper (that is how the link to it may be titled), external project

**Publication**:
Where an article was published: the `publication` field, and the whole of the
article's catalogue row, since an article has no page to link to.
_Avoid_: paper (a link title), source

**Link title**:
The text a project link prints as: the `title` of one `links:` record. It is
printed verbatim, with no vocabulary and no capitalisation.
_Avoid_: label, key, kind

**Catalogue**:
The `/work/` table of every project in canonical order, and the per-category
tables beneath it.
_Avoid_: index, listing, projects page

**Catalogue row**:
One project's line in the catalogue: title, blurb, category and year.
_Avoid_: record, item

**Blurb**:
The opening paragraph after a project's title, used by its catalogue row and
its featured card.
_Avoid_: summary, excerpt

**Featured project**:
A project marked for the front page's card grid.
_Avoid_: highlighted, promoted

**Pinned project**:
A project with an order, placed above newer work in the catalogue.
_Avoid_: sticky, ordered project

**Career record**:
The narrow account of Jenny's working life at `/work/career/`, rendered from
`content/career/`.
_Avoid_: resume, CV, career page

**Career section**:
One of experience, volunteering, education or skills.
_Avoid_: tab, category (that word belongs to projects)

**Role**:
One job or volunteering position, written as one file and grouped with other
roles at the same employer or organisation.
_Avoid_: position, stint, job

**Qualification**:
One education entry: institution, degree, dates and an optional note.
_Avoid_: degree (that is one field), education entry

**Skills group**:
One bold-labelled line of `content/career/skills.md` and the skills listed
under it.
_Avoid_: skill category, skill set

**Career disclosure**:
One collapsible entry in the career record; its summary is the index line the
reader scans, and it opens without JavaScript.
_Avoid_: accordion, card, panel

**Identity**:
The name, tagline, location, email and links in `content/identity.sh`. The
footer prints the email and the location.
_Avoid_: site config, profile, settings

**Theme**:
The active palette, light or dark, chosen with the palette strip and stored in
the browser. Light is the default.
_Avoid_: colour scheme, mode, skin

**Palette strip**:
The seven 1x1 token squares in the header and footer. Both strips are the
theme switch, and a click turns them as a wheel onto the other palette.
_Avoid_: swatches

**Wheel**:
The temporary 3D drum the palette strip becomes during a turn: two seven-notch
palettes on a 105° arc, one turn apart.
_Avoid_: carousel, picker, ring

**Notch**:
One square on the wheel. Seven notches make a palette row, and the rows sit one
105° turn apart.
_Avoid_: face, swatch

**Sky**:
The pixelated, drifting background behind the sheet: clouds in both themes,
stars in the dark.
_Avoid_: background, canvas, gradient

**Star layer**:
The generated stars painted over the clear band of the dark sky. It is built
once per layout and seed, then twinkled by gain.
_Avoid_: starfield, particle layer

**Poster**:
The static image of the sky shown when the canvas cannot run: a light poster
and a dark poster.
_Avoid_: fallback image, still

**Share card**:
The image a link preview shows: the light poster's pixels written as a PNG at
build time, because a preview crawler does not render SVG or run JavaScript.
_Avoid_: preview image, thumbnail, og:image

**Description**:
The one line of prose a page hands to a link preview. On a project page it is
the blurb; every other page writes its own.
_Avoid_: summary, meta text, excerpt

**Route**:
The address a page is emitted at, as a directory with an `index.html`.
Distinct from its **Canonical URL**, which the page declares for itself.
_Avoid_: path, file location, permalink

**Canonical URL**:
The one address a page declares for itself: the site host and the route the
build emitted it at, which is also the address in the sitemap.
_Avoid_: permalink, page URL, link
