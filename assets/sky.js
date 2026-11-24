/**
 * The pixelated sky: the browser half.
 *
 * The pure maths lives in the sky's own modules: /assets/sky-core.mjs
 * composes them, /assets/sky-renderer.mjs is the renderer seam and
 * /assets/sky-webgl.mjs is the GPU adapter. This file owns the canvas, the
 * frame loop, and the reasons to stop: the tab hidden, the canvas out of
 * view, reduced motion, or the GPU context lost.
 *
 * No content depends on this file. Without JavaScript the poster image covers
 * the viewport; if this module fails to load, the CSS gradient remains. Without
 * a drawing context the layer shows the poster over that gradient, so a canvas
 * block still reads as sky.
 */

import { isDark } from "./theme-core.mjs";
import {
  SKY_DEFAULTS,
  TRANSITION_MS,
  createBirdLayer,
  createScene,
  frameLayout,
  transitionMix,
} from "./sky-core.mjs";
import { createCpuRenderer } from "./sky-renderer.mjs";
import { createWebglRenderer } from "./sky-webgl.mjs";

// A visit gets its own sky, and its own birds. Both seeds are chosen once
// per page load, so the field and the birds stay put across internal
// navigation and are only new on a real load. The bird layer mixes its own seed
// with the visit seed, so a new sky never repeats a previous flight.
function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 0xffffffff);
}

const config = { ...SKY_DEFAULTS, seed: randomSeed(), birdSeed: randomSeed() };

/** @type {HTMLElement | null} */
const sky = document.querySelector(".sky");
/** @type {HTMLCanvasElement | null} */
const canvas = document.querySelector(".sky-canvas");

/**
 * Pick the renderer once for this page load. The GPU adapter paints the whole
 * scene in one fragment pass; the CPU adapter stays canonical, backs a levers
 * build, and serves a reader who already prefers reduced motion at load.
 */
function selectRenderer() {
  const prefersCpu =
    document.body.hasAttribute("data-sky-levers") ||
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  if (!prefersCpu) {
    const webgl = createWebglRenderer({ canvas, config });
    if (webgl) return webgl;
  }

  const context =
    typeof canvas.getContext === "function"
      ? canvas.getContext("2d", { alpha: true })
      : null;
  return context === null ? null : createCpuRenderer({ config, context });
}

const renderer = sky && canvas ? selectRenderer() : null;

if (sky && canvas) {
  if (renderer === null) {
    // No 2D context: show the poster over the gradient. The page is otherwise
    // untouched.
    sky.classList.add("sky--fallback");
  } else {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let scene = null;
    let dark = isDark(document.documentElement.dataset.theme);
    // The mix the sky has reached, and the crossing in flight, if any. A
    // crossing is interrupted by taking the current mix as its new origin, so
    // toggling mid-dusk continues from where the sky is.
    let mix = dark ? 1 : 0;
    let flight = null;
    let cellPx = 4;
    let offset = 0;
    let elapsed = 0;
    let lastTime = 0;
    let frame = 0;
    let inView = true;
    let resizeTimer = 0;

    function onScreen() {
      const rect = canvas.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth
      );
    }

    /** The mix at `now`, ending a finished flight on the way. */
    function mixNow(now) {
      if (!flight) return mix;
      const flown = now - flight.start;
      mix = transitionMix(flight.from, flight.to, flown);
      if (flown >= TRANSITION_MS) flight = null;
      return mix;
    }

    /** Finish a crossing where it was heading, without waiting for the clock. */
    function settle(now, target) {
      mix = target;
      flight = null;
      draw(now);
    }

    function draw(now = performance.now()) {
      if (!scene) return;
      renderer.render({
        time: elapsed,
        offset,
        mix: mixNow(now),
      });
    }

    function resize() {
      const previousCellPx = cellPx;
      const layout = frameLayout({
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        cell: config.cell,
      });
      cellPx = layout.cellPx;

      // The canvas gets an explicit CSS size that is an exact multiple of the
      // block, so its backing is never stretched by a fractional factor.
      canvas.width = layout.cols;
      canvas.height = layout.rows;
      canvas.style.width = `${layout.cols * cellPx}px`;
      canvas.style.height = `${layout.rows * cellPx}px`;

      // Keep the drift continuous across a resize. A mobile URL bar collapsing
      // only changes the height, so the field is unchanged; zeroing here would
      // snap the whole sheet back to the start.
      if (scene && cellPx !== previousCellPx) {
        offset *= previousCellPx / cellPx;
      }

      scene = createScene({
        config,
        cols: layout.cols,
        rows: layout.rows,
        cellPx,
      });
      renderer.setScene(scene);
      draw();
    }

    // A bird lever resizes or reseeds only the bird layer. The noise field, the
    // star layer, the offsets and the renderer's surface keep their identities,
    // so tuning a bird never re-rolls the clouds or the stars.
    function rebuildBirds() {
      scene = {
        ...scene,
        birdLayer: createBirdLayer({
          cols: canvas.width,
          rows: canvas.height,
          cellPx,
          config,
        }),
      };
      renderer.setScene(scene);
      draw();
    }

    function stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    }

    function tick(now) {
      frame = requestAnimationFrame(tick);
      if (!lastTime) lastTime = now;

      const delta = now - lastTime;
      if (delta < 1000 / config.maxFps - 1.5) return;

      lastTime = now;
      elapsed += delta / 1000;
      offset += (config.speed * delta) / 1000 / cellPx;
      draw(now);
    }

    // Losing the GPU context stops the loop; restoring it rebuilds the scene
    // through the resize path, which re-uploads every static texture. The
    // seeds live outside the adapter, so the restored sky is the same sky.
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      stop();
    });
    canvas.addEventListener("webglcontextrestored", () => {
      resize();
      start();
    });

    function start() {
      stop();
      if (reducedMotion.matches || document.hidden || !inView) {
        draw();
        return;
      }
      frame = requestAnimationFrame(tick);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else start();
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (entries) => {
          // A fixed canvas can report zero intersection in some browsers while
          // still filling the viewport, so confirm against its box.
          inView = entries.some((entry) => entry.isIntersecting) || onScreen();
          if (inView) start();
          else stop();
        },
        { threshold: 0 },
      ).observe(canvas);
    }

    // Turning reduced motion on mid-flight finishes the crossing at once, so
    // the sky never freezes half-way to night.
    reducedMotion.addEventListener("change", () => {
      if (reducedMotion.matches && flight) settle(performance.now(), flight.to);
      start();
    });

    // The palette strip flips the theme without touching the field or the
    // seed; the clouds cross from one ramp to the other, and stars fade in
    // with the darkening clear band. The crossing takes the wheel's own turn
    // time, so the sky and the strip finish as one gesture. Reduced motion, a
    // hidden tab or a sky out of view all resolve the crossing in one frame.
    document.addEventListener("themechange", () => {
      const next = isDark(document.documentElement.dataset.theme);
      if (next === dark) return;
      dark = next;

      const target = dark ? 1 : 0;
      const now = performance.now();
      if (reducedMotion.matches || document.hidden || !inView) {
        settle(now, target);
        return;
      }

      // The palette strip stamps its wheel's clock in a frame callback, not in
      // the click handler, and the token fade likewise begins at the next
      // style change. One frame of wait puts the three on the same clock.
      requestAnimationFrame(() => {
        const startedAt = performance.now();
        if (reducedMotion.matches || document.hidden || !inView) {
          settle(startedAt, target);
          return;
        }
        flight = { from: mixNow(startedAt), to: target, start: startedAt };
        start();
      });
    });

    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resize();
        start();
      }, 120);
    });

    // Development only. A build made with SKY_LEVERS=1 marks <body> and loads
    // assets/sky-levers.mjs, which needs the live config and a way to repaint.
    // Without the attribute nothing is published, so a production page has no
    // handle on the sky at all.
    if (document.body.hasAttribute("data-sky-levers")) {
      globalThis.skyLevers = {
        config,
        redraw: draw,
        rebuild: resize,
        rebuildBirds,
        restart: start,
      };
    }

    resize();
    start();
  }
}
