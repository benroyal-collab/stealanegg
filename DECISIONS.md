# DECISIONS

Running log. One line per decision, newest at the bottom of its section.
Where the brief left a choice open, this is what I picked and why.

## M0 — Foundation

- **Procedural assets over downloaded CC0 assets.** No HDRIs, meshes or audio
  files are fetched from anywhere. Sky is a physical-sky shader baked to a
  PMREM at runtime; terrain, rocks, foliage, creatures and eggs are parametric
  geometry; textures are synthesised on a canvas; audio is WebAudio synthesis.
  This makes "zero third-party network requests" provable rather than
  aspirational, removes every broken-URL and licence-attribution failure mode,
  and keeps the payload tiny. Cost: hand-authored artist meshes would beat my
  parametric creatures on charm. Logged in `PLAN.md` as decision D1.
- **Exact version pinning, no carets.** Read from what npm actually resolved on
  install day and written back into `package.json` with the ranges stripped, so
  a rebuild in six months produces the same bytes.
- **`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` on.** Stricter
  than the brief asked for. Array indexing in a game loop is where undefined
  hides, and I would rather fight the compiler than a NaN at 60fps.
- **ESLint enforces the sim/render split.** `src/sim/**` and `src/data/**` have
  a `no-restricted-imports` rule banning `three`, `react` and `@react-three/*`.
  Architectural intent that isn't enforced is just a comment; this way the
  build fails if someone reaches for a renderer inside the simulation.
- **`no-console` is an error, with `warn`/`error` allowed.** The brief bans
  `console.log` in the shipped build. Making it a lint error means it can't
  reach the build in the first place.
- **Route-split the 3D runtime.** three + rapier + postprocessing cannot fit a
  250KB gzip initial budget, so the menu shell loads alone and the game chunk
  is fetched behind the Play button. The budget is about time-to-interactive,
  and this is the honest way to hit it.
- **Reversed D2: use Rapier's `KinematicCharacterController` for collide-and-slide,
  keep the feel layer mine.** `PLAN.md` said I'd shapecast by hand. Having
  looked at what that actually costs — step-up, slope limits, ground snap and
  de-penetration are all edge-case minefields — the better split is: my solver
  owns acceleration curves, gravity, coyote time, input buffering, slide
  friction and vault arcs and produces a _desired displacement_ each frame;
  Rapier owns turning that displacement into a legal one. I lose nothing on
  feel, because every feel target lives above the collision layer, and I gain a
  battle-tested collision response. Logged here rather than quietly changing
  the plan.
- **Playwright points at the environment's Chromium.** This box ships browser
  build 1194 and no outbound path to fetch the 1243 this Playwright version
  wants. The config uses `/opt/pw-browsers/chromium` when it exists and falls
  back to Playwright's own resolution otherwise, so CI and dev machines are
  unaffected.

## M1 — Feel

### How I judged it, and the limit on that

I should be straight about this: I cannot sit down with a gamepad in this
environment. There is no display and the only renderer available is a
software rasteriser running at about five frames a second, so "play it and
see how it feels" was not literally available to me.

What I did instead was the next most useful thing, and arguably a more
rigorous one: I measured every curve the controller produces and judged the
numbers against what third-person action games actually ship. Those
measurements are now `tests/unit/feel.test.ts`, so they are not a one-off
impression — they are a fence. If someone detunes the controller later, the
build tells them. A failure there means _the feel changed_; if that was
deliberate, move the band and say why.

The scripted thirty-second loop in `tests/e2e/movement.spec.ts` drives the
real thing through Rapier — sprint, hard turns, jumps, crouch, slide, all four
vault ledges, the ramps and the water — and asserts no NaN, no tunnelling, no
camera clipping. That covers integration. The unit metrics cover feel.

### The measurements

| Metric                    | Value                   | Verdict                                                                 |
| ------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| Time to 95% of top speed  | 138 ms                  | Responsive without teleporting                                          |
| Stop distance from sprint | 0.59 m / 200 ms         | Precise enough to place yourself at a nest, heavy enough to have weight |
| Jump apex / hang time     | 1.06 m / 575 ms         | Snappy hop, not a floaty moon jump                                      |
| 180° turnaround at sprint | 275 ms                  | Committed but not sluggish                                              |
| Slide entry / distance    | 8.09 m/s / 4.42 m       | Worth doing, never faster than running                                  |
| Jog → sprint gear ratio   | 1.67× at every Pace     | See below                                                               |
| Crouch speed              | 1.40 m/s, 23% of sprint | Sneaking costs real time, which is the point                            |
| Camera 90% settle         | 249 ms                  | Follows without dragging                                                |

### Two things the measurements caught that I would have missed

**The sprint gear change was too weak (1.49×).** I had jogging as a linear
blend between walk speed and Pace, which meant the sprint got progressively
more dramatic as the player bought Training Track levels — the gear change
would feel different in every biome. Replaced with a fraction of Pace
(`MOVEMENT.jogFraction = 0.6`), which holds the ratio at a constant 1.67×
whether you are at 6 m/s or 22. Pressing sprint now does the same
recognisable thing all game.

**The FOV punch was arriving late.** I had picked a damping half-life by
eye that left 10% of the travel — 1.3° — still on the table at the 220 ms
mark the brief specifies. Derived it properly instead: half-life = t /
log₂(20) leaves 5%, about two thirds of a degree, which is under the
threshold of noticing.

### A level-design constraint this creates

A plain jump apexes at 1.06 m but the vault band runs to 1.45 m. So ledges
between those heights are vault-only. That is a nice way to teach the vault,
but it means **no critical path may require clearing more than 1.0 m**. A
child who never discovers the vault must still be able to finish every route.
Noted in `CLAUDE.md` as a rule, not left as folklore.

### Other M1 decisions

- **Exhaustion latch on stamina.** Tracing the solver showed that holding
  sprint on an empty bar produced a sprint/walk stutter every few frames as
  regen crossed the start threshold. Added `STAMINA.exhaustRecoverFraction`:
  once the bar empties, sprint stays locked out until it recovers to 55%.
  This is the single ugliest thing a stamina system can do and it was in
  there until I looked at the numbers.
- **Rapier's WASM is hoisted out of its JavaScript.** The `rapier3d-compat`
  package inlines its 1.5 MB binary as base64, which costs a flat 33% before
  compression — about 450 KB of gzip spent on encoding alone, on the critical
  path to first playable. `scripts/rapierWasmPlugin.ts` rewrites the loader to
  fetch the real `.wasm` the package already ships. Game chunk went from
  1,089 KB gzipped to 272 KB plus a separately-cacheable 592 KB binary. The
  plugin fails the build rather than silently regressing if upstream changes
  shape.
- **Wall-scrub kills stored velocity.** If the solver asks to move and the
  character controller returns nothing on that axis, the velocity component
  is zeroed. Without it the player builds up a phantom charge while pressed
  against a wall that fires the instant the wall ends.
- **The greybox gym stays in the build.** It is reachable from the Parent
  Panel as a debug room. Every obstacle in it exists to exercise one feel
  target, and that is worth keeping around permanently.
