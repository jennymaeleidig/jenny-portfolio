/**
 * The pixelated sky: the composition module.
 *
 * The field lives in ./sky-field.mjs, the star layer in ./sky-stars.mjs, the
 * tuning values in ./sky-config.mjs, and the shared tone vocabulary in
 * ./sky-tone.mjs. This module builds a press of them into a sky scene and
 * composes one frame by painting each layer through the same interface.
 *
 * The optional star layer paints its own tints and twinkle over the clear
 * band.
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
import { build as buildField, hash } from "./sky-field.mjs";
import { build as buildStar } from "./sky-stars.mjs";
import {
  BAYER4,
  clamp01,
  lerpColour,
  rampAt,
  rampIndex,
  thresholds,
} from "./sky-tone.mjs";

export { SKY_DEFAULTS } from "./sky-config.mjs";
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
 * The birds' ink: the light theme's ink token, flat in both layers. Depth
 * reads through scale, speed and occlusion, never through tone.
 */
export const BIRD_INK = Object.freeze([20, 20, 15]); // #14140f

/**
 * The flock's shared constants: the beat-unit conversion, the hash lattice,
 * and the per-bird roll offsets. Every tunable value lives in the config;
 * only what the drawing itself needs lives here.
 */

/** Converts a beat rate in flaps per minute to cycles per second. */
function flapHz(birdFlap) {
  return Math.max(0, birdFlap) / 60;
}

const BIRD_PERIOD = 1 << 30;

function birdHash(i, layer, seed, offset) {
  return hash(i, layer * 16 + offset, (seed + offset) | 0, BIRD_PERIOD);
}

/**
 * One layer's settings, read from the config under its `l1`/`l2` prefix. The
 * two layers are independent in every respect, so each keeps its own size,
 * speed, spacing and wing shaping.
 */
export function birdLayer(config, layerIndex) {
  const p = layerIndex === 0 ? "l1" : "l2";
  return {
    count: Math.max(0, Math.round(config[`${p}Count`])),
    scale: Math.max(2, config[`${p}Scale`]),
    scaleJitter: config[`${p}ScaleJitter`],
    speed: config[`${p}Speed`],
    speedJitter: config[`${p}SpeedJitter`],
    gap: config[`${p}Gap`],
    flap: config[`${p}Flap`],
    flapJitter: config[`${p}FlapJitter`],
    droopMax: config[`${p}DroopMax`],
    droopMin: config[`${p}DroopMin`],
    flapSteps: config[`${p}FlapSteps`],
    flapEase: config[`${p}FlapEase`],
    invert: config[`${p}Invert`],
    lift: config[`${p}Lift`],
    y: config[`${p}Y`],
    ySpread: config[`${p}YSpread`],
    body: config[`${p}Body`],
    spread: config[`${p}Spread`],
  };
}

/**
 * The flock, built once per layout and seed like the star layer. The per-bird
 * roll decides scale, speed, altitude, flap phase and entry delay, all from
 * the shared hash. Geometry is fixed here; the beat values are read from the
 * config at paint time, so they tune without a rebuild.
 */
export function createBirdLayer({ cols, rows, cellPx, config = SKY_DEFAULTS }) {
  if (config.birds <= 0) return null;
  const seed = (config.seed ^ config.birdSeed ^ 0x51ed270b) >>> 0;
  const birds = [];

  for (let layerIndex = 0; layerIndex < 2; layerIndex += 1) {
    const params = birdLayer(config, layerIndex);
    if (params.count === 0) continue;
    const wingBase = Math.max(2, params.scale / cellPx);
    const speedBase = params.speed / cellPx;
    // A layer is depth, not altitude: every bird in either layer may start
    // at any height on the sheet, and keeps that height as it flies.
    const yCentre = rows / 2 + (params.y / 100) * rows;

    for (let i = 0; i < params.count; i += 1) {
      const scaleRoll = birdHash(i, layerIndex, seed, 0);
      const altRoll = birdHash(i, layerIndex, seed, 1);
      const speedRoll = birdHash(i, layerIndex, seed, 2);
      const offsetRoll = birdHash(i, layerIndex, seed, 3);
      const phase = birdHash(i, layerIndex, seed, 4);
      const flapRoll = birdHash(i, layerIndex, seed, 5);
      const wing = wingBase * (1 + (scaleRoll - 0.5) * 2 * params.scaleJitter);
      const span = cols + 4 * wing + params.gap * cols;
      birds.push({
        layer: layerIndex,
        wing,
        speed: speedBase * (1 + (speedRoll - 0.5) * 2 * params.speedJitter),
        // Altitude anywhere across the share of the canvas this layer uses.
        row: Math.min(
          rows - 1,
          Math.max(
            0,
            Math.round(
              yCentre + (altRoll - 0.5) * (params.ySpread / 100) * rows,
            ),
          ),
        ),
        phase,
        // Per-bird beat variance: no two birds flap at the same rate, so the
        // flock never falls into a shared rhythm even mid-flight.
        flapVariance: 1 + (flapRoll - 0.5) * 2 * params.flapJitter,
        span,
        // Where this bird sits in its own pass, as a distance along the span.
        // The flock is spread evenly over the pass with half a slot of jitter,
        // so every bird is aloft at once and the count is what sets density.
        // Adding a bird never stacks it on another, and a bird that finishes
        // its pass reappears off-screen right rather than popping mid-sky.
        offset:
          ((i + 0.5 * (offsetRoll - 0.5)) / Math.max(1, params.count)) * span,
      });
    }
  }

  return { birds };
}

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
    birdLayer: createBirdLayer({ cols, rows, cellPx, config }),
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
  evolveScale,
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
 * the clear band's own colour. The flock fades out on that mix.
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
  const flock = birdLayer && blend < 1 ? birdLayer : null;
  // The flock and the stars need the tone each block landed on. Sharing the
  // caller's bands buffer keeps this one sheet of per-frame state.
  const bandBuffer =
    bands ?? (stars || flock ? new Uint8Array(cols * rows) : undefined);

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

  // The flock, painted per block after the sheet. Far-layer birds land only
  // on clear-sky blocks, so the cloud bands occlude them the same way they
  // occlude the stars; near-layer birds ink over anything. Both positions
  // snap to whole blocks, so a bird advances a block at a time and is
  // pixel-identical between snaps — the same hold the twinkle uses.
  if (flock) paintBirds(flock, frame);

  return pixels;
}

/**
 * One bird's wing pair: a sqrt body with the droop lerped by the flap.
 * Coordinates are wing-relative, so the shape is independent of size: `u` is
 * the offset across the wing span, -1 at one tip and +1 at the other.
 */
function wingHeight(u, droop, body, spread) {
  return body * Math.sqrt(Math.abs(u * spread)) - droop * u * u;
}

/** The wing's slope at `u`, clamped at the cusp and again by `maxSlope`. */
function wingSlope(u, droop, body, spread, maxSlope) {
  // Clamped near the u=0 cusp, then again by maxSlope: the unclamped slope
  // would balloon the junction band and flicker it on every flap step.
  const ax = Math.max(Math.abs(u), 1e-3);
  const slope =
    (Math.sign(u) * (body * Math.sqrt(spread))) / (2 * Math.sqrt(ax)) -
    2 * droop * u;
  return Math.max(-maxSlope, Math.min(maxSlope, slope));
}

/**
 * Stamp the flock onto the painted sheet. One shared phase per bird drives
 * both the droop and the bob, so they cannot drift apart; the bob amplitude
 * is derived from the wing (a bigger wing lifts more) and rides the power
 * stroke. Coverage is an NxN sample grid per block, thresholded through the
 * same ordered dither the tone bands use.
 */
function paintBirds(flock, frame) {
  const { pixels, bands: birdBands, cols, rows, config, time, blend } = frame;
  const visible = 1 - clamp01(blend);
  const thickness = config.birdThickness;
  const dither = config.birdDither;
  const n = Math.max(1, Math.round(config.birdCovSteps));
  const invN = 1 / n;
  const denom = n * n;
  const maxSlope = config.birdMaxSlope;
  const snap = config.birdSnap >= 0.5;
  const TAU = Math.PI * 2;
  const params = [birdLayer(config, 0), birdLayer(config, 1)];

  for (const bird of flock.birds) {
    const layer = params[bird.layer];
    const back = bird.layer === 1;
    const wing = bird.wing;

    // Drift: right to left, wrapping off-screen left back to off-screen
    // right, so a bird is always somewhere on its own pass and never appears
    // mid-sky. Before its entry offset it sits further off-screen right, so
    // the whole flock enters from the same edge.
    const raw = time * bird.speed + bird.offset;
    let bx = cols + 2 * wing - (raw % bird.span);

    // Flap: eased sine at this bird's rolled rate, held in steps, one phase
    // for droop and bob alike.
    const beat = time * flapHz(layer.flap) * bird.flapVariance + bird.phase;
    let flap = 0.5 + 0.5 * Math.sin(beat * TAU);
    flap = Math.pow(flap, layer.flapEase);
    if (layer.invert >= 0.5) flap = 1 - flap;
    const steps = Math.max(1, Math.round(layer.flapSteps));
    flap = Math.round(flap * steps) / steps;
    const droop = layer.droopMax + (layer.droopMin - layer.droopMax) * flap;

    // The derived bob: amplitude follows the wing, sign follows the beat.
    let by = bird.row - (layer.lift / 100) * wing * flap;

    // Whole-block snapping: the silhouette is pixel-identical between steps,
    // so drift and bob advance a block at a time instead of re-cutting every
    // block's coverage each frame.
    if (snap) {
      bx = Math.round(bx);
      by = Math.round(by);
    }

    const tol = thickness;
    const yMax = wing * (layer.body * Math.sqrt(layer.spread) + tol * 2);
    const yLo = Math.max(0, Math.floor(by - yMax));
    const yHi = Math.min(rows - 1, Math.ceil(by + yMax));
    const xLo = Math.max(0, Math.floor(bx - wing));
    const xHi = Math.min(cols - 1, Math.ceil(bx + wing));

    for (let y = yLo; y <= yHi; y += 1) {
      const ditherRow = (y & 3) * 4;
      for (let x = xLo; x <= xHi; x += 1) {
        // The cloud bands cover the far flock, exactly as they cover stars.
        if (back && birdBands[y * cols + x] > 0) continue;

        let hits = 0;
        for (let sy = 0; sy < n; sy += 1) {
          for (let sx = 0; sx < n; sx += 1) {
            const u = (x + (sx + 0.5) * invN - bx) / wing;
            // Screen rows grow downward; the wing's own y grows upward.
            const v = (by - (y + (sy + 0.5) * invN)) / wing;
            if (Math.abs(u) > 1) continue;
            const slope = wingSlope(
              u,
              droop,
              layer.body,
              layer.spread,
              maxSlope,
            );
            const width = tol * Math.sqrt(1 + slope * slope);
            const wingY = wingHeight(u, droop, layer.body, layer.spread);
            if (Math.abs(v - wingY) < width) hits += 1;
          }
        }

        const bayer = BAYER4[ditherRow + (x & 3)];
        if (hits / denom + dither * bayer < 0.5) continue;

        const p = (y * cols + x) * 4;
        const ink = lerpColour(
          [pixels[p], pixels[p + 1], pixels[p + 2]],
          BIRD_INK,
          visible,
        );
        pixels[p] = ink[0];
        pixels[p + 1] = ink[1];
        pixels[p + 2] = ink[2];
      }
    }
  }
}
