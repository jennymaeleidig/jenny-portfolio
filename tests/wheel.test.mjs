// The palette strip's turn: geometry and timeline, without a browser
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ANGLE_PER_NOTCH,
  ARC,
  NOTCH_COUNT,
  PERSPECTIVE,
  PINCH_DEPTH,
  PINCH_MS,
  ROTATE_MS,
  SETTLE_MS,
  TURN_MS,
  frameAt,
  planTurn,
} from "../assets/wheel-core.mjs";

const close = (actual, expected, message) =>
  assert.ok(
    Math.abs(actual - expected) < 0.01,
    `${message}: expected ${expected}, got ${actual}`,
  );

test("the wheel turns one seven-notch step of 105 degrees", () => {
  assert.equal(NOTCH_COUNT, 7);
  assert.equal(ANGLE_PER_NOTCH, 15);
  assert.equal(NOTCH_COUNT * ANGLE_PER_NOTCH, 105);
  assert.equal(ARC, 105);
  assert.equal(PERSPECTIVE, 900);
  assert.equal(PINCH_DEPTH, 12);
  assert.equal(PINCH_MS + ROTATE_MS + SETTLE_MS, 640);
  assert.equal(TURN_MS, 640);
});

test("the radius follows the row's pitch", () => {
  close(planTurn(20, "light", "header").radius, 75.96, "20 px");
  close(planTurn(16, "light", "header").radius, 60.77, "16 px");
});

test("each strip turns toward the incoming palette", () => {
  /** @type {Array<[import("../assets/wheel-core.mjs").Theme, import("../assets/wheel-core.mjs").Role, number, number]>} */
  const cases = [
    ["light", "header", -105, 7],
    ["dark", "header", 105, -7],
    ["light", "footer", 105, -7],
    ["dark", "footer", -105, 7],
  ];

  for (const [outgoing, role, rotation, incomingOffset] of cases) {
    const plan = planTurn(20, outgoing, role);
    assert.equal(plan.rotation, rotation, `${outgoing} ${role}`);
    assert.equal(plan.incomingOffset, incomingOffset, `${outgoing} ${role}`);
    close(plan.radius, 75.96, `${outgoing} ${role}`);
  }
});

test("the turn opens on the flat outgoing row", () => {
  assert.deepEqual(frameAt(0), {
    pinch: 0,
    curvature: 0,
    incomingCurvature: 1,
    progress: 0,
    outgoingOpacity: 1,
    incomingOpacity: 0,
  });
  assert.deepEqual(
    frameAt(-50),
    frameAt(0),
    "time before the click is the opening",
  );
});

test("the incoming palette stays bent on the drum through the pinch", () => {
  for (const elapsed of [0, 1, 50, PINCH_MS - 1]) {
    const frame = frameAt(elapsed);
    assert.equal(frame.incomingCurvature, 1, `${elapsed} ms`);
    assert.equal(frame.progress, 0, `${elapsed} ms`);
    assert.equal(frame.outgoingOpacity, 1, `${elapsed} ms`);
  }
  assert.ok(frameAt(50).curvature > 0, "the outgoing row has started to bend");
});

test("the outgoing group fades only once the rotation is underway", () => {
  const early = PINCH_MS + ROTATE_MS * 0.25;
  const late = PINCH_MS + ROTATE_MS * 0.9;

  assert.equal(frameAt(early).outgoingOpacity, 1);
  assert.ok(frameAt(late).outgoingOpacity < 1);
  assert.ok(frameAt(late).outgoingOpacity > 0);
});

test("the rotation ends on the incoming row", () => {
  const frame = frameAt(PINCH_MS + ROTATE_MS);

  assert.equal(frame.pinch, 1);
  assert.equal(frame.curvature, 1);
  assert.equal(frame.incomingCurvature, 1);
  assert.equal(frame.progress, 1);
  assert.equal(frame.outgoingOpacity, 0);
  assert.equal(frame.incomingOpacity, 1);
});

test("the turn lands flat on the incoming row", () => {
  const flat = {
    pinch: 0,
    curvature: 0,
    incomingCurvature: 0,
    progress: 1,
    outgoingOpacity: 0,
    incomingOpacity: 1,
  };

  assert.deepEqual(frameAt(TURN_MS), flat);
  assert.deepEqual(frameAt(TURN_MS + 1000), flat, "the clock can overshoot");
});
