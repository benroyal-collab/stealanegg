# CLAUDE.md — Egg Heist: Wildlands

Read this before touching anything. It should be enough to pick the project up
cold.

## What this is

A 3D stealth-and-collect game for the browser, aimed at 8–12 year olds. You
are a junior ranger recovering scattered eggs, incubating them, releasing the
hatchlings into habitats, and spending visitor donations on gear that lets you
reach wilder biomes.

Three biomes ship: Whisper Glade, Mirrormere, Amber Dunes. All three are
played at night, and the tone is spooky — a horror-film look (moonlight, fog,
a torch, eyes in the dark, a heartbeat under pursuit) pitched at the age range:
dread, never gore, never a flash. See "Nightfall" in DECISIONS.md.

## The three laws this codebase is built around

1. **Failure costs time, never progress.** Being caught drops the egg and
   costs three seconds. It never costs money, creatures, upgrades or a
   session. If you add a punishment, you have broken the game.
2. **One stat is the spine.** _Pace_ gates content, enables skill and absorbs
   upgrades. Do not add a parallel progression track.
3. **Variance lives on the payout, not the challenge.** Mutation and size make
   rewards exciting. The run itself is always fair and readable. All randomness
   enters through `src/sim/rolls.ts` and nowhere else.

## Architecture

```
src/
  sim/       Pure TypeScript. Zero three.js, zero React, zero DOM.
             Economy, rarity rolls, guardian FSM, rival AI, save schema.
             A whole session can be played out here with no renderer.
  systems/   Frame systems bridging sim -> render: movement solver,
             perception sampling, spawn director, audio director.
  render/    r3f components, procedural materials, shaders, post pipeline.
  ui/        HUD, menus, parent panel, accessibility, photo mode.
  data/      balance.ts, biomes.ts, creatures.ts, mutations.ts.
  assets/    ASSETS.md ledger. No binary assets — everything is generated.
```

**The sim/render split is enforced by ESLint**, not by convention. `src/sim/**`
and `src/data/**` have a `no-restricted-imports` rule that fails the build if
they import a renderer, React, or `@react-three/*`. Keep it that way: it is
the only reason the economy and FSM tests are fast and trustworthy.

**State ownership.** One zustand store in `src/state/`. The store is written by
sim and systems, and _read_ by React. React never owns gameplay state.
Per-frame data (player transform, guardian transforms, camera) lives in
mutable refs outside React entirely — only discrete events (egg grabbed, biome
unlocked, money threshold crossed) go through the store and trigger a render.

**Every tuning number lives in `src/data/balance.ts`.** A gameplay constant
anywhere else is a bug. The economy test reads these values and asserts the
pacing windows they produce, so the file is under test.

## Hard constraints — these are build-breaking, not preferences

- No accounts, no sign-in, no PII, no analytics, no telemetry.
- No network request to any third-party domain, ever. Enforced by
  `tests/e2e/network.spec.ts`, which intercepts every request.
- No ads, no in-app purchases, no real-money anything. Not stubbed, not later.
- No dark patterns: no login streaks, no FOMO timers, no energy meters, no
  purchasable randomised rewards. Offline earnings are capped at two hours at
  half rate so idling never beats playing.
- Nothing gets hurt. Guardians shoo; the player tumbles comically and gets up.
- Every audio cue has a matching visual/caption cue. Asserted in
  `tests/unit/cues.test.ts` over the cue registry.
- Nothing flashes above 3Hz anywhere. Photosensitivity is a safety issue.
- Nothing is signalled by colour alone — rarity carries a word and a pip
  count, mutations carry a badge shape.

## Level-design rules that fall out of the movement solver

- **No critical path may require clearing more than 1.0 m.** A plain jump
  apexes at 1.06 m; the vault handles up to 1.45 m. Ledges between those
  heights are vault-only, which is a good way to _teach_ the vault but must
  never be the only way past something. A child who never discovers the vault
  has to be able to finish every route.
- **Nests sit within about 40 m of a safe route home.** A full stamina bar
  buys 36 m of sprint. Further than that and the escape stops being a skill
  moment and becomes a jog.
- **Nest zero sits 18 metres directly ahead of the spawn, in every biome.**
  The economy simulation's "first egg inside sixty seconds" target assumes a
  guided first run over exactly that distance (`FIRST_NEST_DISTANCE_METRES` in
  `sim/session.ts`). If the world does not put a nest there, the pacing
  assertion is measuring a fiction. It is placed by hand in `BiomeRuntime`;
  the rest scatter.
- **The sanctuary clearing is a safe zone.** `WORLD.sanctuaryRadius`, enforced
  in `systems/loop.ts`: guardians cannot enter it, cannot see into it, and
  call off a chase the moment the player crosses in. Anything that lets a
  guardian reach the spawn is a bug, and `tests/unit/safezone.test.ts` says so.
- **Cover has to break line of sight at crouch height.** Guardian vision is a
  cone from roughly chest height; anything a player can hide behind must
  actually occlude the ray, not just look like it does.

## Performance budget

60fps at 1080p on integrated graphics. CPU ≤ 6ms, GPU ≤ 12ms at High, ≤ 450
draw calls, ≤ 1.2M triangles, no per-frame allocations in hot paths. The perf
overlay is F3. If a feature can't hold the budget it goes to Ultra or gets
cut — the budget wins the argument.

## Commands

| Command         | What it does                                                |
| --------------- | ----------------------------------------------------------- |
| `npm run dev`   | Dev server                                                  |
| `npm run build` | Typecheck then production build                             |
| `npm test`      | Vitest — sim, economy, FSM, save, cue registry              |
| `npm run lint`  | ESLint + Prettier check                                     |
| `npm run e2e`   | Playwright — smoke, movement, cold start, network isolation |

## Where to start reading

1. `src/data/balance.ts` — the whole game's tuning in one file.
2. `src/sim/guardian.ts` — the FSM that makes stealth work.
3. `src/systems/movement.ts` — the kinematic solver; feel lives here.
4. `src/render/GameScene.tsx` — how a biome is assembled.

`PLAN.md` has the original implementation plan. `DECISIONS.md` is the running
log of choices made along the way and why.
