/**
 * The palette strip is the theme control.
 *
 * The head's boot script has already applied a stored choice before paint, so
 * this file only mirrors that state into the strips and handles the swap. The
 * theme lives on <html data-theme>, which survives nav.js's main swap; this
 * file re-syncs the copied header's strips when nav.js asks it to.
 */

const root = document.documentElement;
const STORAGE_KEY = "theme";

function isDark() {
  return root.dataset.theme === "dark";
}

function sync() {
  const dark = isDark();
  for (const control of document.querySelectorAll(".swatches")) {
    control.setAttribute("aria-pressed", String(dark));
    control.setAttribute(
      "title",
      dark ? "Switch to light theme" : "Switch to dark theme",
    );
  }
}

/** @param {boolean} dark */
function setTheme(dark) {
  if (dark) root.dataset.theme = "dark";
  else delete root.dataset.theme;

  try {
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
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
  setTheme(!isDark());
});

document.addEventListener("theme-sync", sync);

sync();
