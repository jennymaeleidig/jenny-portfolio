/**
 * The sky's star layer: its jittered layout, the twinkle state machine, and
 * the tinting pass over the clear band.
 *
 * The layer is built once per layout and seed, then paints itself into the
 * shared frame state: it advances its own twinkle and tints its own stars, so
 * no other layer or the composition reads its arrays.
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
 */

import { SKY_DEFAULTS } from "./sky-config.mjs";
import { hash } from "./sky-field.mjs";
import { BAYER4, clamp01, lerpColour, toneIndex } from "./sky-tone.mjs";

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
 * block plus with dim corners; the Bayer dither in paint decides which of
 * those blocks actually paint.
 */
export function build({ cols, rows, cellPx, config = SKY_DEFAULTS }) {
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

  const layer = { peak, tint, owner, stars };

  layer.paint = (frame) => paintStars(layer, frame);

  return layer;
}

/** The star layer's stable name for the same build. */
export function createStarLayer(options) {
  return build(options);
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
export function updateStarGains(layer, config = SKY_DEFAULTS, time = 0) {
  const amount = clamp01(config.starTwinkle / 100);
  const speed = Math.max(0.01, config.starTwinkleSpeed / 100);
  const minimum = config.starTwinkleSize;
  const t = time * speed;
  const TAU = Math.PI * 2;
  const mid = 1 - amount * 0.5;
  const dim = 1 - amount * 0.9;
  const levels = [1, mid, dim];

  for (let i = 0; i < layer.stars.length; i += 1) {
    const star = layer.stars[i];
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

  return layer;
}

/**
 * Tint the stars over the clear band. The cloud band's own edge is already
 * dithered, so stars dissolve into it.
 */
function paintStars(layer, frame) {
  updateStarGains(layer, frame.config, frame.time);

  const { pixels, cols, rows, bands, clearColour, blend, config } = frame;
  const starDither = config.starDither / 100;

  for (let y = 0; y < rows; y += 1) {
    const ditherRow = (y & 3) * 4;
    for (let x = 0; x < cols; x += 1) {
      const index = y * cols + x;
      if (bands[index] !== 0) continue;

      const owner = layer.owner[index];
      if (owner < 0) continue;

      const value = layer.peak[index] * layer.stars[owner].gain;
      const level = toneIndex(
        value,
        STAR_THRESHOLDS,
        starDither,
        BAYER4[ditherRow + (x & 3)],
      );
      let starColour = null;
      if (level === 2) starColour = STAR_TINTS[layer.tint[index]];
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
