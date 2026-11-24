/**
 * The sky's tone and ramp vocabulary: the two ramps, the crossing between
 * them, the tone thresholds and quantiser, and the ordered dither. The field,
 * the star layer and the bird layer all read from here, so none of them has to
 * import another layer.
 */

import { TURN_MS } from "./wheel-core.mjs";

/** The canonical sky ramp, lightest first. Matches the --sky-* tokens. */
export const RAMP = Object.freeze([
  Object.freeze([223, 229, 231]), // #DFE5E7
  Object.freeze([197, 213, 229]), // #C5D5E5
  Object.freeze([158, 200, 228]), // #9EC8E4
  Object.freeze([33, 87, 204]), // #2157CC
]);

/** The dark ramp, lightest first. Matches the dark --sky-* tokens. */
export const DARK_RAMP = Object.freeze([
  Object.freeze([192, 187, 172]), // #C0BBAC
  Object.freeze([119, 117, 120]), // #777578
  Object.freeze([65, 64, 66]), // #414042
  Object.freeze([27, 26, 22]), // #1B1A16
]);

/**
 * How long the sky takes to cross from the light ramp to the dark one, in
 * milliseconds. It is the palette strip's wheel turn, so the sky and the strip
 * finish as one gesture. The stylesheet carries the same time; a test pins it.
 */
export const TRANSITION_MS = TURN_MS;

export function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Smoothstep over [0, 1], clamped outside it. Zero slope at both ends, so a
 * crossing settles rather than starting and stopping hard. */
export function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

/**
 * The eased mix between two crossings, `elapsed` milliseconds in. At or past
 * `duration` the mix is exactly `to`, so a caller can end a flight by checking
 * the elapsed time. Passing the current mix as `from` makes an interrupted
 * crossing continue from where it was instead of restarting.
 */
export function transitionMix(from, to, elapsed, duration = TRANSITION_MS) {
  if (elapsed >= duration) return to;
  if (elapsed <= 0) return from;
  return from + (to - from) * smoothstep(elapsed / duration);
}

/** Lerp two colours channel by channel, rounded to whole 8-bit values. */
export function lerpColour(from, to, mix) {
  const t = clamp01(mix);
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

/** Lerp two ramps stop by stop, in RGB. Returns a fresh ramp. */
export function lerpRamp(from, to, mix) {
  return from.map((colour, index) => lerpColour(colour, to[index], mix));
}

/**
 * The ramp at a mix: the light ramp at 0, the dark ramp at 1, interpolated
 * between. The endpoints return the shipped constants, so a settled sky is
 * always painted from exactly the tokens it declares.
 */
export function rampAt(mix) {
  if (mix <= 0) return RAMP;
  if (mix >= 1) return DARK_RAMP;
  return lerpRamp(RAMP, DARK_RAMP, mix);
}

/**
 * 4x4 ordered dither, offset 1/32 below zero so thresholds sit between blocks
 * rather than on them.
 */
export const BAYER4 = Object.freeze([
  -0.5,
  0,
  -3 / 8,
  1 / 8,
  1 / 4,
  -1 / 4,
  3 / 8,
  -1 / 8,
  -5 / 16,
  3 / 16,
  -7 / 16,
  1 / 16,
  7 / 16,
  -3 / 16,
  5 / 16,
  -1 / 16,
]);

/**
 * Tone thresholds. The interior bands are narrowed by `stark`, so the middle
 * tone can go from a third of the field to almost nothing.
 */
export function thresholds(tones, stark) {
  const count = Math.max(2, tones | 0);
  const interior = Math.max(0, count - 2);
  const mid = (1 / 3) * (1 - stark / 100) + 0.02 * (stark / 100);
  const width = interior ? Math.min(mid, 0.96 / interior) : 0;
  const edge = (1 - interior * width) / 2;

  const bands = [edge];
  for (let i = 0; i < interior; i += 1) bands.push(width);
  bands.push(edge);

  const result = [];
  let accumulator = 0;
  for (let i = 0; i < bands.length - 1; i += 1) {
    accumulator += bands[i];
    result.push(accumulator);
  }
  return result;
}

/**
 * Quantise a scalar to a band index.
 *
 * The dither offset is bounded to one band either side of the undithered
 * result. Narrow bands would otherwise let a single sample cross two of them
 * as `dither` moves from 0 to 100, which is the sparkle this exists to stop.
 */
export function toneIndex(value, bandThresholds, dither = 0, bayer = 0) {
  const limit = bandThresholds.length;
  let base = 0;
  while (base < limit && value >= bandThresholds[base]) base += 1;

  const shifted = value + dither * bayer;
  let q = 0;
  while (q < limit && shifted >= bandThresholds[q]) q += 1;

  const lower = Math.max(0, base - 1);
  const upper = Math.min(limit, base + 1);
  return Math.max(lower, Math.min(upper, q));
}

/** Map a band index to a ramp index, lightest first. */
export function rampIndex(band, tones) {
  const levels = Math.min(RAMP.length, Math.max(2, tones | 0)) - 1;
  return Math.max(0, Math.min(RAMP.length - 1, levels - band));
}
