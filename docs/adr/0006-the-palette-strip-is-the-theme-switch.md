# The palette strip is the theme switch

The site has two themes, light and dark. The palette strip in the site header
and the identical strip in the footer are both the control. A click flips the
theme, and the choice is stored under `theme` in `localStorage`. The default is
light, and the site does not follow `prefers-color-scheme`.

An inline script in `<head>` reads the stored key and sets
`<html data-theme="dark">` before the stylesheet paints. It is the one classic
script on the site; every other script is a module.

The dark theme keeps the clouds and their generation. It adds stars, which are
painted only in the clear band of the dark sky. `assets/sky-poster-dark.svg` is
the no-canvas fallback. The share card stays the light poster, because a
preview crawler does not run JavaScript.

## Why

The palette strip was already page furniture: token squares overlaid on
the header and footer text lines. Making the strip the control adds no new
chrome and puts the switch at both ends of the sheet. The footer strip would be
confusing if it looked the same but did nothing.

Storing the choice keeps the theme across reloads and `nav.js`'s main swap. The
inline boot script applies it before paint, so a stored dark choice does not
flash light first. A module script would load too late for that. The exception
is narrow: the test allows exactly this script and still requires every other
script to be a module.

The site does not use `prefers-color-scheme`. The requested default is light,
and the switch is explicit. A system preference would make the first visit
depend on the operating system rather than the site.

The share card is one image for every visitor. A crawler cannot read
`localStorage` or choose a palette, so a theme-specific card would not make
previews theme-aware. The light poster is the stable card.

## The crossing

Switching themes fades rather than cuts. The sky lerps its colour ramp from
the light stops to the dark stops and re-quantises the bands each frame, so
every frame mid-crossing is still valid banded, dithered pixel art. The page
tokens are registered `<color>` custom properties and transition over the same
time. The clear band darkens and the stars fade in with it.

The crossing takes one wheel turn (`TURN_MS`, 640ms, preceded by smoothstep),
because the strip is already turning on the click. Two motions of different
lengths would read as two events. The sky holds for one frame before it starts:
the strip stamps its wheel's clock in a frame callback rather than in the click
handler, and the token fade begins at the next style change, so the frame of
wait is what puts all three on the same clock.

A crossing re-targets rather than restarts: a second click takes the current
mix as its origin, so interrupting never pops. Reduced motion, a hidden tab or
a sky out of view resolve the crossing in one frame instead of animating it.
Browsers that cannot register a custom property keep the instant swap, and the
boot script adds the `theme-fades` class only where registering works — an
unregistered property would cut the page over half-way through the fade.

## Consequences

- `assets/theme-core.mjs` owns the storage key and the dark token. The boot
  script in `layouts/shell.sh` repeats the two literals, and a test fails if
  they drift.
- `assets/theme.js` syncs both strips from `<html data-theme>`. `nav.js` asks it
  to re-sync after replacing the header.
- `assets/sky-poster.svg` and `assets/sky-poster-dark.svg` are both generated
  from `SKY_DEFAULTS`; both metadata hashes are tested.
- The inline boot script is an allowed classic script in `tests/reading.test.mjs`.
  Every other script stays a module.
- If `localStorage` is blocked, the choice still applies for the page and the
  next page falls back to light.
- Printing resets the light palette and hides the sky.
- `assets/sky-core.mjs` owns the crossing's duration (`TRANSITION_MS`, from
  `TURN_MS`), its easing (`smoothstep`) and the ramp lerp. The stylesheet
  repeats the duration and the equivalent cubic bezier; a test fails if they
  drift.

## Rejected alternatives

- **Follow `prefers-color-scheme`.** It makes the first visit depend on the
  operating system and contradicts the light default.
- **Add a separate theme button.** The strip already marks the palette and
  needs no extra furniture.
- **Put the switch only in the header.** The footer strip would still look
  interactive, and a reader at the bottom would have to scroll back up.
- **Load the theme from a module script.** Modules are deferred, so a stored
  dark theme would paint light first.
- **Make the share card theme-specific.** Preview crawlers do not run the
  switch, so the card cannot know which theme to use.
- **Store the theme in a cookie.** It would be sent to the server on every
  request, and the static site has no use for it.
- **Crossfade two finished skies.** Mixing two dithered images blurs the bands
  and puts colours from neither palette on screen. Lerping the ramp keeps the
  dither and the banding intact.
