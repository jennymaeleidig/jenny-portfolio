/**
 * The palette strip's turn, as pure functions.
 *
 * The strip is a two-position drum: each palette is seven notches, adjacent
 * notches are 15 degrees apart, and the two palettes sit one 105 degree turn
 * from each other. Only the central seven notches face the viewer; the wheel
 * carries fourteen.
 *
 * The browser layer (assets/theme.js) owns the DOM, the clock and reduced
 * motion. This module owns the geometry and the timeline, so both can be
 * sampled without a browser.
 */

/** The notches in one palette row. */
export const NOTCH_COUNT = 7;

/** The angle between adjacent notches, not 360 / 7. */
export const ANGLE_PER_NOTCH = 15;

/** The visible arc: seven notches at 15 degrees each. */
export const ARC = NOTCH_COUNT * ANGLE_PER_NOTCH;

/** The viewport's perspective, in pixels. */
export const PERSPECTIVE = 900;

/** How far the stage recedes at the deepest point of the pinch, in pixels. */
export const PINCH_DEPTH = 12;

/** The pinch, rotation and settle phases of one turn, in milliseconds. */
export const PINCH_MS = 137;
export const ROTATE_MS = 320;
export const SETTLE_MS = 183;

/** One turn's interpolated motion, before the flat frames at each end. */
export const TURN_MS = PINCH_MS + ROTATE_MS + SETTLE_MS;

/**
 * The two palettes the strip can show.
 *
 * @typedef {"light" | "dark"} Theme
 * @typedef {"header" | "footer"} Role
 * @typedef {{ radius: number, rotation: number, incomingOffset: number }} Plan
 * @typedef {{
 *   pinch: number,
 *   curvature: number,
 *   incomingCurvature: number,
 *   progress: number,
 *   outgoingOpacity: number,
 *   incomingOpacity: number,
 * }} Frame
 */

/**
 * The wheel's shape for a strip and the turn it is about to make.
 *
 * Radius is half the square divided by tan(7.5 degrees), so notches butt
 * together on a 24-face cylinder. A light header turns left toward dark and a
 * dark header turns right toward light; the footer mirrors each turn. The
 * incoming palette starts seven positions away, on the side the turn comes
 * from.
 *
 * @param {number} size The measured square size, in pixels.
 * @param {Theme} outgoing The theme the strip is showing.
 * @param {Role} role The strip's place on the sheet.
 * @returns {Plan}
 */
export function planTurn(size, outgoing, role) {
  const radius = size / 2 / Math.tan(((ANGLE_PER_NOTCH / 2) * Math.PI) / 180);
  const direction =
    (outgoing === "light" ? -1 : 1) * (role === "footer" ? -1 : 1);
  const rotation = direction * NOTCH_COUNT * ANGLE_PER_NOTCH;

  return {
    radius,
    rotation,
    incomingOffset: rotation < 0 ? NOTCH_COUNT : -NOTCH_COUNT,
  };
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smoothstep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (value) => 1 - (1 - value) ** 3;
const easeInOutCubic = (value) =>
  value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;

/**
 * The wheel's pose at an elapsed time.
 *
 * At 0 the outgoing row is flat and the incoming seven are already bent onto
 * the drum but transparent. The outgoing group fades only after 55 percent of
 * the rotation. By TURN_MS the wheel is the flat incoming row. Times outside
 * the turn clamp to its two flat ends.
 *
 * @param {number} elapsed Milliseconds since the opening frame.
 * @returns {Frame}
 */
export function frameAt(elapsed) {
  if (elapsed >= TURN_MS) {
    return {
      pinch: 0,
      curvature: 0,
      incomingCurvature: 0,
      progress: 1,
      outgoingOpacity: 0,
      incomingOpacity: 1,
    };
  }

  if (elapsed < PINCH_MS) {
    const p = clamp01(elapsed / PINCH_MS);
    const eased = easeOutCubic(p);
    return {
      pinch: eased,
      curvature: eased,
      incomingCurvature: 1,
      progress: 0,
      outgoingOpacity: 1,
      incomingOpacity: smoothstep(eased),
    };
  }

  const rotateElapsed = elapsed - PINCH_MS;

  if (rotateElapsed < ROTATE_MS) {
    const p = rotateElapsed / ROTATE_MS;
    return {
      pinch: 1,
      curvature: 1,
      incomingCurvature: 1,
      progress: easeInOutCubic(p),
      outgoingOpacity: 1 - smoothstep((p - 0.55) / 0.45),
      incomingOpacity: 1,
    };
  }

  const settle = easeOutCubic((rotateElapsed - ROTATE_MS) / SETTLE_MS);
  return {
    pinch: 1 - settle,
    curvature: 1 - settle,
    incomingCurvature: 1 - settle,
    progress: 1,
    outgoingOpacity: 0,
    incomingOpacity: 1,
  };
}
