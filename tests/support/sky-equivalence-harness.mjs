/**
 * The adapter equivalence harness: one sky scene and one frame state rendered
 * through the CPU and WebGL2 adapters, then read back and compared.
 *
 * The pure core is the canonical reference. This harness never treats a shader
 * as an oracle: every allowance and every assertion is made against the CPU
 * adapter's surface.
 *
 * The comparison follows the visual-equivalence contract — the same ramps,
 * the same thresholds, the same phases and the same ordered dither — rather
 * than a bit comparison. It reports the mean and per-channel absolute delta,
 * the count and share of channels past a small threshold, and the maximum
 * delta. A block that differs only because a star twinkles at a neighbouring
 * level is classified separately and bounded; the rest of the sheet must agree.
 *
 * The one accepted crossing is the star twinkle. The CPU keeps a per-star
 * deadband and holds each twinkle step, while the kernel runs stateless sines
 * through the dithered star thresholds. A star block may therefore land one
 * level away. The harness names that allowance (`starLevel`) instead of
 * widening the whole comparison. If twinkle chatter is ever observed, the
 * remedy is the CPU-side gains texture updated once per frame — an upload,
 * not a readback.
 */

import { SKY_DEFAULTS, createScene } from "../../assets/sky-core.mjs";
import { STAR_DIM, STAR_TINTS } from "../../assets/sky-stars.mjs";
import { lerpColour, rampAt, rampIndex } from "../../assets/sky-tone.mjs";
import { createCpuRenderer } from "../../assets/sky-renderer.mjs";
import { createWebglRenderer } from "../../assets/sky-webgl.mjs";

/** A channel pair within this many 8-bit levels is treated as equal. */
export const DIFFERENCE_THRESHOLD = 2;

/** The layout the harness builds unless the caller supplies one. */
export const DEFAULT_LAYOUT = Object.freeze({ cols: 120, rows: 68, cellPx: 4 });

function starOutcomes(blend, tintKey, tones) {
  const clear = rampAt(blend)[rampIndex(0, tones)];
  return [
    clear,
    lerpColour(clear, STAR_DIM, blend),
    lerpColour(clear, STAR_TINTS[tintKey], blend),
  ];
}

function nearestStarLevel(pixels, pixel, outcomes, threshold) {
  let best = -1;
  let bestDistance = Infinity;
  for (let level = 0; level < outcomes.length; level += 1) {
    const colour = outcomes[level];
    let distance = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      distance += Math.abs(pixels[pixel + channel] - colour[channel]);
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      best = level;
    }
  }
  return bestDistance <= threshold * 3 ? best : -1;
}

function accumulateDeltas(cpu, gpu, blockCount) {
  const perChannel = [0, 0, 0, 0];
  const perChannelOver = [0, 0, 0, 0];
  const differing = [];
  let sum = 0;
  let over = 0;
  let maximum = 0;

  for (let block = 0; block < blockCount; block += 1) {
    const pixel = block * 4;
    let blockOver = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(cpu[pixel + channel] - gpu[pixel + channel]);
      sum += delta;
      perChannel[channel] += delta;
      if (delta > maximum) maximum = delta;
      if (delta > DIFFERENCE_THRESHOLD) {
        over += 1;
        perChannelOver[channel] += 1;
        blockOver = true;
      }
    }
    if (blockOver) differing.push(block);
  }

  return { perChannel, perChannelOver, differing, sum, over, maximum };
}

function classifyDiffering(differing, cpu, gpu, scene, blend, tones) {
  const starOwned = scene.starLayer?.owner ?? null;
  let starBlocks = 0;
  let starLevelBlocks = 0;
  let starStepMaximum = 0;
  let unexplainedBlocks = 0;

  for (const block of differing) {
    const owner = starOwned ? starOwned[block] : -1;
    if (owner < 0) {
      unexplainedBlocks += 1;
      continue;
    }

    starBlocks += 1;
    const pixel = block * 4;
    const outcomes = starOutcomes(blend, scene.starLayer.tint[block], tones);
    const cpuLevel = nearestStarLevel(
      cpu,
      pixel,
      outcomes,
      DIFFERENCE_THRESHOLD,
    );
    const gpuLevel = nearestStarLevel(
      gpu,
      pixel,
      outcomes,
      DIFFERENCE_THRESHOLD,
    );
    const step = Math.abs(cpuLevel - gpuLevel);
    if (cpuLevel >= 0 && gpuLevel >= 0 && step <= 1) {
      starLevelBlocks += 1;
      if (step > starStepMaximum) starStepMaximum = step;
    } else {
      unexplainedBlocks += 1;
    }
  }

  return {
    starBlocks,
    starLevelBlocks,
    starStepMaximum,
    unexplainedBlocks,
  };
}

/** The largest single-level star recolour available on this frame's stars. */
function oneLevelMaximum(scene, blockCount, blend, tones) {
  const starOwned = scene.starLayer?.owner ?? null;
  if (!starOwned) return 0;

  let maximum = 0;
  for (let block = 0; block < blockCount; block += 1) {
    if (starOwned[block] < 0) continue;
    const outcomes = starOutcomes(blend, scene.starLayer.tint[block], tones);
    for (let level = 1; level < outcomes.length; level += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        const delta = Math.abs(
          outcomes[level][channel] - outcomes[level - 1][channel],
        );
        if (delta > maximum) maximum = delta;
      }
    }
  }
  return maximum;
}

function measure(cpu, gpu, scene, blockCount, blend, tones) {
  const deltas = accumulateDeltas(cpu, gpu, blockCount);
  const stars = classifyDiffering(
    deltas.differing,
    cpu,
    gpu,
    scene,
    blend,
    tones,
  );
  const channels = blockCount * 4;

  return {
    threshold: DIFFERENCE_THRESHOLD,
    channels,
    meanAbs: deltas.sum / channels,
    perChannelAbs: deltas.perChannel.map((total) => total / blockCount),
    perChannelOver: deltas.perChannelOver,
    overThreshold: deltas.over,
    overThresholdShare: deltas.over / channels,
    maximum: deltas.maximum,
    ...stars,
    starLevelShare: blockCount ? stars.starLevelBlocks / blockCount : 0,
    allowedMaximum: oneLevelMaximum(scene, blockCount, blend, tones),
  };
}

/** Render one frame through both adapters and diff the two surfaces. */
export function compareFrame({
  scene,
  cpu,
  webgl,
  state,
  blockCount,
  config = SKY_DEFAULTS,
}) {
  const blend =
    state.mix === undefined ? Number(Boolean(state.dark)) : state.mix;
  cpu.render(state);
  webgl.render(state);
  const cpuPixels = cpu.surface.pixels;
  const gpuPixels = webgl.surface.readFrame();
  if (!gpuPixels) throw new Error("the WebGL2 surface could not be read back");
  return measure(cpuPixels, gpuPixels, scene, blockCount, blend, config.tones);
}

/** Build one scene and the two adapters that paint it. */
export function createAdapters({
  layout = DEFAULT_LAYOUT,
  config = SKY_DEFAULTS,
} = {}) {
  const scene = createScene({
    config,
    cols: layout.cols,
    rows: layout.rows,
    cellPx: layout.cellPx,
  });

  const webglCanvas = document.createElement("canvas");
  webglCanvas.width = layout.cols;
  webglCanvas.height = layout.rows;

  const webgl = createWebglRenderer({ canvas: webglCanvas, config });
  if (!webgl) {
    throw new Error("the browser did not provide a WebGL2 context");
  }

  const cpu = createCpuRenderer({ config });
  cpu.setScene(scene);
  webgl.setScene(scene);

  return { scene, cpu, webgl };
}

/**
 * Build one scene, render each frame state through both adapters, and return
 * the measured difference for every frame. Frames run in the order given, so
 * the CPU twinkle sees the same sequence a page would.
 */
export function runEquivalence({
  layout = DEFAULT_LAYOUT,
  frames,
  config = SKY_DEFAULTS,
} = {}) {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error("the equivalence harness needs at least one frame state");
  }

  const { scene, cpu, webgl } = createAdapters({ layout, config });

  const results = frames.map((frame) => {
    const state = {
      time: frame.time ?? 0,
      offset: frame.offset ?? 0,
      mix: frame.mix,
      dark: frame.dark ?? false,
    };
    return {
      name: frame.name,
      ...compareFrame({
        scene,
        cpu,
        webgl,
        state,
        blockCount: layout.cols * layout.rows,
        config,
      }),
    };
  });

  return { layout, results };
}

/** The performance grid: the layout the baseline was measured at. */
export const PERFORMANCE_LAYOUT = Object.freeze({
  cols: 480,
  rows: 270,
  cellPx: 4,
});

/** Read one frame's star level for every star-owned block. */
function starLevelSheet(pixels, scene, blend, tones) {
  const owner = scene.starLayer?.owner;
  const levels = new Int8Array(owner ? owner.length : 0).fill(-1);
  if (!owner) return levels;

  for (let block = 0; block < owner.length; block += 1) {
    if (owner[block] < 0) continue;
    const outcomes = starOutcomes(blend, scene.starLayer.tint[block], tones);
    levels[block] = nearestStarLevel(
      pixels,
      block * 4,
      outcomes,
      DIFFERENCE_THRESHOLD,
    );
  }
  return levels;
}

/**
 * Render consecutive frames at the animation cadence and count the star blocks
 * whose level changes from one frame to the next, for each adapter. Only the
 * blocks that classify as a star level in both adjacent frames are compared,
 * so a cloud band crossing a star cannot be read as chatter.
 */
export function runStarChatter({
  layout = DEFAULT_LAYOUT,
  config = SKY_DEFAULTS,
  frames = 24,
  fps = 24,
  offset = 0,
  mix = 1,
} = {}) {
  const { scene, cpu, webgl } = createAdapters({ layout, config });
  const owner = scene.starLayer?.owner;
  if (!owner) throw new Error("this scene has no star layer to measure");

  const starBlocks = [];
  for (let block = 0; block < owner.length; block += 1) {
    if (owner[block] >= 0) starBlocks.push(block);
  }

  const blend = mix === undefined ? 1 : mix;
  const tones = config.tones;
  let previousCpu = null;
  let previousGpu = null;
  let cpuFlips = 0;
  let gpuFlips = 0;
  let gpuFlipsWhileCpuHeld = 0;
  let pairs = 0;
  const perFrame = [];

  for (let index = 0; index < frames; index += 1) {
    const state = { time: index / fps, offset, mix };
    cpu.render(state);
    webgl.render(state);
    const gpuPixels = webgl.surface.readFrame();
    if (!gpuPixels)
      throw new Error("the WebGL2 surface could not be read back");
    const cpuLevels = starLevelSheet(cpu.surface.pixels, scene, blend, tones);
    const gpuLevels = starLevelSheet(gpuPixels, scene, blend, tones);

    if (previousCpu && previousGpu) {
      let frameCpu = 0;
      let frameGpu = 0;
      let frameHeld = 0;
      let framePairs = 0;
      for (const block of starBlocks) {
        const cpuWas = previousCpu[block];
        const cpuNow = cpuLevels[block];
        const gpuWas = previousGpu[block];
        const gpuNow = gpuLevels[block];
        if (cpuWas < 0 || cpuNow < 0 || gpuWas < 0 || gpuNow < 0) continue;
        framePairs += 1;
        const cpuFlip = cpuWas !== cpuNow;
        const gpuFlip = gpuWas !== gpuNow;
        if (cpuFlip) frameCpu += 1;
        if (gpuFlip) frameGpu += 1;
        if (!cpuFlip && gpuFlip) frameHeld += 1;
      }
      cpuFlips += frameCpu;
      gpuFlips += frameGpu;
      gpuFlipsWhileCpuHeld += frameHeld;
      pairs += framePairs;
      perFrame.push({
        frame: index,
        pairs: framePairs,
        cpuFlips: frameCpu,
        gpuFlips: frameGpu,
      });
    }

    previousCpu = cpuLevels;
    previousGpu = gpuLevels;
  }

  return {
    layout,
    fps,
    frames,
    starBlocks: starBlocks.length,
    pairs,
    cpuFlips,
    gpuFlips,
    gpuFlipsWhileCpuHeld: gpuFlipsWhileCpuHeld,
    cpuFlipRate: pairs ? cpuFlips / pairs : 0,
    gpuFlipRate: pairs ? gpuFlips / pairs : 0,
    perFrame,
  };
}

/** Time one adapter's render call, after a warm-up, over the settled grid. */
function timeAdapter(renderer, { warmup, frames, fps }) {
  for (let index = 0; index < warmup; index += 1) {
    renderer.render({ time: index / fps, offset: index * 0.25, mix: 0.5 });
  }
  const samples = new Array(frames);
  for (let index = 0; index < frames; index += 1) {
    const step = warmup + index;
    const start = performance.now();
    renderer.render({ time: step / fps, offset: step * 0.25, mix: 0.5 });
    samples[index] = performance.now() - start;
  }
  samples.sort((a, b) => a - b);
  return {
    median: samples[Math.floor(samples.length / 2)],
    min: samples[0],
    max: samples[samples.length - 1],
  };
}

/**
 * Measure both adapters on the same scene at the performance grid. Warm-up
 * frames are excluded from the samples; the median is the reported number.
 */
export function runPerformance({
  layout = PERFORMANCE_LAYOUT,
  config = SKY_DEFAULTS,
  warmup = 20,
  frames = 120,
  fps = 24,
} = {}) {
  const { cpu, webgl } = createAdapters({ layout, config });
  const timing = { warmup, frames, fps };
  return {
    layout,
    warmup,
    frames,
    fps,
    webgl: timeAdapter(webgl, timing),
    cpu: timeAdapter(cpu, timing),
  };
}

/** The frame states the repo test asks the harness to compare. */
export const REPRESENTATIVE_FRAMES = Object.freeze([
  { name: "light", time: 0, offset: 0, mix: 0 },
  { name: "light-birds-a", time: 4.2, offset: 17.3, mix: 0 },
  { name: "light-birds-b", time: 11.7, offset: 41.6, mix: 0 },
  { name: "mid-crossing", time: 2.4, offset: 9.5, mix: 0.5 },
  { name: "dark-twinkle-a", time: 1.3, offset: 5.2, mix: 1 },
  { name: "dark-twinkle-b", time: 3.7, offset: 13.1, mix: 1 },
  { name: "dark-twinkle-c", time: 8.2, offset: 27.9, mix: 1 },
]);
