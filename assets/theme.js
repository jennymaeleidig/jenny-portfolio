/**
 * The palette strip is the theme control.
 *
 * The head's boot script has already applied a stored choice before paint, so
 * this file mirrors that state into the strips and handles the swap. The
 * theme lives on <html data-theme>, which survives nav.js's main swap; this
 * file finishes an in-flight turn and re-syncs the copied header's strips when
 * nav.js asks it to.
 *
 * A click applies the theme first, so the page never waits for the wheel.
 * Unless motion is reduced, a generated fourteen-notch wheel then turns one
 * 105 degree step in the strip's place, starting on the outgoing palette and
 * settling on the incoming one. The geometry and timeline live in
 * wheel-core.mjs.
 */

import { DARK, LIGHT, THEME_STORAGE_KEY, isDark } from "./theme-core.mjs";
import {
  ANGLE_PER_NOTCH,
  NOTCH_COUNT,
  PINCH_DEPTH,
  TURN_MS,
  frameAt,
  planTurn,
} from "./wheel-core.mjs";

const root = document.documentElement;
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const HALF_NOTCHES = (NOTCH_COUNT - 1) / 2;

let animating = false;
/** @type {(() => void) | null} */
let endTurn = null;

function currentDark() {
  return isDark(root.dataset.theme);
}

function strips() {
  return [...document.querySelectorAll(".palette-strip")];
}

function sync() {
  const dark = currentDark();
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  for (const control of strips()) {
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

/**
 * The seven static squares' computed colours, in token order. Reading the
 * spans keeps the stylesheet the one source of token names and values.
 *
 * @param {Element} control
 */
function notchColors(control) {
  return [...control.querySelectorAll(":scope > span")]
    .slice(0, NOTCH_COUNT)
    .map((span) => getComputedStyle(span).backgroundColor);
}

/**
 * @param {Element} control
 * @returns {"header" | "footer"}
 */
function roleOf(control) {
  return control.closest(".site-footer") ? "footer" : "header";
}

/**
 * @typedef {{
 *   control: Element,
 *   role: "header" | "footer",
 *   outgoing: string[],
 * }} Target
 * @typedef {{
 *   el: HTMLSpanElement,
 *   group: number,
 *   flatOffset: number,
 *   wheelOffset: number,
 * }} Notch
 * @typedef {{
 *   control: Element,
 *   viewport: HTMLSpanElement,
 *   stage: HTMLSpanElement,
 *   notches: Notch[],
 *   size: number,
 *   plan: import("./wheel-core.mjs").Plan,
 * }} Wheel
 */

/**
 * Build fourteen notches onto a wheel inside the strip's reserved box.
 *
 * @param {Target} target
 * @param {import("./wheel-core.mjs").Theme} outgoingTheme
 * @param {string[]} outgoing
 * @param {string[]} incoming
 * @returns {Wheel}
 */
function makeWheel(target, outgoingTheme, outgoing, incoming) {
  const { control, role } = target;
  const squares = [...control.querySelectorAll(":scope > span")];
  const size = squares[0]?.getBoundingClientRect().width ?? 0;
  const plan = planTurn(size, outgoingTheme, role);
  const reversed = role === "footer";

  const viewport = document.createElement("span");
  viewport.className = "wheel-viewport";
  viewport.setAttribute("aria-hidden", "true");
  const stage = document.createElement("span");
  stage.className = "wheel-stage";
  viewport.append(stage);

  /** @type {Notch[]} */
  const notches = [];

  /** @param {number} group @param {string[]} colors */
  const buildGroup = (group, colors) => {
    for (let index = 0; index < NOTCH_COUNT; index += 1) {
      const el = document.createElement("span");
      el.className = "wheel-notch";
      el.style.setProperty(
        "--notch-color",
        colors[reversed ? NOTCH_COUNT - 1 - index : index],
      );
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.marginLeft = `${-size / 2}px`;
      el.style.marginTop = `${-size / 2}px`;
      stage.append(el);

      notches.push({
        el,
        group,
        flatOffset: index - HALF_NOTCHES,
        wheelOffset:
          index - HALF_NOTCHES + (group === 0 ? 0 : plan.incomingOffset),
      });
    }
  };

  buildGroup(0, outgoing);
  buildGroup(1, incoming);
  control.append(viewport);
  control.classList.add("is-wheeling");

  return { control, viewport, stage, notches, size, plan };
}

/**
 * @param {Wheel} wheel
 * @param {import("./wheel-core.mjs").Frame} frame
 */
function paintWheel(wheel, frame) {
  wheel.stage.style.transform = `translateZ(${(
    -PINCH_DEPTH * frame.pinch
  ).toFixed(2)}px)`;

  for (const notch of wheel.notches) {
    const curvature =
      notch.group === 0 ? frame.curvature : frame.incomingCurvature;
    const angle =
      notch.wheelOffset * ANGLE_PER_NOTCH +
      wheel.plan.rotation * frame.progress;
    const radians = (angle * Math.PI) / 180;
    const flatX = notch.flatOffset * wheel.size;
    const cylinderX = wheel.plan.radius * Math.sin(radians);
    const cylinderZ = wheel.plan.radius * (Math.cos(radians) - 1);
    const x = (1 - curvature) * flatX + curvature * cylinderX;
    const z = curvature * cylinderZ;

    notch.el.style.transform = `translate3d(${x.toFixed(
      2,
    )}px, 0, ${z.toFixed(2)}px) rotateY(${(curvature * angle).toFixed(2)}deg)`;
    notch.el.style.opacity = String(
      notch.group === 0 ? frame.outgoingOpacity : frame.incomingOpacity,
    );
    notch.el.style.setProperty("--bleed", `${(0.25 * curvature).toFixed(3)}px`);
  }
}

/**
 * @param {Wheel[]} wheels
 * @param {import("./wheel-core.mjs").Frame} frame
 */
function paintWheels(wheels, frame) {
  for (const wheel of wheels) paintWheel(wheel, frame);
}

/** @param {boolean} busy */
function setBusy(busy) {
  for (const control of strips()) {
    if (busy) control.setAttribute("aria-busy", "true");
    else control.removeAttribute("aria-busy");
  }
}

function swap() {
  if (animating) return;

  const outgoingTheme = currentDark() ? DARK : LIGHT;
  const toDark = !currentDark();

  if (motionQuery.matches) {
    setTheme(toDark);
    return;
  }

  // Resolve the strips per turn: client-side navigation replaces the header.
  const targets = strips().map((control) => ({
    control,
    role: roleOf(control),
    outgoing: notchColors(control),
  }));

  animating = true;
  setTheme(toDark);

  const wheels = targets.map((target) =>
    makeWheel(
      target,
      outgoingTheme,
      target.outgoing,
      notchColors(target.control),
    ),
  );

  setBusy(true);
  paintWheels(wheels, frameAt(0));

  let startTime = 0;
  let resting = false;

  const finish = () => {
    if (!animating || endTurn !== finish) return;
    for (const wheel of wheels) {
      wheel.control.classList.remove("is-wheeling");
      wheel.viewport.remove();
    }
    setBusy(false);
    animating = false;
    endTurn = null;
  };

  endTurn = finish;

  /** @param {number} now */
  function draw(now) {
    if (!animating || endTurn !== finish) return;
    const elapsed = now - startTime;

    if (elapsed >= TURN_MS) {
      if (!resting) {
        resting = true;
        paintWheels(wheels, frameAt(TURN_MS));
        requestAnimationFrame(finish);
      }
      return;
    }

    paintWheels(wheels, frameAt(elapsed));
    requestAnimationFrame(draw);
  }

  // One frame of warm-up after the flat outgoing frame, then one clock for
  // both strips.
  requestAnimationFrame(() => {
    if (!animating || endTurn !== finish) return;
    startTime = performance.now();
    requestAnimationFrame(draw);
  });
}

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const control = event.target.closest(".palette-strip");
  if (!control) return;
  event.preventDefault();
  swap();
});

document.addEventListener("theme-sync", () => {
  endTurn?.();
  sync();
});

motionQuery.addEventListener("change", () => {
  if (motionQuery.matches) endTurn?.();
});

sync();
