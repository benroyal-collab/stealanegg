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

## Running the gates against the real build

Every one of these was found in the same afternoon, by the same act: making
the end-to-end suite build the code it was about to test, and then actually
running all of it rather than the two specs that were quick.

### The store's clock was never wound

`tick` in `state/store.ts` owns the incubator countdown, accrued play time,
passive donations from placed creatures, caption expiry and the forty-five
minute break reminder. It was defined, exported through the store's type, and
called by nothing at all. Five features, all inert, none of them failing
loudly — an incubator that never finishes just looks like an incubator you
have not waited long enough for.

A `StoreClock` in the render tree drives it now, with the delta clamped so a
backgrounded tab cannot hand the incubator a minute of progress. The loop gate
asserts that the number on screen actually moves, which is the assertion that
was missing.

### Nothing stood between the spawn and the first nest except everything

The incubator sat at x=0, z=−1.5. Its own comment explained that it was placed
there "so a child carrying their first egg home walks straight into it". They
did — on the way _out_, at z=−0.55, where its collider stopped them dead.

Moving it aside uncovered the next wall: a tree on the axis at z=−5.1. The
foliage exclusion was a single circle around the sanctuary, and the route to
nest zero ran straight out of it into the treeline.

So the rule written into `CLAUDE.md` after the last round of this — nest zero
sits eighteen metres directly ahead of the spawn — was true and still useless,
because nothing guaranteed a walkable lane to get there. There is one now, the
distance and the corridor width both live in `balance.ts` next to the pacing
model that measures them, and a unit test asserts that no station stands in
the lane. The next person to add a hut to the sanctuary cannot quietly close
the only route out.

### The gates were measuring the rasteriser

CI renders this scene at well under one frame per second at 1080p, and the
movement solver clamps its timestep to 1/20s. So `waitForTimeout(2000)` bought
two frames — a tenth of a second of simulated movement — and every assertion
downstream was reading a player who had barely started walking. "Sprinting
reaches full Pace" was failing with a speed of exactly zero.

The helpers count frames now, and a duration keeps its plain reading ("sprint
for two seconds") by being honoured in frames rather than milliseconds. The
gameplay specs also dropped to 640×360, because they are about the simulation
and not the picture; the screenshot gate is where the resolution matters and
it still runs at 1080p.

### Three ways to write a test that cannot fail usefully

Worth naming, because they were all in this suite at once:

1. **A locator read with no timeout.** `textContent()` waits for the element,
   and Playwright sets no default action timeout, so polling a prompt that is
   not up yet blocks until the test's entire budget is gone and then reports
   "target page closed". Twenty-five minutes to learn "not there yet".
2. **A search step wider than the thing it is searching for.** The grab prompt
   lives inside a 2.6 metre radius. A leg of eighteen metres sweeps past it
   forever, and the log looks like a player who is stuck.
3. **A write the app overwrites.** Three places wrote a save and reloaded, and
   the app's own `pagehide` handler — there so a child who closes the tab keeps
   their sanctuary — wrote the outgoing page's copy over the top each time. The
   save round-trip test was testing a default save.

### What the screenshots said this time

Ultra was the milkier, flatter image than High — the wrong way round for the
top preset. God rays screen-blended with an unclamped maximum, and the sun is
behind the camera most of the time at dawn (which is exactly when you want the
shafts), so with no visible source to radiate from the effect laid a flat veil
over the frame. Clamped well under one, it now does what it is for.

With that fixed and the AO pass back, the preset ladder reads correctly: Low is
clean and flat, High has raking trunk shadows and contact occlusion, Ultra adds
a denser understorey and a third shadow cascade. Dawn light through birch does
now look like something.

The ranger himself was the weakest thing on screen, and got a pass of his own
-- see below.

## The ranger

He was a hat, a coat capsule and two legs: 1.45 m tall, five and a half heads,
and twenty centimetres shorter than the physics capsule the solver was pushing
around. The collider and the character were two different people, and the one
you could see was proportioned like a toddler.

### What actually makes a figure read as a person

Not polygon count. In rough order of how much each one bought:

1. **Two segments per limb.** A thigh and a shin with a knee between them is
   the difference between walking and swinging a pendulum. Same for the elbow,
   which also lets the arms close up as the pace rises -- a walker swings
   almost straight arms, a sprinter holds them near ninety degrees.
2. **Proportion.** Seven heads, hips at just over half the total height,
   fingertips at mid-thigh. These live in `rangerProportions.ts` and are
   asserted against the physics capsule in `tests/unit/ranger.test.ts`, because
   "the character is the size of his own collider" is exactly the kind of thing
   that is obvious in a bug report and invisible in a screenshot.
3. **A neck.** A head straight on a torso is a snowman. Ten centimetres fixes
   it.
4. **A tapered chest.** Two stacked tapers rather than one capsule: narrow at
   the navel, broad across the ribs.
5. **A face.** Jaw, brows, nose, mouth, ears, eyes with an iris set into the
   sclera. Two-millimetre details on a twenty-centimetre head, and most of what
   stops it reading as a ball.
6. **Breathing.** A couple of millimetres of chest scale, faster after running.
   Invisible frame to frame and the reason a standing figure looks alive.

### Which is where the draw calls went

Written the obvious way -- one `<mesh>` per piece -- this came to forty-nine
meshes and about a hundred draw calls, because every shadow caster is drawn
again for each cascade. That took High to 446 against a budget of 450. Four
calls of headroom is not a budget, it is a coincidence, and the next prop added
to any biome would have broken it.

So the pieces are baked, the same way the nests and the fences already were,
with one addition: `mergeParts.ts` carries a per-vertex colour, so skin, cloth,
leather and hair share a single material and therefore a single draw. Merging
stops at the next thing that has to move independently, so there is one buffer
per joint: twelve nodes for forty-nine pieces.

High came back at **360** draw calls -- ninety of headroom, and four fewer than
the stubby version cost. The better character is cheaper than the one it
replaced, which is the outcome to aim for and not the one to assume.

One thing the merge cost: the shared normal map had to go. Merged geometry
carries each primitive's own UVs, so a tiled texture lands at a different scale
on the hat, the shin and the nose. Harmless for roughness, where the variation
is a whisper; on a normal map it covered the ranger in what looked like
knitwear.

### Two false readings along the way

Worth writing down because both wasted time. First, the trousers looked like
bare skin in every screenshot, so they got darkened twice -- and did not
change. Reading the PNG's actual pixels showed the legs at (112, 83, 47)
against ground at (129, 103, 71): correctly dark, correctly separated, and
nothing like what the image had appeared to show. Second, before that, the
whole lower body read as one pale column; that turned out to be a camera
sitting exactly side-on, with the far leg hidden behind the near one and the
caption chip covering the boots.

The lesson is the same one this project keeps relearning: when a picture
disagrees with the code, measure the picture. A forty-line PNG decoder settled
in one run what two rounds of looking had got wrong.

## The menu a child could not leave

Rebuilding the ranger had nothing to do with this; running the whole suite
afterwards is what found it.

`Panel` closes itself on Escape from a capture-phase listener on the window.
The game's input manager listens on the same window in the bubble phase and
maps Escape to "toggle pause". Nothing stopped the event between them, so one
keypress was handled twice: the panel closed immediately, and the input
manager's frame callback then toggled paused straight back on.

At sixty frames a second that is a sixteen-millisecond flicker, which looks
like nothing at all and is why it survived every previous run of this gate --
the assertion sometimes landed inside the closed frame. At the frame rate a
software rasteriser manages, the menu closed and stayed shut for a full second
before reopening, and the gate finally caught it.

It is worth being clear about what the bug actually was, because "flaky test"
was the tempting reading: **a child who opened the pause menu by accident could
not get out of it with the keyboard.** That is one of the accessibility
promises in the brief, broken in the shipped build, hidden behind a frame
rate. One `stopPropagation` fixes it, for this panel and every other one.

## Performance — measuring the budget properly

### Reading the counters at all

The first attempt at a budget probe reported `draws=1 tris=1`. three clears
`info.render` inside every `render()` call, and an ordinary frame callback
runs _before_ the render, so it was reading a freshly-cleared counter every
time. Setting `info.autoReset = false` and clearing it ourselves at the top of
each frame (priority −1000) means what the overlay and the gate read is the
previous frame's real total.

Worth stating plainly: I had a performance overlay reporting zeros and did not
notice, because zeros look like "nothing to worry about". A budget you cannot
see is a wish, and a budget that reads zero is worse than none at all.

### The measurement that was measuring nothing

Three rounds of draw-call work came back with byte-identical numbers --
`draws=522 tris=1123422`, every time. That reads as "the optimisation did
nothing". It actually meant "the optimisation is not in the build": Playwright
runs `vite preview`, which serves `dist/`, and the config had
`reuseExistingServer: true`. Every run was measuring a build from hours
earlier.

The config now runs `npm run build` as part of starting the server and never
reuses one. Three seconds a run against a gate that reports fiction is not a
trade worth thinking about. This is the second time on this project that a
green-looking number turned out to be measuring something other than the game,
and both times the tell was the same: a number that would not move.

### What the measurement found

| Preset | Draw calls | Triangles    | Verdict                      |
| ------ | ---------- | ------------ | ---------------------------- |
| Low    | 178        | 279k         | inside budget                |
| High   | 665 → 360  | 1.12M → 929k | inside the 450 / 1.2M budget |

(The intermediate 258 / 670k was High with the ambient-occlusion normal pass
switched off. That turned out not to be a saving so much as a missing feature
— see below — so the real figure is the 364 with AO back on.)

Three causes, in order of size:

1. **Nine guardians at fourteen meshes each.** Eyes, pupils, ears and belly
   are separate draw calls, and every one is paid again for every shadow
   cascade. None of it is visible past twenty metres. They are now grouped
   into a `detail` node and hidden by distance -- the same for hatchlings in
   their habitats.
2. **Three shadow cascades at High.** Every caster is drawn once per cascade.
   Moved to two at High, three at Ultra. The budget wins the argument, and
   far-distance shadow crispness is exactly what an Ultra preset is for.
3. **Fourteen separate twig meshes per nest**, 126 draw calls before anything
   else was on screen. Baked into one shared geometry: nests are things a
   child recognises by shape, so making each one subtly unique cost nine
   geometries and bought nothing.

A fourth saving was tried and then reversed: switching off the ambient
occlusion normal pass at Medium and High bought about a hundred draw calls,
and no ambient occlusion at all. SSAO does not fall back to depth-derived
normals — it declines to run and logs about it once a frame. Two presets were
therefore shipping an AO setting that was on and inert. The console assertion
in the shot gate caught it the first time that gate ran against a build that
actually contained the change, which is the same root cause as the stale-build
problem above, showing up in a different disguise.

The preset test now asserts `aoNormalPass === ambientOcclusion` rather than a
hand-written list of four booleans, so the two cannot drift apart again.

The last of the three savings had already been written down here as done
before it actually was: the detail group existed and the distance constant existed, but
the line that connects them had never been inserted, so the constant sat there
unused and the cull did nothing. Lint caught it as an unused variable, which is
the only reason it was caught at all.

Also culled the guardian vision cones by distance. Nine transparent discs
metres across stack into near-full-screen overdraw, and a cone you cannot walk
into does not help anyone plan. That one change took the software rasteriser
in CI from seventeen seconds a frame to something usable.

### What cannot be measured here, and is not claimed

**Frame rate.** CI renders through a software rasteriser at a fraction of a
frame per second. Any fps assertion made against it would be measuring
SwiftShader. So `tests/e2e/perf.spec.ts` asserts draw calls and triangles --
which are hardware-independent, are what the budget is actually written in,
and are meaningful in CI and on a real machine alike.

The "locked 60fps at 1080p on integrated graphics" target is therefore
**unverified**. The work per frame is inside budget and the F3 overlay is
there to check it on real hardware, but nobody has run this on an Iris Xe and
I am not going to claim otherwise.
