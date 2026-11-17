// The palette strip: stored choice, boot script and the DOM half of the switch
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DARK,
  LIGHT,
  THEME_STORAGE_KEY,
  declaredTokens,
  isDark,
} from "../assets/theme-core.mjs";
import { root, sharedSite } from "./support/site.mjs";

const { output, siteCss } = await sharedSite();
const theme = readFileSync(join(root, "assets", "theme.js"), "utf8");
const shell = readFileSync(join(root, "layouts", "shell.sh"), "utf8");

test("the theme module names its storage key and tokens", () => {
  assert.equal(THEME_STORAGE_KEY, "theme");
  assert.equal(DARK, "dark");
  assert.equal(LIGHT, "light");
  assert.equal(isDark(DARK), true);
  assert.equal(isDark(LIGHT), false);
  assert.equal(isDark(undefined), false);
  assert.equal(isDark(null), false);
  assert.equal(isDark(""), false);
});

test("the shell boot script carries the same key and dark token", () => {
  assert.match(
    shell,
    new RegExp(`^theme_storage_key=${THEME_STORAGE_KEY}$`, "m"),
    "the shell names the same storage key",
  );
  assert.match(
    shell,
    new RegExp(`^theme_dark=${DARK}$`, "m"),
    "the shell names the same dark token",
  );
  assert.match(
    shell,
    /localStorage\.getItem\("\$theme_storage_key"\) === "\$theme_dark"/,
    "the boot script reads the stored dark choice",
  );
  assert.match(
    shell,
    /document\.documentElement\.dataset\.theme = "\$theme_dark"/,
    "the boot script applies the dark token before paint",
  );
});

test("the home page starts light and leaves the choice to the boot script", () => {
  const home = readFileSync(join(output, "index.html"), "utf8");

  assert.doesNotMatch(
    home,
    /<html[^>]*\bdata-theme=/,
    "the markup does not preselect a theme",
  );
  assert.match(home, /<meta name="color-scheme" content="light">/);
});

test("the strip syncs every control from the active theme", () => {
  assert.match(theme, /document\.querySelectorAll\("\.palette-strip"\)/);
  assert.match(
    theme,
    /control\.setAttribute\("aria-pressed", String\(dark\)\)/,
  );
  assert.match(theme, /control\.setAttribute\("aria-label", label\)/);
  assert.match(theme, /control\.setAttribute\("title", label\)/);
  assert.match(theme, /document\.addEventListener\("theme-sync"/);
});

test("clicking a strip stores the choice and repaints the theme", () => {
  assert.match(theme, /event\.target\.closest\("\.palette-strip"\)/);
  assert.match(theme, /const toDark = !currentDark\(\);/);
  assert.match(theme, /setTheme\(toDark\)/);
  assert.match(
    theme,
    /localStorage\.setItem\(THEME_STORAGE_KEY, dark \? DARK : LIGHT\)/,
  );
  assert.match(theme, /document\.dispatchEvent\(new Event\("themechange"\)\)/);
});

test("the theme changes first and the wheel paints the receipt", () => {
  const swap = theme.slice(
    theme.indexOf("function swap()"),
    theme.indexOf('document.addEventListener("click"'),
  );
  const turn = swap.slice(swap.indexOf("const targets = strips()"));
  const order = [
    "outgoing: paletteColors(outgoingTheme === DARK)",
    "setTheme(toDark)",
    "paletteColors(toDark)",
    "paintWheels(wheels, frameAt(0))",
    "requestAnimationFrame(",
  ].map((step) => turn.indexOf(step));

  for (const [index, position] of order.entries()) {
    assert.ok(position >= 0, `the click path keeps ${index}`);
    if (index > 0) {
      assert.ok(
        order[index - 1] < position,
        `the click path keeps ${index} after ${index - 1}`,
      );
    }
  }
  assert.match(
    turn,
    /makeWheel\(\s*target,\s*outgoingTheme,\s*target\.outgoing,\s*paletteColors\(toDark\) \?\? notchColors\(target\.control\),\s*\)/,
    "the built wheel takes both declared palettes",
  );
  assert.match(
    turn,
    /setTheme\(toDark\);\s*\n\s*const wheels/,
    "the theme is applied before the wheel is built",
  );
});

test("a turn in flight ignores further clicks", () => {
  assert.match(theme, /function swap\(\) \{\s*if \(animating\) return;/);
});

test("reduced motion swaps the theme with no wheel", () => {
  const swap = theme.slice(
    theme.indexOf("function swap()"),
    theme.indexOf('document.addEventListener("click"'),
  );
  const reduced = swap.search(
    /if \(motionQuery\.matches\) \{\s*setTheme\(toDark\);\s*return;\s*\}/,
  );
  assert.ok(reduced >= 0, "the click path returns after applying the theme");
  assert.ok(
    reduced < swap.indexOf("strips().map"),
    "the wheel is never built when motion is reduced",
  );
});

test("enabling reduced motion mid-turn finishes it without a lock frame", () => {
  const listener = theme.slice(
    theme.indexOf('motionQuery.addEventListener("change"'),
  );
  assert.match(listener, /if \(motionQuery\.matches\) endTurn\?\.\(\);/);
  assert.doesNotMatch(listener, /frameAt\(TURN_MS\)/);
});

test("navigation finishes an in-flight turn and re-syncs the new strips", () => {
  assert.match(
    theme,
    /document\.addEventListener\("theme-sync", \(\) => \{\s*endTurn\?\.\(\);\s*sync\(\);/,
  );
});

test("the turn marks both strips busy and clears them together", () => {
  assert.match(theme, /control\.setAttribute\("aria-busy", "true"\)/);
  assert.match(theme, /control\.removeAttribute\("aria-busy"\)/);
  const finish = theme.slice(
    theme.indexOf("const finish = () =>"),
    theme.indexOf("endTurn = finish;"),
  );
  assert.match(finish, /animating = false;/);
  assert.match(finish, /endTurn = null;/);
  assert.match(finish, /setBusy\(false\)/);
  assert.match(finish, /viewport\.remove\(\)/);
});

test("an ended turn cannot clear the next one", () => {
  const finish = theme.slice(
    theme.indexOf("const finish = () =>"),
    theme.indexOf("endTurn = finish;"),
  );
  const draw = theme.slice(
    theme.indexOf("function draw(now)"),
    theme.indexOf("// One frame of warm-up"),
  );

  assert.match(finish, /if \(!animating \|\| endTurn !== finish\) return;/);
  assert.match(draw, /if \(!animating \|\| endTurn !== finish\) return;/);
});

test("the strips are resolved at the start of each turn", () => {
  assert.doesNotMatch(theme, /^const strips = /m);
  assert.match(
    theme,
    /function strips\(\) \{\s*return \[\.\.\.document\.querySelectorAll/,
  );
  assert.match(theme, /const targets = strips\(\)\.map/);
});

test("the wheel viewport is hidden from assistive technology", () => {
  assert.match(theme, /viewport\.setAttribute\("aria-hidden", "true"\)/);
});

test("the production strip carries none of the prototype's controls", () => {
  for (const leftover of [
    "data-preset",
    "force-reduced",
    "prototype",
    "presetName",
    "readout",
  ]) {
    assert.equal(theme.includes(leftover), false, `${leftover} is not shipped`);
  }
});

test("the theme does not follow the system preference", () => {
  for (const [name, source] of [
    ["site.css", siteCss],
    ["theme.js", theme],
    ["shell.sh", shell],
  ]) {
    assert.doesNotMatch(source, /prefers-color-scheme/, `${name} stays manual`);
  }
});

test("the wheel reads declared palettes, not the fading page", () => {
  // A switch starts the token fade before the wheel is built, so a computed
  // colour at that moment is a blend of the two palettes. The wheel must land
  // on the incoming palette, which only the stylesheet's declarations hold.
  assert.match(
    theme,
    /declaredTokens\(rules, selector, NOTCH_TOKENS\)/,
    "the values come from the stylesheet's declared tokens",
  );
  assert.match(
    theme,
    /function paletteColors\(dark\) \{/,
    "a declared palette resolves per theme",
  );
  assert.match(
    theme,
    /const selector = dark \? `:root\[data-theme="\$\{DARK\}"\]` : ":root";/,
    "each theme is read from its own rule",
  );
  // The strip's colours are the token list the stylesheet paints, in order.
  for (const token of [
    "--ink",
    "--accent",
    "--accent-bright",
    "--sky-1",
    "--sky-2",
    "--sky-3",
    "--sky-4",
  ]) {
    assert.ok(
      theme.includes(`"${token}"`),
      `${token} is one of the strip's colours`,
    );
  }
});

test("a plain rule still yields its tokens, empty cssRules and all", () => {
  // Chrome gives every style rule a `cssRules` list of its own, empty unless
  // the rule nests. Walking only the rules that have one skipped every plain
  // rule, which silently left the wheel with the fading page's colours.
  const decls = (map) => ({
    getPropertyValue: (name) => map[name] ?? "",
  });
  const plain = (selector, map) => ({
    selectorText: selector,
    style: decls(map),
    cssRules: { length: 0 },
  });
  const nested = (children) => ({
    cssRules: { length: children.length, ...children },
  });

  const rules = [
    plain(":root", { "--ink": "#14140f", "--sky-1": "#dfe5e7" }),
    plain(':root[data-theme="dark"]', {
      "--ink": "#ddd0c5",
      "--sky-1": "#c0bbac",
    }),
    nested([plain(":root", { "--ink": "#000000" })]),
  ];
  const tokens = ["--ink", "--sky-1"];

  assert.deepEqual(
    [...declaredTokens(rules, ":root", tokens)],
    [
      ["--ink", "#000000"],
      ["--sky-1", "#dfe5e7"],
    ],
    "the last declaration wins, whether plain or nested",
  );
  assert.deepEqual(
    [...declaredTokens(rules, ':root[data-theme="dark"]', tokens)],
    [
      ["--ink", "#ddd0c5"],
      ["--sky-1", "#c0bbac"],
    ],
  );

  assert.deepEqual(
    [
      ...declaredTokens(
        [plain(":root", { "--ink": "#14140f" })],
        ":root",
        tokens,
      ),
    ],
    [["--ink", "#14140f"]],
    "a missing token is simply absent, which the caller reads as a fallback",
  );
});
