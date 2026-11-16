// The palette strip: stored choice, boot script and the DOM half of the switch
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DARK,
  LIGHT,
  THEME_STORAGE_KEY,
  isDark,
} from "../assets/theme-core.mjs";
import { root, sharedSite } from "./support/site.mjs";

const { output, siteCss } = await sharedSite();
const theme = readFileSync(join(root, "assets", "theme.js"), "utf8");
const shell = readFileSync(join(root, "layouts", "shell.sh"), "utf8");

test("the theme's stored name has one owner", () => {
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

test("the pages start light and leave the choice to the boot script", () => {
  const home = readFileSync(join(output, "index.html"), "utf8");

  assert.doesNotMatch(
    home,
    /<html[^>]*\bdata-theme=/,
    "the markup does not preselect a theme",
  );
  assert.match(home, /<meta name="color-scheme" content="light">/);
});

test("the strip syncs every control from the active theme", () => {
  assert.match(theme, /document\.querySelectorAll\("\.swatches"\)/);
  assert.match(
    theme,
    /control\.setAttribute\("aria-pressed", String\(dark\)\)/,
  );
  assert.match(theme, /control\.setAttribute\("aria-label", label\)/);
  assert.match(theme, /control\.setAttribute\("title", label\)/);
  assert.match(theme, /document\.addEventListener\("theme-sync", sync\)/);
});

test("clicking a strip stores the choice and repaints the theme", () => {
  assert.match(theme, /event\.target\.closest\("\.swatches"\)/);
  assert.match(theme, /setTheme\(!currentDark\(\)\)/);
  assert.match(
    theme,
    /localStorage\.setItem\(THEME_STORAGE_KEY, dark \? DARK : LIGHT\)/,
  );
  assert.match(theme, /document\.dispatchEvent\(new Event\("themechange"\)\)/);
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
