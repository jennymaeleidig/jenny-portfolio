/**
 * Development levers for the sky. Emitted only by a SKY_LEVERS=1 build.
 *
 * The prototype's tuning panel, wired to the config the canvas already reads.
 * `scripts/post-build.sh` copies this file only when the flag is set, and
 * `layouts/shell.sh` only writes the tag and the body attribute when it is
 * set; a production tree has neither, so this module cannot be reached.
 *
 * `assets/sky.js` publishes the live controller as `globalThis.skyLevers` when
 * it sees the attribute. Tuning belongs in `SKY_DEFAULTS` in
 * `assets/sky-core.mjs`: "copy values" puts the current settings on the
 * clipboard in that shape.
 */

import { OFFSET_Y_LIMIT } from "/assets/sky-core.mjs";

const controller = globalThis.skyLevers;

const sliders = [
  {
    key: "cell",
    label: "cell",
    min: 2,
    max: 14,
    step: 1,
    rebuild: true,
    hint: "block size in CSS px",
  },
  {
    key: "scale",
    label: "scale",
    min: 20,
    max: 260,
    step: 2,
    rebuild: true,
    hint: "noise feature size in CSS px: clouds vs static",
  },
  {
    key: "tones",
    label: "tones",
    min: 2,
    max: 4,
    step: 1,
    hint: "quantisation steps into the ramp",
  },
  {
    key: "gain",
    label: "gain",
    min: 100,
    max: 400,
    step: 5,
    mul: 0.01,
    hint: "contrast stretch before quantisation",
  },
  {
    key: "speed",
    label: "speed",
    min: 0,
    max: 60,
    step: 1,
    hint: "drift, CSS px/s",
  },
  {
    key: "falloff",
    label: "falloff",
    min: 0,
    max: 100,
    step: 1,
    hint: "how much coverage thins toward the bottom",
  },
  {
    key: "offsetY",
    label: "offset y",
    min: -OFFSET_Y_LIMIT,
    max: OFFSET_Y_LIMIT,
    step: 5,
    hint: "slides the whole sky up (+) or down (-)",
  },
  {
    key: "dither",
    label: "dither",
    min: 0,
    max: 100,
    step: 1,
    hint: "ordered dither on the tone thresholds: 0 is a hard snap",
  },
  {
    key: "sky",
    label: "sky",
    min: 0,
    max: 100,
    step: 1,
    hint: "trades white for blue: 50 is neutral",
  },
  {
    key: "stark",
    label: "stark",
    min: 0,
    max: 100,
    step: 1,
    hint: "narrows the interior tones: 100 is nearly two colours",
  },
  {
    key: "evolve",
    label: "evolve",
    min: 0,
    max: 100,
    step: 1,
    life: true,
    hint: "how far the masses swell and thin across the plane",
  },
  {
    key: "evolveSpeed",
    label: "evolve speed",
    min: 0,
    max: 100,
    step: 1,
    life: true,
    hint: "how fast that pattern drifts and changes",
  },
  {
    key: "evolveScale",
    label: "evolve scale",
    min: 60,
    max: 600,
    step: 10,
    life: true,
    rebuild: true,
    hint: "size of the flow's features: small patches vs whole regions",
  },
  {
    key: "evolveTilt",
    label: "evolve tilt",
    min: 0,
    max: 100,
    step: 1,
    life: true,
    hint: "0 drifts sideways only, 100 drifts upright as steeply as it crosses",
  },
  {
    key: "warp",
    label: "warp",
    min: 0,
    max: 100,
    step: 1,
    life: true,
    hint: "sideways wave amplitude",
  },
  {
    key: "warpSpeed",
    label: "warp speed",
    min: 0,
    max: 100,
    step: 1,
    life: true,
    hint: "how fast the wave travels",
  },
];

const STYLE = `
  .sky-levers {
    position: fixed; left: 16px; top: 16px; z-index: 10;
    margin: 0;
    font: 11px/1.25 var(--font-family, ui-monospace, monospace);
    color: var(--ink, #14140f);
  }
  /* The site grid puts a line of space above every sibling (* + *). The panel
     is a dense instrument, so spacing here is set by hand instead. */
  .sky-levers *,
  .sky-levers *::before,
  .sky-levers *::after { margin: 0; }
  .sky-levers-panel {
    width: min(320px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    overflow-y: auto; overscroll-behavior: contain;
    padding: 10px 12px;
    background: rgba(251, 250, 248, .96);
    border: var(--border-thickness, 2px) solid var(--sky-2, #c5d5e5);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(20, 20, 15, .12);
  }
  .sky-levers-panel[hidden] { display: none; }
  .sky-levers-handle {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; padding-bottom: 6px; margin-bottom: 7px;
    border-bottom: 1px solid #e6e5d9;
    font-size: 10px; line-height: 1.2; letter-spacing: .04em;
    text-transform: uppercase; color: #5c5b52;
    cursor: grab; touch-action: none; user-select: none;
  }
  .sky-levers.dragging .sky-levers-handle { cursor: grabbing; }
  .sky-levers-grip {
    width: 12px; height: 9px;
    background: repeating-linear-gradient(180deg, #b9b8ad 0 1px, transparent 1px 4px);
  }
  .sky-levers h4 {
    font-size: 10px; line-height: 1.2; letter-spacing: .04em;
    text-transform: uppercase; color: #5c5b52;
    margin-bottom: 5px;
  }
  .sky-levers h4:not(:first-child) {
    margin-top: 9px; padding-top: 7px; border-top: 1px solid #e6e5d9;
  }
  .sky-levers-row {
    display: grid; grid-template-columns: 96px 1fr 38px; gap: 8px;
    align-items: center; padding-bottom: 2px;
  }
  .sky-levers-row label {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .sky-levers input[type=range] {
    width: 100%; height: 14px; margin: 0; padding: 0;
    accent-color: var(--accent, #b83d05);
  }
  .sky-levers output {
    text-align: right; color: #5c5b52; font-variant-numeric: tabular-nums;
  }
  .sky-levers-row.seg { grid-template-columns: 96px 1fr; }
  .sky-levers-seg { display: flex; gap: 4px; }
  .sky-levers-seg > * { margin: 0; }
  .sky-levers button {
    font: inherit; line-height: 1.2; padding: 2px 8px; cursor: pointer;
    border: 1px solid #dad9ce; border-radius: 5px;
    background: transparent; color: #5c5b52;
  }
  .sky-levers button[aria-pressed=true] {
    background: var(--ink, #14140f); color: var(--paper, #f4f4ed);
    border-color: var(--ink, #14140f);
  }
  .sky-levers-actions {
    display: flex; gap: 4px; margin-top: 9px; padding-top: 7px;
    border-top: 1px solid #e6e5d9;
  }
  .sky-levers-note { color: #5c5b52; font-size: 10px; line-height: 1.3; padding-top: 6px; }
  .sky-levers-toggle {
    font: inherit; padding: 6px 10px; border-radius: 8px; cursor: pointer;
    border: 1px solid #dad9ce; color: #5c5b52;
    background: rgba(251, 250, 248, .96);
  }
  @media print { .sky-levers { display: none; } }
`;

function nearestStep(slider, value) {
  const steps = Math.round((value - slider.min) / slider.step);
  return slider.min + steps * slider.step;
}

if (controller) {
  const { config } = controller;
  const canvas = document.querySelector(".sky-canvas");
  const initial = { ...config };

  const style = document.createElement("style");
  style.textContent = STYLE;

  const root = document.createElement("div");
  root.className = "sky-levers";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "sky-levers-toggle";
  toggle.textContent = "sky levers";
  toggle.setAttribute("aria-expanded", "true");

  const panel = document.createElement("div");
  panel.className = "sky-levers-panel";

  const rows = new Map();

  /** Slider position for the config's current value. */
  function position(slider) {
    return nearestStep(slider, config[slider.key] / (slider.mul ?? 1));
  }

  /** The number to show beside a slider, given its raw position. */
  function format(slider, raw) {
    const shown = slider.mul ? raw * slider.mul : raw;
    return Number.isInteger(shown) ? String(shown) : shown.toFixed(2);
  }
  const sliderMarkup = (slider) => `
    <div class="sky-levers-row">
      <label for="sky-levers-${slider.key}" title="${slider.hint}">${slider.label}</label>
      <input id="sky-levers-${slider.key}" type="range" min="${slider.min}" max="${slider.max}"
             step="${slider.step}" value="${position(slider)}">
      <output for="sky-levers-${slider.key}"></output>
    </div>`;

  const sky = sliders.filter((slider) => !slider.life);
  const life = sliders.filter((slider) => slider.life);

  panel.innerHTML = `
    <div class="sky-levers-handle" tabindex="0"
         title="drag to move · double-click to reset">
      <span>sky levers</span>
      <span class="sky-levers-grip" aria-hidden="true"></span>
    </div>
    <h4>sky</h4>
    <div class="sky-levers-row seg">
      <span>mode</span>
      <span class="sky-levers-seg">
        ${["frame", "wash", "off"]
          .map(
            (mode) =>
              `<button type="button" data-mode="${mode}" aria-pressed="${String(config.mode === mode)}">${mode}</button>`,
          )
          .join("")}
      </span>
    </div>
    ${sky.map(sliderMarkup).join("")}
    <div class="sky-levers-row seg">
      <span>fps</span>
      <span class="sky-levers-seg">
        ${[24, 60]
          .map(
            (fps) =>
              `<button type="button" data-fps="${fps}" aria-pressed="${String(config.maxFps === fps)}">${fps}</button>`,
          )
          .join("")}
      </span>
    </div>
    <h4>life</h4>
    ${life.map(sliderMarkup).join("")}
    <div class="sky-levers-actions">
      <button type="button" data-action="copy">copy values</button>
      <button type="button" data-action="reset">reset</button>
    </div>
    <p class="sky-levers-note">development build · SKY_LEVERS=1</p>
  `;

  root.append(panel, toggle);
  document.head.append(style);
  document.body.append(root);

  for (const slider of sliders) {
    const input = panel.querySelector(`#sky-levers-${slider.key}`);
    const output = input.parentNode.querySelector("output");
    const apply = () => {
      const raw = Number(input.value);
      config[slider.key] = raw * (slider.mul ?? 1);
      output.textContent = format(slider, raw);
      if (slider.rebuild) controller.rebuild();
      else controller.redraw();
      controller.restart();
    };
    input.addEventListener("input", apply);
    output.textContent = format(slider, position(slider));
    rows.set(slider.key, input);
  }

  function setMode(mode) {
    config.mode = mode;
    if (canvas) {
      canvas.style.display = mode === "off" ? "none" : "";
      canvas.style.opacity = mode === "wash" ? "0.42" : "";
    }
    for (const button of panel.querySelectorAll("[data-mode]")) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    }
    controller.restart();
  }

  panel.addEventListener("click", (event) => {
    const mode = event.target.closest("[data-mode]");
    if (mode) {
      setMode(mode.dataset.mode);
      return;
    }

    const fps = event.target.closest("[data-fps]");
    if (fps) {
      config.maxFps = Number(fps.dataset.fps);
      for (const button of panel.querySelectorAll("[data-fps]")) {
        button.setAttribute("aria-pressed", String(button === fps));
      }
      controller.restart();
      return;
    }

    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "reset") {
      Object.assign(config, initial);
      for (const slider of sliders) {
        const input = rows.get(slider.key);
        input.value = position(slider);
        input.parentNode.querySelector("output").textContent = format(
          slider,
          position(slider),
        );
      }
      setMode(initial.mode);
      for (const button of panel.querySelectorAll("[data-fps]")) {
        button.setAttribute(
          "aria-pressed",
          String(Number(button.dataset.fps) === config.maxFps),
        );
      }
      controller.rebuild();
      controller.restart();
    } else if (action === "copy") {
      copyValues(event.target);
    }
  });

  // The panel's whole purpose is retuning the shipped defaults, so it prints
  // them in the shape SKY_DEFAULTS uses. Clipboard first, console as fallback.
  // `seed` is left out: a visit picks a fresh one, so the value on screen is
  // not a default. The poster's seed is the one in SKY_DEFAULTS.
  function copyValues(button) {
    const entries = [
      ["mode", `"${config.mode}"`],
      ...sliders.map((slider) => [
        slider.key,
        format(slider, position(slider)),
      ]),
      ["maxFps", config.maxFps],
    ];
    const body = entries
      .map(([key, value]) => `  ${key}: ${value},`)
      .join("\n");
    const text = `// paste into SKY_DEFAULTS in assets/sky-core.mjs\n{\n${body}\n}`;

    console.log(text);
    const done = () => {
      button.textContent = "copied";
      setTimeout(() => {
        button.textContent = "copy values";
      }, 1200);
    };
    navigator.clipboard?.writeText(text).then(done, () => {});
  }

  // Dragging. The handle moves the panel and keeps it inside the viewport,
  // measured against the viewport rather than the page so it also holds on a
  // phone. The pointer is captured, so the drag survives leaving the handle and
  // the panel cannot lose track of it.
  const handle = panel.querySelector(".sky-levers-handle");
  const EDGE = 8;
  let drag = null;

  function place(left, top) {
    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(EDGE, window.innerWidth - rect.width - EDGE);
    const maxTop = Math.max(EDGE, window.innerHeight - rect.height - EDGE);
    root.style.left = `${Math.min(Math.max(left, EDGE), maxLeft)}px`;
    root.style.top = `${Math.min(Math.max(top, EDGE), maxTop)}px`;
  }

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    const rect = root.getBoundingClientRect();
    drag = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    handle.setPointerCapture(event.pointerId);
    root.classList.add("dragging");
  });

  handle.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    place(
      drag.left + event.clientX - drag.x,
      drag.top + event.clientY - drag.y,
    );
  });

  function release(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    drag = null;
    root.classList.remove("dragging");
  }

  handle.addEventListener("pointerup", release);
  handle.addEventListener("pointercancel", release);

  // Double-click puts it back where it starts.
  handle.addEventListener("dblclick", () => {
    root.style.left = "";
    root.style.top = "";
  });

  // The handle takes focus, so the panel can also be moved without a pointer.
  handle.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 32 : 8;
    const move = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (!move) return;
    event.preventDefault();
    const rect = root.getBoundingClientRect();
    place(rect.left + move[0], rect.top + move[1]);
  });

  // A window that shrinks must not strand the panel off screen.
  window.addEventListener("resize", () => {
    if (!root.style.left) return;
    const rect = root.getBoundingClientRect();
    place(rect.left, rect.top);
  });

  toggle.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.hidden = open;
    toggle.setAttribute("aria-expanded", String(open));
  });
  toggle.hidden = true;

  setMode(config.mode);
}
