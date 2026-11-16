# Dark-sky starfield: what the sources do, what we should do

Scope: replace the blue sky with stars on the existing CPU pipeline — integer
hash → value noise → fBm → `toneIndex` → 4×4 Bayer, one block per ~2 CSS px
(`assets/sky-core.mjs:28`, `:92`, `:371`). Clouds keep their generation; stars do
not scroll; a new seed per page load already exists (`assets/sky.js`).

## 1. What the three sources do

### 1a. xcv145336, "[2D] Starfield in the sky with scrolling effect ver 1.0"

<https://godotshaders.com/shader/2d-starfield-in-the-sky-with-scrolling-effect-ver-1-0/>

**Placement — jittered grid, one star per cell, four layers.** Per layer
`layer_scale = exp((layer*2 + 1) * 0.3)` (defaults `density=150`,
`layer_parascale=2`), i.e. scales 1.35 / 2.46 / 4.48 / 8.17. It computes
`layer_st = st * layer_scale - TIME * layer_speed`, then `grid_id = floor(layer_st)`,
`grid_st = fract(layer_st)`. Each cell contains exactly one candidate at

```text
snow_pos = (0.5 + 0.3*sin(r*6.28 + TIME*star_horizontal_wave),
            0.5 + 0.2*cos(r*12.56))
```

so jitter is an ellipse of radius 0.3/0.2 — _not_ full-cell. Spacing stays close
to a lattice. Occupancy is 100%; density comes only from cell size.

**Size and brightness.** `snow_size = layer_size * 0.01 * (0.5 + 0.5*r)`
(linear in the hash), `brightness = 1 - layer*0.3`. So size is uniform-ish in
[0.5, 1] × the layer scale, and deeper layers are dimmer by construction.

**Shape.** A Gaussian core `exp(-d²/s²)` multiplied by a `1/x²` spike term whose
frequency is `0.8 - d*42`, then rotated over time. The author credits this to
source 3: "Star drawing formula:" links to the sparkling-star post.

**Twinkle.** `twinkle = (1 - e) + e * (sin(r*100 + t*0.3) * cos(r*120 + t*2.3))`
with `e = twinkle_effect` (0.6). A product of two sines, phase from the cell
hash. The product ranges over [-1, 1], so the multiplier can go negative; the
final `max(color, color + …)` clamps that away.

**Motion we must not copy.** Every layer is offset by `TIME * layer_speed`, and
`layer_speed` is scaled `1 + 0.3*layer` — parallax scrolling. Stars also sway
inside their cell (`star_horizontal_wave`).

**Dithering.** None. No palette; it blends arbitrary RGB via
`color = max(color + snowflake*brightness*colortype, color)` where `colortype`
is a per-cell random RGB.

**Licence.** Page footer: "The shader code and all code snippets in this post are
under CC0 license and can be used freely without the author's permission."
Implements CC0 1.0 (<https://creativecommons.org/publicdomain/zero/1.0/>).

### 1b. Joy-less, AnimatedStarfieldShader

<https://github.com/Joy-less/AnimatedStarfieldShader> ·
<https://raw.githubusercontent.com/Joy-less/AnimatedStarfieldShader/main/AnimatedStarfield.gdshader>

A port of 1a. README: "Based on [Starfield in the sky with scrolling effect] by
xcv145336." Same grid, same jitter constants, same twinkle product, same
per-cell RGB tint. Differences:

- `shader_type spatial`, `UV` instead of `SCREEN_UV`, `aspect_ratio` uniform.
- `density` is reused as the layer exponent, `layer_scale = exp((layer+1)*density)`
  (default 1.3), and `layer_parascale` is the layer _count_.
- **Pixelation is coordinate snapping**: `st = round(st * pixelate_count) /
pixelate_count` when `pixelate_enabled`. No ordered dither, no palette, no
  quantisation of brightness — it snaps the sample point and still blends
  continuously.

**Licence.** `LICENSE.md`: "MIT License / Copyright (c) 2025 Joyless". MIT
(<https://opensource.org/license/mit>). Because upstream 1a is CC0, the MIT
grant is clean.

### 1c. xcv145336, "[2D] Sparkling star effect" (page retitled ver 2.1)

<https://godotshaders.com/shader/2d-sparkling-star-effect-ver-2-0/>

Not a field. One sprite centred on `UV`, so it supplies a _shape and a time
function_, never placement or density.

- Shape: rotate `(UV-0.5)*scale` (7500) by `TIME*rotate_speed`, Gaussian envelope
  `M = exp(-L²·decay²/scale)` with a hard cut `M = M < 0.05 ? 0 : M`, then the
  `getI` spike product (1/x² in each axis).
- Twinkle: `f = base + disturbance*(3 sin t + 2 cos 4t + 6 sin 2t + 1 sin 3t)`.
  Four harmonics, incommensurate-looking, so it sparkles rather than pulses.
  `stop_shine` freezes `f` at `frequency_base`.
- No dither, no palette, no placement, no scrolling.

**Licence.** Same CC0 1.0 footer as 1a.

### Licence summary

| Source | Licence | Obligation if we copied code         |
| ------ | ------- | ------------------------------------ |
| 1a     | CC0 1.0 | none (attribution optional)          |
| 1b     | MIT     | ship licence text + copyright notice |
| 1c     | CC0 1.0 | none                                 |

Godot Shaders' site policy (<https://godotshaders.com/license/>) lets authors
pick CC0, MIT or GPLv3 per post, and states the featured image, screenshots and
videos are excluded from the code licence. Code is safe; screenshots are not ours to reuse. We copy no GLSL —
only techniques, which this note credits.

## 2. What we should do

### 2.1 Feed stars into the scalar, before the quantiser

Do **not** stamp star colours over the finished ImageData. Add star intensity to
the field value and let the existing `toneIndex` (`assets/sky-core.mjs:371`)
choose a palette entry:

```js
value = cloudValue(x, y) + starValue[x, y]     // 0..1, clamped
band  = toneIndex(value, thresholds, dither, BAYER4[(y&3)*4 + (x&3)])
```

This buys three things at once: the 4-tone ramp, the ordered dither, and the
2 px block grid. A star cannot be smoother than a block because the block is the
sample. Requirement: the dark ramp must be monotonic dark→light with the
lightest band reserved for star cores, otherwise a star sitting on the brightest
cloud band is invisible (which is also the correct occlusion behaviour).

### 2.2 Placement A — jittered grid, built once into a star list

Closest to the sources, but full-cell jitter and a real size distribution.

```js
CELL = 14                                     // blocks ≈ 28 CSS px
for cy in 0..ceil(rows/CELL), cx in 0..ceil(cols/CELL):
  h  = hash(cx, cy, starSeed)                 // integer hash, not sin
  if h > 0.62: continue                       // ~38% of cells empty
  jx = hash(cx, cy, starSeed+1); jy = hash(cx, cy, starSeed+2)
  px = (cx + 0.1 + 0.8*jx) * CELL             // full-cell jitter
  py = (cy + 0.1 + 0.8*jy) * CELL
  u  = hash(cx, cy, starSeed+3)
  size = u < 0.74 ? 1 : u < 0.94 ? 2 : 3
  push {px, py, size, phase: hash(...,+4)*TAU, twinkles: size >= 2}
```

Cost: `cols*rows / CELL²` ≈ 0.5% of blocks, once per layout — not per frame.
Jitter of 0.8 of the cell risks two neighbours landing close (clumping); 0.5–0.6
is the conservative middle. Empty cells are what stop it reading as graph paper;
the sources use 100% occupancy, which is why their layers need strong size
falloff to look varied.

### 2.3 Placement B — sparse layered hash fields, no list

Genuinely different: no candidate list, three independent densities at three
lattice pitches. Cheapest correct form is per-block against the _nearest_ node
only, not a loop over nodes:

```text
for each block (x, y):
  v = 0
  for L in 0..2:
    q   = LATTICE[L]                  // 5, 17, 41 blocks
    gx  = floor(x/q); gy = floor(y/q)
    h   = hash(gx, gy, starSeed + L*97)
    if h > DENSITY[L]: continue       // 0.35, 0.12, 0.03
    // node centre jittered by 0.7 of the cell, in block units
    cx  = (gx + 0.15 + 0.7*hash(gx,gy,starSeed+L*97+1)) * q
    cy  = (gy + 0.15 + 0.7*hash(gx,gy,starSeed+L*97+2)) * q
    r   = RADIUS[L]                   // 1.1, 1.8, 2.6 blocks
    v  += exp(-((x+0.5-cx)² + (y+0.5-cy)²) / (2r²)) * PEAK[L]
  starValue[x,y] = v
```

Trade-off: ~3 hashes and 3 exp per block per rebuild, not per frame. Density is
Bernoulli per cell → Poisson clumping, which reads as real sky at low density and
as blotches at high density. Layers give size variance without parallax: use
_pitch_ and _peak_, never a scroll offset.

Recommendation: A for the star list (varied, controllable, cheap to twinkle), B
only if a static field with no list is preferred. A also makes twinkle a
per-star update instead of a whole-buffer recompute.

### 2.4 Rendering a star of 1–3 blocks

Sample a Gaussian at block centres with a per-star sub-block offset
(`±0.35` block) so footprints differ:

- size 1 → peak 0.55–0.75, one block, sometimes a Bayer-only neighbour.
- size 2 → σ ≈ 0.6, a two-block diagonal.
- size 3 → σ ≈ 0.9, plus-shaped core; corners get intensity ≈ 0.2 and therefore
  only appear where `BAYER4` is below threshold — a ragged 3×3, never a square.

Brightness couples to size (bigger = brighter), which is what makes the field
read as depth rather than as density.

### 2.5 Twinkle curve 1 — harmonic sum (after 1c)

```text
i(t) = 0.55 + 0.22*sin(TAU*t/7.3 + p1)
            + 0.12*sin(TAU*t/3.1 + p2)
            + 0.07*sin(TAU*t/11.7 + p3)
```

Incommensurate periods mean no visible loop. Peak-to-peak ≈ 0.8, so a bright star
visits 3 bands. Cost: 3 `sin` per twinkling star per update — a few hundred calls,
negligible. Apply to size ≥ 2 only; size-1 stars stay fixed (the ask allows
twinkling of larger stars).

### 2.6 Twinkle curve 2 — quantised hash hold

```js
k     = floor(t / HOLD)                     // HOLD 0.8–1.4 s
level = 1 + floor(hash(starId, k, starSeed) * 3)   // 3 discrete levels
```

Deterministic, ~zero cost, and it looks like 8-bit blinking rather than a
smooth pulse. Downside: abrupt by design, and `k` must be derived from a clamped
clock (see pitfalls) or a stalled tab resumes mid-jump. Good for the faint
majority; keep curve 1 for the handful of hero stars.

**Rejected:** the product-of-sines from 1a/1b. Cheap, but symmetric and
fast (2.3 rad/s default) — every star flutters at a similar rate and none has a
rest state.

### 2.7 Dithering, quantisation, and flicker

- The star sprite is a continuous intensity sampled on the block grid. There is
  no anti-aliasing step to undo — the block _is_ the pixel.
- Edge blocks are resolved by `BAYER4`, already indexed by `(y&3, x&3)`
  (`assets/sky-core.mjs:92`). Because the pattern is spatial and static, a star
  edge is a fixed checker/diagonal, not a shimmer.
- Twinkle must be quantised too. Feeding continuous `i(t)` into the quantiser
  makes a 2×2 star boil as `i` crosses a threshold: one block flips, then
  another. Two cures: (a) hold the level (`k` above) so crossings are rare; (b)
  hysteresis — keep the current level until `i` exceeds the band edge by ±0.06.
  Both are per-star state, a few bytes.
- Never randomise the dither per frame. `BAYER4` is a function of block
  coordinates only.
- Clamp the twinkle floor at the star's base band so "dim" means dim, not gone.

## 3. Pitfalls

**Repeat at the field period.** `createField` sets
`periodX = round(width*cellPx/scale)` (`assets/sky-core.mjs:261`) and samples in
lattice units; stars keyed to that lattice repeat every `periodX` blocks and slide
whenever `width` changes. Anchor stars in CSS pixels on a virtual plane whose
origin is the document, and hash integer block coordinates from that origin.

**Popping on resize.** `assets/sky.js` reseeds only on page load, so the seed is
stable — but star positions derived from `cols`/`rows` are not. Hash
`floor(cssX / cellPx)` from a fixed origin; a height-only change (mobile URL bar)
then moves nothing.

**Twinkle aliasing.** `maxFps` is 60 (`assets/sky-core.mjs:85`,
`assets/sky.js:134`); a 2 Hz twinkle is 30 samples per cycle at 60 fps but 15 at
30 fps, and a resumed tab delivers one huge delta. Drive twinkle from a clock
whose delta is clamped (≤100 ms) and keep angular rates ≤ ~2 rad/s.

**Stars inside clouds.** With the additive model, a star over the top band is
just the top band — invisible. That is occlusion, but it pops at the cloud edge;
dither the _visibility_ threshold with the same Bayer matrix, or attenuate star
peak by cloud band rather than culling.

**Mobile cost.** `renderFrame` is already O(cols·rows) at ~82k blocks for a
390×844 viewport at 2 px. Adding three hashes per block per frame is a material
regression; adding 400 stars × ≤9 block writes is not. Precompute the star field
once per layout, keep `starPeak: Float32Array`, `starId: Int16Array`, and a
per-star `gain[]`, and touch only `gain[]` per frame.

**Reduced motion.** `assets/sky.js:47` already skips the loop and draws one frame
when `prefers-reduced-motion: reduce`. Draw that frame at `t = 0` (or with
twinkle frozen at each star's hash-chosen level) so the still image has stars at
a sensible brightness rather than all mid-transition.

## 4. Open questions

1. Does the dark ramp keep 4 tones, and which index is "star"?
2. Do clouds attenuate stars, or only occlude them at the top band?
3. Star budget per viewport — 300, 800? Decide from a fixed screenshot.
