/**
 * The palette strip is the theme control.
 *
 * The head's boot script has already applied a stored choice before paint, so
 * this file only mirrors that state into the strips and handles the swap. The
 * theme lives on <html data-theme>, which survives nav.js's main swap; this
 * file re-syncs the copied header's strips when nav.js asks it to.
 */

import { DARK, LIGHT, THEME_STORAGE_KEY, isDark } from "./theme-core.mjs";

const root = document.documentElement;

function currentDark() {
  return isDark(root.dataset.theme);
}

function sync() {
  const dark = currentDark();
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  for (const control of document.querySelectorAll(".swatches")) {
    control.setAttribute("aria-pressed", String(dark));
    control.setAttribute("aria-label", label);
    control.setAttribute("title", label);
  }
}

/** @param {boolean} dark */
function setTheme(dark) {
  if (dark) root.dataset.theme = DARK;
  else delete root.dataset.theme;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, dark ? DARK : LIGHT);
  } catch {
    // A blocked storage leaves the choice for this page only.
  }

  sync();
  document.dispatchEvent(new Event("themechange"));
}

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const control = event.target.closest(".swatches");
  if (!control) return;
  event.preventDefault();
  setTheme(!currentDark());
});

document.addEventListener("theme-sync", sync);

sync();
