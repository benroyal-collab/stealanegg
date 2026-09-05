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

## M2 — The look

### Four bugs that only a screenshot could have found

Every one of these compiled, passed lint, passed 121 unit tests, and produced
a running game. They were found by looking at the output.

1. **`three-stdlib` 2.36.1's CSM is broken twice against three 0.185.** Its
   published bundle mangled `get lights_pars_begin()` into a method named
   `getlights_pars_begin()`, so `CSMShader.lights_pars_begin` is `undefined`
   and `injectInclude()` assigns that over three's chunk — globally, killing
   every lit material in the process. Its replacement chunk is also written
   against the `GeometricContext` API three removed. Wrote our own CSM rather
   than maintain a fork of a core lighting chunk.

2. **Our CSM declared locals inside three's unrolled light loop.** three's
   `#pragma unroll_loop_start` expands the body N times into the _same_ scope,
   which is why three's own code declares `DirectionalLight directionalLight;`
   outside the loop. One cascade compiled; three cascades failed with a
   redefinition error. So the Low preset looked fine and High rendered
   nothing — the worst possible failure shape, because the cheap check passes.

3. **`csmDepth = -vViewPosition.z` had the sign backwards.** three sets
   `vViewPosition = -mvPosition.xyz`, so it is already positive in front of
   the camera. Negating it made every depth negative, no cascade ever claimed
   a fragment, and _the sun silently stopped contributing at every quality
   level_. The scene still rendered — lit by ambient and the environment map —
   which reads as "flat lighting", not as a bug.

4. **The shadow frustum was measured in one space and applied in another.**
   Bounds were computed in light space around the world origin, then the light
   was placed somewhere else entirely, so no cascade pointed at the camera.

**What I changed as a result:** the screenshot gate now asserts a clean
console at every quality preset. Bug 2 would have been caught in one run by
that assertion, and I spent three rounds of looking at pictures without
finding it. A shader that fails to compile still produces a screenshot — just
one with the geometry missing — so byte-size checks and eyeballs are both
blind to it.

### The visual pass itself

The first render was a dark green plane with pale cones on it. What actually
moved it:

- **Fog was drowning the scene.** Exponential fog at 0.017 over a 150m map
  leaves 65% fog at 60 metres. Down to 0.0055, and the fog colour matched to
  the horizon tint rather than a neutral grey — a mismatch draws a hard band
  where the terrain's fade meets the sky dome.
- **Ground albedos were too dark for ACES.** `#3f4a2c` is a plausible number
  for grass and it tone-maps to mud. Raised across all three biomes.
- **The sanctuary was in a bowl.** The terrain's radial apron flattened the
  centre towards zero while the rim rose, so the opening shot was the inside
  of a hill. It now flattens towards a raised plateau, and the sanctuary is a
  lookout.
- **Grass had no alpha cutout**, so every blade was a solid rectangle and a
  meadow looked like scattered paper. Generating a cutout texture — a few
  tapered blades with a root-to-tip gradient baked into RGB — was the single
  biggest visual win in the project.
- **Trunk and leaf shared one tint**, because a tree is one instanced mesh
  with one per-instance colour. Tagging vertices with `aPart` (0 = wood, 1 =
  leaf) and mixing in the shader costs nothing and is what makes a birch stand
  read as birches.
- **Ambient was swamping the key.** At 0.95 hemisphere against 4.6 sun there
  were no readable cast shadows. Now 0.45 against 6.2.
- **SSAO intensity was 22.** That is a multiplier, not a percentage: it drove
  occlusion to full across the whole frame and multiplied the scene to black.

### Honest assessment of where the look landed

It reads as a real place at dawn — layered canopies, birch trunks catching the
low sun, grass tufts, mist in the distance, a warm sky. It does not read as a
_console_ game. The gap is in the things a procedural pipeline is worst at:
the trees are recognisably parametric blobs, the terrain has visible
tessellation on its long slopes, and there is no hand-authored composition
anywhere — no clearing that was placed because it framed well.

That is the cost of decision D1, and it is the one I would revisit first with
more time. The renderer underneath it is genuinely good; what it is rendering
is the limit.

## M5 — Cover that actually works

Instanced foliage has no colliders, which is right for grass and wrong for a
tree: without one a birch is scenery a guardian sees straight through. Cover
that does not break the ray is the most frustrating thing a stealth game can
do.

- **Solid layers get a real collider each** — trunks, rocks, ruins, cacti. A
  few hundred capsules is nothing. Their density is pinned to 1 regardless of
  quality preset: a tree you can walk through on Low and not on High would be
  a different game, not a prettier one.
- **Soft cover is a density grid**, built from the same scatter the renderer
  uses. A guardian's ray samples it and accumulates; enough density near the
  player and the line is broken. Eye height decides it, which is Mirrormere's
  signature mechanic in one condition: standing up in the reeds does not hide
  you, and crouching does.

## M6 — Onboarding

- **The title screen gates the game, and the tests press Play.** Forcing the
  phase in test setup would mean a broken Play button fails one test instead
  of all of them.
- **The tutorial is five lines and clears itself.** No "click Next", no gate,
  no quiz. A child who ignores it entirely can still finish the game on the
  prompts alone — which is what the cold-start gate actually asserts.

## M3 / M7 — Impact, and one design commitment made honest

- **Gameplay requests effects; the systems decide.** A catch sets
  `playerRef.shakeRequest` and `playerRef.tumbleRemaining` rather than calling
  into the camera or the solver. The camera suppresses shake under reduced
  motion without gameplay code needing to know that setting exists, and the
  movement solver owns the tumble as one of its own stances. Every
  accessibility rule then lives in exactly one place.
- **Particles are one pooled instanced mesh recycled by index.** Dead
  instances park at zero scale rather than being removed, so the instance
  count is constant and the buffer never resizes. A burst allocates nothing.

### The tutorial nest

`sim/session.ts` models the first run over an eighteen-metre trip and calls it
a "level-design commitment". Then the cold-start gate walked out of the
sanctuary and could not find a nest, because nests were scattered on a ring
starting sixteen metres out _in an arbitrary direction_.

So the pacing model was asserting a fiction: "first egg inside sixty seconds"
was measured against a world that did not exist. Nest zero is now placed by
hand, eighteen metres directly ahead of the spawn, in every biome, and the
rule is written into `CLAUDE.md` where the next person will find it.

This is the failure mode I most wanted to avoid on this project — a green test
measuring something the game does not do — and it took an end-to-end test
walking the actual world to catch it. Worth the cost of writing that test.
