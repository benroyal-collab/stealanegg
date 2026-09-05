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
