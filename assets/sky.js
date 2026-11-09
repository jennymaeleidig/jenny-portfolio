/**
 * The pixelated sky: the browser half.
 *
 * Pure maths lives in /assets/sky-core.mjs. This file owns the canvas, the
 * frame loop, and the three reasons to stop: the tab is hidden, the canvas is
 * out of view, or the reader asked for reduced motion.
 *
 * No content depends on this file. Without it the poster image still covers
 * the viewport. Without a 2D context the layer shows the poster over its CSS
 * gradient, so a canvas block still reads as sky.
 */

import { SKY_DEFAULTS, createField, renderFrame } from "/assets/sky-core.mjs";

// A visit gets its own sky. The seed is chosen once per page load, so the
// field stays put across internal navigation and is only new on a real load.
function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 0xffffffff);
}

const config = { ...SKY_DEFAULTS, seed: randomSeed() };

const sky = document.querySelector(".sky");
const canvas = document.querySelector(".sky-canvas");

if (sky && canvas) {
  const context =
    typeof canvas.getContext === "function" ? canvas.getContext("2d", { alpha: true }) : null;

  if (!context) {
    // No 2D context: show the poster over the gradient. The page is otherwise
    // untouched.
    sky.classList.add("sky--fallback");
  } else {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let field = null;
    let image = null;
    let pixels = null;
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

    function draw() {
      if (!field) return;
      renderFrame({ field, out: pixels, config, time: elapsed, offset });
      context.putImageData(image, 0, 0);
    }

    function resize() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      const previousCellPx = cellPx;

      // Snap one block to a whole number of device pixels, then give the
      // canvas an explicit CSS size that is an exact multiple of it. Without
      // this the CSS size stretches the backing by a fractional factor and
      // every block edge lands on a different device pixel: a flickering seam
      // that drifts under the field.
      cellPx = Math.max(1, Math.round(config.cell * dpr) / dpr);
      const cols = Math.max(1, Math.ceil(width / cellPx));
      const rows = Math.max(1, Math.ceil(height / cellPx));

      canvas.width = cols;
      canvas.height = rows;
      canvas.style.width = `${cols * cellPx}px`;
      canvas.style.height = `${rows * cellPx}px`;

      // Keep the drift continuous across a resize. A mobile URL bar collapsing
      // only changes the height, so the field is unchanged; zeroing here would
      // snap the whole sheet back to the start.
      if (field && cellPx !== previousCellPx) {
        offset *= previousCellPx / cellPx;
      }

      field = createField({ cols, rows, cellPx, scale: config.scale, seed: config.seed });
      image = context.createImageData(cols, rows);
      pixels = image.data;
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
      draw();
    }

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

    reducedMotion.addEventListener("change", start);

    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        start();
      }, 120);
    });

    resize();
    start();
  }
}
