/**
 * The theme's stored name and its one dark test.
 *
 * The boot script and the palette strip share the storage key; the canvas
 * reads the `dark` token off `<html data-theme>`, and the poster takes the
 * theme as an argument. The boot script in layouts/shell.sh carries the key
 * and the dark token, so a rename touches this module and that script.
 */

export const THEME_STORAGE_KEY = "theme";
export const DARK = "dark";
export const LIGHT = "light";

/** @param {string | undefined | null} value */
export function isDark(value) {
  return value === DARK;
}
