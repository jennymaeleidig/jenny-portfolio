/**
 * The theme's stored name and its one dark test.
 *
 * The head's boot script, the palette strip, the canvas and the poster all
 * read the same storage key and the same `dark` token, so a rename lands in
 * one place. The boot script in layouts/shell.sh carries the same two values.
 */

export const THEME_STORAGE_KEY = "theme";
export const DARK = "dark";
export const LIGHT = "light";

/** @param {string | undefined | null} value */
export function isDark(value) {
  return value === DARK;
}
