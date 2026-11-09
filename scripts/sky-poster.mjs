#!/usr/bin/env node
/**
 * Regenerate assets/sky-poster.svg from the sky core.
 *
 * The poster is the still the page shows when the canvas cannot run. It is a
 * text SVG, so it is diffable and stays inside the no-binaries rule. Run this
 * after changing the ramp, the seed or the tuned values:
 *
 *   node scripts/sky-poster.mjs
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RAMP, SKY_DEFAULTS, createField, rampIndex, renderFrame } from "../assets/sky-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// A coarse grid at roughly the shipped feature size. Big enough to read as
// clouds, small enough to keep the path data in the tens of kilobytes.
const cols = 160;
const rows = 100;
const cellPx = 9;

const field = createField({
  cols,
  rows,
  cellPx,
  scale: SKY_DEFAULTS.scale,
  seed: SKY_DEFAULTS.seed,
});
const bands = new Uint8Array(cols * rows);
renderFrame({ field, bands, config: SKY_DEFAULTS, time: 0, offset: 0 });

const hex = (ramp) => "#" + RAMP[ramp].map((value) => value.toString(16).padStart(2, "0")).join("");
const paths = new Map(RAMP.map((_, index) => [index, []]));

for (let y = 0; y < rows; y += 1) {
  let x = 0;
  while (x < cols) {
    const ramp = rampIndex(bands[y * cols + x], SKY_DEFAULTS.tones);
    let run = 1;
    while (
      x + run < cols &&
      rampIndex(bands[y * cols + x + run], SKY_DEFAULTS.tones) === ramp
    ) {
      run += 1;
    }

    paths.get(ramp).push(`M${x} ${y}h${run}v1H${x}z`);
    x += run;
  }
}

const body = [...paths.entries()]
  .filter(([, runs]) => runs.length > 0)
  .map(([ramp, runs]) => `  <path fill="${hex(ramp)}" d="${runs.join("")}"/>`)
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols} ${rows}" width="${cols * 10}" height="${rows * 10}" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges" aria-hidden="true">
  <rect width="${cols}" height="${rows}" fill="${hex(0)}"/>
${body}
</svg>
`;

writeFileSync(join(root, "assets", "sky-poster.svg"), svg);
console.log(`assets/sky-poster.svg: ${svg.length} bytes`);
