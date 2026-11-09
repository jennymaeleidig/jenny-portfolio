import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BAYER4,
  RAMP,
  SKY_DEFAULTS,
  createField,
  fbm,
  hash,
  rampIndex,
  renderFrame,
  sampleEvolve,
  sampleField,
  thresholds,
  toneIndex,
} from "../assets/sky-core.mjs";

function rawToneIndex(value, bandThresholds, dither, bayer) {
  let q = 0;
  while (q < bandThresholds.length && value + dither * bayer >= bandThresholds[q]) q += 1;
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
    maxFps: 60,
  });

  assert.deepEqual(RAMP, [
    [223, 229, 231],
    [197, 213, 229],
    [158, 200, 228],
    [33, 87, 204],
  ]);
});

test("the field is deterministic for a seed", () => {
  const first = createField(fieldOptions);
  const second = createField(fieldOptions);

  assert.deepEqual([...first.data], [...second.data]);
  assert.equal(first.periodX, second.periodX);
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
      const there = fbm(step + periodX, y * (field.cellPx / field.scale), seed, periodX);
      assert.ok(
        Math.abs(here - there) < 1e-12,
        `x=${x}, y=${y} is not periodic: ${here} !== ${there}`,
      );
    }
  }

  // The hash itself wraps exactly.
  for (let x = -8; x < 16; x += 1) {
    assert.equal(hash(x, 2, seed, periodX), hash(x + periodX, 2, seed, periodX));
  }
});

test("sampling the stored field wraps instead of clamping", () => {
  const field = createField(fieldOptions);

  assert.equal(sampleField(field, 3, 4), sampleField(field, field.width + 3, 4));
  assert.equal(sampleField(field, -1, 4), sampleField(field, field.width - 1, 4));
});

test("the quantiser only ever emits indices into the ramp", () => {
  const field = createField(fieldOptions);
  const pixels = renderFrame({ field });
  const allowed = new Set(RAMP.map(([r, g, b]) => `${r},${g},${b}`));

  assert.equal(pixels.length, field.cols * field.rows * 4);

  for (let i = 0; i < pixels.length; i += 4) {
    assert.equal(pixels[i + 3], 255, "every block is opaque");
    const colour = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`;
    assert.ok(allowed.has(colour), `pixel ${i / 4} is ${colour}, not in the ramp`);
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
      assert.ok(index >= 0 && index < RAMP.length, `tones=${tones} band=${band} -> ${index}`);
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

  assert.ok(clampEngaged, "the test must exercise a case the clamp actually changes");
});

test("the clamp pulls an over-dithered sample back to one band", () => {
  const bands = [0.4, 0.5, 0.6];
  const value = 0.45;

  assert.equal(rawToneIndex(value, bands, 1, 1), 3, "unclamped dither crosses every band");
  assert.equal(toneIndex(value, bands, 1, 1), 2, "one band above the undithered result");
});

test("dither dissolves a boundary instead of snapping it", () => {
  const bands = thresholds(SKY_DEFAULTS.tones, SKY_DEFAULTS.stark);
  const value = bands[0] + 0.001;
  const bandsHit = new Set(
    BAYER4.map((bayer) => toneIndex(value, bands, SKY_DEFAULTS.dither / 100, bayer)),
  );

  assert.ok(bandsHit.size > 1, "a threshold should spread across more than one band");
});

test("two consecutive frames differ", () => {
  const field = createField({ cols: 360, rows: 200, cellPx: 2, scale: 150, seed: 12 });
  const first = renderFrame({ field, time: 0, offset: 0 });
  const next = renderFrame({
    field,
    time: 1 / 60,
    offset: (SKY_DEFAULTS.speed * (1 / 60)) / field.cellPx,
  });

  assert.notDeepEqual([...first], [...next]);
});

test("the evolution field is periodic on both axes and carries no bias", () => {
  const field = createField({ cols: 240, rows: 140, cellPx: 2, scale: 150, seed: 12 });

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

  const mean = field.evolve.reduce((sum, value) => sum + value, 0) / field.evolve.length;
  assert.ok(Math.abs(mean) < 1e-6, `the flow must be centred, not ${mean}`);

  const spread = Math.max(...field.evolve) - Math.min(...field.evolve);
  assert.ok(spread > 0.1, `the flow must vary across the field, spread is ${spread}`);
});

test("the masses swell in different places instead of breathing in step", () => {
  const field = createField({ cols: 240, rows: 140, cellPx: 2, scale: 150, seed: 12 });
  const config = { ...SKY_DEFAULTS, speed: 0, warp: 0, warpSpeed: 0, dither: 0, evolveSpeed: 0 };
  const still = new Uint8Array(field.cols * field.rows);
  const evolved = new Uint8Array(field.cols * field.rows);

  renderFrame({ field, bands: still, config: { ...config, evolve: 0 }, time: 0, offset: 0 });
  renderFrame({ field, bands: evolved, config: { ...config, evolve: 100 }, time: 0, offset: 0 });

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
  const bare = createField({ cols: 60, rows: 40, cellPx: 2, scale: 150, seed: 12 });
  const roomy = createField({ cols: 60, rows: 40, cellPx: 2, scale: 150, seed: 12, margin: 20 });

  assert.equal(roomy.height, roomy.rows + 40, "the margin adds rows on both sides");

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
  assert.ok(above > 0 && above < 1, "the margin holds real sky, not a flat edge");
});

test("the lift pans the sky and stops at the margin", () => {
  const field = createField({ cols: 80, rows: 60, cellPx: 2, scale: 150, seed: 12, margin: 24 });
  const config = { ...SKY_DEFAULTS, speed: 0, warp: 0, warpSpeed: 0, evolve: 0 };
  const rest = renderFrame({ field, config, offsetY: 0 });
  const up = renderFrame({ field, config, offsetY: 12 });
  const down = renderFrame({ field, config, offsetY: -12 });

  assert.notDeepEqual([...rest], [...up], "the clouds move up");
  assert.notDeepEqual([...rest], [...down], "the clouds move down");

  const pinned = renderFrame({ field, config, offsetY: 500 });
  const pinnedSame = renderFrame({ field, config, offsetY: 200 });
  assert.deepEqual([...pinned], [...pinnedSame], "past the margin it stops rather than wrapping");
});

test("the flow's feature size is built into the field", () => {
  const small = createField({ cols: 240, rows: 140, cellPx: 2, scale: 150, seed: 12, evolveScale: 90 });
  const large = createField({ cols: 240, rows: 140, cellPx: 2, scale: 150, seed: 12, evolveScale: 540 });

  assert.ok(small.evolvePeriod > large.evolvePeriod, "a smaller flow sees more lattice cells");
  assert.equal(small.evolvePeriodY > large.evolvePeriodY, true);
  assert.notDeepEqual([...small.evolve], [...large.evolve]);
});

test("the flow's tilt decides how much of its drift is vertical", () => {
  const field = createField({ cols: 240, rows: 140, cellPx: 2, scale: 150, seed: 12 });
  const config = { ...SKY_DEFAULTS, speed: 0, warp: 0, warpSpeed: 0, evolveSpeed: 60 };

  const sideways = renderFrame({ field, config: { ...config, evolveTilt: 0 }, time: 5, offset: 0 });
  const upright = renderFrame({ field, config: { ...config, evolveTilt: 100 }, time: 5, offset: 0 });

  assert.notDeepEqual([...sideways], [...upright], "tilt changes where the flow has got to");
});

test("with evolve off the sky holds perfectly still", () => {
  const field = createField({ cols: 160, rows: 100, cellPx: 2, scale: 150, seed: 12 });
  const config = { ...SKY_DEFAULTS, evolve: 0, speed: 0, warp: 0, warpSpeed: 0 };

  const first = renderFrame({ field, config, time: 0, offset: 0 });
  const later = renderFrame({ field, config, time: 30, offset: 0 });

  assert.deepEqual([...first], [...later]);
});

test("the flow drifts with its own speed, independent of the sky's", () => {
  const field = createField({ cols: 360, rows: 200, cellPx: 2, scale: 150, seed: 12 });
  const config = { ...SKY_DEFAULTS, speed: 0, warp: 0, warpSpeed: 0 };

  const still = renderFrame({ field, config: { ...config, evolveSpeed: 0 }, time: 0, offset: 0 });
  const holding = renderFrame({ field, config: { ...config, evolveSpeed: 0 }, time: 6, offset: 0 });
  const drifted = renderFrame({ field, config, time: 6, offset: 0 });

  assert.deepEqual([...still], [...holding], "with no evolve speed the flow holds still");
  assert.notDeepEqual([...still], [...drifted], "evolveSpeed alone moves the flow");
});
