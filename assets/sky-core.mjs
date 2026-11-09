/**
 * The pixelated sky, as pure functions.
 *
 * The field is an integer hash, value noise, three-octave fBm, a contrast
 * stretch, smoothstep and tone banding with a 4x4 ordered dither. It is
 * computed once per configuration change; each frame only re-quantises it.
 *
 * Four properties are load-bearing and tested in tests/sky.test.mjs:
 *
 *   1. sampling is interpolated, never rounded;
 *   2. the field is periodic in x, so the drift wraps with no pop;
 *   3. tone bands are dithered, so boundaries dissolve instead of snapping;
 *   4. the quantiser only ever emits indices into the canonical ramp.
 *
 * The browser layer (assets/sky.js) is the only part that touches the DOM.
 */

/** The canonical sky ramp, lightest first. Matches the --sky-* tokens. */
export const RAMP = Object.freeze([
  Object.freeze([223, 229, 231]), // #DFE5E7
  Object.freeze([197, 213, 229]), // #C5D5E5
  Object.freeze([158, 200, 228]), // #9EC8E4
  Object.freeze([33, 87, 204]), // #2157CC
]);

/** The values the site ships with, as last tuned with the levers. */
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
  maxFps: 60,
});

/**
 * 4x4 ordered dither, centred on zero so thresholds sit between blocks
 * rather than on them.
 */
export const BAYER4 = Object.freeze([
  -0.5, 0, -3 / 8, 1 / 8, 1 / 4, -1 / 4, 3 / 8, -1 / 8, -5 / 16, 3 / 16, -7 / 16, 1 / 16, 7 / 16,
  -3 / 16, 5 / 16, -1 / 16,
]);

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
  let h = Math.imul(hx, 374761393) ^ Math.imul(hy, 668265263) ^ Math.imul(seed | 0, 1442695041);
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
      amplitude * valueNoise(x * frequency, y * frequency, seed + i * 101, periodX, periodY);
    normaliser += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return sum / normaliser;
}

/**
 * The evolution field: a second, much larger noise field that decides where
 * the tone thresholds are pushed up and where they are pulled down.
 *
 * The first field is the clouds. This one is the weather over them: sampled by
 * the same machinery, but with features `evolveScale` CSS px wide, and drifting
 * on both axes at a rate set by `evolveSpeed` and `evolveTilt`. Because it
 * varies across the plane, masses swell in one place while they thin in
 * another, and because it drifts continuously, no fixed spot simply breathes in
 * and out.
 */
/** How far the sky may be slid up or down, in CSS px, either way. */
export const OFFSET_Y_LIMIT = 400;

const EVOLVE = Object.freeze({
  scaleRatio: 1.8, // × the sky's feature size, when evolveScale is not given
  octaves: 2,
  amount: 1, // bias at evolve = 100, in field units
  driftX: 42, // cells/s at evolveSpeed = 100
});

/**
 * Build one period of the field.
 *
 * `width` is `cols + 2 * GUTTER + 2` cells: room for the widest warp on both
 * sides. The lattice period is rounded to whole noise cells, and the x step
 * is chosen so the buffer is exactly one period wide. Adding `periodX` to a
 * sample in lattice units therefore returns the same value.
 *
 * `margin` builds extra rows above and below the visible band, so the whole sky
 * can be slid up or down (`renderFrame`'s `offsetY`) without wrapping and
 * without changing a single value in the band the page shows. The text of the
 * field is unchanged by a margin: row `y + margin` is row `y` of a field built
 * without one.
 */
const GUTTER = 16;

export function createField({
  cols,
  rows,
  cellPx,
  scale,
  seed = SKY_DEFAULTS.seed,
  evolveScale = scale * EVOLVE.scaleRatio,
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

  return {
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

/**
 * Re-quantise the field into RGBA for one frame. No noise is evaluated here.
 *
 * `offset` is the drift in cells; `time` is seconds of animation. Both are
 * interpolated into the field, never rounded. `offsetY` pans the whole sky up
 * (+) or down (-), also in cells, within the margin the field was built with;
 * it stops at the edge rather than repeating.
 */
export function renderFrame({
  field,
  out,
  bands,
  config = SKY_DEFAULTS,
  time = 0,
  offset = 0,
  offsetY = 0,
}) {
  const { data, evolve: flow, width, cols, rows, height, margin } = field;
  const pixels = out ?? new Uint8ClampedArray(cols * rows * 4);

  const tones = Math.min(RAMP.length, Math.max(2, config.tones | 0));
  const dither = config.dither / 100;
  const bandThresholds = thresholds(tones, config.stark);

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
    const sampleOffset = drift + warpCells * Math.sin(y * 0.055 + time * warpSpeed);
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
        value = data[skyRowData + a] * inverse + data[skyRowData + b] * fraction;
      } else {
        const top = data[skyRowData + a] * inverse + data[skyRowData + b] * fraction;
        const bottom = data[skyNextData + a] * inverse + data[skyNextData + b] * fraction;
        value = top * (1 - skyDepth) + bottom * skyDepth;
      }
      value = (value - 0.5) * gain + 0.5 - falloffBias - skyBias;

      if (evolveBias > 0) {
        let ea = (evolveWhole + x) % width;
        if (ea < 0) ea += width;
        let eb = ea + 1;
        if (eb >= width) eb -= width;
        const here =
          (flow[flowRowData + ea] * evolveInverse + flow[flowRowData + eb] * evolveFraction) *
            flowUp +
          (flow[flowNextData + ea] * evolveInverse + flow[flowNextData + eb] * evolveFraction) *
            flowDepth;
        value -= here * 2 * evolveBias;
      }

      if (value < 0) value = 0;
      else if (value > 1) value = 1;
      value = value * value * (3 - 2 * value);

      const band = toneIndex(value, bandThresholds, dither, BAYER4[ditherRow + (x & 3)]);
      if (bands) bands[y * cols + x] = band;

      const colour = RAMP[rampIndex(band, tones)];
      pixels[pixel] = colour[0];
      pixels[pixel + 1] = colour[1];
      pixels[pixel + 2] = colour[2];
      pixels[pixel + 3] = 255;
      pixel += 4;
    }
  }

  return pixels;
}
