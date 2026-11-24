// The WebGL2 adapter's creation seam, exercised without a GL context: a page
// only falls back to the CPU adapter when there is no context to be had.
import { test } from "node:test";
import assert from "node:assert/strict";

import { createWebglRenderer } from "../assets/sky-webgl.mjs";

function canvasReturning(value) {
  const calls = [];
  return {
    calls,
    getContext(kind, attributes) {
      calls.push([kind, attributes]);
      return value;
    },
    addEventListener() {},
  };
}

test("the GPU adapter is absent when there is no canvas", () => {
  assert.equal(createWebglRenderer({}), null);
  assert.equal(createWebglRenderer(), null);
});

test("the GPU adapter is absent when the canvas has no context method", () => {
  assert.equal(createWebglRenderer({ canvas: {} }), null);
});

test("the GPU adapter asks only for WebGL2 and reports its absence", () => {
  const canvas = canvasReturning(null);
  assert.equal(createWebglRenderer({ canvas }), null);
  assert.deepEqual(
    canvas.calls.map(([kind]) => kind),
    ["webgl2"],
  );
});

test("the GPU adapter is absent when requesting WebGL2 throws", () => {
  const canvas = {
    getContext() {
      throw new Error("no context here");
    },
  };
  assert.equal(createWebglRenderer({ canvas }), null);
});
