/**
 * The sky's tuning vocabulary: the shape of a config and the values the site
 * ships with. The composition module and the layer modules read the same
 * defaults, so a layer never has to import the composition it belongs to.
 */

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
