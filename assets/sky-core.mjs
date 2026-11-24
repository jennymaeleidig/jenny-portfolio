/**
 * The pixelated sky: the composition module.
 *
 * The field lives in ./sky-field.mjs and the shared tone vocabulary in
 * ./sky-tone.mjs. This module builds a press of them into a sky scene and
 * composes one frame by painting each layer through the same interface.
 *
 * The optional star layer paints its own tints over the clear band; its layout
 * and twinkle are tested in tests/sky.test.mjs.
 *
 * The browser layer (assets/sky.js) is the only part that touches the DOM.
 *
 * Star sources (idea-level re-implementation, no code copied; FORCE11):
 *   Joy-less. (2025). AnimatedStarfieldShader [Computer software]. GitHub.
 *     MIT, © 2025 Joyless.
 *     https://github.com/Joy-less/AnimatedStarfieldShader
 *   xcv145336. (2025). [2D] Sparkling star effect (Version 2.1) [Computer
 *     software]. Godot Shaders. CC0-1.0.
 *     https://godotshaders.com/shader/2d-sparkling-star-effect-ver-2-0/
 *   xcv145336. (2025). [2D] Starfield in the sky with scrolling effect (Version
 *     1.0) [Computer software]. Godot Shaders. CC0-1.0.
 *     https://godotshaders.com/shader/2d-starfield-in-the-sky-with-scrolling-effect-ver-1-0/
 * What carries over from them is ideas only: one star per cell, a random
 * twinkle phase, bright cores fading to dim extremities. No expression,
 * constant, or code block is copied, so only the credit is owed.
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

import { build as buildField, hash } from "./sky-field.mjs";
import {
  BAYER4,
  clamp01,
  lerpColour,
  rampAt,
  rampIndex,
  thresholds,
  toneIndex,
} from "./sky-tone.mjs";

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

/**
 * A star's two paints: its core, chosen per star, and the same dim edge for
 * both tints. The core colours are the dark palette's ink and accent-bright.
 */
export const STAR_TINTS = Object.freeze({
  1: Object.freeze([221, 208, 197]), // #DDD0C5, lighter white
  2: Object.freeze([248, 205, 112]), // #F8CD70, yellow
});
export const STAR_DIM = Object.freeze([192, 187, 172]); // #C0BBAC, sky-1

/** Star intensity bands: dim edge, then core. The dither straddles both. */
export const STAR_THRESHOLDS = Object.freeze([0.28, 0.5]);

/**
 * The tuning values the sky reads. Every value is a plain number so a caller
 * can compute an override; only `mode` is categorical.
 *
 * @typedef {object} SkyConfig
 * @property {string} mode
 * @property {number} cell
 * @property {number} tones
 * @property {number} scale
 * @property {number} gain
 * @property {number} speed
 * @property {number} falloff
 * @property {number} offsetY
 * @property {number} evolve
 * @property {number} evolveSpeed
 * @property {number} evolveScale
 * @property {number} evolveTilt
 * @property {number} warp
 * @property {number} warpSpeed
 * @property {number} dither
 * @property {number} sky
 * @property {number} stark
 * @property {number} seed
 * @property {number} maxFps
 * @property {number} starCell
 * @property {number} starDensity
 * @property {number} starMedium
 * @property {number} starLarge
 * @property {number} starYellow
 * @property {number} starBright
 * @property {number} starDither
 * @property {number} starTwinkle
 * @property {number} starTwinkleSpeed
 * @property {number} starTwinkleSize
 * @property {number} birds
 * @property {number} birdSeed
 * @property {number} birdThickness
 * @property {number} birdDither
 * @property {number} birdCovSteps
 * @property {number} birdMaxSlope
 * @property {number} birdSnap
 * @property {number} l1Count
 * @property {number} l1Scale
 * @property {number} l1ScaleJitter
 * @property {number} l1Speed
 * @property {number} l1SpeedJitter
 * @property {number} l1Gap
 * @property {number} l1Flap
 * @property {number} l1FlapJitter
 * @property {number} l1DroopMax
 * @property {number} l1DroopMin
 * @property {number} l1FlapSteps
 * @property {number} l1FlapEase
 * @property {number} l1Invert
 * @property {number} l1Lift
 * @property {number} l1Y
 * @property {number} l1YSpread
 * @property {number} l1Body
 * @property {number} l1Spread
 * @property {number} l2Count
 * @property {number} l2Scale
 * @property {number} l2ScaleJitter
 * @property {number} l2Speed
 * @property {number} l2SpeedJitter
 * @property {number} l2Gap
 * @property {number} l2Flap
 * @property {number} l2FlapJitter
 * @property {number} l2DroopMax
 * @property {number} l2DroopMin
 * @property {number} l2FlapSteps
 * @property {number} l2FlapEase
 * @property {number} l2Invert
 * @property {number} l2Lift
 * @property {number} l2Y
 * @property {number} l2YSpread
 * @property {number} l2Body
 * @property {number} l2Spread
 */

/**
 * The values the site ships with, as last tuned with the levers.
 *
 * @type {Readonly<SkyConfig>}
 */
export const SKY_DEFAULTS = Object.freeze({
  mode: "frame",
  cell: 2, // CSS px per block
  tones: 4,
  scale: 260, // noise feature size, CSS px
  gain: 2.1,
  speed: 20, // drift, CSS px/s
  falloff: 54, // how much coverage thins toward the bottom
  offsetY: -220, // pan the whole sky up (+) or down (-), CSS px
  evolve: 60,
  evolveSpeed: 30,
  evolveScale: 340, // flow feature size, CSS px
  evolveTilt: 13, // 0 drifts sideways only, 100 as steeply as it moves across
  warp: 51,
  warpSpeed: 9,
  dither: 20,
  sky: 87,
  stark: 77,
  seed: 12,
  maxFps: 24,
  starCell: 67, // jittered grid spacing, CSS px
  starDensity: 67, // share of cells that hold a star, %
  starMedium: 27, // share of stars two blocks across, %
  starLarge: 12, // share of stars shaped as the full plus with dim corners, %
  starYellow: 37, // share of stars with the yellow core, %
  starBright: 90, // peak intensity, %
  starDither: 24, // ordered dither on the star bands, %
  starTwinkle: 70, // how deep the dim step goes, %
  starTwinkleSpeed: 220, // multiplier on the twinkle speed, %
  starTwinkleSize: 2, // smallest size tier that twinkles (1-3)
  birds: 1, // the flock, 0 hides it entirely
  birdSeed: 19, // rerolls every per-bird value without rebuilding the sky
  birdThickness: 0.05, // wing half-width, relative to the wing cutoff
  birdDither: 0.06, // ordered dither on the wing edge
  birdCovSteps: 1, // coverage samples per block axis
  birdMaxSlope: 3, // wing-slope clamp at the junction cusp
  birdSnap: 1, // 1 advances whole blocks at a time; 0 is continuous
  // near layer: larger, faster, in front of the clouds
  l1Count: 3,
  l1Scale: 31, // wing cutoff, CSS px
  l1ScaleJitter: 0.32,
  l1Speed: 18, // drift, CSS px/s
  l1SpeedJitter: 0.3,
  l1Gap: 0.35, // respawn gap, share of the visible width
  l1Flap: 12, // wing beats per minute
  l1FlapJitter: 0.15, // ± share on the beat rate, per bird
  l1DroopMax: 0,
  l1DroopMin: 0.67,
  l1FlapSteps: 12,
  l1FlapEase: 1,
  l1Invert: 0,
  l1Lift: 8, // bob amplitude, % of the wing cutoff
  l1Y: 0, // altitude centre, % of height off the middle
  l1YSpread: 100, // share of the canvas height a bird may start in
  l1Body: 0.6, // sqrt hump height
  l1Spread: 0.8, // sqrt spread
  // far layer: smaller, slower, occluded by the clouds
  l2Count: 6,
  l2Scale: 14,
  l2ScaleJitter: 0.3,
  l2Speed: 8,
  l2SpeedJitter: 0.3,
  l2Gap: 0.5,
  l2Flap: 12,
  l2FlapJitter: 0.15,
  l2DroopMax: 0.12,
  l2DroopMin: 1,
  l2FlapSteps: 3,
  l2FlapEase: 1,
  l2Invert: 0,
  l2Lift: 8,
  l2Y: 0,
  l2YSpread: 100,
  l2Body: 0.62,
  l2Spread: 0.64,
});

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
    starLayer: createStarLayer({ cols, rows, cellPx, config }),
    birdLayer: createBirdLayer({ cols, rows, cellPx, config }),
    offsetY: config.offsetY / cellPx,
  };
}

const STAR_PERIOD = 1 << 30;
const TINT_WHITE = 1;
const TINT_YELLOW = 2;

function starHash(x, y, seed, offset) {
  return hash(x, y, (seed + offset) | 0, STAR_PERIOD);
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

/**
 * One star layer, built once per layout and seed.
 *
 * Stars sit on a jittered grid in block coordinates anchored at the viewport
 * origin, so a resize reveals new cells instead of moving or reseeding the
 * ones already on screen. A star is one block, a two-block pair, or a five
 * block plus with dim corners; the Bayer dither in renderFrame decides which
 * of those blocks actually paint.
 */
export function createStarLayer({ cols, rows, cellPx, config = SKY_DEFAULTS }) {
  const cell = Math.max(2, Math.round(config.starCell / cellPx));
  const seed = (config.seed ^ 0x9e3779b9) >>> 0;
  const peak = new Float32Array(cols * rows);
  const tint = new Uint8Array(cols * rows);
  const owner = new Int32Array(cols * rows).fill(-1);
  const stars = [];

  const densityPercent = clampPercent(config.starDensity);
  const largePercent = clampPercent(config.starLarge);
  const mediumPercent = clampPercent(config.starMedium);
  const yellowPercent = clampPercent(config.starYellow);
  const brightGain = clamp01(config.starBright / 100);

  const cellCols = Math.ceil(cols / cell);
  const cellRows = Math.ceil(rows / cell);

  /** Paint one block when it is brighter than whatever already owns it. */
  function paint(x, y, value, tintKey, starIndex) {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    const index = y * cols + x;
    if (value <= peak[index]) return;
    peak[index] = value;
    tint[index] = tintKey;
    owner[index] = starIndex;
  }

  for (let cy = 0; cy < cellRows; cy += 1) {
    for (let cx = 0; cx < cellCols; cx += 1) {
      if (starHash(cx, cy, seed, 0) * 100 >= densityPercent) continue;

      const bx = Math.min(
        cols - 1,
        Math.floor((cx + 0.15 + 0.7 * starHash(cx, cy, seed, 1)) * cell),
      );
      const by = Math.min(
        rows - 1,
        Math.floor((cy + 0.15 + 0.7 * starHash(cx, cy, seed, 2)) * cell),
      );

      const sizeRoll = starHash(cx, cy, seed, 3) * 100;
      let size = 1;
      if (sizeRoll < largePercent) size = 3;
      else if (sizeRoll < largePercent + mediumPercent) size = 2;
      const tintKey =
        starHash(cx, cy, seed, 4) * 100 < yellowPercent
          ? TINT_YELLOW
          : TINT_WHITE;
      const phase = starHash(cx, cy, seed, 5) * Math.PI * 2;
      const variance = 0.8 + 0.2 * starHash(cx, cy, seed, 6);
      const starIndex = stars.length;
      stars.push({ phase, size, gain: 1, level: 0, nextChange: 0 });

      const core = brightGain * variance;
      const edge = core * (0.5 + 0.1 * starHash(cx, cy, seed, 7));
      paint(bx, by, core, tintKey, starIndex);

      if (size === 2) {
        const direction = Math.floor(starHash(cx, cy, seed, 8) * 8);
        const dx = [1, -1, 0, 0, 1, 1, -1, -1][direction];
        const dy = [0, 0, 1, -1, 1, -1, 1, -1][direction];
        paint(bx + dx, by + dy, edge, tintKey, starIndex);
      } else if (size === 3) {
        paint(bx + 1, by, edge, tintKey, starIndex);
        paint(bx - 1, by, edge, tintKey, starIndex);
        paint(bx, by + 1, edge, tintKey, starIndex);
        paint(bx, by - 1, edge, tintKey, starIndex);
        const corner = edge * 0.52;
        for (const [dx, dy] of [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]) {
          paint(bx + dx, by + dy, corner, tintKey, starIndex);
        }
      }
    }
  }

  return { peak, tint, owner, stars };
}

/** How long a star holds one twinkle step, in scaled seconds. */
const TWINKLE_HOLD = 0.25;
const TWINKLE_DEADBAND = 0.005;

/**
 * Pick the next twinkle step, with a deadband around each boundary so a star
 * sitting near one cannot chatter between levels.
 */
function twinkleLevel(gain, mid, dim, current) {
  if (current === 0) return gain < mid - TWINKLE_DEADBAND ? 1 : 0;
  if (current === 1) {
    if (gain > mid + TWINKLE_DEADBAND) return 0;
    if (gain < dim - TWINKLE_DEADBAND) return 2;
    return 1;
  }
  return gain > dim + TWINKLE_DEADBAND ? 1 : 2;
}

/**
 * The twinkle: three incommensurate sines per star, so no loop is visible, and
 * only stars at or above `starTwinkleSize` move. The gain never exceeds one, so
 * a star dims from its resting brightness rather than blooming.
 *
 * The wave is quantised to three held steps. A continuous gain re-quantised
 * per block every frame makes a large star lose and regain its arms a block at
 * a time; stepping the whole star and holding the step keeps its shape.
 */
export function updateStarGains(starLayer, config = SKY_DEFAULTS, time = 0) {
  const amount = clamp01(config.starTwinkle / 100);
  const speed = Math.max(0.01, config.starTwinkleSpeed / 100);
  const minimum = config.starTwinkleSize;
  const t = time * speed;
  const TAU = Math.PI * 2;
  const mid = 1 - amount * 0.5;
  const dim = 1 - amount * 0.9;
  const levels = [1, mid, dim];

  for (let i = 0; i < starLayer.stars.length; i += 1) {
    const star = starLayer.stars[i];
    if (amount === 0 || star.size < minimum) {
      star.gain = 1;
      star.level = 0;
      star.nextChange = 0;
      continue;
    }
    const phase = star.phase;
    const wave =
      0.5 +
      0.22 * Math.sin((t * TAU) / 7.3 + phase) +
      0.14 * Math.sin((t * TAU) / 3.1 + phase * 1.7) +
      0.08 * Math.sin((t * TAU) / 11.7 + phase * 2.3);
    const target = twinkleLevel(
      1 - amount * (1 - clamp01(wave)),
      mid,
      dim,
      star.level,
    );
    if (target !== star.level && t >= star.nextChange) {
      star.level = target;
      star.nextChange = t + TWINKLE_HOLD;
    }
    star.gain = levels[star.level];
  }

  return starLayer;
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
  if (stars) {
    updateStarGains(stars, config, time);
    paintStars(stars, frame);
  }

  // The flock, painted per block after the sheet. Far-layer birds land only
  // on clear-sky blocks, so the cloud bands occlude them the same way they
  // occlude the stars; near-layer birds ink over anything. Both positions
  // snap to whole blocks, so a bird advances a block at a time and is
  // pixel-identical between snaps — the same hold the twinkle uses.
  if (flock) paintBirds(flock, frame);

  return pixels;
}

/**
 * Tint the stars over the clear band. The cloud band's own edge is already
 * dithered, so stars dissolve into it.
 */
function paintStars(stars, frame) {
  const { pixels, cols, rows, bands, clearColour, blend, config } = frame;
  const starDither = config.starDither / 100;

  for (let y = 0; y < rows; y += 1) {
    const ditherRow = (y & 3) * 4;
    for (let x = 0; x < cols; x += 1) {
      const index = y * cols + x;
      if (bands[index] !== 0) continue;

      const owner = stars.owner[index];
      if (owner < 0) continue;

      const value = stars.peak[index] * stars.stars[owner].gain;
      const level = toneIndex(
        value,
        STAR_THRESHOLDS,
        starDither,
        BAYER4[ditherRow + (x & 3)],
      );
      let starColour = null;
      if (level === 2) starColour = STAR_TINTS[stars.tint[index]];
      else if (level === 1) starColour = STAR_DIM;
      if (starColour === null) continue;

      // A star fades in over the clear band, so at a partial mix it is a
      // blend of its own tint and the band it sits on.
      const colour = lerpColour(clearColour, starColour, blend);
      const pixel = index * 4;
      pixels[pixel] = colour[0];
      pixels[pixel + 1] = colour[1];
      pixels[pixel + 2] = colour[2];
    }
  }
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
