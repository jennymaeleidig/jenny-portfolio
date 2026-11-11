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

import {
  SKY_DEFAULTS,
  createScene,
  frameLayout,
  renderFrame,
} from "/assets/sky-core.mjs";

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
    typeof canvas.getContext === "function"
      ? canvas.getContext("2d", { alpha: true })
      : null;

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
    let offsetY = 0;
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
      renderFrame({
        field,
        out: pixels,
        config,
        time: elapsed,
        offset,
        offsetY,
      });
      context.putImageData(image, 0, 0);
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
      if (field && cellPx !== previousCellPx) {
        offset *= previousCellPx / cellPx;
      }

      const scene = createScene({
        config,
        cols: layout.cols,
        rows: layout.rows,
        cellPx,
      });
      field = scene.field;
      offsetY = scene.offsetY;
      image = context.createImageData(layout.cols, layout.rows);
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

    // Development only. A build made with SKY_LEVERS=1 marks <body> and loads
    // assets/sky-levers.mjs, which needs the live config and a way to repaint.
    // Without the attribute nothing is published, so a production page has no
    // handle on the sky at all.
    if (document.body.hasAttribute("data-sky-levers")) {
      globalThis.skyLevers = {
        config,
        redraw: draw,
        rebuild: resize,
        restart: start,
      };
    }

    resize();
    start();
  }
}
