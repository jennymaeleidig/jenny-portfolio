/**
 * The sky's renderer seam.
 *
 * A renderer paints a sky scene for one frame state onto a surface it owns.
 * The scene is the built state from ./sky-core.mjs: the field, the star layer,
 * the bird layer and the lift. The frame state is what moves: seconds of
 * animation, drift in cells, the lift in cells, and the light/dark mix.
 *
 * The interface every renderer satisfies:
 *
 *   setScene(scene)   Replace the sky scene. The surface is reallocated only
 *                     when the scene's grid differs from the current one.
 *                     Returns the surface.
 *   render(state)     Paint one frame state onto the surface and present it.
 *                     `state` is { time, offset, offsetY, mix, dark };
 *                     `offsetY` defaults to the scene's lift. Returns the
 *                     surface.
 *   surface           The adapter-owned drawing surface:
 *                     { cols, rows, pixels, present(), readFrame() }.
 *                     On the CPU surface `pixels` is the frame buffer: a
 *                     Uint8ClampedArray of cols × rows RGBA blocks. On the
 *                     GPU surface `pixels` is not the frame; the frame is
 *                     read back through `readFrame()`. `readFrame()` is part
 *                     of the surface contract but exists for a test, never
 *                     for the frame loop.
 *
 * A renderer is created once per page load. The CPU adapter below is the
 * canonical reference for the sky's look; it composes the layers through
 * renderFrame. The WebGL2 adapter in ./sky-webgl.mjs uploads the scene once
 * and paints from its own framebuffer, presenting through the same surface
 * contract.
 */

import { SKY_DEFAULTS, renderFrame } from "./sky-core.mjs";

/**
 * A surface for a 2D context, or a bare pixel buffer when there is no context.
 * The context's ImageData owns the pixels it presents; without one the surface
 * owns a plain buffer.
 */
function createSurface(cols, rows, context = null) {
  const image = context ? context.createImageData(cols, rows) : null;
  const pixels = image ? image.data : new Uint8ClampedArray(cols * rows * 4);
  return {
    cols,
    rows,
    pixels,
    present() {
      if (image) context.putImageData(image, 0, 0);
    },
    readFrame() {
      return pixels;
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
      surface = createSurface(cols, rows, context);
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
