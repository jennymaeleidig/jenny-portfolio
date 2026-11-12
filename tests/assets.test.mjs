// The paper and the sky: CSS, palette, font and the built assets
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  POSTER,
  SKY_TOKENS,
  TOKENS,
  build,
  contrast,
  posterHash,
  root,
  sharedSite,
  walk,
} from "./support/site.mjs";

const { output, htmlFiles, siteCss } = await sharedSite();

test("the sky sits behind the sheet with its poster and gradient fallbacks", () => {
  const home = readFileSync(join(output, "index.html"), "utf8");

  assert.match(home, /<div class="sky" aria-hidden="true">/);
  assert.match(home, /<canvas class="sky-canvas"><\/canvas>/);
  assert.match(
    home,
    /<noscript><img[^>]*class="sky-poster"[^>]*src="\/assets\/sky-poster\.svg"[^>]*><\/noscript>/,
  );
  assert.match(
    home,
    /<script type="module" src="\/assets\/sky\.js"><\/script>/,
  );

  assert.match(
    siteCss,
    /\.sky\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*-1;/s,
  );
  assert.match(
    siteCss,
    /\.sky\s*\{[^}]*linear-gradient\(180deg, var\(--sky-1\)/s,
  );
  assert.match(siteCss, /\.sky-canvas\s*\{[^}]*image-rendering:\s*pixelated/s);
  assert.match(
    siteCss,
    /\.sky--fallback\s*\{[^}]*url\("\/assets\/sky-poster\.svg"\)/s,
  );
  assert.match(
    siteCss,
    /\.sky--fallback\s+\.sky-canvas[^{]*\{[^}]*display:\s*none/s,
  );

  for (const asset of ["sky.js", "sky-core.mjs", "sky-poster.svg", "nav.js"]) {
    assert.equal(
      statSync(join(output, "assets", asset)).isFile(),
      true,
      `${asset} is emitted`,
    );
  }
});

test("the sky's levers are a development tool, not a shipped one", () => {
  const home = readFileSync(join(output, "index.html"), "utf8");
  const sky = readFileSync(join(output, "assets", "sky.js"), "utf8");

  assert.doesNotMatch(
    home,
    /sky-levers/,
    "no production page points at the panel",
  );
  assert.equal(
    existsSync(join(output, "assets", "sky-levers.mjs")),
    false,
    "the panel is not emitted without the flag",
  );
  assert.match(
    sky,
    /document\.body\.hasAttribute\("data-sky-levers"\)/,
    "the live config is published only when the build marks the body",
  );
});

test("a SKY_LEVERS=1 build carries the levers on every page", () => {
  const dist = mkdtempSync(join(tmpdir(), "portfolio-levers-"));
  build(dist, { SKY_LEVERS: "1" });

  const pages = walk(dist).filter((path) => path.endsWith(".html"));
  assert.ok(pages.length > 0, "the development build emits pages");

  for (const file of pages) {
    const html = readFileSync(file, "utf8");
    assert.match(
      html,
      /<body data-sky-levers>/,
      `${relative(root, file)} marks the body`,
    );
    assert.match(
      html,
      /<script type="module" src="\/assets\/sky-levers\.mjs"><\/script>/,
      `${relative(root, file)} loads the panel after the sky`,
    );
  }

  const levers = readFileSync(join(dist, "assets", "sky-levers.mjs"), "utf8");
  for (const key of [
    "cell",
    "scale",
    "tones",
    "gain",
    "speed",
    "falloff",
    "dither",
    "sky",
    "stark",
    "evolve",
    "evolveSpeed",
    "warp",
    "warpSpeed",
  ]) {
    assert.match(levers, new RegExp(`key: "${key}"`), `${key} has a lever`);
  }
});

test("the committed poster is a static frame of the current sky", () => {
  const svg = readFileSync(join(root, "assets", "sky-poster.svg"), "utf8");

  assert.match(svg, new RegExp(`sha256:${posterHash()} cell:${POSTER.cellPx}`));

  const [, base64] = svg.match(/base64,([A-Za-z0-9+/=]+)/) ?? [];
  assert.ok(base64, "the poster embeds its PNG frame");

  const png = Buffer.from(base64, "base64");
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(
    png.readUInt32BE(16),
    POSTER.cols,
    "the poster is the shipped width",
  );
  assert.equal(
    png.readUInt32BE(20),
    POSTER.rows,
    "the poster is the shipped height",
  );
});

test("the share card is the poster, unwrapped for a link preview", () => {
  const svg = readFileSync(join(root, "assets", "sky-poster.svg"), "utf8");
  const [, base64] = svg.match(/base64,([A-Za-z0-9+/=]+)/) ?? [];
  assert.ok(base64, "the poster embeds its PNG frame");

  const card = readFileSync(join(output, "assets", "sky-poster.png"));
  assert.deepEqual(
    card,
    Buffer.from(base64, "base64"),
    "the card is the poster's own pixels, not a re-render",
  );

  const width = card.readUInt32BE(16);
  const height = card.readUInt32BE(20);
  const home = readFileSync(join(output, "index.html"), "utf8");
  assert.match(
    home,
    new RegExp(`<meta property="og:image:width" content="${width}">`),
    "the card declares the width it ships",
  );
  assert.match(
    home,
    new RegExp(`<meta property="og:image:height" content="${height}">`),
    "the card declares the height it ships",
  );
});

test("the stylesheet is a light-only fork with the grid and its fallbacks", () => {
  assert.match(siteCss, /--line-height:\s*1\.5rem/);
  assert.match(siteCss, /--column:\s*80ch/);
  assert.match(siteCss, /color-scheme:\s*light/);
  assert.match(siteCss, /@supports \(width: calc\(round\(down/);
  assert.match(siteCss, /\.grid/);
  assert.match(siteCss, /:focus-visible\s*\{[^}]*outline:/);
  assert.match(siteCss, /font-display:\s*block/);

  assert.doesNotMatch(siteCss, /@import/);
  assert.doesNotMatch(siteCss, /prefers-color-scheme/);
  assert.doesNotMatch(siteCss, /\.debug/);
  assert.doesNotMatch(siteCss, /font-display:\s*swap/);
});

test("the sheet insets its content from its own border", () => {
  assert.match(
    siteCss,
    /\.sheet\s*\{[^}]*padding:\s*var\(--sheet-pad-y\) var\(--sheet-pad-x\)/s,
  );
  assert.match(siteCss, /\.sheet\s*\{[^}]*--sheet-pad-x:\s*3ch/s);
  const print = siteCss.slice(siteCss.indexOf("@media print"));
  assert.match(
    print,
    /\.sheet\s*\{[^}]*padding:\s*0/s,
    "print drops the sheet padding",
  );
});

test("the featured grid caps at three columns and collapses on a narrow viewport", () => {
  assert.match(siteCss, /\.grid\s*\{[^}]*--grid-cells:\s*1/s);
  assert.match(
    siteCss,
    /\.featured\s*\{[^}]*align-items:\s*stretch/s,
    "cards in a row share one height so the closing rules sit square",
  );
  assert.match(
    siteCss,
    /\.card\s*\{[^}]*border-top:/s,
    "each card opens on the light rule",
  );
  assert.match(
    siteCss,
    /\.card:nth-child\(-n \+ 3\)\s*\{\s*border-top:\s*0/,
    "the first row opens without a rule under the tagline",
  );
  assert.doesNotMatch(
    siteCss,
    /\.card\s*\{[^}]*border-bottom:/s,
    "a card does not rule off its own bottom",
  );
  assert.match(
    siteCss,
    /\.primary-links:last-child,\s*\n\.career-section > :last-child,\s*\n\.catalogue tbody tr:last-child > \*/,
    "a ruled run never closes on a rule of its own",
  );
  assert.match(
    siteCss,
    /\.grid:has\(> :nth-child\(3\)\)\s*\{\s*--grid-cells:\s*3/,
  );
  assert.doesNotMatch(siteCss, /:nth-child\([4-9]\)\)\s*\{\s*--grid-cells/);
  assert.match(
    siteCss,
    /@media screen and \(max-width: 760px\)\s*\{\s*\.grid > \*\s*\{\s*flex-basis:\s*100%/s,
  );
  assert.match(
    siteCss,
    /@media screen and \(max-width: 760px\)\s*\{[\s\S]*?\.card:first-child\s*\{\s*border-top:\s*0/s,
    "the single-column run also opens without a rule",
  );
});

test("the catalogue and the header stay readable on a narrow viewport", () => {
  assert.match(
    siteCss,
    /@media screen and \(max-width: 560px\)\s*\{[\s\S]*?\.site-header\s*\{[^}]*flex-direction:\s*column/s,
  );
  assert.match(
    siteCss,
    /@media screen and \(max-width: 640px\)\s*\{[\s\S]*?\.catalogue thead\s*\{\s*display:\s*none/s,
  );
  assert.match(
    siteCss,
    /@media screen and \(max-width: 640px\)\s*\{[\s\S]*?\.catalogue td\s*\{[^}]*display:\s*block/s,
  );
  assert.match(
    siteCss,
    /@media screen and \(max-width: 640px\)\s*\{[\s\S]*?\.catalogue tr:last-child\s*\{\s*border-bottom:\s*0/s,
    "the last catalogue row never closes the run on a rule",
  );
});

test("every page runs the palette strip in its header and its footer", () => {
  const strip =
    /<div class="swatches" aria-hidden="true">((?:<span><\/span>){8})<\/div>/;

  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    const header =
      html.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0] ?? "";
    const footer =
      html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0] ?? "";
    assert.match(
      header,
      strip,
      `${relative(root, file)} header runs the strip`,
    );
    assert.match(
      footer,
      strip,
      `${relative(root, file)} footer runs the strip`,
    );
  }

  assert.match(
    siteCss,
    /\.swatches\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*nowrap/s,
    "the strip is one row that never wraps",
  );
  assert.match(
    siteCss,
    /\.swatches\s*\{[^}]*position:\s*absolute[^}]*right:\s*var\(--sheet-pad-x\)/s,
    "the strip is set into the paper, inset the same as the header and footer",
  );
  assert.match(
    siteCss,
    /\.sheet\s*\{[^}]*position:\s*relative/s,
    "the sheet anchors the strip",
  );
  assert.match(
    siteCss,
    /\.site-header \.swatches\s*\{\s*top:\s*var\(--swatch-inset-y\)/s,
    "the header strip sits on the header's text line",
  );
  assert.match(
    siteCss,
    /\.site-footer \.swatches\s*\{[^}]*bottom:\s*var\(--swatch-inset-y\)/s,
    "the footer strip sits on the footer's text line",
  );
  assert.match(
    siteCss,
    /\.site-footer \.swatches\s*\{[^}]*left:\s*var\(--sheet-pad-x\)[^}]*flex-direction:\s*row-reverse/s,
    "the footer strip hangs off the left edge, deep blue first",
  );
  assert.match(
    siteCss,
    /\.swatches > \*\s*\{[^}]*width:\s*var\(--swatch-size\)[^}]*height:\s*var\(--swatch-size\)/s,
    "every square is 1x1",
  );
  const sheetBlock = siteCss.match(/\.sheet\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(
    sheetBlock,
    /--sheet-font-size:/,
    "the sheet names its own font size",
  );
  assert.doesNotMatch(
    sheetBlock,
    /(^|;|\s)font-size:/,
    "the sheet does not set its size, so print's 8pt still reaches it",
  );
  assert.match(
    siteCss,
    /\.swatches\s*\{[^}]*font-size:\s*var\(--sheet-font-size\)/s,
    "the strip measures its inset in the sheet's font, so its edge lands on the text's",
  );
  assert.match(
    siteCss,
    /\.site-header nav a,\s*\n\.site-footer a\s*\{[^}]*background-color:\s*var\(--paper\)/s,
    "type over the strip carries its own paper backing, so it stays legible",
  );
  for (const [index, name] of TOKENS.entries()) {
    assert.match(
      siteCss,
      new RegExp(
        `\\.swatches > :nth-child\\(${index + 1}\\)\\s*\\{\\s*background:\\s*var\\(--${name}\\)`,
      ),
      `square ${index + 1} is --${name}`,
    );
  }
});

test("the palette is installed and body text and links clear 4.5:1 on the paper", () => {
  const token = (name) => {
    const match = siteCss.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(match, `missing --${name}`);
    return match[1];
  };

  const paper = token("paper");
  assert.equal(paper.toLowerCase(), "#f4f4ed");
  assert.equal(token("ink").toLowerCase(), "#14140f");
  assert.equal(token("accent").toLowerCase(), "#b83d05");
  assert.equal(token("accent-bright").toLowerCase(), "#ff9767");
  for (const sky of SKY_TOKENS) {
    assert.ok(token(sky));
  }

  assert.ok(contrast(token("ink"), paper) >= 4.5);
  assert.ok(contrast(token("accent"), paper) >= 4.5);

  for (const name of TOKENS) {
    const uses = siteCss.match(new RegExp(`var\\(--${name}\\)`, "g")) ?? [];
    assert.ok(uses.length > 0, `--${name} must appear outside its declaration`);
  }
});

test("the self-hosted font is emitted", () => {
  const font = join(output, "assets", "fonts", "CommitMonoV143-VF.woff2");

  assert.equal(statSync(font).isFile(), true);
});
