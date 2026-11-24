/**
 * The sky's renderer seam.
 *
 * A renderer paints a sky scene for one frame state onto a surface it owns.
 * The scene is the built state from ./sky-core.mjs: the field, the star layer,
 * the flock and the lift. The frame state is what moves: seconds of
 * animation, drift in cells, the lift in cells, and the light/dark mix.
 *
 * The interface every renderer satisfies:
 *
 *   setScene(scene)   Replace the sky scene. The surface is reallocated only
 *                     when the scene's grid differs from the current one.
 *                     Returns the surface.
 *   render(state)     Paint one frame onto the surface and present it.
 *                     `state` is { time, offset, offsetY, mix, dark };
 *                     `offsetY` defaults to the scene's lift. Returns the
 *                     surface, whose pixels now hold the frame.
 *   surface           The adapter-owned drawing surface:
 *                     { cols, rows, pixels, present() }, where `pixels` is a
 *                     Uint8ClampedArray of cols × rows RGBA blocks.
 *
 * A renderer is created once per page load. The CPU adapter below is the
 * canonical reference for the sky's look; it composes the layers through
 * renderFrame. A WebGL2 adapter would upload the scene once and paint from
 * its own framebuffer, presenting through the same surface contract.
 */

import { SKY_DEFAULTS, renderFrame } from "./sky-core.mjs";

/** A surface for environments with no canvas. */
function pixelSurface(cols, rows) {
  return {
    cols,
    rows,
    pixels: new Uint8ClampedArray(cols * rows * 4),
    present() {},
  };
}

/** A surface backed by a 2D context's ImageData. */
function imageSurface(context, cols, rows) {
  const image = context.createImageData(cols, rows);
  return {
    cols,
    rows,
    pixels: image.data,
    present() {
      context.putImageData(image, 0, 0);
    },
  };
}

/**
 * The CPU renderer: pixels composed by the pure core.
 *
 * `context` is the browser's 2D context when there is one; the adapter then
 * owns the ImageData the frame is painted into. Without a context it
 * allocates a bare pixel buffer, which is how the poster and tests use it.
 */
export function createCpuRenderer({
  config = SKY_DEFAULTS,
  scene = null,
  context = null,
} = {}) {
  let current = null;
  let surface = null;

  function setScene(next) {
    current = next;
    const { cols, rows } = next.field;
    if (!surface || surface.cols !== cols || surface.rows !== rows) {
      surface = context
        ? imageSurface(context, cols, rows)
        : pixelSurface(cols, rows);
    }
    return surface;
  }

  function render({
    time = 0,
    offset = 0,
    offsetY = undefined,
    mix = undefined,
    dark = false,
  } = {}) {
    if (!current) return null;
    renderFrame({
      field: current.field,
      out: surface.pixels,
      config,
      time,
      offset,
      offsetY: offsetY ?? current.offsetY,
      mix,
      dark,
      starLayer: current.starLayer ?? null,
      birdLayer: current.birdLayer ?? null,
    });
    surface.present();
    return surface;
  }

  if (scene) setScene(scene);

  return {
    setScene,
    render,
    get surface() {
      return surface;
    },
  };
}
