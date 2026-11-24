/**
 * The sky's bird layer: the per-bird layout, the wing maths, and the stamping
 * pass.
 *
 * The bird layer is built once per layout and seed, then paints itself into the
 * shared frame state. It reads the sheet's band record for the far layer's
 * occlusion, so it never needs a handoff from the composition or the field.
 *
 * Every tunable value lives in the config; only what the drawing itself needs
 * lives here.
 */

import { SKY_DEFAULTS } from "./sky-config.mjs";
import { hash } from "./sky-field.mjs";
import { BAYER4, clamp01, lerpColour } from "./sky-tone.mjs";

/**
 * The birds' ink: the light theme's ink token, flat in both layers. Depth
 * reads through scale, speed and occlusion, never through tone.
 */
export const BIRD_INK = Object.freeze([20, 20, 15]); // #14140f

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
 * The bird layer, built once per layout and seed like the star layer. The
 * per-bird roll decides scale, speed, altitude, flap phase and entry delay, all from
 * the shared hash. Geometry is fixed here; the beat values are read from the
 * config at paint time, so they tune without a rebuild.
 */
export function build({ cols, rows, cellPx, config = SKY_DEFAULTS }) {
  if (config.birds <= 0) return null;
  const seed = (config.seed ^ config.birdSeed ^ 0x51ed270b) >>> 0;
  const birds = [];
  const paramsByLayer = [];

  for (let layerIndex = 0; layerIndex < 2; layerIndex += 1) {
    const params = birdLayer(config, layerIndex);
    paramsByLayer[layerIndex] = params;
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
        // bird layer never falls into a shared rhythm even mid-flight.
        flapVariance: 1 + (flapRoll - 0.5) * 2 * params.flapJitter,
        span,
        // Where this bird sits in its own pass, as a distance along the span.
        // The bird layer is spread evenly over the pass with half a slot of
        // jitter, so every bird is aloft at once and the count is what sets density.
        // Adding a bird never stacks it on another, and a bird that finishes
        // its pass reappears off-screen right rather than popping mid-sky.
        offset:
          ((i + 0.5 * (offsetRoll - 0.5)) / Math.max(1, params.count)) * span,
      });
    }
  }

  const stamps = [];
  let stampBytes = 0;
  for (const bird of birds) {
    const stamp = bakeStamps(bird, paramsByLayer[bird.layer], config);
    stamps.push(stamp);
    stampBytes += stamp.bytes;
  }

  const layer = {
    birds,
    stamps,
    shaping: paramsByLayer.map((params) => stampShaping(params, config)),
    stampBytes,
  };

  layer.paint = (frame) => paintBirdLayer(layer, frame);

  return layer;
}

/** The bird layer's stable name for the same build. */
export function createBirdLayer(options) {
  return build(options);
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
 * The coverage samples that land on one block, given its offset from the
 * bird's centre. Coverage depends only on that offset, the wing shape and the
 * droop, so a whole silhouette can be baked once and translated intact.
 */
function coverageAt(dx, dy, wing, droop, body, spread, tol, maxSlope, n, invN) {
  let hits = 0;
  for (let sy = 0; sy < n; sy += 1) {
    for (let sx = 0; sx < n; sx += 1) {
      const u = (dx + (sx + 0.5) * invN) / wing;
      // Screen rows grow downward; the wing's own y grows upward.
      const v = -(dy + (sy + 0.5) * invN) / wing;
      if (Math.abs(u) > 1) continue;
      const slope = wingSlope(u, droop, body, spread, maxSlope);
      const width = tol * Math.sqrt(1 + slope * slope);
      const wingY = wingHeight(u, droop, body, spread);
      if (Math.abs(v - wingY) < width) hits += 1;
    }
  }
  return hits;
}

/** The shape inputs a stamp bakes, so a paint can tell whether it still fits. */
function stampShaping(params, config) {
  return {
    thickness: config.birdThickness,
    covSteps: Math.max(1, Math.round(config.birdCovSteps)),
    maxSlope: config.birdMaxSlope,
    steps: Math.max(1, Math.round(params.flapSteps)),
    droopMax: params.droopMax,
    droopMin: params.droopMin,
    body: params.body,
    spread: params.spread,
  };
}

function sameShaping(a, b) {
  return (
    !!a &&
    !!b &&
    a.thickness === b.thickness &&
    a.covSteps === b.covSteps &&
    a.maxSlope === b.maxSlope &&
    a.steps === b.steps &&
    a.droopMax === b.droopMax &&
    a.droopMin === b.droopMin &&
    a.body === b.body &&
    a.spread === b.spread
  );
}

/**
 * Bake one bird's wing silhouettes, one per quantised flap step. Each grid
 * holds coverage (`hits`) per block offset from the bird's centre; the ordered
 * dither stays out because it depends on where the block lands on screen.
 */
function bakeStamps(bird, params, config) {
  const shaping = stampShaping(params, config);
  const wing = bird.wing;
  const tol = shaping.thickness;
  const n = shaping.covSteps;
  const invN = 1 / n;
  const yMax = wing * (params.body * Math.sqrt(params.spread) + tol * 2);
  const dxLo = Math.floor(-wing);
  const dxHi = Math.ceil(wing);
  const dyLo = Math.floor(-yMax);
  const dyHi = Math.ceil(yMax);
  const width = dxHi - dxLo + 1;
  const height = dyHi - dyLo + 1;
  const denom = n * n;
  const Store = denom <= 255 ? Uint8Array : Uint16Array;
  const grids = [];

  for (let step = 0; step <= shaping.steps; step += 1) {
    const droop =
      params.droopMax +
      (params.droopMin - params.droopMax) * (step / shaping.steps);
    const grid = new Store(width * height);
    for (let j = 0; j < height; j += 1) {
      for (let i = 0; i < width; i += 1) {
        grid[j * width + i] = coverageAt(
          dxLo + i,
          dyLo + j,
          wing,
          droop,
          params.body,
          params.spread,
          tol,
          shaping.maxSlope,
          n,
          invN,
        );
      }
    }
    grids.push(grid);
  }

  return {
    shapes: shaping,
    dxLo,
    dxHi,
    dyLo,
    dyHi,
    width,
    height,
    grids,
    bytes: width * height * Store.BYTES_PER_ELEMENT * grids.length,
  };
}

/** Blend the bird ink over one painted block. */
function inkBlock(pixels, p, visible) {
  const ink = lerpColour(
    [pixels[p], pixels[p + 1], pixels[p + 2]],
    BIRD_INK,
    visible,
  );
  pixels[p] = ink[0];
  pixels[p + 1] = ink[1];
  pixels[p + 2] = ink[2];
}

/**
 * Translate one baked stamp by whole blocks and threshold it onto the sheet.
 * The dither stays at blit time because it depends on the block's screen
 * position, not on the wing; the far layer's cloud occlusion does too.
 */
function blitStamp(stamp, step, bx, by, back, frame, visible, denom) {
  const { pixels, bands, cols, rows, config } = frame;
  const dither = config.birdDither;
  const grid = stamp.grids[step];
  const xLo = Math.max(0, bx + stamp.dxLo);
  const xHi = Math.min(cols - 1, bx + stamp.dxHi);
  const yLo = Math.max(0, by + stamp.dyLo);
  const yHi = Math.min(rows - 1, by + stamp.dyHi);

  for (let y = yLo; y <= yHi; y += 1) {
    const ditherRow = (y & 3) * 4;
    const rowBase = (y - by - stamp.dyLo) * stamp.width;
    for (let x = xLo; x <= xHi; x += 1) {
      // The cloud bands cover the far birds, exactly as they cover stars.
      if (back && bands[y * cols + x] > 0) continue;

      const hits = grid[rowBase + (x - bx - stamp.dxLo)];
      const bayer = BAYER4[ditherRow + (x & 3)];
      if (hits / denom + dither * bayer < 0.5) continue;

      inkBlock(pixels, (y * cols + x) * 4, visible);
    }
  }
}

/**
 * Stamp the bird layer onto the painted sheet. One shared phase per bird drives
 * both the droop and the bob, so they cannot drift apart; the bob amplitude
 * is derived from the wing (a bigger wing lifts more) and rides the power
 * stroke. Coverage is an NxN sample grid per block, thresholded through the
 * same ordered dither the tone bands use. The far layer reads the frame's band
 * record and skips every block a cloud band owns.
 */
function paintBirdLayer(layerState, frame) {
  const { pixels, bands: birdBands, cols, rows, config, time, blend } = frame;
  const visible = 1 - clamp01(blend);
  const thickness = config.birdThickness;
  const dither = config.birdDither;
  const n = Math.max(1, Math.round(config.birdCovSteps));
  const denom = n * n;
  const maxSlope = config.birdMaxSlope;
  const snap = config.birdSnap >= 0.5;
  const TAU = Math.PI * 2;
  const params = [birdLayer(config, 0), birdLayer(config, 1)];
  const shaping = params.map((layer) => stampShaping(layer, config));
  const stamped = shaping.map(
    (shape, index) => snap && sameShaping(shape, layerState.shaping[index]),
  );

  for (let index = 0; index < layerState.birds.length; index += 1) {
    const bird = layerState.birds[index];
    const layer = params[bird.layer];
    const back = bird.layer === 1;
    const wing = bird.wing;

    // Drift: right to left, wrapping off-screen left back to off-screen
    // right, so a bird is always somewhere on its own pass and never appears
    // mid-sky. Before its entry offset it sits further off-screen right, so
    // the whole bird layer enters from the same edge.
    const raw = time * bird.speed + bird.offset;
    let bx = cols + 2 * wing - (raw % bird.span);

    // Flap: eased sine at this bird's rolled rate, held in steps, one phase
    // for droop and bob alike.
    const beat = time * flapHz(layer.flap) * bird.flapVariance + bird.phase;
    let flap = 0.5 + 0.5 * Math.sin(beat * TAU);
    flap = Math.pow(flap, layer.flapEase);
    if (layer.invert >= 0.5) flap = 1 - flap;
    const steps = Math.max(1, Math.round(layer.flapSteps));
    const stepIndex = Math.round(flap * steps);
    flap = stepIndex / steps;

    // The derived bob: amplitude follows the wing, sign follows the beat.
    let by = bird.row - (layer.lift / 100) * wing * flap;

    // Whole-block snapping: the silhouette is pixel-identical between steps,
    // so drift and bob advance a block at a time instead of re-cutting every
    // block's coverage each frame.
    if (snap) {
      bx = Math.round(bx);
      by = Math.round(by);
    }

    if (stamped[bird.layer]) {
      blitStamp(
        layerState.stamps[index],
        stepIndex,
        bx,
        by,
        back,
        frame,
        visible,
        denom,
      );
      continue;
    }

    // A continuous or retuned bird layer has no stamp to blit, so it re-cuts
    // each block from the wing maths.
    const droop = layer.droopMax + (layer.droopMin - layer.droopMax) * flap;
    const tol = thickness;
    const yMax = wing * (layer.body * Math.sqrt(layer.spread) + tol * 2);
    const yLo = Math.max(0, Math.floor(by - yMax));
    const yHi = Math.min(rows - 1, Math.ceil(by + yMax));
    const xLo = Math.max(0, Math.floor(bx - wing));
    const xHi = Math.min(cols - 1, Math.ceil(bx + wing));

    for (let y = yLo; y <= yHi; y += 1) {
      const ditherRow = (y & 3) * 4;
      for (let x = xLo; x <= xHi; x += 1) {
        // The cloud bands cover the far birds, exactly as they cover stars.
        if (back && birdBands[y * cols + x] > 0) continue;

        const hits = coverageAt(
          x - bx,
          y - by,
          wing,
          droop,
          layer.body,
          layer.spread,
          tol,
          maxSlope,
          n,
          1 / n,
        );

        const bayer = BAYER4[ditherRow + (x & 3)];
        if (hits / denom + dither * bayer < 0.5) continue;

        inkBlock(pixels, (y * cols + x) * 4, visible);
      }
    }
  }
}
