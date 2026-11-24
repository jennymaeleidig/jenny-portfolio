import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BAYER4,
  BIRD_INK,
  DARK_RAMP,
  OFFSET_Y_LIMIT,
  RAMP,
  SKY_DEFAULTS,
  STAR_DIM,
  STAR_TINTS,
  TRANSITION_MS,
  createBirdLayer,
  createField,
  createScene,
  createStarLayer,
  frameLayout,
  fbm,
  hash,
  lerpRamp,
  rampAt,
  rampIndex,
  renderFrame,
  sampleEvolve,
  sampleField,
  smoothstep,
  thresholds,
  toneIndex,
  transitionMix,
  updateStarGains,
} from "../assets/sky-core.mjs";
import { build as buildField } from "../assets/sky-field.mjs";
import { build as buildBirdLayer } from "../assets/sky-birds.mjs";
import { defaultsText } from "../assets/sky-levers.mjs";
import { build as buildStar } from "../assets/sky-stars.mjs";
import { createCpuRenderer } from "../assets/sky-renderer.mjs";
import { TURN_MS } from "../assets/wheel-core.mjs";

function rawToneIndex(value, bandThresholds, dither, bayer) {
  let q = 0;
  while (
    q < bandThresholds.length &&
    value + dither * bayer >= bandThresholds[q]
  )
    q += 1;
  return q;
}

const fieldOptions = {
  cols: 24,
  rows: 12,
  cellPx: 2,
  scale: 150,
  seed: 12,
};

test("the sky ships at the values that were tuned", () => {
  assert.deepEqual(SKY_DEFAULTS, {
    mode: "frame",
    cell: 2,
    tones: 4,
    scale: 260,
    gain: 2.1,
    speed: 20,
    falloff: 54,
    offsetY: -220,
    evolve: 60,
    evolveSpeed: 30,
    evolveScale: 340,
    evolveTilt: 13,
    warp: 51,
    warpSpeed: 9,
    dither: 20,
    sky: 87,
    stark: 77,
    seed: 12,
    maxFps: 24,
    starCell: 67,
    starDensity: 67,
    starMedium: 27,
    starLarge: 12,
    starYellow: 37,
    starBright: 90,
    starDither: 24,
    starTwinkle: 70,
    starTwinkleSpeed: 220,
    starTwinkleSize: 2,
    birds: 1,
    birdSeed: 19,
    birdThickness: 0.05,
    birdDither: 0.06,
    birdCovSteps: 1,
    birdMaxSlope: 3,
    birdSnap: 1,
    l1Count: 3,
    l1Scale: 31,
    l1ScaleJitter: 0.32,
    l1Speed: 18,
    l1SpeedJitter: 0.3,
    l1Gap: 0.35,
    l1Flap: 12,
    l1FlapJitter: 0.15,
    l1DroopMax: 0,
    l1DroopMin: 0.67,
    l1FlapSteps: 12,
    l1FlapEase: 1,
    l1Invert: 0,
    l1Lift: 8,
    l1Y: 0,
    l1YSpread: 100,
    l1Body: 0.6,
    l1Spread: 0.8,
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

  assert.deepEqual(RAMP, [
    [223, 229, 231],
    [197, 213, 229],
    [158, 200, 228],
    [33, 87, 204],
  ]);
  assert.deepEqual(DARK_RAMP, [
    [192, 187, 172],
    [119, 117, 120],
    [65, 64, 66],
    [27, 26, 22],
  ]);
  assert.deepEqual(STAR_TINTS, {
    1: [221, 208, 197],
    2: [248, 205, 112],
  });
  assert.deepEqual(STAR_DIM, [192, 187, 172]);
});

test("the field is deterministic for a seed", () => {
  const first = createField(fieldOptions);
  const second = createField(fieldOptions);

  assert.deepEqual([...first.data], [...second.data]);
  assert.equal(first.periodX, second.periodX);
});

test("the field layer builds from a config and exposes paint", () => {
  const config = { ...SKY_DEFAULTS, seed: 31, scale: 150, evolveScale: 410 };
  const layer = buildField({ cols: 24, rows: 12, cellPx: 2, config });
  const legacy = createField({
    cols: 24,
    rows: 12,
    cellPx: 2,
    scale: config.scale,
    seed: config.seed,
    evolveScale: config.evolveScale,
  });

  assert.equal(typeof layer.paint, "function");
  assert.equal(layer.scale, config.scale);
  assert.equal(layer.seed, config.seed);
  assert.equal(layer.evolveScale, config.evolveScale);
  assert.equal(layer.width, legacy.width);
  assert.equal(layer.height, legacy.height);
  assert.deepEqual([...layer.data], [...legacy.data]);
});

test("a different seed gives a different field", () => {
  const first = createField(fieldOptions);
  const second = createField({ ...fieldOptions, seed: 13 });

  assert.notDeepEqual([...first.data], [...second.data]);
});

test("the field is periodic in x, one lattice period apart", () => {
  const field = createField(fieldOptions);
  const { periodX, seed } = field;

  for (const y of [0, 3, 11]) {
    for (let x = 0; x < 24; x += 1) {
      const step = x * (periodX / field.width);
      const here = fbm(step, y * (field.cellPx / field.scale), seed, periodX);
      const there = fbm(
        step + periodX,
        y * (field.cellPx / field.scale),
        seed,
        periodX,
      );
      assert.ok(
        Math.abs(here - there) < 1e-12,
        `x=${x}, y=${y} is not periodic: ${here} !== ${there}`,
      );
    }
  }

  // The hash itself wraps exactly.
  for (let x = -8; x < 16; x += 1) {
    assert.equal(
      hash(x, 2, seed, periodX),
      hash(x + periodX, 2, seed, periodX),
    );
  }
});

test("sampling the stored field wraps instead of clamping", () => {
  const field = createField(fieldOptions);

  assert.equal(
    sampleField(field, 3, 4),
    sampleField(field, field.width + 3, 4),
  );
  assert.equal(
    sampleField(field, -1, 4),
    sampleField(field, field.width - 1, 4),
  );
});

test("the quantiser only ever emits indices into the ramp", () => {
  const field = createField(fieldOptions);
  const pixels = renderFrame({ field });
  const allowed = new Set(RAMP.map(([r, g, b]) => `${r},${g},${b}`));

  assert.equal(pixels.length, field.cols * field.rows * 4);

  for (let i = 0; i < pixels.length; i += 4) {
    assert.equal(pixels[i + 3], 255, "every block is opaque");
    const colour = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`;
    assert.ok(
      allowed.has(colour),
      `pixel ${i / 4} is ${colour}, not in the ramp`,
    );
  }
});

test("the band output matches the painted ramp", () => {
  const field = createField(fieldOptions);
  const bands = new Uint8Array(field.cols * field.rows);
  const pixels = renderFrame({ field, bands });

  for (let i = 0; i < bands.length; i += 1) {
    const colour = RAMP[rampIndex(bands[i], SKY_DEFAULTS.tones)];
    assert.equal(pixels[i * 4], colour[0]);
    assert.equal(pixels[i * 4 + 1], colour[1]);
    assert.equal(pixels[i * 4 + 2], colour[2]);
  }
});

test("ramp indices stay inside the ramp for every tone count", () => {
  for (let tones = 2; tones <= RAMP.length; tones += 1) {
    for (let band = 0; band <= tones - 1; band += 1) {
      const index = rampIndex(band, tones);
      assert.ok(
        index >= 0 && index < RAMP.length,
        `tones=${tones} band=${band} -> ${index}`,
      );
    }
  }
});

test("dither never moves a sample by more than one band", () => {
  const bands = thresholds(SKY_DEFAULTS.tones, SKY_DEFAULTS.stark);
  let clampEngaged = false;

  for (let step = 0; step <= 1000; step += 1) {
    const value = step / 1000;
    const base = toneIndex(value, bands, 0, 0);

    for (const bayer of BAYER4) {
      for (let dither = 0; dither <= 100; dither += 5) {
        const raw = rawToneIndex(value, bands, dither / 100, bayer);
        const band = toneIndex(value, bands, dither / 100, bayer);
        if (Math.abs(raw - base) > 1) clampEngaged = true;
        assert.ok(
          Math.abs(band - base) <= 1,
          `value=${value} dither=${dither} bayer=${bayer}: ${base} -> ${band}`,
        );
      }
    }
  }

  assert.ok(
    clampEngaged,
    "the test must exercise a case the clamp actually changes",
  );
});

test("the clamp pulls an over-dithered sample back to one band", () => {
  const bands = [0.4, 0.5, 0.6];
  const value = 0.45;

  assert.equal(
    rawToneIndex(value, bands, 1, 1),
    3,
    "unclamped dither crosses every band",
  );
  assert.equal(
    toneIndex(value, bands, 1, 1),
    2,
    "one band above the undithered result",
  );
});

test("dither dissolves a boundary instead of snapping it", () => {
  const bands = thresholds(SKY_DEFAULTS.tones, SKY_DEFAULTS.stark);
  const value = bands[0] + 0.001;
  const bandsHit = new Set(
    BAYER4.map((bayer) =>
      toneIndex(value, bands, SKY_DEFAULTS.dither / 100, bayer),
    ),
  );

  assert.ok(
    bandsHit.size > 1,
    "a threshold should spread across more than one band",
  );
});

test("two consecutive frames differ", () => {
  const field = createField({
    cols: 360,
    rows: 200,
    cellPx: 2,
    scale: 150,
    seed: 12,
  });
  const first = renderFrame({ field, time: 0, offset: 0 });
  const next = renderFrame({
    field,
    time: 1 / 60,
    offset: (SKY_DEFAULTS.speed * (1 / 60)) / field.cellPx,
  });

  assert.notDeepEqual([...first], [...next]);
});

test("the evolution field is periodic on both axes and carries no bias", () => {
  const field = createField({
    cols: 240,
    rows: 140,
    cellPx: 2,
    scale: 150,
    seed: 12,
  });

  for (const [x, y] of [
    [0, 0],
    [7, 11],
    [133, 41],
  ]) {
    const here = sampleEvolve(field, x, y);
    assert.ok(
      Math.abs(here - sampleEvolve(field, x + field.width, y)) < 1e-12,
      `x=${x}, y=${y} does not wrap in x`,
    );
    assert.ok(
      Math.abs(here - sampleEvolve(field, x, y + field.rows)) < 1e-12,
      `x=${x}, y=${y} does not wrap in y`,
    );
  }

  const mean =
    field.evolve.reduce((sum, value) => sum + value, 0) / field.evolve.length;
  assert.ok(Math.abs(mean) < 1e-6, `the flow must be centred, not ${mean}`);

  const spread = Math.max(...field.evolve) - Math.min(...field.evolve);
  assert.ok(
    spread > 0.1,
    `the flow must vary across the field, spread is ${spread}`,
  );
});

test("the masses swell in different places instead of breathing in step", () => {
  const field = createField({
    cols: 240,
    rows: 140,
    cellPx: 2,
    scale: 150,
    seed: 12,
  });
  const config = {
    ...SKY_DEFAULTS,
    speed: 0,
    warp: 0,
    warpSpeed: 0,
    dither: 0,
    evolveSpeed: 0,
  };
  const still = new Uint8Array(field.cols * field.rows);
  const evolved = new Uint8Array(field.cols * field.rows);

  renderFrame({
    field,
    bands: still,
    config: { ...config, evolve: 0 },
    time: 0,
    offset: 0,
  });
  renderFrame({
    field,
    bands: evolved,
    config: { ...config, evolve: 100 },
    time: 0,
    offset: 0,
  });

  let grown = 0;
  let thinned = 0;
  for (let i = 0; i < still.length; i += 1) {
    if (evolved[i] > still[i]) grown += 1;
    else if (evolved[i] < still[i]) thinned += 1;
  }

  assert.ok(grown > 0, "some masses grow at this moment");
  assert.ok(thinned > 0, "others thin at the same moment");
});

test("a margin carries the sky above and below without changing the view", () => {
  const bare = createField({
    cols: 60,
    rows: 40,
    cellPx: 2,
    scale: 150,
    seed: 12,
  });
  const roomy = createField({
    cols: 60,
    rows: 40,
    cellPx: 2,
    scale: 150,
    seed: 12,
    margin: 20,
  });

  assert.equal(
    roomy.height,
    roomy.rows + 40,
    "the margin adds rows on both sides",
  );

  for (const [x, y] of [
    [0, 0],
    [11, 7],
    [59, 39],
  ]) {
    assert.equal(
      sampleField(roomy, x, y + 20),
      sampleField(bare, x, y),
      `row ${y} must be the same sky with or without a margin`,
    );
  }

  const above = sampleField(roomy, 3, 0);
  assert.ok(
    above > 0 && above < 1,
    "the margin holds real sky, not a flat edge",
  );
});

test("the lift pans the sky and stops at the margin", () => {
  const field = createField({
    cols: 80,
    rows: 60,
    cellPx: 2,
    scale: 150,
    seed: 12,
    margin: 24,
  });
  const config = {
    ...SKY_DEFAULTS,
    speed: 0,
    warp: 0,
    warpSpeed: 0,
    evolve: 0,
  };
  const rest = renderFrame({ field, config, offsetY: 0 });
  const up = renderFrame({ field, config, offsetY: 12 });
  const down = renderFrame({ field, config, offsetY: -12 });

  assert.notDeepEqual([...rest], [...up], "the clouds move up");
  assert.notDeepEqual([...rest], [...down], "the clouds move down");

  const pinned = renderFrame({ field, config, offsetY: 500 });
  const pinnedSame = renderFrame({ field, config, offsetY: 200 });
  assert.deepEqual(
    [...pinned],
    [...pinnedSame],
    "past the margin it stops rather than wrapping",
  );
});

test("the flow's feature size is built into the field", () => {
  const small = createField({
    cols: 240,
    rows: 140,
    cellPx: 2,
    scale: 150,
    seed: 12,
    evolveScale: 90,
  });
  const large = createField({
    cols: 240,
    rows: 140,
    cellPx: 2,
    scale: 150,
    seed: 12,
    evolveScale: 540,
  });

  assert.ok(
    small.evolvePeriod > large.evolvePeriod,
    "a smaller flow sees more lattice cells",
  );
  assert.equal(small.evolvePeriodY > large.evolvePeriodY, true);
  assert.notDeepEqual([...small.evolve], [...large.evolve]);
});

test("the flow's tilt decides how much of its drift is vertical", () => {
  const field = createField({
    cols: 240,
    rows: 140,
    cellPx: 2,
    scale: 150,
    seed: 12,
  });
  const config = {
    ...SKY_DEFAULTS,
    speed: 0,
    warp: 0,
    warpSpeed: 0,
    evolveSpeed: 60,
  };

  const sideways = renderFrame({
    field,
    config: { ...config, evolveTilt: 0 },
    time: 5,
    offset: 0,
  });
  const upright = renderFrame({
    field,
    config: { ...config, evolveTilt: 100 },
    time: 5,
    offset: 0,
  });

  assert.notDeepEqual(
    [...sideways],
    [...upright],
    "tilt changes where the flow has got to",
  );
});

test("with evolve off the sky holds perfectly still", () => {
  const field = createField({
    cols: 160,
    rows: 100,
    cellPx: 2,
    scale: 150,
    seed: 12,
  });
  const config = {
    ...SKY_DEFAULTS,
    evolve: 0,
    speed: 0,
    warp: 0,
    warpSpeed: 0,
  };

  const first = renderFrame({ field, config, time: 0, offset: 0 });
  const later = renderFrame({ field, config, time: 30, offset: 0 });

  assert.deepEqual([...first], [...later]);
});

test("the flow drifts with its own speed, independent of the sky's", () => {
  const field = createField({
    cols: 360,
    rows: 200,
    cellPx: 2,
    scale: 150,
    seed: 12,
  });
  const config = { ...SKY_DEFAULTS, speed: 0, warp: 0, warpSpeed: 0 };

  const still = renderFrame({
    field,
    config: { ...config, evolveSpeed: 0 },
    time: 0,
    offset: 0,
  });
  const holding = renderFrame({
    field,
    config: { ...config, evolveSpeed: 0 },
    time: 6,
    offset: 0,
  });
  const drifted = renderFrame({ field, config, time: 6, offset: 0 });

  assert.deepEqual(
    [...still],
    [...holding],
    "with no evolve speed the flow holds still",
  );
  assert.notDeepEqual(
    [...still],
    [...drifted],
    "evolveSpeed alone moves the flow",
  );
});

test("frameLayout snaps a block to whole device pixels and covers the frame", () => {
  for (const dpr of [1, 2, 3]) {
    for (const cell of [2, 3, 5, 7]) {
      const layout = frameLayout({ width: 390, height: 844, dpr, cell });
      assert.ok(layout.cellPx >= 1, `cell ${cell} at dpr ${dpr} keeps a block`);
      assert.ok(
        Number.isInteger(layout.cellPx * dpr),
        `cell ${cell} at dpr ${dpr} lands on a device pixel`,
      );
      assert.ok(
        layout.cols * layout.cellPx >= 390,
        "the columns cover the width",
      );
      assert.ok(
        (layout.cols - 1) * layout.cellPx < 390,
        "and no column is wasted",
      );
      assert.ok(
        layout.rows * layout.cellPx >= 844,
        "the rows cover the height",
      );
      assert.ok(
        (layout.rows - 1) * layout.cellPx < 844,
        "and no row is wasted",
      );
    }
  }
});

test("createScene lifts by the config and carries the pannable margin", () => {
  const config = { ...SKY_DEFAULTS, offsetY: -220 };
  const { field, offsetY } = createScene({
    config,
    cols: 20,
    rows: 10,
    cellPx: 2,
  });

  assert.equal(offsetY, -110);
  assert.equal(field.margin, Math.ceil(OFFSET_Y_LIMIT / 2));
  assert.equal(
    field.height - field.rows,
    field.margin * 2,
    "the margin sits above and below",
  );
  assert.equal(field.scale, config.scale);
  assert.equal(field.seed, config.seed);
  assert.equal(field.evolveScale, config.evolveScale);
});

test("the CPU renderer paints a sky scene onto the surface it owns", () => {
  const config = { ...SKY_DEFAULTS, seed: 12, birdSeed: 34 };
  const scene = createScene({ config, cols: 24, rows: 12, cellPx: 2 });
  const renderer = createCpuRenderer({ config, scene });
  const surface = renderer.surface;

  assert.equal(surface.cols, scene.field.cols);
  assert.equal(surface.rows, scene.field.rows);
  assert.equal(surface.pixels.length, scene.field.cols * scene.field.rows * 4);

  const state = { time: 3, offset: 5, offsetY: scene.offsetY, mix: 0.35 };
  renderer.render(state);

  assert.deepEqual(
    [...surface.pixels],
    [
      ...renderFrame({
        field: scene.field,
        config,
        starLayer: scene.starLayer,
        birdLayer: scene.birdLayer,
        ...state,
      }),
    ],
    "the adapter paints the reference frame",
  );

  const painted = surface.pixels;
  renderer.render({ ...state, mix: 0.9 });
  assert.equal(renderer.surface.pixels, painted, "a frame reuses the surface");

  const nextScene = createScene({ config, cols: 10, rows: 8, cellPx: 2 });
  renderer.setScene(nextScene);
  assert.equal(renderer.surface.pixels.length, 10 * 8 * 4);
  assert.notEqual(renderer.surface.pixels, painted, "a new grid reallocates");
  assert.equal(renderer.surface.cols, 10);
  assert.equal(renderer.surface.rows, 8);
});

const starConfig = {
  ...SKY_DEFAULTS,
  starCell: 10,
  starDensity: 100,
};

const starLayout = {
  cols: 80,
  rows: 40,
  cellPx: 2,
  config: starConfig,
};

function paintedTints(layer) {
  return new Set(
    [...layer.owner]
      .map((owner, index) => (owner >= 0 ? layer.tint[index] : null))
      .filter((value) => value !== null),
  );
}

test("the star layer is deterministic for a seed", () => {
  const first = createStarLayer(starLayout);
  const second = createStarLayer(starLayout);

  assert.deepEqual([...first.peak], [...second.peak]);
  assert.deepEqual([...first.tint], [...second.tint]);
  assert.deepEqual([...first.owner], [...second.owner]);
  assert.deepEqual(first.stars, second.stars);
});

test("the star layer builds from a config and paints its own twinkle", () => {
  const layer = buildStar(starLayout);
  const legacy = createStarLayer(starLayout);

  assert.equal(typeof layer.paint, "function");
  assert.deepEqual([...layer.peak], [...legacy.peak]);
  assert.deepEqual([...layer.tint], [...legacy.tint]);
  assert.deepEqual([...layer.owner], [...legacy.owner]);
  assert.deepEqual(layer.stars, legacy.stars);

  const config = {
    ...starConfig,
    starBright: 100,
    starDither: 0,
    starTwinkle: 100,
    starTwinkleSize: 1,
  };
  const field = createField({
    cols: starLayout.cols,
    rows: starLayout.rows,
    cellPx: starLayout.cellPx,
    scale: 150,
    seed: 12,
  });
  const twinkling = buildStar({ ...starLayout, config });
  assert.equal(
    twinkling.stars.every((star) => star.gain === 1),
    true,
    "stars rest at full brightness",
  );

  renderFrame({ field, config, dark: true, starLayer: twinkling, time: 3 });
  assert.ok(
    twinkling.stars.some((star) => star.gain < 1),
    "painting advances the twinkle without a caller update",
  );
});

test("a different seed gives a different star layer", () => {
  const first = createStarLayer(starLayout);
  const second = createStarLayer({
    ...starLayout,
    config: { ...starConfig, seed: 13 },
  });

  assert.notDeepEqual([...first.peak], [...second.peak]);
});

test("star density turns the layer off and fills every cell", () => {
  const empty = createStarLayer({
    ...starLayout,
    config: { ...starConfig, starDensity: 0 },
  });
  assert.equal(empty.stars.length, 0);
  assert.equal(
    empty.owner.every((owner) => owner === -1),
    true,
  );

  const full = createStarLayer(starLayout);
  const cell = Math.round(starConfig.starCell / starLayout.cellPx);
  const cells =
    Math.ceil(starLayout.cols / cell) * Math.ceil(starLayout.rows / cell);

  assert.equal(full.stars.length, cells);
});

test("star size and tint follow their shares", () => {
  for (const { name, config, expected } of [
    {
      name: "small",
      config: { ...starConfig, starLarge: 0, starMedium: 0 },
      expected: 1,
    },
    {
      name: "medium",
      config: { ...starConfig, starLarge: 0, starMedium: 100 },
      expected: 2,
    },
    {
      name: "large",
      config: { ...starConfig, starLarge: 100, starMedium: 0 },
      expected: 3,
    },
  ]) {
    const layer = createStarLayer({
      ...starLayout,
      config,
    });
    assert.ok(layer.stars.length > 0, `${name} stars exist`);
    assert.deepEqual(
      new Set(layer.stars.map((star) => star.size)),
      new Set([expected]),
      `${name} stars keep one size`,
    );
  }

  const white = createStarLayer({
    ...starLayout,
    config: { ...starConfig, starYellow: 0 },
  });
  assert.deepEqual(paintedTints(white), new Set([1]));

  const yellow = createStarLayer({
    ...starLayout,
    config: { ...starConfig, starYellow: 100 },
  });
  assert.deepEqual(paintedTints(yellow), new Set([2]));
});

test("a taller viewport keeps the stars already on screen", () => {
  const short = createStarLayer(starLayout);
  const tall = createStarLayer({ ...starLayout, rows: 80 });

  for (let i = 0; i < short.peak.length; i += 1) {
    assert.equal(short.peak[i], tall.peak[i], `peak ${i} stays put`);
    assert.equal(short.tint[i], tall.tint[i], `tint ${i} stays put`);
    assert.equal(short.owner[i], tall.owner[i], `owner ${i} stays put`);
  }
});

test("stars paint only in the dark clear band", () => {
  const field = createField({
    cols: starLayout.cols,
    rows: starLayout.rows,
    cellPx: starLayout.cellPx,
    scale: 150,
    seed: 12,
  });
  const layer = createStarLayer(starLayout);

  const light = renderFrame({ field });
  const lightWithStars = renderFrame({ field, starLayer: layer, dark: false });
  assert.deepEqual([...lightWithStars], [...light]);

  const config = { ...starConfig, starBright: 100, starDither: 0 };
  const bands = new Uint8Array(field.cols * field.rows);
  const pixels = renderFrame({
    field,
    bands,
    config,
    dark: true,
    starLayer: layer,
  });
  const allowed = new Set(
    [...DARK_RAMP, STAR_DIM, ...Object.values(STAR_TINTS)].map(
      ([r, g, b]) => `${r},${g},${b}`,
    ),
  );
  const core = new Set(
    Object.values(STAR_TINTS).map(([r, g, b]) => `${r},${g},${b}`),
  );

  let cores = 0;
  for (let i = 0; i < bands.length; i += 1) {
    const colour = `${pixels[i * 4]},${pixels[i * 4 + 1]},${pixels[i * 4 + 2]}`;
    assert.ok(
      allowed.has(colour),
      `pixel ${i} is ${colour}, not in the palette`,
    );
    if (core.has(colour)) cores += 1;
    if (layer.owner[i] >= 0 && bands[i] !== 0) {
      assert.ok(!core.has(colour), `pixel ${i} is a star behind a cloud`);
    }
  }

  assert.ok(cores > 0, "at least one star core paints in the clear band");
});

test("the twinkle freezes, filters by size, and holds three levels", () => {
  const frozen = createStarLayer(starLayout);
  updateStarGains(frozen, { ...starConfig, starTwinkle: 0 }, 5);
  assert.equal(
    frozen.stars.every((star) => star.gain === 1),
    true,
  );

  const largeOnly = createStarLayer(starLayout);
  updateStarGains(
    largeOnly,
    { ...starConfig, starTwinkleSize: 3, starTwinkle: 70 },
    5,
  );
  assert.equal(
    largeOnly.stars
      .filter((star) => star.size < 3)
      .every((star) => star.gain === 1),
    true,
  );

  const config = { ...starConfig };
  const layer = createStarLayer(starLayout);
  const gains = new Set();
  for (let time = 0; time < 10; time += 0.37) {
    updateStarGains(layer, config, time);
    for (const star of layer.stars) gains.add(star.gain);
  }

  for (const gain of gains) {
    assert.ok(
      [1, 0.65, 0.37].some((level) => Math.abs(gain - level) < 1e-12),
      `${gain} is not a held twinkle level`,
    );
    assert.ok(gain <= 1, "the twinkle never blooms");
  }

  for (const level of [1, 0.65, 0.37]) {
    assert.ok(
      [...gains].some((gain) => Math.abs(gain - level) < 1e-12),
      `${level} is reached at the shipped twinkle values`,
    );
  }

  updateStarGains(layer, config, 0);
  const held = layer.stars.map((star) => star.level);
  updateStarGains(layer, config, 0.05);
  assert.deepEqual(
    layer.stars.map((star) => star.level),
    held,
    "a step is held until its next change",
  );
});

test("the crossing takes the wheel's turn time and eases both ends", () => {
  // The palette strip turns as a wheel; the sky crosses in step with it, so
  // the two can never drift apart.
  assert.equal(TRANSITION_MS, TURN_MS);
  assert.equal(TRANSITION_MS, 640);

  assert.equal(smoothstep(0), 0);
  assert.equal(smoothstep(1), 1);
  assert.equal(smoothstep(0.5), 0.5);
  for (let i = 1; i <= 100; i += 1) {
    assert.ok(smoothstep(i / 100) >= smoothstep((i - 1) / 100));
  }
  assert.equal(smoothstep(-1), 0, "a mix below zero clamps");
  assert.equal(smoothstep(2), 1, "a mix above one clamps");
});

test("a crossing finishes exactly at its duration", () => {
  assert.equal(transitionMix(0, 1, 0), 0);
  assert.equal(transitionMix(0, 1, TRANSITION_MS), 1);
  assert.equal(transitionMix(1, 0, TRANSITION_MS), 0);
  assert.ok(transitionMix(0, 1, TRANSITION_MS - 1) < 1);
});

test("an interrupted crossing continues from where it was", () => {
  const half = transitionMix(0, 1, TRANSITION_MS / 2);
  assert.equal(half, 0.5, "the halfway mix is smoothstep's midpoint");

  assert.equal(transitionMix(half, 0, 0), half, "no jump at the interrupt");
  assert.equal(transitionMix(half, 0, TRANSITION_MS), 0);
  for (let i = 1; i <= 100; i += 1) {
    assert.ok(
      transitionMix(half, 0, i * 6) <= transitionMix(half, 0, (i - 1) * 6),
    );
  }
});

test("the ramp crosses monotonically from one shipped ramp to the other", () => {
  assert.deepEqual(rampAt(0.3), lerpRamp(RAMP, DARK_RAMP, 0.3));
  for (let stop = 0; stop < RAMP.length; stop += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      let previous = RAMP[stop][channel];
      for (let step = 1; step <= 20; step += 1) {
        const value = rampAt(step / 20)[stop][channel];
        assert.ok(value <= previous, `stop ${stop} channel ${channel} rises`);
        assert.ok(value >= DARK_RAMP[stop][channel]);
        previous = value;
      }
      assert.equal(previous, DARK_RAMP[stop][channel]);
    }
  }
});

test("a mix of nothing and everything reproduces the two shipped skies", () => {
  const field = createField({
    cols: starLayout.cols,
    rows: starLayout.rows,
    cellPx: starLayout.cellPx,
    scale: 150,
    seed: 12,
  });
  const layer = createStarLayer(starLayout);

  assert.deepEqual(
    [...renderFrame({ field, mix: 0, starLayer: layer })],
    [...renderFrame({ field })],
    "a day-mix is the shipped day",
  );
  assert.deepEqual(
    [...renderFrame({ field, mix: 1, starLayer: layer })],
    [...renderFrame({ field, dark: true, starLayer: layer })],
    "a night-mix is the shipped night",
  );
});

test("every block between the ramps comes from the interpolated ramp", () => {
  const field = createField(fieldOptions);
  const mix = 0.5;
  const pixels = renderFrame({ field, mix });
  const allowed = new Set(rampAt(mix).map(([r, g, b]) => `${r},${g},${b}`));

  for (let i = 0; i < pixels.length; i += 4) {
    const colour = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`;
    assert.ok(allowed.has(colour), `pixel ${i / 4} is ${colour}`);
  }
});

test("stars fade in with the ramp and land on the shipped tints", () => {
  const field = createField({
    cols: starLayout.cols,
    rows: starLayout.rows,
    cellPx: starLayout.cellPx,
    scale: 150,
    seed: 12,
  });
  const config = { ...starConfig, starBright: 100, starDither: 0 };
  const layer = () => createStarLayer(starLayout);
  const day = renderFrame({ field, config, starLayer: layer() });
  assert.deepEqual(
    [...renderFrame({ field, config, starLayer: layer(), mix: 0 })],
    [...day],
    "stars are invisible by day",
  );

  const half = 0.5;
  const mid = renderFrame({
    field,
    config,
    mix: half,
    starLayer: layer(),
  });
  const clear = rampAt(half)[rampAt(half).length - 1];

  let blended = 0;
  for (let i = 0; i < field.cols * field.rows; i += 1) {
    const colour = [mid[i * 4], mid[i * 4 + 1], mid[i * 4 + 2]];
    const tint = [...Object.values(STAR_TINTS), STAR_DIM].find((candidate) =>
      colour.every(
        (value, channel) =>
          Math.abs(
            value -
              clear[channel] -
              (candidate[channel] - clear[channel]) * half,
          ) <= 1,
      ),
    );
    if (tint) blended += 1;
  }
  assert.ok(blended > 0, "a star is a half-way blend of the clear band");

  const night = renderFrame({
    field,
    config,
    mix: 1,
    starLayer: layer(),
  });
  const shipped = new Set(
    [...Object.values(STAR_TINTS), STAR_DIM].map(
      ([r, g, b]) => `${r},${g},${b}`,
    ),
  );
  assert.ok(
    [...shipped].some((tint) => {
      const [r, g, b] = tint.split(",").map(Number);
      return night.some(
        (_, i) =>
          i % 4 === 0 &&
          night[i] === r &&
          night[i + 1] === g &&
          night[i + 2] === b,
      );
    }),
    "a night-mix paints the shipped tints",
  );
});

test("an interrupted crossing has no seam at the interrupt", () => {
  // A fall to night, interrupted half-way and reversed. The interrupt must not
  // introduce a step bigger than the crossing's own steps: the ramp continues
  // from where it was rather than jumping.
  const falling = [];
  for (let elapsed = 0; elapsed <= TRANSITION_MS / 2; elapsed += 16) {
    falling.push(transitionMix(0, 1, elapsed));
  }
  const held = falling[falling.length - 1];

  const rising = [];
  for (let elapsed = 0; elapsed <= TRANSITION_MS; elapsed += 16) {
    rising.push(transitionMix(held, 0, elapsed));
  }

  assert.equal(rising[0], held, "the reversed crossing opens where it left");
  assert.equal(rising[rising.length - 1], 0, "it lands on day");

  const ramps = [...falling, ...rising].map(rampAt);
  const step = (from, to) => {
    let largest = 0;
    for (let stop = 0; stop < RAMP.length; stop += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        largest = Math.max(
          largest,
          Math.abs(to[stop][channel] - from[stop][channel]),
        );
      }
    }
    return largest;
  };

  const steps = ramps.slice(1).map((ramp, i) => step(ramps[i], ramp));
  const seam = steps[falling.length - 1];

  assert.ok(
    steps.some((value) => value > 0),
    "the test samples a crossing in flight",
  );
  assert.equal(seam, 0, "the interrupt adds no step of its own");
});

const birdConfig = {
  ...SKY_DEFAULTS,
  // small, quick birds so a short test frame shows the birds aloft
  l1Scale: 20,
  l1Speed: 60,
  l1Count: 2,
  l2Scale: 14,
  l2Speed: 40,
  l2Count: 2,
  seed: 12,
};

const birdLayout = {
  cols: 120,
  rows: 60,
  cellPx: 2,
  config: birdConfig,
};

const birdField = createField({
  cols: birdLayout.cols,
  rows: birdLayout.rows,
  cellPx: birdLayout.cellPx,
  scale: 150,
  seed: 12,
});

/** The blocks inked for one bird-layer config and time, as x/y pairs. */
function birdInk(config, time) {
  const birdLayer = createBirdLayer({ ...birdLayout, config });
  return inkBlocks(
    renderFrame({ field: birdField, config, time, birdLayer }),
    birdLayout.cols,
    birdLayout.rows,
  );
}

function inkBounds(blocks) {
  const xs = blocks.map(([x]) => x);
  const ys = blocks.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** Contiguous runs of inked columns, bridging the gaps a wing's dither leaves. */
function inkRuns(blocks, bridge = 4) {
  const columns = [...new Set(blocks.map(([x]) => x))].sort((a, b) => a - b);
  const runs = [];
  for (const x of columns) {
    const last = runs[runs.length - 1];
    if (last && x - last[1] - 1 <= bridge) last[1] = x;
    else runs.push([x, x]);
  }
  return runs;
}

/**
 * One bird layer sampled over time, with each frame's ink and whether the
 * whole silhouette sits inside the sheet so its leading edge can be tracked.
 */
function birdRun(config, { to = 25, step = 0.1 } = {}) {
  const birdLayer = createBirdLayer({ ...birdLayout, config });
  const frames = [];
  for (let time = 0; time <= to + 1e-9; time += step) {
    const blocks = inkBlocks(
      renderFrame({ field: birdField, config, time, birdLayer }),
      birdLayout.cols,
      birdLayout.rows,
    );
    const bounds = blocks.length ? inkBounds(blocks) : null;
    frames.push({
      time,
      blocks,
      bounds,
      inside:
        bounds !== null && bounds.minX > 0 && bounds.maxX < birdLayout.cols - 1,
    });
  }
  return frames;
}

/** Blocks per second the leading edge travels, measured from the paint. */
function driftSpeed(frames) {
  let distance = 0;
  let elapsed = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const previous = frames[i - 1];
    const current = frames[i];
    if (!previous.inside || !current.inside) continue;
    const shift = current.bounds.minX - previous.bounds.minX;
    // Positive shifts are a wrap or the dither holding the leading edge.
    if (shift >= 0) continue;
    distance += -shift;
    elapsed += current.time - previous.time;
  }
  return distance / elapsed;
}

/** Every block painted exactly in the ink, and where it landed. */
function inkBlocks(pixels, cols, rows) {
  const found = [];
  for (let i = 0; i < cols * rows; i += 1) {
    if (
      pixels[i * 4] === BIRD_INK[0] &&
      pixels[i * 4 + 1] === BIRD_INK[1] &&
      pixels[i * 4 + 2] === BIRD_INK[2]
    )
      found.push([i % cols, Math.floor(i / cols)]);
  }
  return found;
}

test("the bird layer is deterministic for a seed", () => {
  const times = [0, 0.7, 2.3, 5.1];
  const frames = (config) => times.map((time) => birdInk(config, time));

  assert.deepEqual(frames(birdConfig), frames(birdConfig));
  assert.notDeepEqual(frames({ ...birdConfig, seed: 13 }), frames(birdConfig));
});

test("both depth layers fly, the near birds larger and faster", () => {
  const near = birdRun({ ...birdConfig, l1Count: 1, l2Count: 0 });
  const far = birdRun({ ...birdConfig, l1Count: 0, l2Count: 1 });

  assert.ok(
    near.some((frame) => frame.blocks.length > 0),
    "the near layer flies",
  );
  assert.ok(
    far.some((frame) => frame.blocks.length > 0),
    "the far layer flies",
  );

  const widest = (frames) =>
    Math.max(
      ...frames
        .filter((frame) => frame.bounds)
        .map((frame) => frame.bounds.maxX - frame.bounds.minX),
    );
  assert.ok(
    widest(near) > widest(far),
    "the near birds are larger than the far",
  );

  const nearSpeed = driftSpeed(near);
  const farSpeed = driftSpeed(far);
  assert.ok(
    nearSpeed > farSpeed * 1.2,
    `the near birds drift faster than the far (${nearSpeed} vs ${farSpeed})`,
  );
});

test("each bird flaps at its own rolled rate", () => {
  const still = { ...birdConfig, l1FlapJitter: 0, l2FlapJitter: 0 };
  const varied = { ...birdConfig, l1FlapJitter: 0.6, l2FlapJitter: 0.6 };
  const stillLayer = createBirdLayer({ ...birdLayout, config: still });
  const variedLayer = createBirdLayer({ ...birdLayout, config: varied });
  const differs = (a, b) => a.some((value, i) => value !== b[i]);

  let painted = false;
  for (let i = 1; i <= 100 && !painted; i += 1) {
    const time = i * 0.1;
    painted = differs(
      renderFrame({
        field: birdField,
        config: still,
        time,
        birdLayer: stillLayer,
      }),
      renderFrame({
        field: birdField,
        config: varied,
        time,
        birdLayer: variedLayer,
      }),
    );
  }
  assert.ok(painted, "the per-bird beat variance changes the painted wings");
});

test("the bird layer is aloft at load, spread over distinct slots", () => {
  // A tighter pass makes several birds visible in the first frame; the
  // columns they ink show the birds spread across the sheet, not stacked.
  const spread = { ...birdConfig, l1Count: 4, l2Count: 0, l1Gap: 0 };
  const runs = inkRuns(birdInk(spread, 0));
  assert.ok(runs.length >= 3, "several birds are aloft at load");

  const centres = runs.map(([from, to]) => (from + to) / 2);
  for (let i = 1; i < centres.length; i += 1) {
    assert.ok(
      centres[i] - centres[i - 1] > 20,
      "no two birds share a slot in the paint",
    );
  }
  assert.ok(
    Math.min(...centres) < birdLayout.cols / 3,
    "the birds reach the left of the sheet",
  );
  assert.ok(
    Math.max(...centres) > (birdLayout.cols * 2) / 3,
    "the birds reach the right of the sheet",
  );
});

test("the count sets density", () => {
  const inkAt = (count) =>
    birdInk({ ...birdConfig, l1Count: count, l2Count: count }, 4).length;
  assert.ok(inkAt(4) > inkAt(1), "more birds ink more of the sheet");
});

test("the bird layer enters from off-screen right and wraps off-screen left", () => {
  const config = { ...birdConfig, l1Count: 1, l2Count: 0, l1Gap: 0 };
  const birdLayer = createBirdLayer({ ...birdLayout, config });
  const step = 0.02;
  let previous = false;
  let lastInk = null;
  const entries = [];
  const exits = [];

  for (let time = 0; time <= 10; time += step) {
    const blocks = inkBlocks(
      renderFrame({ field: birdField, config, time, birdLayer }),
      birdLayout.cols,
      birdLayout.rows,
    );
    for (const [x, y] of blocks) {
      assert.ok(
        x >= 0 && x < birdLayout.cols,
        `block ${x} is outside the sheet`,
      );
      assert.ok(y >= 0 && y < birdLayout.rows, `row ${y} is outside the sheet`);
    }

    const inked = blocks.length > 0;
    if (inked && !previous) entries.push(inkBounds(blocks));
    if (!inked && previous) exits.push(lastInk);
    if (inked) lastInk = inkBounds(blocks);
    previous = inked;
  }

  assert.ok(entries.length >= 1, "the bird enters the sheet from a blank sky");
  assert.ok(exits.length >= 1, "the bird leaves the sheet into a blank sky");
  for (const entry of entries) {
    assert.ok(
      entry.maxX >= birdLayout.cols - 2,
      "the bird enters at the right edge",
    );
  }
  for (const exit of exits) {
    assert.ok(exit.minX <= 1, "the bird wraps off the left edge");
  }
});

test("the birds keep to the light sky", () => {
  const layer = createBirdLayer(birdLayout);
  const light = renderFrame({
    field: birdField,
    config: birdConfig,
    time: 5,
    birdLayer: layer,
  });
  assert.ok(
    inkBlocks(light, birdLayout.cols, birdLayout.rows).length > 0,
    "the bird layer paints in the light sky",
  );

  const dark = renderFrame({
    field: birdField,
    config: birdConfig,
    time: 5,
    birdLayer: layer,
    mix: 1,
  });
  assert.equal(
    inkBlocks(dark, birdLayout.cols, birdLayout.rows).length,
    0,
    "the bird layer clears once the sky has crossed to night",
  );

  const off = createBirdLayer({
    ...birdLayout,
    config: { ...birdConfig, birds: 0 },
  });
  assert.equal(off, null, "the bird layer can be turned off entirely");
});

test("back-band birds are hidden by the cloud bands", () => {
  // The front band inks over the clouds, so the occlusion rule is tested with
  // only the far layer flying: it may paint only where the sky is clear.
  const config = { ...birdConfig, l1Count: 0, l2Count: 3 };
  const birdLayer = createBirdLayer({ ...birdLayout, config });
  const bands = new Uint8Array(birdLayout.cols * birdLayout.rows);
  const pixels = renderFrame({
    field: birdField,
    bands,
    config,
    time: 6,
    birdLayer,
  });
  const ink = new Set(
    inkBlocks(pixels, birdLayout.cols, birdLayout.rows).map(
      ([x, y]) => y * birdLayout.cols + x,
    ),
  );
  assert.ok(ink.size > 0, "the back band paints against the clear sky");

  for (const block of ink) {
    assert.equal(bands[block], 0, `block ${block} is a bird behind a cloud`);
  }
});

test("the bird layer builds and paints through the shared layer interface", () => {
  // Only the far layer flies, so the band record gates every painted block.
  const config = { ...birdConfig, l1Count: 0, l2Count: 3 };
  const layer = buildBirdLayer({ ...birdLayout, config });

  assert.deepEqual(
    layer.birds,
    createBirdLayer({ ...birdLayout, config }).birds,
    "the stable name builds the same bird layer",
  );

  const paint = (bands) => {
    const pixels = new Uint8ClampedArray(birdLayout.cols * birdLayout.rows * 4);
    layer.paint({
      pixels,
      cols: birdLayout.cols,
      rows: birdLayout.rows,
      bands,
      config,
      time: 6,
      blend: 0,
    });
    return inkBlocks(pixels, birdLayout.cols, birdLayout.rows);
  };

  const clear = paint(new Uint8Array(birdLayout.cols * birdLayout.rows));
  assert.ok(clear.length > 0, "the bird layer paints into the shared pixels");

  const covered = paint(
    new Uint8Array(birdLayout.cols * birdLayout.rows).fill(1),
  );
  assert.equal(
    covered.length,
    0,
    "the bird layer's own paint honours the shared bands",
  );
});

test("the bird layer's stamp cache stays inside its memory bound", () => {
  const defaults = createBirdLayer({
    cols: 480,
    rows: 270,
    cellPx: 4,
    config: SKY_DEFAULTS,
  });
  assert.ok(defaults.stampBytes > 0, "the bird layer bakes stamps");
  assert.ok(
    defaults.stampBytes <= 200 * 1024,
    `the shipped bird layer's stamps take ${defaults.stampBytes} bytes`,
  );

  const stress = createBirdLayer({
    ...birdLayout,
    config: { ...birdConfig, l1Count: 30, l2Count: 30 },
  });
  assert.ok(
    stress.stampBytes <= 200 * 1024,
    `a crowded bird layer's stamps take ${stress.stampBytes} bytes`,
  );
});

test("a bird-only rebuild swaps the bird layer and leaves the rest of the scene", () => {
  const scene = createScene({
    config: birdConfig,
    cols: birdLayout.cols,
    rows: birdLayout.rows,
    cellPx: birdLayout.cellPx,
  });
  const { field, starLayer, birdLayer } = scene;
  const more = { ...birdConfig, l1Count: birdConfig.l1Count + 1 };
  const rebuilt = createBirdLayer({
    cols: birdLayout.cols,
    rows: birdLayout.rows,
    cellPx: birdLayout.cellPx,
    config: more,
  });

  let swapped = false;
  for (const time of [0, 0.5, 1, 2, 4, 8]) {
    const before = renderFrame({ field, config: birdConfig, time, birdLayer });
    const after = renderFrame({
      field,
      config: more,
      time,
      birdLayer: rebuilt,
    });
    if (before.some((value, i) => value !== after[i])) swapped = true;
  }
  assert.ok(swapped, "the rebuilt bird layer paints differently");
  assert.equal(field, scene.field, "the noise field keeps its identity");
  assert.equal(starLayer, scene.starLayer, "the star layer keeps its identity");
});

test("copy values renders every shipped key, the bird layer's included", () => {
  const text = defaultsText(
    Object.freeze({ ...SKY_DEFAULTS, l1Count: 5, birds: 0 }),
  );

  for (const key of Object.keys(SKY_DEFAULTS)) {
    assert.match(text, new RegExp(`^  ${key}: `, "m"), `${key} is copied`);
  }
  assert.match(text, /^  birds: 0,$/m);
  assert.match(text, /^  l1Count: 5,$/m);
  assert.match(text, /^  l2Spread: 0.64,$/m);
  assert.match(text, /^  mode: "frame",$/m);
});

test("copy values pins the shipped seeds, not the live visit", () => {
  const text = defaultsText(
    Object.freeze({ ...SKY_DEFAULTS, seed: 987654, birdSeed: 123456 }),
  );

  assert.match(text, /^  seed: 12,$/m);
  assert.match(text, /^  birdSeed: 19,$/m);
  assert.doesNotMatch(text, /987654|123456/, "the live seeds do not leak");
});
