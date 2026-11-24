// The adapter equivalence harness, driven through headless Chromium: one
// scene and one frame state rendered by the CPU and WebGL2 adapters, then
// compared under the visual-equivalence contract. The CPU adapter is the
// reference; no shader output is used as an oracle.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import {
  DEFAULT_LAYOUT,
  DIFFERENCE_THRESHOLD,
  PERFORMANCE_LAYOUT,
  REPRESENTATIVE_FRAMES,
} from "./support/sky-equivalence-harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// The page imports the same asset modules the build copies; the test copies
// them into a temp tree that mirrors the repo's relative layout.
const ASSET_MODULES = [
  "sky-config.mjs",
  "sky-core.mjs",
  "sky-field.mjs",
  "sky-flock.mjs",
  "sky-renderer.mjs",
  "sky-stars.mjs",
  "sky-tone.mjs",
  "sky-webgl.mjs",
  "wheel-core.mjs",
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

// Measured bounds. The star allowance is named separately: a star block may
// sit one twinkle level away because the kernel trades the CPU deadband for
// stateless sines through the same dithered thresholds.
const MAX_MEAN_ABS = 0.25;
const MAX_PER_CHANNEL_ABS = 0.3;
const MAX_OVER_THRESHOLD_SHARE = 0.01;
const MAX_STAR_LEVEL_SHARE = 0.02;

// Performance bounds in milliseconds of main-thread JavaScript per frame. The
// GPU allowance is the done-ness target; the CPU allowance is the
// measured full-frame baseline at the same grid.
const MAX_WEBGL_FRAME_MS = 1;
const MAX_CPU_FRAME_MS = 7;

// A star may change level from one frame to the next, but the GPU's chatter
// must stay in proportion to the CPU's held-step twinkle. The small floor
// absorbs a frame where dither alone moves a block the CPU happened to hold.
const MAX_STAR_CHATTER_RATIO = 2;
const STAR_CHATTER_FLOOR = 12;

function makeHarnessPage() {
  const directory = mkdtempSync(join(tmpdir(), "sky-equivalence-"));
  mkdirSync(join(directory, "assets"));
  mkdirSync(join(directory, "tests", "support"), { recursive: true });
  for (const name of ASSET_MODULES) {
    writeFileSync(
      join(directory, "assets", name),
      readFileSync(join(root, "assets", name)),
    );
  }
  writeFileSync(
    join(directory, "tests", "support", "sky-equivalence-harness.mjs"),
    readFileSync(join(here, "support", "sky-equivalence-harness.mjs")),
  );
  writeFileSync(
    join(directory, "index.html"),
    `<!doctype html>
<html>
  <body>
    <script type="module">
      import {
        runEquivalence,
        runPerformance,
        runStarChatter,
      } from "./tests/support/sky-equivalence-harness.mjs";
      window.runSkyEquivalence = runEquivalence;
      window.runSkyPerformance = runPerformance;
      window.runStarChatter = runStarChatter;
      window.skyHarnessReady = true;
    </script>
  </body>
</html>
`,
  );
  return directory;
}

function serve(directory) {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://127.0.0.1").pathname,
    );
    const relative = normalize(pathname).replace(/^([/\\])+/, "");
    const file = relative
      ? resolve(directory, relative)
      : join(directory, "index.html");
    if (!file.startsWith(`${directory}/`)) {
      response.writeHead(403);
      response.end("forbidden");
      return;
    }
    let body;
    try {
      body = readFileSync(file);
    } catch {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
    });
    response.end(body);
  });
  return new Promise((ready) => {
    server.listen(0, "127.0.0.1", () => ready(server));
  });
}

function summary(result) {
  return {
    name: result.name,
    meanAbs: Number(result.meanAbs.toFixed(3)),
    perChannelAbs: result.perChannelAbs.map((value) =>
      Number(value.toFixed(3)),
    ),
    overThreshold: result.overThreshold,
    overThresholdShare: Number(result.overThresholdShare.toFixed(5)),
    maximum: result.maximum,
    allowedMaximum: result.allowedMaximum,
    starBlocks: result.starBlocks,
    starLevelBlocks: result.starLevelBlocks,
  };
}

const executable = chromium.executablePath();
const browserInstalled = existsSync(executable);
const skipReason = browserInstalled
  ? false
  : `Playwright Chromium is not installed at ${executable}; run "npx playwright install chromium" to run the adapter equivalence harness`;

test(
  "the CPU and WebGL2 adapters agree on representative sky frames",
  { skip: skipReason },
  async () => {
    const directory = makeHarnessPage();
    const server = await serve(directory);
    const { port } = server.address();
    const browser = await chromium.launch({
      headless: true,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });

    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.waitForFunction(() => window.skyHarnessReady === true);
      const report = await page.evaluate(
        ({ layout, frames }) => window.runSkyEquivalence({ layout, frames }),
        { layout: DEFAULT_LAYOUT, frames: REPRESENTATIVE_FRAMES },
      );

      assert.deepEqual(errors, []);
      assert.equal(report.results.length, REPRESENTATIVE_FRAMES.length);
      assert.deepEqual(
        report.results.map((result) => result.name),
        REPRESENTATIVE_FRAMES.map((frame) => frame.name),
      );

      for (const result of report.results) {
        assert.equal(
          result.unexplainedBlocks,
          0,
          `${result.name}: ${result.unexplainedBlocks} differing block(s) are not a star twinkle level`,
        );
        assert.ok(
          result.starStepMaximum <= 1,
          `${result.name}: a star block crossed more than one twinkle level`,
        );
        assert.ok(
          result.starLevelBlocks <= result.starBlocks,
          `${result.name}: the star allowance exceeds the star blocks that differ`,
        );
        assert.ok(
          result.starLevelShare <= MAX_STAR_LEVEL_SHARE,
          `${result.name}: ${(result.starLevelShare * 100).toFixed(2)}% of blocks are star-level differences`,
        );
        assert.ok(
          result.overThresholdShare <= MAX_OVER_THRESHOLD_SHARE,
          `${result.name}: ${(result.overThresholdShare * 100).toFixed(2)}% of channels differ past ${DIFFERENCE_THRESHOLD}`,
        );
        assert.ok(
          result.meanAbs <= MAX_MEAN_ABS,
          `${result.name}: mean absolute delta ${result.meanAbs.toFixed(3)} is too high`,
        );
        for (const value of result.perChannelAbs) {
          assert.ok(
            value <= MAX_PER_CHANNEL_ABS,
            `${result.name}: a channel's mean absolute delta ${value.toFixed(3)} is too high`,
          );
        }
        assert.ok(
          result.maximum <= result.allowedMaximum + DIFFERENCE_THRESHOLD,
          `${result.name}: maximum delta ${result.maximum} exceeds the one-level star recolour bound ${result.allowedMaximum}`,
        );
      }

      // The measured difference, frame by frame, is part of the test's report.
      console.log(JSON.stringify(report.results.map(summary), null, 2));
    } finally {
      await browser.close();
      server.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

function formatMilliseconds(value) {
  return `${value.toFixed(3)} ms`;
}

test(
  "the WebGL2 and CPU adapters stay inside the frame-time budget",
  { skip: skipReason },
  async () => {
    const directory = makeHarnessPage();
    const server = await serve(directory);
    const { port } = server.address();
    const browser = await chromium.launch({
      headless: true,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });

    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.waitForFunction(() => window.skyHarnessReady === true);

      const measure = () =>
        page.evaluate(({ layout }) => window.runSkyPerformance({ layout }), {
          layout: PERFORMANCE_LAYOUT,
        });

      let report = await measure();
      if (
        report.webgl.median > MAX_WEBGL_FRAME_MS ||
        report.cpu.median > MAX_CPU_FRAME_MS
      ) {
        report = await measure();
      }

      assert.deepEqual(errors, []);
      console.log(JSON.stringify(report, null, 2));
      assert.ok(
        report.webgl.median <= MAX_WEBGL_FRAME_MS,
        `WebGL2 median ${formatMilliseconds(report.webgl.median)} is over ${formatMilliseconds(MAX_WEBGL_FRAME_MS)}`,
      );
      assert.ok(
        report.cpu.median <= MAX_CPU_FRAME_MS,
        `CPU median ${formatMilliseconds(report.cpu.median)} is over ${formatMilliseconds(MAX_CPU_FRAME_MS)}`,
      );
    } finally {
      await browser.close();
      server.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test(
  "consecutive frames do not make the GPU's stars chatter past the CPU's",
  { skip: skipReason },
  async () => {
    const directory = makeHarnessPage();
    const server = await serve(directory);
    const { port } = server.address();
    const browser = await chromium.launch({
      headless: true,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });

    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.waitForFunction(() => window.skyHarnessReady === true);

      const report = await page.evaluate(
        ({ layout }) =>
          window.runStarChatter({ layout, frames: 24, fps: 24, mix: 1 }),
        { layout: PERFORMANCE_LAYOUT },
      );

      assert.deepEqual(errors, []);
      console.log(JSON.stringify(report, null, 2));
      assert.ok(
        report.gpuFlips <=
          report.cpuFlips * MAX_STAR_CHATTER_RATIO + STAR_CHATTER_FLOOR,
        `GPU star chatter (${report.gpuFlips} flips) exceeds the CPU's (${report.cpuFlips} flips) beyond the allowance`,
      );
    } finally {
      await browser.close();
      server.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
