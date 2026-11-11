#!/usr/bin/env node
/**
 * Regenerate assets/sky-poster.svg from the sky core.
 *
 * The poster is a static frame at the shipped cell size: the same field, seed,
 * palette, tuned values and lift as the canvas, rendered at time 0. It is embedded
 * as a PNG data URI so the committed file stays text and stays inside the
 * no-binaries rule, while costing a fraction of an equivalent vector poster.
 *
 * The SVG records a hash of the raw frame. tests/build.test.mjs recomputes it
 * from the core, so a changed seed or palette fails the suite instead of
 * quietly shipping a stale fallback.
 *
 *   node scripts/sky-poster.mjs
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

import {
  SKY_DEFAULTS,
  createScene,
  frameLayout,
  renderFrame,
} from "../assets/sky-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The frame the canvas draws at the shipped cell size: a 1440x900 viewport. */
const POSTER_FRAME = { width: 1440, height: 900, cell: SKY_DEFAULTS.cell };

/** The poster's grid, derived the way the canvas derives its own. */
export const POSTER = Object.freeze(frameLayout(POSTER_FRAME));

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[n] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

/** Minimal 8-bit RGB PNG writer: no filters, one zlib stream. */
function encodePng(cols, rows, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(cols, 0);
  header.writeUInt32BE(rows, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = cols * 3;
  const raw = Buffer.alloc((stride + 1) * rows);
  for (let y = 0; y < rows; y += 1) {
    const out = y * (stride + 1);
    raw[out] = 0; // filter: none
    rgb.copy(raw, out + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The poster's frame, hash and embedded PNG. Pure and deterministic. */
export function posterArtifact() {
  const { cols, rows, cellPx } = POSTER;
  // The canvas carries sky above and below the window so the lift can pan;
  // building the scene the same way makes the poster the shipped framing.
  const { field, offsetY } = createScene({
    config: SKY_DEFAULTS,
    cols,
    rows,
    cellPx,
  });
  const pixels = renderFrame({
    field,
    config: SKY_DEFAULTS,
    time: 0,
    offset: 0,
    offsetY,
  });

  const rgb = Buffer.alloc(cols * rows * 3);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
    rgb[j] = pixels[i];
    rgb[j + 1] = pixels[i + 1];
    rgb[j + 2] = pixels[i + 2];
  }

  return {
    cols,
    rows,
    cellPx,
    hash: createHash("sha256").update(rgb).digest("hex"),
    png: encodePng(cols, rows, rgb),
  };
}

export function posterHash() {
  return posterArtifact().hash;
}

export function posterSvg() {
  const { cols, rows, cellPx, hash, png } = posterArtifact();

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols} ${rows}" width="${cols * cellPx}" height="${rows * cellPx}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <metadata>sky-poster sha256:${hash} cell:${cellPx}</metadata>
  <image width="${cols}" height="${rows}" style="image-rendering:pixelated" href="data:image/png;base64,${png.toString("base64")}"/>
</svg>
`;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const svg = posterSvg();
  writeFileSync(join(root, "assets", "sky-poster.svg"), svg);
  console.log(`assets/sky-poster.svg: ${svg.length} bytes`);
}
