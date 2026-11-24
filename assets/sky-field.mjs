/**
 * The sky's field: the integer hash, value noise, three-octave fBm, the field
 * build, its sampling, and the whole-sheet paint pass.
 *
 * The field is computed once per layout and seed; each frame only re-quantises
 * it. Four properties are load-bearing:
 *
 *   1. sampling is interpolated, never rounded;
 *   2. the field is periodic in x, so the drift wraps with no pop;
 *   3. tone bands are dithered, so boundaries dissolve instead of snapping;
 *   4. the cloud quantiser only ever emits indices into the active theme's
 *      ramp.
 */

import { BAYER4, rampIndex, toneIndex } from "./sky-tone.mjs";

function wrap(value, period) {
  const wrapped = value % period;
  return wrapped < 0 ? wrapped + period : wrapped;
}

/**
 * Integer hash. `x` wraps on the lattice period, which is what makes the
 * field tile seamlessly in x.
 */
export function hash(x, y, seed, periodX, periodY = 0) {
  const hx = wrap(x, periodX);
  const hy = periodY ? wrap(y, periodY) : y | 0;
  let h =
    Math.imul(hx, 374761393) ^
    Math.imul(hy, 668265263) ^
    Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Value noise with smoothstep interpolation between lattice corners. */
export function valueNoise(x, y, seed, periodX, periodY = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const a = hash(xi, yi, seed, periodX, periodY);
  const b = hash(xi + 1, yi, seed, periodX, periodY);
  const c = hash(xi, yi + 1, seed, periodX, periodY);
  const d = hash(xi + 1, yi + 1, seed, periodX, periodY);

  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Sum of octaves; the caller decides how many. */
export function fbm(x, y, seed, periodX, octaves = 3, periodY = 0) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normaliser = 0;

  for (let i = 0; i < octaves; i += 1) {
    sum +=
      amplitude *
      valueNoise(
        x * frequency,
        y * frequency,
        seed + i * 101,
        periodX,
        periodY,
      );
    normaliser += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return sum / normaliser;
}

const EVOLVE = Object.freeze({
  scaleRatio: 1.8, // × the sky's feature size, when evolveScale is not given
  octaves: 2,
  amount: 1, // half the bias at evolve = 100; the paint pass applies it twice
  driftX: 42, // cells/s at evolveSpeed = 100
});

const GUTTER = 16;

/**
 * Build one period of the field, once per layout and seed.
 *
 * `width` is `cols + 2 * GUTTER + 2` cells: room for the widest warp on both
 * sides. The lattice period is rounded to whole noise cells, and the x step
 * is chosen so the buffer is exactly one period wide. Adding `periodX` to a
 * sample in lattice units therefore returns the same value.
 *
 * `margin` builds extra rows above and below the visible band, so the whole sky
 * can be slid up or down without wrapping and without changing a single value
 * in the band the page shows. The text of the field is unchanged by a margin:
 * row `y + margin` is row `y` of a field built without one.
 *
 * The evolution field is a second, much larger noise field that decides where
 * tone thresholds are pushed up and pulled down. It is sampled by the same
 * machinery, with features `evolveScale` CSS px wide, drifting on both axes at
 * a rate set by `evolveSpeed` and `evolveTilt`. Because it varies across the
 * plane, masses swell in one place while they thin in another; because it
 * drifts continuously, no fixed spot breathes in and out.
 */
export function build({
  cols,
  rows,
  cellPx,
  config = {},
  scale = config.scale,
  seed = config.seed,
  evolveScale = config.evolveScale ?? scale * EVOLVE.scaleRatio,
  margin = 0,
}) {
  const width = cols + 2 * GUTTER + 2;
  const height = rows + 2 * margin;
  const periodX = Math.max(2, Math.round((width * cellPx) / scale));
  const stepX = periodX / width;
  const stepY = cellPx / scale;
  const data = new Float32Array(width * height);

  // Row `margin` is lattice row 0, so the band the page shows is the same sky
  // with or without a margin, whichever way the lift goes.
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const vy = (y - margin) * stepY;
    for (let x = 0; x < width; x += 1) {
      data[row + x] = fbm(x * stepX, vy, seed, periodX);
    }
  }

  // The flow is periodic on both axes, so it can drift in y forever without a
  // seam where the buffer wraps. The price is that it repeats after one buffer
  // height, as the sky already does after one width.
  const evolvePeriod = Math.max(2, Math.round((width * cellPx) / evolveScale));
  const evolvePeriodY = Math.max(2, Math.round((rows * cellPx) / evolveScale));
  const evolveStepX = evolvePeriod / width;
  const evolveStepY = evolvePeriodY / rows;
  const evolve = new Float32Array(width * rows);
  let evolveMean = 0;

  for (let y = 0; y < rows; y += 1) {
    const row = y * width;
    const vy = y * evolveStepY;
    for (let x = 0; x < width; x += 1) {
      const value = fbm(
        x * evolveStepX,
        vy,
        seed + 7919,
        evolvePeriod,
        EVOLVE.octaves,
        evolvePeriodY,
      );
      evolve[row + x] = value;
      evolveMean += value;
    }
  }

  // Centre it. Evolution should move coverage from one region to another, not
  // take white away from the sky as a whole.
  evolveMean /= width * rows;
  for (let i = 0; i < evolve.length; i += 1) evolve[i] -= evolveMean;

  const layer = {
    data,
    evolve,
    width,
    cols,
    rows,
    height,
    margin,
    periodX,
    evolvePeriod,
    evolvePeriodY,
    cellPx,
    scale,
    evolveScale,
    seed,
  };

  layer.paint = (frame) => paintField(layer, frame);

  return layer;
}

/** Read the field with x wrapped, so the period is continuous. */
export function sampleField(field, x, y) {
  const column = wrap(x, field.width);
  const row = wrap(y, field.height);
  return field.data[row * field.width + column];
}

/** Read the evolution field, wrapped on both axes. */
export function sampleEvolve(field, x, y) {
  const column = wrap(x, field.width);
  const row = ((y % field.rows) + field.rows) % field.rows;
  return field.evolve[row * field.width + column];
}

/**
 * Re-quantise the field into RGBA for one frame. No noise is evaluated here.
 *
 * `offset` is the drift in cells; `time` is seconds of animation. Both are
 * interpolated into the field, never rounded. `offsetY` pans the whole sky up
 * (+) or down (-), also in cells, within the margin the field was built with;
 * it stops at the edge rather than repeating.
 *
 * `bands`, when the frame carries one, records the tone each block landed on
 * so later layers can read the sheet's occlusion.
 */
function paintField(field, frame) {
  const { data, evolve: flow, width, rows, height, margin } = field;
  const { pixels, cols, config, time, offset, offsetY, ramp, tones } = frame;
  const { bands } = frame;
  const bandThresholds = frame.bandThresholds;
  const dither = frame.dither;

  const evolve = config.evolve / 100;
  const evolveSpeed = config.evolveSpeed / 100;
  const evolveTilt = config.evolveTilt / 100;
  const gain = config.gain;
  const fallBase = config.falloff / 100;
  const skyBias = (config.sky / 100 - 0.5) * 0.7;
  const evolveBias = evolve * EVOLVE.amount;

  const warpCells = (config.warp / 100) * 14;
  const warpSpeed = (config.warpSpeed / 100) * 0.8;
  const drift = wrap(offset, width);

  // The evolution field keeps its own clock, and drifts on both axes so the
  // pattern passes rather than pulses. Sampling it per cell is what makes the
  // swelling local: it pushes the thresholds up in one place and pulls them
  // down in another.
  const evolveShiftX = wrap(time * evolveSpeed * EVOLVE.driftX, width);
  const evolveWhole = Math.floor(evolveShiftX);
  const evolveFraction = evolveShiftX - evolveWhole;
  const evolveInverse = 1 - evolveFraction;
  const evolveShiftY = time * evolveSpeed * EVOLVE.driftX * evolveTilt;
  const lift = margin + offsetY;

  let pixel = 0;
  for (let y = 0; y < rows; y += 1) {
    const depth = rows > 1 ? y / (rows - 1) : 0;
    const falloffBias = fallBase * depth * 0.55;
    const sampleOffset =
      drift + warpCells * Math.sin(y * 0.055 + time * warpSpeed);
    const whole = Math.floor(sampleOffset);
    const fraction = sampleOffset - whole;
    const inverse = 1 - fraction;
    const ditherRow = (y & 3) * 4;

    // The sky pans vertically by sampling between two rows, so a fractional
    // lift is smooth. With no lift the second row is not read at all.
    const skyY = Math.min(Math.max(lift + y, 0), height - 1);
    const skyRow = Math.floor(skyY);
    const skyDepth = skyY - skyRow;
    const skyRowData = skyRow * width;
    const skyNextData = Math.min(skyRow + 1, height - 1) * width;

    // The flow is interpolated between two rows, then between two columns, so
    // it slides smoothly instead of stepping one block at a time.
    const flowY = wrap(evolveShiftY + y, rows);
    const flowRow = Math.floor(flowY) % rows;
    const flowNext = (flowRow + 1) % rows;
    const flowDepth = flowY - Math.floor(flowY);
    const flowUp = 1 - flowDepth;
    const flowRowData = flowRow * width;
    const flowNextData = flowNext * width;

    for (let x = 0; x < cols; x += 1) {
      let a = (whole + x) % width;
      if (a < 0) a += width;
      let b = a + 1;
      if (b >= width) b -= width;

      let value;
      if (skyDepth === 0) {
        value =
          data[skyRowData + a] * inverse + data[skyRowData + b] * fraction;
      } else {
        const top =
          data[skyRowData + a] * inverse + data[skyRowData + b] * fraction;
        const bottom =
          data[skyNextData + a] * inverse + data[skyNextData + b] * fraction;
        value = top * (1 - skyDepth) + bottom * skyDepth;
      }
      value = (value - 0.5) * gain + 0.5 - falloffBias - skyBias;

      if (evolveBias > 0) {
        let ea = (evolveWhole + x) % width;
        if (ea < 0) ea += width;
        let eb = ea + 1;
        if (eb >= width) eb -= width;
        const here =
          (flow[flowRowData + ea] * evolveInverse +
            flow[flowRowData + eb] * evolveFraction) *
            flowUp +
          (flow[flowNextData + ea] * evolveInverse +
            flow[flowNextData + eb] * evolveFraction) *
            flowDepth;
        value -= here * 2 * evolveBias;
      }

      if (value < 0) value = 0;
      else if (value > 1) value = 1;
      value = value * value * (3 - 2 * value);

      const band = toneIndex(
        value,
        bandThresholds,
        dither,
        BAYER4[ditherRow + (x & 3)],
      );
      if (bands) bands[y * cols + x] = band;

      const colour = ramp[rampIndex(band, tones)];

      pixels[pixel] = colour[0];
      pixels[pixel + 1] = colour[1];
      pixels[pixel + 2] = colour[2];
      pixels[pixel + 3] = 255;
      pixel += 4;
    }
  }
}
