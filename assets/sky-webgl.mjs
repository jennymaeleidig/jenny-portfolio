/**
 * The sky's WebGL2 renderer: the whole scene in one fragment pass.
 *
 * The pure core in ./sky-core.mjs stays the canonical reference. This adapter
 * carries only the per-frame pass onto the GPU: the field and evolution field
 * are packed once per scene into static RG8 textures, the star layout is
 * packed once, and the flock rides small per-bird uniforms. Every frame is
 * uniforms plus one draw; nothing is uploaded or read back from the browser
 * between frames.
 *
 * The kernel deliberately does not reproduce the integer hash, the fBm build,
 * the star layout or the flock layout. Those are baked by the core. The
 * sampling, contrast, evolution subtraction, dither, ramp selection, star
 * tinting and wing stamping are reproduced here, because they are per frame.
 *
 * The surface keeps the seam's shape (`cols`, `rows`, `present()`), but a
 * framebuffer cannot expose a CPU-readable `pixels` array without a stall.
 * `pixels` is therefore allocated and left untouched until `readFrame()` is
 * called; that method does one `readPixels` after the frame and flips it to
 * top-down order. It exists for a harness or a test, never for the frame loop.
 *
 * There is no gains-texture fallback for twinkle chatter. The stateless sine
 * through the dithered star thresholds is the crossing recorded for this
 * adapter; if chatter is ever measured, the gain texture is the documented
 * next step.
 *
 * No shader code is copied. The port is from this repository's own core.
 */

import { SKY_DEFAULTS } from "./sky-config.mjs";
import { BIRD_INK, birdLayer } from "./sky-flock.mjs";
import { STAR_DIM, STAR_THRESHOLDS, STAR_TINTS } from "./sky-stars.mjs";
import { BAYER4, RAMP, clamp01, rampAt, thresholds } from "./sky-tone.mjs";

const MAX_BIRDS = 64;
const MAX_THRESHOLDS = 8;
const TAU = Math.PI * 2;

const VERTEX_SOURCE = `#version 300 es
void main() {
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uField;
uniform sampler2D uEvolve;
uniform sampler2D uStars;

uniform ivec4 uFieldSize; // cols, rows, width, height

uniform float uDrift;
uniform float uWarpPhase;
uniform float uWarpCells;
uniform float uWarpRow;
uniform float uGain;
uniform float uFallBase;
uniform float uSkyBias;
uniform float uEvolveBias;
uniform float uEvolveMin;
uniform float uEvolveSpan;
uniform int uFlowWhole;
uniform float uFlowFrac;
uniform float uFlowShiftY;
uniform float uLift;

uniform vec3 uRamp[4];
uniform float uThresholds[${MAX_THRESHOLDS}];
uniform int uThresholdCount;
uniform int uRampLevels;
uniform float uDither;
uniform float uBayer[16];
uniform float uBlend;
uniform vec3 uClearColour;

uniform vec3 uStarWhite;
uniform vec3 uStarYellow;
uniform vec3 uStarDim;
uniform float uStarThresholds[2];
uniform float uStarDither;
uniform float uStarAmount;
uniform float uStarMinimum;
uniform float uStarMid;
uniform float uStarDimLevel;
uniform vec3 uTwinklePhase;

uniform int uBirdCount;
uniform vec4 uBirdA[${MAX_BIRDS}]; // x, y, wing, droop
uniform vec4 uBirdB[${MAX_BIRDS}]; // layer (1 = far), visible, -, -
uniform vec4 uLayerShape[2];      // body, spread, thickness, maxSlope
uniform float uBirdDither;
uniform vec3 uBirdInk;
uniform int uCovSteps;

out vec4 outColour;

int positiveModulo(int value, int period) {
  int rest = value % period;
  return rest < 0 ? rest + period : rest;
}

float unpack16(vec2 texel) {
  uvec2 bytes = uvec2(texel * 255.0 + 0.5);
  uint value = (bytes.x << 8) | bytes.y;
  return float(value) / 65535.0;
}

float fieldAt(int x, int y) {
  int width = uFieldSize.z;
  return unpack16(texelFetch(uField, ivec2(positiveModulo(x, width), y), 0).rg);
}

float evolveAt(int x, int y) {
  int width = uFieldSize.z;
  return unpack16(texelFetch(uEvolve, ivec2(positiveModulo(x, width), y), 0).rg);
}

int bandIndex(float value, float dither, float bayer) {
  int base = 0;
  while (base < uThresholdCount && value >= uThresholds[base]) base += 1;

  float shifted = value + dither * bayer;
  int q = 0;
  while (q < uThresholdCount && shifted >= uThresholds[q]) q += 1;

  int lower = max(0, base - 1);
  int upper = min(uThresholdCount, base + 1);
  return clamp(q, lower, upper);
}

int starBand(float value, float dither, float bayer) {
  int base = 0;
  while (base < 2 && value >= uStarThresholds[base]) base += 1;

  float shifted = value + dither * bayer;
  int q = 0;
  while (q < 2 && shifted >= uStarThresholds[q]) q += 1;

  int lower = max(0, base - 1);
  int upper = min(2, base + 1);
  return clamp(q, lower, upper);
}

float wingHeight(float u, float droop, float body, float spread) {
  return body * sqrt(abs(u * spread)) - droop * u * u;
}

float wingSlope(float u, float droop, float body, float spread, float maxSlope) {
  float ax = max(abs(u), 1e-3);
  float slope =
    sign(u) * (body * sqrt(spread)) / (2.0 * sqrt(ax)) - 2.0 * droop * u;
  return clamp(slope, -maxSlope, maxSlope);
}

float birdCoverage(
  float dx,
  float dy,
  float wing,
  float droop,
  vec4 shape
) {
  float body = shape.x;
  float spread = shape.y;
  float thickness = shape.z;
  float maxSlope = shape.w;
  float invN = 1.0 / float(uCovSteps);
  float hits = 0.0;

  for (int sy = 0; sy < uCovSteps; sy += 1) {
    for (int sx = 0; sx < uCovSteps; sx += 1) {
      float u = (dx + (float(sx) + 0.5) * invN) / wing;
      float v = -(dy + (float(sy) + 0.5) * invN) / wing;
      if (abs(u) > 1.0) continue;
      float slope = wingSlope(u, droop, body, spread, maxSlope);
      float width = thickness * sqrt(1.0 + slope * slope);
      float height = wingHeight(u, droop, body, spread);
      if (abs(v - height) < width) hits += 1.0;
    }
  }

  return hits / float(uCovSteps * uCovSteps);
}

void main() {
  int x = int(gl_FragCoord.x);
  int y = uFieldSize.y - 1 - int(gl_FragCoord.y);
  int cols = uFieldSize.x;
  int rows = uFieldSize.y;
  int width = uFieldSize.z;
  int height = uFieldSize.w;
  float fx = float(x);
  float fy = float(y);

  float depth = rows > 1 ? fy / float(rows - 1) : 0.0;
  float sampleOffset =
    uDrift + uWarpCells * sin(fy * uWarpRow + uWarpPhase);
  int whole = int(floor(sampleOffset));
  float fraction = sampleOffset - float(whole);
  float inverse = 1.0 - fraction;

  float skyY = clamp(uLift + fy, 0.0, float(height - 1));
  int skyRow = int(floor(skyY));
  float skyDepth = skyY - float(skyRow);
  int skyNext = min(skyRow + 1, height - 1);

  float flowY = uFlowShiftY + fy;
  int flowRow = int(floor(flowY)) % rows;
  int flowNext = (flowRow + 1) % rows;
  float flowDepth = flowY - floor(flowY);
  float flowUp = 1.0 - flowDepth;

  int a = positiveModulo(whole + x, width);
  int b = a + 1 >= width ? 0 : a + 1;

  float top = fieldAt(a, skyRow) * inverse + fieldAt(b, skyRow) * fraction;
  float value = top;
  if (skyDepth != 0.0) {
    float bottom =
      fieldAt(a, skyNext) * inverse + fieldAt(b, skyNext) * fraction;
    value = top * (1.0 - skyDepth) + bottom * skyDepth;
  }

  float falloffBias = uFallBase * depth * 0.55;
  value = (value - 0.5) * uGain + 0.5 - falloffBias - uSkyBias;

  int ea = positiveModulo(uFlowWhole + x, width);
  int eb = ea + 1 >= width ? 0 : ea + 1;
  float here =
    (evolveAt(ea, flowRow) * (1.0 - uFlowFrac) +
      evolveAt(eb, flowRow) * uFlowFrac) *
      flowUp +
    (evolveAt(ea, flowNext) * (1.0 - uFlowFrac) +
      evolveAt(eb, flowNext) * uFlowFrac) *
      flowDepth;
  value -= (here * uEvolveSpan + uEvolveMin) * 2.0 * uEvolveBias;

  value = clamp(value, 0.0, 1.0);
  value = value * value * (3.0 - 2.0 * value);

  int ditherIndex = (y & 3) * 4 + (x & 3);
  int band = bandIndex(value, uDither, uBayer[ditherIndex]);
  vec3 colour = uRamp[uRampLevels - band];

  if (band == 0 && uBlend > 0.0) {
    vec4 star = texelFetch(uStars, ivec2(x, y), 0);
    float peak = unpack16(star.rg);
    if (peak > 0.0) {
      int pack = int(star.b * 255.0 + 0.5);
      int size = pack & 3;
      bool yellow = ((pack >> 2) & 1) == 1;
      float phase = star.a * ${TAU.toFixed(15)};

      float gain = 1.0;
      if (uStarAmount > 0.0 && float(size) >= uStarMinimum) {
        float wave =
          0.5 +
          0.22 * sin(uTwinklePhase.x + phase) +
          0.14 * sin(uTwinklePhase.y + phase * 1.7) +
          0.08 * sin(uTwinklePhase.z + phase * 2.3);
        float target = 1.0 - uStarAmount * (1.0 - clamp(wave, 0.0, 1.0));
        float level = target < uStarDimLevel ? 2.0 : (target < uStarMid ? 1.0 : 0.0);
        gain = level == 2.0 ? uStarDimLevel : (level == 1.0 ? uStarMid : 1.0);
      }

      int starLevel = starBand(
        peak * gain,
        uStarDither,
        uBayer[ditherIndex]
      );
      if (starLevel == 2) {
        vec3 tint = yellow ? uStarYellow : uStarWhite;
        colour = mix(uClearColour, tint, uBlend);
      } else if (starLevel == 1) {
        colour = mix(uClearColour, uStarDim, uBlend);
      }
    }
  }

  for (int i = 0; i < uBirdCount; i += 1) {
    vec4 bird = uBirdA[i];
    vec4 meta = uBirdB[i];
    float dx = fx - bird.x;
    float dy = fy - bird.y;
    float wing = bird.z;
    vec4 shape = uLayerShape[int(meta.x)];
    float yMax = wing * (shape.x * sqrt(shape.y) + shape.z * 2.0);
    if (abs(dx) > wing + 1.0 || abs(dy) > yMax + 1.0) continue;
    if (meta.x > 0.5 && band > 0) continue;

    float coverage = birdCoverage(dx, dy, wing, bird.w, shape);
    if (coverage + uBirdDither * uBayer[ditherIndex] < 0.5) continue;
    colour = mix(colour, uBirdInk, meta.y);
  }

  outColour = vec4(colour, 1.0);
}
`;

/**
 * Pack a float field into RG8, high byte first, rounding on the way in so the
 * shader's integer unpack recovers the nearest 16-bit value.
 */
function packField(values, low, high, map = null) {
  const packed = new Uint8Array(values.length * 2);
  const span = high - low || 1;
  for (let i = 0; i < values.length; i += 1) {
    const unit = map ? map(values[i], low, span) : values[i];
    const quantised = Math.round(Math.max(0, Math.min(1, unit)) * 65535);
    packed[i * 2] = (quantised >> 8) & 255;
    packed[i * 2 + 1] = quantised & 255;
  }
  return packed;
}

function packUnit(values) {
  return packField(values, 0, 1);
}

/** Pack an evolution field against its own range, centred on the mean. */
function packEvolve(values) {
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] < low) low = values[i];
    if (values[i] > high) high = values[i];
  }
  if (!Number.isFinite(low)) {
    low = 0;
    high = 1;
  }
  return {
    packed: packField(
      values,
      low,
      high,
      (value, origin, span) => (value - origin) / span,
    ),
    low,
    span: high - low || 1,
  };
}

/** Pack the star layout: peak 16-bit, size/tint byte, phase byte. */
function packStars(layer, cols, rows) {
  const packed = new Uint8Array(cols * rows * 4);
  if (!layer) return packed;

  for (let i = 0; i < cols * rows; i += 1) {
    const owner = layer.owner[i];
    if (owner < 0) continue;
    const star = layer.stars[owner];
    const peak = Math.round(Math.max(0, Math.min(1, layer.peak[i])) * 65535);
    const tint = layer.tint[i] === 2 ? 4 : 0;
    const size = Math.max(1, Math.min(3, star.size));
    const phase = Math.round(
      Math.max(0, Math.min(255, (star.phase / TAU) * 255)),
    );
    packed[i * 4] = (peak >> 8) & 255;
    packed[i * 4 + 1] = peak & 255;
    packed[i * 4 + 2] = tint | size;
    packed[i * 4 + 3] = phase;
  }
  return packed;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`sky shader failed to compile: ${log}`);
  }
  return shader;
}

function buildProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`sky shader failed to link: ${log}`);
  }
  return program;
}

function uniform(gl, program, name) {
  return gl.getUniformLocation(program, name);
}

/**
 * A renderer that paints the whole scene through one WebGL2 fragment pass.
 *
 * Returns null when the canvas cannot give a WebGL2 context; a shader that
 * fails to compile or link throws, because the canvas has already committed
 * to WebGL2 and cannot become a 2D surface.
 */
export function createWebglRenderer({ canvas, config = SKY_DEFAULTS } = {}) {
  if (!canvas || typeof canvas.getContext !== "function") return null;

  let gl = null;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
    });
  } catch {
    return null;
  }
  if (!gl) return null;

  let current = null;
  let surface = null;
  let program = null;
  let vao = null;
  let fieldTexture = null;
  let evolveTexture = null;
  let starTexture = null;
  let lost = false;
  let locations = null;

  const ramp = new Float32Array(12);
  const thresholdsBuffer = new Float32Array(MAX_THRESHOLDS);
  const starThresholds = new Float32Array(2);
  const bayers = new Float32Array(BAYER4);
  const birdA = new Float32Array(MAX_BIRDS * 4);
  const birdB = new Float32Array(MAX_BIRDS * 4);
  const layerShape = new Float32Array(8);
  const twinklePhase = new Float32Array(3);

  function makeTexture(width, height, format) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  function uploadField(scene) {
    const field = scene.field;
    fieldTexture = makeTexture(field.width, field.height, gl.RG8);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      field.width,
      field.height,
      gl.RG,
      gl.UNSIGNED_BYTE,
      packUnit(field.data),
    );

    const evolve = packEvolve(field.evolve);
    evolveTexture = makeTexture(field.width, field.rows, gl.RG8);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      field.width,
      field.rows,
      gl.RG,
      gl.UNSIGNED_BYTE,
      evolve.packed,
    );

    starTexture = makeTexture(field.cols, field.rows, gl.RGBA8);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      field.cols,
      field.rows,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      packStars(scene.starLayer, field.cols, field.rows),
    );

    return evolve;
  }

  function ensureProgram() {
    if (program) return;
    program = buildProgram(gl);
    vao = gl.createVertexArray();
    locations = {
      field: uniform(gl, program, "uField"),
      evolve: uniform(gl, program, "uEvolve"),
      stars: uniform(gl, program, "uStars"),
      fieldSize: uniform(gl, program, "uFieldSize"),
      drift: uniform(gl, program, "uDrift"),
      warpPhase: uniform(gl, program, "uWarpPhase"),
      warpCells: uniform(gl, program, "uWarpCells"),
      warpRow: uniform(gl, program, "uWarpRow"),
      gain: uniform(gl, program, "uGain"),
      fallBase: uniform(gl, program, "uFallBase"),
      skyBias: uniform(gl, program, "uSkyBias"),
      evolveBias: uniform(gl, program, "uEvolveBias"),
      evolveMin: uniform(gl, program, "uEvolveMin"),
      evolveSpan: uniform(gl, program, "uEvolveSpan"),
      flowWhole: uniform(gl, program, "uFlowWhole"),
      flowFrac: uniform(gl, program, "uFlowFrac"),
      flowShiftY: uniform(gl, program, "uFlowShiftY"),
      lift: uniform(gl, program, "uLift"),
      ramp: uniform(gl, program, "uRamp[0]"),
      thresholds: uniform(gl, program, "uThresholds[0]"),
      thresholdCount: uniform(gl, program, "uThresholdCount"),
      rampLevels: uniform(gl, program, "uRampLevels"),
      dither: uniform(gl, program, "uDither"),
      bayer: uniform(gl, program, "uBayer[0]"),
      blend: uniform(gl, program, "uBlend"),
      clearColour: uniform(gl, program, "uClearColour"),
      starWhite: uniform(gl, program, "uStarWhite"),
      starYellow: uniform(gl, program, "uStarYellow"),
      starDim: uniform(gl, program, "uStarDim"),
      starThresholds: uniform(gl, program, "uStarThresholds[0]"),
      starDither: uniform(gl, program, "uStarDither"),
      starAmount: uniform(gl, program, "uStarAmount"),
      starMinimum: uniform(gl, program, "uStarMinimum"),
      starMid: uniform(gl, program, "uStarMid"),
      starDimLevel: uniform(gl, program, "uStarDimLevel"),
      twinklePhase: uniform(gl, program, "uTwinklePhase"),
      birdCount: uniform(gl, program, "uBirdCount"),
      birdA: uniform(gl, program, "uBirdA[0]"),
      birdB: uniform(gl, program, "uBirdB[0]"),
      layerShape: uniform(gl, program, "uLayerShape[0]"),
      birdDither: uniform(gl, program, "uBirdDither"),
      birdInk: uniform(gl, program, "uBirdInk"),
      covSteps: uniform(gl, program, "uCovSteps"),
    };
    gl.useProgram(program);
    gl.uniform1i(locations.field, 0);
    gl.uniform1i(locations.evolve, 1);
    gl.uniform1i(locations.stars, 2);
  }

  function setScene(next) {
    current = next;
    const { cols, rows } = next.field;
    if (!surface || surface.cols !== cols || surface.rows !== rows) {
      surface = {
        cols,
        rows,
        pixels: new Uint8ClampedArray(cols * rows * 4),
        present() {},
        readFrame() {
          if (!gl || lost) return null;
          const bytes = new Uint8Array(cols * rows * 4);
          gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
          const rowBytes = cols * 4;
          for (let y = 0; y < rows; y += 1) {
            const from = (rows - 1 - y) * rowBytes;
            surface.pixels.set(
              bytes.subarray(from, from + rowBytes),
              y * rowBytes,
            );
          }
          return surface.pixels;
        },
      };
    }

    gl.viewport(0, 0, cols, rows);
    if (lost) return surface;
    ensureProgram();
    const evolve = uploadField(next);
    surface.evolve = evolve;
    return surface;
  }

  function render({
    time = 0,
    offset = 0,
    offsetY = undefined,
    mix = undefined,
    dark = false,
  } = {}) {
    if (!current || !surface) return null;
    if (lost) return surface;

    const field = current.field;
    const cols = field.cols;
    const rows = field.rows;
    const blend = mix === undefined ? Number(dark) : clamp01(mix);
    const tones = Math.min(RAMP.length, Math.max(2, config.tones | 0));
    const rampColours = rampAt(blend);
    const bandThresholds = thresholds(tones, config.stark);
    const rampLevels = tones - 1;
    const clearColour =
      rampColours[Math.max(0, Math.min(RAMP.length - 1, rampLevels))];

    const evolveBias = (config.evolve / 100) * 1;
    const evolveSpeed = config.evolveSpeed / 100;
    const evolveTilt = config.evolveTilt / 100;
    const warpCells = (config.warp / 100) * 14;
    const warpSpeed = (config.warpSpeed / 100) * 0.8;
    const warpPhase = (((time * warpSpeed) % TAU) + TAU) % TAU;
    const drift = ((offset % field.width) + field.width) % field.width;

    const evolveShiftX =
      (((time * evolveSpeed * 42) % field.width) + field.width) % field.width;
    const flowWhole = Math.floor(evolveShiftX);
    const flowFrac = evolveShiftX - flowWhole;
    const evolveShiftY = time * evolveSpeed * 42 * evolveTilt;
    const flowShiftY = ((evolveShiftY % rows) + rows) % rows;

    const state = {
      time,
      offsetY: offsetY ?? current.offsetY,
      blend,
      tones,
      rampColours,
      bandThresholds,
      rampLevels,
      clearColour,
      evolveBias,
      warpCells,
      warpPhase,
      drift,
      flowWhole,
      flowFrac,
      flowShiftY,
    };

    uploadUniforms(state);
    uploadBirds(state);
    uploadTwinkle(time);

    gl.viewport(0, 0, cols, rows);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    surface.present();
    return surface;
  }

  function uploadUniforms(state) {
    const field = current.field;
    const lift = field.margin + state.offsetY;
    const rampCount = Math.min(4, state.rampColours.length);
    for (let i = 0; i < rampCount; i += 1) {
      const colour = state.rampColours[i];
      ramp[i * 3] = colour[0] / 255;
      ramp[i * 3 + 1] = colour[1] / 255;
      ramp[i * 3 + 2] = colour[2] / 255;
    }
    thresholdsBuffer.fill(0);
    for (let i = 0; i < state.bandThresholds.length; i += 1) {
      thresholdsBuffer[i] = state.bandThresholds[i];
    }

    const clear = state.clearColour;
    const starWhite = STAR_TINTS[1];
    const starYellow = STAR_TINTS[2];

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, evolveTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, starTexture);

    gl.uniform4i(
      locations.fieldSize,
      field.cols,
      field.rows,
      field.width,
      field.height,
    );
    gl.uniform1f(locations.drift, state.drift);
    gl.uniform1f(locations.warpPhase, state.warpPhase);
    gl.uniform1f(locations.warpCells, state.warpCells);
    gl.uniform1f(locations.warpRow, 0.055);
    gl.uniform1f(locations.gain, config.gain);
    gl.uniform1f(locations.fallBase, config.falloff / 100);
    gl.uniform1f(locations.skyBias, (config.sky / 100 - 0.5) * 0.7);
    gl.uniform1f(locations.evolveBias, state.evolveBias);
    gl.uniform1f(locations.evolveMin, surface.evolve.low);
    gl.uniform1f(locations.evolveSpan, surface.evolve.span);
    gl.uniform1i(locations.flowWhole, state.flowWhole);
    gl.uniform1f(locations.flowFrac, state.flowFrac);
    gl.uniform1f(locations.flowShiftY, state.flowShiftY);
    gl.uniform1f(locations.lift, lift);

    gl.uniform3fv(locations.ramp, ramp);
    gl.uniform1fv(locations.thresholds, thresholdsBuffer);
    gl.uniform1i(locations.thresholdCount, state.bandThresholds.length);
    gl.uniform1i(locations.rampLevels, state.rampLevels);
    gl.uniform1f(locations.dither, config.dither / 100);
    gl.uniform1fv(locations.bayer, bayers);
    gl.uniform1f(locations.blend, state.blend);
    gl.uniform3f(
      locations.clearColour,
      clear[0] / 255,
      clear[1] / 255,
      clear[2] / 255,
    );

    gl.uniform3f(
      locations.starWhite,
      starWhite[0] / 255,
      starWhite[1] / 255,
      starWhite[2] / 255,
    );
    gl.uniform3f(
      locations.starYellow,
      starYellow[0] / 255,
      starYellow[1] / 255,
      starYellow[2] / 255,
    );
    gl.uniform3f(
      locations.starDim,
      STAR_DIM[0] / 255,
      STAR_DIM[1] / 255,
      STAR_DIM[2] / 255,
    );
    starThresholds[0] = STAR_THRESHOLDS[0];
    starThresholds[1] = STAR_THRESHOLDS[1];
    gl.uniform1fv(locations.starThresholds, starThresholds);
    gl.uniform1f(locations.starDither, config.starDither / 100);
    gl.uniform1f(locations.starAmount, clamp01(config.starTwinkle / 100));
    gl.uniform1f(locations.starMinimum, config.starTwinkleSize);
    gl.uniform1f(
      locations.starMid,
      1 - clamp01(config.starTwinkle / 100) * 0.5,
    );
    gl.uniform1f(
      locations.starDimLevel,
      1 - clamp01(config.starTwinkle / 100) * 0.9,
    );
  }

  function uploadTwinkle(time) {
    const speed = Math.max(0.01, config.starTwinkleSpeed / 100);
    const t = time * speed;
    const phases = [
      ((t * TAU) / 7.3) % TAU,
      ((t * TAU) / 3.1) % TAU,
      ((t * TAU) / 11.7) % TAU,
    ];
    for (let i = 0; i < 3; i += 1) {
      twinklePhase[i] = ((phases[i] % TAU) + TAU) % TAU;
    }
    gl.uniform3fv(locations.twinklePhase, twinklePhase);
  }

  function uploadBirds(state) {
    const flock = current.birdLayer;
    const visible = Math.max(0, 1 - state.blend);
    birdA.fill(0);
    birdB.fill(0);
    let count = 0;

    if (flock && visible > 0) {
      const field = current.field;
      const params = [birdLayer(config, 0), birdLayer(config, 1)];
      layerShape.set([
        params[0].body,
        params[0].spread,
        config.birdThickness,
        config.birdMaxSlope,
        params[1].body,
        params[1].spread,
        config.birdThickness,
        config.birdMaxSlope,
      ]);

      for (const bird of flock.birds) {
        if (count >= MAX_BIRDS) break;
        const layer = bird.layer === 0 ? params[0] : params[1];
        const wing = bird.wing;
        const raw = state.time * bird.speed + bird.offset;
        let bx = field.cols + 2 * wing - (raw % bird.span);

        const beat =
          state.time * flapHz(layer.flap) * bird.flapVariance + bird.phase;
        let flap = 0.5 + 0.5 * Math.sin(beat * TAU);
        flap = Math.pow(flap, layer.flapEase);
        if (layer.invert >= 0.5) flap = 1 - flap;
        const steps = Math.max(1, Math.round(layer.flapSteps));
        const stepIndex = Math.round(flap * steps);
        flap = stepIndex / steps;

        let by = bird.row - (layer.lift / 100) * wing * flap;
        const snap = config.birdSnap >= 0.5;
        if (snap) {
          bx = Math.round(bx);
          by = Math.round(by);
        }
        const droop = layer.droopMax + (layer.droopMin - layer.droopMax) * flap;

        birdA[count * 4] = bx;
        birdA[count * 4 + 1] = by;
        birdA[count * 4 + 2] = wing;
        birdA[count * 4 + 3] = droop;
        birdB[count * 4] = bird.layer;
        birdB[count * 4 + 1] = visible;
        count += 1;
      }
    }

    gl.uniform1i(locations.birdCount, count);
    gl.uniform4fv(locations.birdA, birdA);
    gl.uniform4fv(locations.birdB, birdB);
    gl.uniform4fv(locations.layerShape, layerShape);
    gl.uniform1f(locations.birdDither, config.birdDither);
    gl.uniform3f(
      locations.birdInk,
      BIRD_INK[0] / 255,
      BIRD_INK[1] / 255,
      BIRD_INK[2] / 255,
    );
    gl.uniform1i(
      locations.covSteps,
      Math.max(1, Math.round(config.birdCovSteps)),
    );
  }

  function onLost(event) {
    event.preventDefault();
    lost = true;
  }

  function onRestored() {
    lost = false;
    program = null;
    vao = null;
    fieldTexture = null;
    evolveTexture = null;
    starTexture = null;
    locations = null;
  }

  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  return {
    setScene,
    render,
    get surface() {
      return surface;
    },
  };
}

function flapHz(birdFlap) {
  return Math.max(0, birdFlap) / 60;
}
