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
  sampleField,
  thresholds,
  toneIndex,
} from "../assets/sky-core.mjs";

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
    scale: 150,
    gain: 3.55,
    speed: 20,
    falloff: 54,
    evolve: 18,
    evolveSpeed: 26,
    warp: 14,
    warpSpeed: 13,
    dither: 75,
    sky: 92,
    stark: 74,
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

  for (let step = 0; step <= 1000; step += 1) {
    const value = step / 1000;
    const base = toneIndex(value, bands, 0, 0);

    for (const bayer of BAYER4) {
      for (let dither = 0; dither <= 100; dither += 5) {
        const band = toneIndex(value, bands, dither / 100, bayer);
        assert.ok(
          Math.abs(band - base) <= 1,
          `value=${value} dither=${dither} bayer=${bayer}: ${base} -> ${band}`,
        );
      }
    }
  }
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
