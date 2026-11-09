// Progressive enhancement for the resume selector. The query string is the
// whole selection state: this reads it, applies it to the existing markup, and
// writes changes back with replaceState. Nothing is fetched and nothing is
// re-rendered. Without this module the page still carries every entry and
// prints the canonical selection.
import { parseSelection, toSearch } from "/assets/resume-selector-core.mjs";

const form = document.querySelector("[data-resume-selector]");

if (form) {
  const controls = [...form.querySelectorAll('input[name="include"]')];
  const controlled = new Set(controls.map((control) => control.value));
  const sections = [...document.querySelectorAll("[data-resume-section]")];
  const entries = [...document.querySelectorAll(".resume-entry[id]")].filter((entry) =>
    controlled.has(entry.id),
  );
  const allIds = [
    ...sections.map((section) => section.dataset.resumeSection),
    ...entries.map((entry) => entry.id),
  ];
  const defaultOmitted = (form.dataset.defaultOmitted ?? "").split(/\s+/).filter(Boolean);

  function apply(selection) {
    const included = new Set(selection.included);
    for (const section of sections) {
      section.hidden = !included.has(section.dataset.resumeSection);
    }
    for (const entry of entries) {
      entry.hidden = !included.has(entry.id);
    }
    for (const control of controls) {
      control.checked = included.has(control.value);
    }
  }

  function selectionFromControls() {
    return {
      included: controls.filter((control) => control.checked).map((control) => control.value),
    };
  }

  function syncUrl(selection) {
    const search = toSearch(selection);
    if (search === location.search) return;
    history.replaceState(null, "", `${location.pathname}${search}${location.hash}`);
  }

  apply(parseSelection(location.search, { allIds, defaultOmitted }));

  form.addEventListener("change", () => {
    const selection = selectionFromControls();
    apply(selection);
    syncUrl(selection);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const selection = selectionFromControls();
    apply(selection);
    syncUrl(selection);
  });
}
