# The pure sky core is the sky's canonical reference

The sky has two renderers planned: the pure-JavaScript core in
`assets/sky-core.mjs` (after the split, its layer modules), and a WebGL2
fragment kernel that will paint the same sky on the GPU. This decision
settles, before either is written for the GPU, which of them owns the truth.

The pure core is the canonical reference. The GLSL kernel is a deliberate,
minimal duplicate of the per-frame pass only.

The plan behind this decision is recorded in the architecture review of
2026-11-23: the field re-quantise, the star twinkle and the flock together
cost a measured 8.9 ms of main-thread JavaScript per frame at the 24 fps cap,
which is the whole frame budget on a mobile CPU. A WebGL2 adapter removes that
cost by uploading the CPU-built field, evolution field and star layout once
as static textures and sending only small uniforms per frame.

## Why

Cross-GPU determinism is unattainable for a fragment pass. Mobile GPUs differ
in `mediump` precision, in float-texture filtering support and in how they
evaluate transcendentals, so no shader output can be bit-compared across
devices — or against the CPU. Holding the kernel to the core's exact bits
would mean either abandoning the GPU path or keeping the CPU path a
second-class citizen.

The pure core already has dependents that cannot run a shader: the test suite
(`tests/sky.test.mjs`, `tests/fields.test.mjs`) pins the sky's behaviour, the
poster script (`scripts/sky-poster.mjs`) hashes the shipped SVGs from
`renderFrame` output, and a browser without WebGL2 needs a fallback renderer.
These consumers define the core's interface; the kernel is a new consumer,
not a replacement.

## The crossing

The kernel duplicates only the per-frame pass: sample the field, stretch the
contrast, dither, quantise to the ramp, tint the stars, stamp the flock. It
does not duplicate the integer hash, the value noise, the fBm build, the star
layout or the flock layout: those are baked on the CPU and uploaded as static
textures, because porting a 32-bit integer hash to GLSL would break exact
cross-GPU determinism where it is load-bearing and gain nothing.

The contract between the two is visual equivalence, not bit-match: the same
ramps, the same thresholds, the same phases and the same ordered dither, so
the shipped look survives the crossing. When the two renderers disagree, the
core wins by definition. The levers build (`SKY_LEVERS=1`) forces the CPU
adapter, so tuning reads the core's output and lands in `SKY_DEFAULTS`;
the kernel is then brought to the core, never the other way round.

The star twinkle's deadband is the one accepted semantic difference. On the
CPU it is a per-star state machine that holds a star near a level boundary;
in the kernel it is stateless per-frame sines through the dithered
thresholds, which take over the anti-chatter duty. If that is not enough,
the gains stay CPU-side in a small state texture updated per frame — allowed,
because it is an upload, not a readback.

## Consequences

- `SKY_DEFAULTS` and every sky test stay pinned to the pure core. The GLSL
  kernel is never a test oracle.
- Changes to the per-frame maths require touching the kernel as well as the
  core; that cost is paid knowingly, and the kernel's small scope keeps it
  a small cost.
- The levers build always tunes the CPU adapter, keeping the
  levers-to-defaults-to-tests chain on one implementation.
- Per-frame GPU work reads only static textures and uniforms: no full-buffer
  uploads, no `gl.readPixels` in the loop, and monotonic clocks are wrapped
  into small ranges on the CPU before they become uniforms.
- A future review seeing two implementations of the same maths should read
  this record before proposing to collapse them: the duplication is the
  portability strategy.

## Rejected alternatives

- **Make the GLSL kernel canonical.** The tests, the poster and the fallback
  cannot run a shader, so the core would keep existing anyway, only demoted.
- **Bit-match the kernel to the core.** Cross-GPU determinism is unattainable,
  so the harness would pin one desktop GPU and call it the truth.
- **Port everything to the shader.** The integer hash, the field build and the
  layouts are exactly the parts where GPU floats drift; keeping them on the
  CPU preserves the determinism the poster hash and the tests rely on.
- **Ship only the CPU renderer.** The measured 8.9 ms/frame on the main
  thread is the whole budget on mobile, and no CPU optimisation removes it.
