# PLAN — Egg Heist: Wildlands

## 1. Reading of the brief

Build a shippable vertical slice of a 3D browser stealth-and-collect game for
8–12 year olds: three finished biomes, a complete 90-second loop, a
console-grade render pipeline, hard child-safety guarantees, and a written
roadmap for biomes 4–10.

The two things that decide whether this succeeds:

1. **Feel.** If holding the stick down and running a circle isn't satisfying,
   nothing downstream matters. M1 is gated on that and I will not proceed past
   a mushy controller.
2. **The look.** The visual bar *is* the project. Grey-boxes shipped as "done"
   is the single worst failure mode available here.

## 2. Architecture

```
src/
  sim/        pure TypeScript. Zero three.js, zero React, zero DOM.
              economy, rarity rolls, guardian FSM, rival AI, save schema,
              progression, seeded RNG. 100% unit-testable headless.
  systems/    frame-rate systems that bridge sim -> render.
              movement solver, perception sampling, spawn director,
              audio director, cue registry.
  render/     r3f components, procedural materials, shaders, post pipeline.
  ui/         HUD, menus, parent panel, accessibility, photo mode.
  data/       balance.ts, biomes.ts, creatures.ts, mutations.ts.
              EVERY tuning number lives here.
  assets/     ASSETS.md ledger (see decision D1 — the folder stays thin).
```

**State ownership.** `zustand` holds a single store. The store is written by
sim + systems and *read* by React. React never owns gameplay state and never
drives a frame. Per-frame mutation (player transform, guardian transforms)
lives in mutable ref objects outside React's reconciliation entirely — only
discrete, low-frequency events (egg grabbed, biome unlocked, money crossed a
threshold) go through zustand and re-render UI.

**The simulation is authoritative and headless.** `runHeadlessSession()` in
`sim/` plays a whole session with no renderer at all. That is what the M4
economy test drives, and it is why the balance assertions are trustworthy.

## 3. Milestone order

M0 foundation → M1 feel → M2 look → M3 loop → M4 balance → M5 three biomes →
M6 onboarding/UI → M7 audio/polish → M8 ship.

I am deliberately doing **feel before look** and **look before loop**. A
beautiful game with a bad controller is unfixable late; a good controller in a
grey box is a great foundation. And building the loop into a finished-looking
world means I never have to retrofit the art.

## 4. Risks

| Risk | Mitigation |
|---|---|
| **Frame budget vs. the visual spec.** GTAO + volumetrics + instanced foliage + water on Iris Xe at 60fps is genuinely tight. | Quality presets from day one, not bolted on. Every post effect is individually gate-able. The perf overlay (F3) ships. If something can't hold budget it goes to Ultra or gets cut — the budget wins the argument. |
| **Bundle budget (250KB gz) vs. three + rapier WASM.** Rapier's WASM alone blows the initial budget. | Route-split: the initial load is the menu shell + loader only. The game scene, three, and rapier are a lazy chunk fetched behind the Play button. Initial bundle stays small and honest. |
| **Asset pipeline is a dependency I don't control.** Downloading HDRIs/models means external hosts, licence bookkeeping, KTX2 tooling, and a real chance of a broken URL in a committed file. | Generate everything procedurally (see D1). Zero external assets means zero broken links, zero licence risk, and a *provable* zero-third-party-network guarantee, which §3 requires anyway. |
| **Scope.** This brief is roughly a team-quarter of work. | Depth over breadth, as instructed. Three biomes finished. Everything in §3 (safety) treated as build-breaking and verified by test, not by eyeball. |
| **Child-safety claims must be verifiable, not asserted.** | A Playwright test intercepts *all* network traffic and fails on any third-party request. A Vitest test walks the cue registry and fails if any audio cue lacks a caption. Safety is enforced by CI, not by good intentions. |

## 5. The three decisions I am least sure about

**D1 — Procedural assets over downloaded CC0 assets.**
The brief names Poly Haven, Quaternius and Kenney. I am going procedural
instead: terrain from noise, sky/HDRI from a physical-sky shader baked to
PMREM at runtime, PBR textures synthesised on canvas, creatures and eggs from
parametric geometry, audio from WebAudio synthesis. *Why:* it makes the
zero-third-party-network requirement provable rather than aspirational, it
removes every broken-URL and licence-attribution failure mode, and it keeps
the payload tiny. *What I'm unsure about:* hand-authored artist meshes would
almost certainly beat my parametric creatures on pure charm. I think the
trade is right for a slice that must *ship*, but it is a real cost and it is
the decision most likely to be wrong.

**D2 — Hand-rolled kinematic solver inside Rapier, rather than Rapier's
`KinematicCharacterController`.**
Rapier is in the stack and owns the world, colliders and queries. But the
character move/slide/step/coyote logic is mine, driven by shapecasts. *Why:*
feel targets that precise (120ms coyote, 150ms buffer, exact slide friction
curves) need the solver to be inspectable and tweakable frame by frame.
*Unsure:* it's more code to get right, and Rapier's controller handles some
step/slope edge cases well out of the box.

**D3 — Rival collectors as a scripted timing device, not real pathfinding
agents.**
They telegraph a target, travel a spline on a timer, and claim the egg if
they arrive first. *Why:* the brief's constraint is that they must never
touch, chase or attack the player, and that losing a race costs exactly 20
seconds. A scripted racer delivers that pressure with total predictability
and near-zero CPU. *Unsure:* it may read as fake once a child watches one for
a few minutes. A real navmesh agent would look better and cost budget I'd
rather spend on foliage.

## 6. Definition of done

`npm run build && npm test && npm run lint && npm run e2e` green; `dist/`
serves with zero console errors and zero third-party requests; three biomes
distinguishable by silhouette and palette alone; a child reaches their first
egg in under 60 seconds using only on-screen guidance.
