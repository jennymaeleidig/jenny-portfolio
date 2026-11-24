// The paper and the sky: CSS, palette, font and the built assets
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { DARK, LIGHT } from "../assets/theme-core.mjs";
import { PERSPECTIVE } from "../assets/wheel-core.mjs";
import { TRANSITION_MS } from "../assets/sky-core.mjs";
import {
  POSTER,
  NOTCH_TOKENS,
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
    /:root\[data-theme="dark"\] \.sky--fallback::after\s*\{[^}]*url\("\/assets\/sky-poster-dark\.svg"\)/s,
    "the dark fallback crossfades to the dark poster",
  );
  assert.match(
    siteCss,
    /\.sky--fallback\s+\.sky-canvas[^{]*\{[^}]*display:\s*none/s,
  );

  for (const asset of [
    "sky.js",
    "sky-core.mjs",
    "sky-poster.svg",
    "sky-poster-dark.svg",
    "theme.js",
    "theme-core.mjs",
    "wheel-core.mjs",
    "nav.js",
  ]) {
    assert.equal(
      statSync(join(output, "assets", asset)).isFile(),
      true,
      `${asset} is emitted`,
    );
  }
});

test("the sky's levers are development-only, never emitted", () => {
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
    "starCell",
    "starDensity",
    "starMedium",
    "starLarge",
    "starYellow",
    "starBright",
    "starDither",
    "starTwinkle",
    "starTwinkleSpeed",
    "starTwinkleSize",
  ]) {
    assert.match(levers, new RegExp(`key: "${key}"`), `${key} has a lever`);
  }

  // The ship set is deliberately short: on/off and count, scale and speed per
  // layer. Deeper bird layer values stay in SKY_DEFAULTS.
  const birdLayerKeys = [...levers.matchAll(/key: "([^"]+)"/g)]
    .map((match) => match[1])
    .filter((key) => key === "birds" || /^l[12]/.test(key))
    .sort();
  assert.deepEqual(birdLayerKeys, [
    "birds",
    "l1Count",
    "l1Scale",
    "l1Speed",
    "l2Count",
    "l2Scale",
    "l2Speed",
  ]);

  // Every bird lever takes the bird-only path, and that path rebuilds the
  // bird layer alone: no scene, field, star or canvas reallocation.
  assert.match(levers, /birds: true/);
  assert.match(levers, /controller\.rebuildBirds\(\)/);

  const sky = readFileSync(join(dist, "assets", "sky.js"), "utf8");
  const start = sky.indexOf("function rebuildBirds()");
  assert.ok(start >= 0, "the sky publishes a bird-only rebuild");
  const body = sky.slice(start, sky.indexOf("function stop()", start));
  assert.match(body, /createBirdLayer\(/);
  assert.doesNotMatch(
    body,
    /createScene|createField|createStarLayer|image\s*=|pixels\s*=|field\s*=|starLayer\s*=|offsetY\s*=/,
    "a bird rebuild touches nothing but the bird layer",
  );
  assert.match(sky, /rebuildBirds[,:]/);
});

test("the committed posters are static frames of the current sky", () => {
  assert.notEqual(posterHash(LIGHT), posterHash(DARK));

  for (const [theme, file] of [
    [LIGHT, "sky-poster.svg"],
    [DARK, "sky-poster-dark.svg"],
  ]) {
    const svg = readFileSync(join(root, "assets", file), "utf8");

    assert.match(
      svg,
      new RegExp(`sha256:${posterHash(theme)} cell:${POSTER.cellPx}`),
      `${file} matches the ${theme} frame`,
    );

    const [, base64] = svg.match(/base64,([A-Za-z0-9+/=]+)/) ?? [];
    assert.ok(base64, `${file} embeds its PNG frame`);

    const png = Buffer.from(base64, "base64");
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(
      png.readUInt32BE(16),
      POSTER.cols,
      `${file} is the shipped width`,
    );
    assert.equal(
      png.readUInt32BE(20),
      POSTER.rows,
      `${file} is the shipped height`,
    );
  }
});

test("the share card is the poster, unwrapped for a link preview", () => {
  const svg = readFileSync(join(root, "assets", "sky-poster.svg"), "utf8");
  const [, base64] = svg.match(/base64,([A-Za-z0-9+/=]+)/) ?? [];
  assert.ok(base64, "the poster embeds its PNG frame");

  const card = readFileSync(join(output, "assets", "sky-poster.png"));
  assert.deepEqual(
    card,
    Buffer.from(base64, "base64"),
    "the card equals the poster's embedded PNG",
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

test("the stylesheet is a fork with the grid and both palettes", () => {
  assert.match(siteCss, /--line-height:\s*1\.5rem/);
  assert.match(siteCss, /--column:\s*80ch/);
  assert.match(siteCss, /:root\s*\{[^}]*color-scheme:\s*light/s);
  assert.match(
    siteCss,
    /:root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark/s,
  );
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
    /:root,\s*\n\s*:root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*light/s,
    "print tells the UA to use the light scheme",
  );
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
    /<button class="palette-strip" type="button" aria-pressed="false" aria-label="Dark theme" title="Dark theme">((?:<span><\/span>){7})<\/button>/;

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
    /\.palette-strip\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*nowrap/s,
    "the strip is one row that never wraps",
  );
  assert.match(
    siteCss,
    /\.palette-strip\s*\{[^}]*position:\s*absolute[^}]*right:\s*var\(--sheet-pad-x\)/s,
    "the strip is set into the paper, inset the same as the header and footer",
  );
  assert.match(
    siteCss,
    /\.palette-strip\s*\{[^}]*appearance:\s*none[^}]*cursor:\s*pointer/s,
    "the strip is a button reset with a pointer",
  );
  assert.match(
    siteCss,
    /\.sheet\s*\{[^}]*position:\s*relative/s,
    "the sheet anchors the strip",
  );
  assert.match(
    siteCss,
    /\.site-header \.palette-strip\s*\{\s*top:\s*calc\(var\(--notch-inset-y\)[^;]*\)/s,
    "the header strip sits on the header's text line, less its tap padding",
  );
  assert.match(
    siteCss,
    /\.site-footer \.palette-strip\s*\{[^}]*bottom:\s*calc\(var\(--notch-inset-y\)[^;]*\)/s,
    "the footer strip sits on the footer's text line, less its tap padding",
  );
  // The squares are smaller than the touch minimum, so the button's padding
  // grows the hit box around them and the anchors above cancel it out; the
  // squares stay on the text line, and the wheel, centred on the box, stays
  // centred on them.
  assert.match(
    siteCss,
    /\.palette-strip\s*\{[^}]*--strip-tap-pad:\s*max\(0px,\s*\(24px - var\(--notch-size\)\) \/ 2\)/s,
    "the strip pads its box out to the 24px touch minimum",
  );
  assert.match(
    siteCss,
    /\.palette-strip\s*\{[^}]*padding:\s*var\(--strip-tap-pad\) 0/s,
    "the strip's padding is vertical, so the wheel keeps the box's centre",
  );
  assert.match(
    siteCss,
    /\.site-footer \.palette-strip\s*\{[^}]*left:\s*var\(--sheet-pad-x\)[^}]*flex-direction:\s*row-reverse/s,
    "the footer strip hangs off the left edge, deep blue first",
  );
  assert.match(
    siteCss,
    /\.palette-strip > \*:not\(\.wheel-viewport\)\s*\{[^}]*width:\s*var\(--notch-size\)[^}]*height:\s*var\(--notch-size\)/s,
    "every static square is 1x1 and the wheel viewport is excluded",
  );
  // A narrow sheet cannot hold the menu and the strip on one line, so the
  // menu and the footer's line justify and hold one line, and the strip moves
  // under it as a band inset to the sheet's content width: the squares keep
  // their size and spread across the band, so the wheel lays its notches out
  // at the row's pitch rather than at the square's edge.
  const narrow =
    siteCss.match(
      /@media screen and \(max-width: 560px\) \{[\s\S]*?\n\}/,
    )?.[0] ?? "";
  assert.match(
    narrow,
    /\.site-header nav\s*\{[^}]*flex-wrap:\s*nowrap[^}]*justify-content:\s*space-between/s,
    "the narrow menu justifies and holds one line",
  );
  assert.match(
    narrow,
    /\.site-footer\s*\{[^}]*justify-content:\s*space-between/s,
    "the narrow footer's line justifies",
  );
  assert.doesNotMatch(
    narrow,
    /\.site-footer\s*\{[^}]*flex-wrap:\s*nowrap/s,
    "the footer keeps wrapping, or its band cannot claim a row of its own",
  );
  assert.match(
    narrow,
    /\.site-footer a,\s*\.site-footer \.site-separator,\s*\.site-footer \.site-location\s*\{[^}]*white-space:\s*nowrap/s,
    "the footer's pieces stay whole, so its row is one line",
  );
  assert.match(
    narrow,
    /\.site-footer a\s*\{\s*margin-left:\s*0/s,
    "the footer's email drops the auto margin so the line spreads evenly",
  );
  assert.match(
    narrow,
    /\.palette-strip\s*\{[^}]*position:\s*relative[^}]*justify-content:\s*space-between/s,
    "the narrow squares keep their size and spread across the band",
  );
  assert.doesNotMatch(
    narrow,
    /\.palette-strip\s*\{[^}]*position:\s*static/s,
    "the narrow strip still anchors the wheel's viewport, so the turn happens in the band",
  );
  assert.match(
    siteCss,
    /@media screen and \(max-width: 560px\)\s*\{[\s\S]*?--notch-size:\s*1rem/s,
    "the mobile strip keeps its 16 px square",
  );
  assert.match(
    narrow,
    /\.site-header \.palette-strip\s*\{[^}]*inset:\s*auto/s,
    "the header band clears the desktop offsets instead of inheriting them",
  );
  assert.match(
    narrow,
    /\.site-footer \.palette-strip\s*\{[^}]*inset:\s*auto[^}]*order:\s*-1[^}]*flex:\s*0 0 100%/s,
    "the footer's band clears the offsets and holds its own unshrunken line above the footer's own",
  );
  assert.doesNotMatch(
    narrow,
    /\.palette-strip\s*\{[^}]*margin-inline/s,
    "the narrow band is inset to the sheet's content width, not bled to the paper's edge",
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
    /\.palette-strip\s*\{[^}]*font-size:\s*var\(--sheet-font-size\)/s,
    "the strip measures its inset in the sheet's font, so its edge lands on the text's",
  );
  assert.match(
    siteCss,
    /\.site-header nav a,\s*\n\.site-footer a\s*\{[^}]*background-color:\s*var\(--paper\)/s,
    "type over the strip carries its own paper backing, so it stays legible",
  );
  for (const [index, name] of NOTCH_TOKENS.entries()) {
    assert.match(
      siteCss,
      new RegExp(
        `\\.palette-strip > :nth-child\\(${index + 1}\\)\\s*\\{\\s*background:\\s*var\\(--${name}\\)`,
      ),
      `square ${index + 1} is --${name}`,
    );
  }
  assert.doesNotMatch(
    siteCss,
    new RegExp(
      `\\.palette-strip > :nth-child\\(\\d+\\)\\s*\\{\\s*background:\\s*var\\(--paper\\)`,
    ),
    "paper is the sheet, not a strip square",
  );
});

test("the strip's turn stays inside its reserved box and stays flat", () => {
  assert.match(
    siteCss,
    /\.palette-strip\.is-wheeling > span:not\(\.wheel-viewport\)\s*\{\s*visibility:\s*hidden/s,
    "the static squares hide during the turn, but not the viewport",
  );
  assert.match(
    siteCss,
    new RegExp(
      `\\.wheel-viewport\\s*\\{[^}]*position:\\s*absolute[^}]*inset:\\s*0[^}]*perspective:\\s*${PERSPECTIVE}px[^}]*pointer-events:\\s*none`,
      "s",
    ),
    "the viewport fills the strip, carries the wheel's perspective and ignores the pointer",
  );
  assert.match(
    siteCss,
    /\.wheel-stage\s*\{[^}]*top:\s*50%[^}]*left:\s*50%[^}]*width:\s*0[^}]*height:\s*0[^}]*transform-style:\s*preserve-3d/s,
    "the stage is a zero-size 3D centre point",
  );
  assert.match(
    siteCss,
    /\.wheel-notch\s*\{[^}]*background:\s*var\(--notch-color\)[^}]*backface-visibility:\s*hidden/s,
    "each notch takes a palette colour and hides its back face",
  );
  assert.match(
    siteCss,
    /\.wheel-notch::before\s*\{[^}]*inset:\s*0 calc\(var\(--bleed\) \* -1\)[^}]*background:\s*inherit/s,
    "the hairline bleed grows the notch and inherits its colour",
  );

  const forbidden = [
    "border",
    "border-radius",
    "box-shadow",
    "background-image",
    "filter",
    "backdrop-filter",
    "opacity",
    "overflow",
    "clip-path",
    "mask",
  ];
  for (const selector of [
    ".wheel-viewport",
    ".wheel-stage",
    ".wheel-notch",
    ".wheel-notch::before",
  ]) {
    const start = siteCss.indexOf(`${selector} {`);
    assert.ok(start >= 0, `${selector} is styled`);
    const body = siteCss.slice(start, siteCss.indexOf("}", start));
    assert.doesNotMatch(body, /linear-gradient|radial-gradient/, selector);
    for (const property of forbidden) {
      assert.doesNotMatch(
        body,
        new RegExp(`(?:^|[;{])\\s*${property}\\s*:`),
        `${selector} adds no ${property}`,
      );
    }
  }
});

test("the build emits no prototype tree", () => {
  assert.equal(
    existsSync(join(output, "prototypes")),
    false,
    "no prototype tree",
  );
  for (const file of walk(output)) {
    assert.doesNotMatch(
      relative(output, file),
      /prototype/,
      `${file} is not a prototype`,
    );
  }
});

test("both palettes are installed and body text and links clear 4.5:1", () => {
  const block = (selector) => {
    const start = siteCss.indexOf(selector);
    assert.ok(start >= 0, `missing ${selector}`);
    const open = siteCss.indexOf("{", start);
    const close = siteCss.indexOf("}", open);
    return siteCss.slice(open + 1, close);
  };
  const token = (source, name) => {
    const match = source.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(match, `missing --${name}`);
    return match[1];
  };

  const themes = [
    {
      selector: ":root {",
      paper: "#f4f4ed",
      ink: "#14140f",
      accent: "#b83d05",
      "accent-bright": "#ff9767",
      "sky-1": "#dfe5e7",
      "sky-2": "#c5d5e5",
      "sky-3": "#9ec8e4",
      "sky-4": "#2157cc",
    },
    {
      selector: ':root[data-theme="dark"] {',
      paper: "#4a484b",
      ink: "#ddd0c5",
      accent: "#ffab77",
      "accent-bright": "#f8cd70",
      "sky-1": "#c0bbac",
      "sky-2": "#777578",
      "sky-3": "#414042",
      "sky-4": "#1b1a16",
    },
  ];

  for (const theme of themes) {
    const source = block(theme.selector);
    for (const name of TOKENS) {
      assert.equal(
        token(source, name).toLowerCase(),
        theme[name],
        `${theme.selector} --${name}`,
      );
    }
    assert.ok(contrast(token(source, "ink"), token(source, "paper")) >= 4.5);
    assert.ok(contrast(token(source, "accent"), token(source, "paper")) >= 4.5);
  }

  for (const name of TOKENS) {
    const uses = siteCss.match(new RegExp(`var\\(--${name}\\)`, "g")) ?? [];
    assert.ok(uses.length > 0, `--${name} must appear outside its declaration`);
  }
});

test("the self-hosted font is emitted", () => {
  const font = join(output, "assets", "fonts", "CommitMonoV143-VF.woff2");

  assert.equal(statSync(font).isFile(), true);
});

test("the page palette crosses in step with the sky", () => {
  // The tokens are registered so they can be interpolated at all.
  for (const token of [
    "paper",
    "ink",
    "accent",
    "accent-bright",
    "sky-1",
    "sky-2",
    "sky-3",
    "sky-4",
  ]) {
    assert.match(
      siteCss,
      new RegExp(`@property --${token} \\{[^}]*syntax: "<color>"`, "s"),
      `--${token} is a registered colour`,
    );
  }

  // Same duration as the sky, and the cubic bezier of smoothstep carried
  // to five decimal places: P1 = (1/3, 0), P2 = (2/3, 1).
  const crossing = `cubic-bezier\\(0\\.33333, 0, 0\\.66667, 1\\)`;
  assert.match(
    siteCss,
    new RegExp(
      `:root\\.theme-fades \\{[^}]*--paper ${TRANSITION_MS}ms ${crossing}`,
      "s",
    ),
    "the tokens use the sky's time and easing",
  );
  assert.match(
    siteCss,
    new RegExp(
      `\\.sky::after \\{[^}]*transition: opacity ${TRANSITION_MS}ms ${crossing}`,
      "s",
    ),
    "the fallback crossfade uses the same time and easing",
  );

  // Without @property an unregistered token would cut over half-way through,
  // so the token transition is opt-in from the boot script.
  const boot = siteCss.slice(0, siteCss.indexOf(":root {"));
  assert.doesNotMatch(boot, /transition:/);
  assert.match(
    readFileSync(join(root, "layouts", "shell.sh"), "utf8"),
    /CSS\.registerProperty[^}]*theme-fades/s,
    "the boot script only fades where a custom property can be interpolated",
  );

  // The fade obeys the reader's motion preference.
  assert.match(
    siteCss,
    /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*:root\.theme-fades/,
    "the token fade is gated behind the motion preference",
  );
});

test("the sky starts its crossing on the wheel's clock", () => {
  const sky = readFileSync(join(root, "assets", "sky.js"), "utf8");
  const handler = sky.slice(sky.indexOf('addEventListener("themechange"'));

  assert.match(
    handler,
    /requestAnimationFrame\(\(\) => \{\s*const startedAt = performance\.now\(\)/,
    "the flight is stamped in a frame callback, not in the click handler",
  );
  assert.match(
    handler,
    /flight = \{ from: mixNow\(startedAt\), to: target, start: startedAt \}/,
    "the flight starts where the frame callback found the mix",
  );
});

test("each registered token starts at the colour its theme declares", () => {
  // The initial value is a second copy of the light palette beside :root: it
  // is what a browser uses before (or without) the :root declarations, so a
  // palette edit that misses it would show a stale colour.
  const lightBlock = siteCss.slice(
    siteCss.indexOf(":root {") + 1,
    siteCss.indexOf("}", siteCss.indexOf(":root {")),
  );

  for (const token of [
    "paper",
    "ink",
    "accent",
    "accent-bright",
    "sky-1",
    "sky-2",
    "sky-3",
    "sky-4",
  ]) {
    const declared = lightBlock.match(
      new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})`),
    )?.[1];
    const initial = siteCss.match(
      new RegExp(
        `@property --${token} \\{[^}]*initial-value:\\s*(#[0-9a-fA-F]{6})`,
        "s",
      ),
    )?.[1];

    assert.ok(declared, `--${token} is declared on :root`);
    assert.equal(
      initial?.toLowerCase(),
      declared.toLowerCase(),
      `--${token}'s registered initial value matches the light palette`,
    );
  }
});
