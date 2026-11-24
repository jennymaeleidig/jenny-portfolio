/**
 * The pixelated sky: the composition module.
 *
 * The field lives in ./sky-field.mjs, the star layer in ./sky-stars.mjs, the
 * bird layer in ./sky-birds.mjs, the tuning values in ./sky-config.mjs, and the
 * shared tone vocabulary in ./sky-tone.mjs. This module builds a press of them
 * into a sky scene and composes one frame by painting each layer through the
 * same interface.
 *
 * The optional star layer paints its own tints and twinkle over the clear
 * band, and the optional bird layer stamps its own birds over the sheet.
 *
 * The browser layer (assets/sky.js) is the only part that touches the DOM.
 *
 * Source (visual reference only, no code copied):
 *   Paper, "Paper Shaders: ultra-fast zero-dependency shaders",
 *   Apache-2.0, https://shaders.paper.design/
 *   Code: https://github.com/paper-design/shaders
 * The dither vocabulary here follows that library's look. Nothing from it is
 * vendored, so only the credit is owed. Its NOTICE file ("Powered by Paper
 * Shaders: https://shaders.paper.design") has to travel only if shader code
 * is ever copied in.
 */

import { SKY_DEFAULTS } from "./sky-config.mjs";
import { EVOLVE_SCALE_RATIO, build as buildField } from "./sky-field.mjs";
import { build as buildBirdLayer } from "./sky-birds.mjs";
import { build as buildStar } from "./sky-stars.mjs";
import { clamp01, rampAt, rampIndex, thresholds } from "./sky-tone.mjs";

export { SKY_DEFAULTS } from "./sky-config.mjs";
export { BIRD_INK, birdLayer, createBirdLayer } from "./sky-birds.mjs";
export {
  STAR_DIM,
  STAR_THRESHOLDS,
  STAR_TINTS,
  createStarLayer,
  updateStarGains,
} from "./sky-stars.mjs";

export {
  BAYER4,
  DARK_RAMP,
  RAMP,
  TRANSITION_MS,
  lerpColour,
  lerpRamp,
  rampAt,
  rampIndex,
  smoothstep,
  thresholds,
  toneIndex,
  transitionMix,
} from "./sky-tone.mjs";
export {
  fbm,
  hash,
  sampleEvolve,
  sampleField,
  valueNoise,
} from "./sky-field.mjs";

/** How far the sky may be slid up or down, in CSS px, either way. */
export const OFFSET_Y_LIMIT = 400;

/**
 * The viewport-to-frame layout the canvas and the poster share: a block size
 * snapped to whole device pixels, and the grid that covers the frame. A block
 * edge therefore lands on a device pixel rather than a fraction of one.
 */
export function frameLayout({
  width,
  height,
  dpr = 1,
  cell = SKY_DEFAULTS.cell,
}) {
  const cellPx = Math.max(1, Math.round(cell * dpr) / dpr);
  return {
    cellPx,
    cols: Math.max(1, Math.ceil(width / cellPx)),
    rows: Math.max(1, Math.ceil(height / cellPx)),
  };
}

/**
 * One sky scene: the field for a frame, plus the lift in cells that goes with
 * it. The canvas and the poster both build their frame here, so the fallback
 * is built the same way as the canvas at time 0.
 */
export function createScene({ config = SKY_DEFAULTS, cols, rows, cellPx }) {
  return {
    field: buildField({
      cols,
      rows,
      cellPx,
      config,
      // Sky above and below the window, so the lift can pan without repeating.
      margin: Math.ceil(OFFSET_Y_LIMIT / cellPx),
    }),
    starLayer: buildStar({ cols, rows, cellPx, config }),
    birdLayer: buildBirdLayer({ cols, rows, cellPx, config }),
    offsetY: config.offsetY / cellPx,
  };
}

/**
 * The field layer for an explicit scale and seed. `build` in sky-field.mjs is
 * the layer interface; this keeps the options shape the poster and tests use.
 */
export function createField({
  cols,
  rows,
  cellPx,
  scale,
  seed = SKY_DEFAULTS.seed,
  evolveScale = scale * EVOLVE_SCALE_RATIO,
  margin = 0,
}) {
  return buildField({ cols, rows, cellPx, scale, seed, evolveScale, margin });
}

/**
 * Compose one frame: build the shared state, then let each layer paint into it.
 *
 * `offset` is the drift in cells; `time` is seconds of animation. `offsetY`
 * pans the whole sky up (+) or down (-), also in cells. `mix` crosses the sky
 * between the light ramp (0) and the dark ramp (1); `dark` is the two-state
 * shorthand for it. The star layer fades in with the same mix, blended over
 * the clear band's own colour. The bird layer fades out on that mix.
 */
export function renderFrame({
  field,
  out = undefined,
  bands = undefined,
  config = SKY_DEFAULTS,
  time = 0,
  offset = 0,
  offsetY = 0,
  mix = undefined,
  dark = false,
  starLayer = null,
  birdLayer = null,
}) {
  const { cols, rows } = field;
  const pixels = out ?? new Uint8ClampedArray(cols * rows * 4);

  const blend = mix === undefined ? Number(dark) : clamp01(mix);
  const ramp = rampAt(blend);
  const tones = Math.min(ramp.length, Math.max(2, config.tones | 0));
  const stars = blend > 0 && starLayer ? starLayer : null;
  const birdLayerState = birdLayer && blend < 1 ? birdLayer : null;
  // The bird layer and the stars need the tone each block landed on. Sharing
  // the caller's bands buffer keeps this one sheet of per-frame state.
  const bandBuffer =
    bands ??
    (stars || birdLayerState ? new Uint8Array(cols * rows) : undefined);

  const frame = {
    pixels,
    cols,
    rows,
    bands: bandBuffer,
    config,
    time,
    blend,
    ramp,
    tones,
    bandThresholds: thresholds(tones, config.stark),
    dither: config.dither / 100,
    clearColour: ramp[rampIndex(0, tones)],
    offset,
    offsetY,
  };

  field.paint(frame);
  if (stars) stars.paint(frame);

  // The bird layer, painted per block after the sheet. Far-layer birds land
  // only on clear-sky blocks, so the cloud bands occlude them the same way they
  // occlude the stars; near-layer birds ink over anything. Both positions
  // snap to whole blocks, so a bird advances a block at a time and is
  // pixel-identical between snaps — the same hold the twinkle uses.
  if (birdLayerState) birdLayerState.paint(frame);

  return pixels;
}
