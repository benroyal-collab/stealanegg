# ROADMAP — biomes 4 to 10

The vertical slice ships three finished biomes. This is the plan for the
remaining seven, written so that someone else could build them.

## What "a biome" costs

Every biome in the slice took the same five things, and the roadmap assumes
the same five:

1. **A row in `src/data/biomes.ts`** — pace gate, income range, guardian
   configuration, lighting rig, terrain shape, foliage mix, palette, ambience.
   No code.
2. **A creature set** in `src/data/creatures.ts` — six to eight species
   spanning Common to Legendary, with one Mythic and, in the last biome, the
   Secret.
3. **A guardian** — a `CreatureBody` and a set of FSM numbers. The behaviour
   itself is shared; what makes a guardian distinct is the relationship
   between its `chaseSpeed`, `turnRate` and `visionRange`. The Sentinel Swan
   is "fast and terrible at corners" purely because of those three numbers.
4. **A signature mechanic** — one rule that changes how you move or hide.
   These are the only ones that need real code, and each of the three below
   is between twenty and eighty lines.
5. **Foliage kinds** if the existing vocabulary does not cover it. Adding one
   is a function in `foliageGeometry.ts` plus a colour pair.

The pacing target for each new biome is a **×3.5 income step** over the one
before, per the brief's table. `tests/unit/pacing.test.ts` should gain an
assertion per biome as each lands, and the Training Track curve should be
re-tuned against the whole ladder rather than each biome in isolation.

## The biomes

### 4 — Thornhollow · Pace gate 17.5 m/s

A bramble maze under a permanent overcast. Sightlines are short and twisting;
the danger is not being seen from far away, it is turning a corner into
something.

- **Guardian: Bramble Badger.** Slow, enormous vision cone, very high
  `turnRate`. It cannot chase you down but it can corner you.
- **Signature mechanic: thorn walls.** Impassable except at gaps, and the gaps
  move on a slow cycle. This is the first biome that is a _maze_ rather than
  an open field, and it is where the vault stops being optional.
- **Creatures:** Thornfinch, Hollowmole, Brackenpup, Snarewing, Duskvole,
  Thornqueen (Mythic).
- **Income:** 245 → 980.

### 5 — Frostmarch · Pace gate 22 m/s

A snowfield at blue hour. Wide open, brilliantly lit, nowhere to hide — the
Amber Dunes lesson repeated with a twist.

- **Guardian: Rime Elk.** Fast, long vision, but its hearing is poor: the
  snow muffles everything. The inverse of the Dune Scorpion.
- **Signature mechanic: footprints.** You leave tracks in the snow, and
  guardians follow them. Crouching leaves shallower prints; a fresh snowfall
  clears them on a cycle. This is the first mechanic where a _past_ action
  can give you away.
- **Creatures:** Snowmite, Driftling, Glacierpup, Frostcrest, Aurorafin,
  Winterking (Mythic).
- **Income:** 860 → 3,430.

### 6 — Emberfall · Pace gate 27 m/s

Volcanic terraces at dusk, lit from below. The most dramatic-looking biome in
the game and the one to put in the trailer.

- **Guardian: Cinder Moth.** Flies, so terrain cover does nothing; you have
  to break line of sight _vertically_, under overhangs.
- **Signature mechanic: heat vents.** Periodic updrafts that launch you high
  into the air. Fast travel and a hazard at once, since being airborne is
  being visible.
- **Creatures:** Emberling, Ashcrawler, Cindertail, Magmapup, Pyrewing,
  Emberheart (Mythic).
- **Income:** 3,010 → 12,000.

### 7 — Gossamer Reach · Pace gate 32 m/s

A canopy world of rope bridges and hanging platforms, hundreds of metres up.

- **Guardian: Loom Spider.** Does not chase. It re-weaves the bridges behind
  you, so escape routes close.
- **Signature mechanic: verticality.** The first biome with real Z-axis
  navigation. Needs a fall-safety rule — a child who falls should land in a
  net, lose ten seconds and nothing else.
- **Creatures:** Silkmite, Bridgehop, Canopykit, Weaverwing, Gossamerfin,
  Loomqueen (Mythic).
- **Income:** 10,500 → 42,000.

### 8 — Tidepool Hollow · Pace gate 37 m/s

A coastline on a tidal cycle. The map physically changes shape every ninety
seconds.

- **Guardian: Sentinel Crab.** Slow but it never gives up, following you
  across the whole map until you leave the beach.
- **Signature mechanic: the tide.** Routes open and close on a timer visible
  from anywhere on the map. Getting caught out by a rising tide costs time,
  never progress.
- **Creatures:** Tidemite, Shellhop, Pearlfin, Kelpling, Wavecrest,
  Tidemother (Mythic).
- **Income:** 36,750 → 147,000.

### 9 — The Whispering Deep · Pace gate 42 m/s

A cave system lit only by the eggs themselves.

- **Guardian: Echo Bat.** Blind. Hunts entirely by sound, with a _visible_
  sonar pulse that sweeps the cave on a rhythm.
- **Signature mechanic: darkness.** Your only light is the egg you are
  carrying, and a rarer egg glows brighter — so the most valuable prize is
  also the one that gives you away. The best risk/reward tension in the
  roadmap.
- **Creatures:** Glowmite, Echoling, Crystalpup, Deepfin, Lumenwing,
  Deepsinger (Mythic).
- **Income:** 128,600 → 514,500.

### 10 — Aurora Crown · Pace gate 48 m/s

The summit. Low gravity, floating islands, the northern lights overhead. The
victory lap, and it should look like one.

- **Guardian: Sky Warden.** Every previous guardian's behaviour in rotation,
  switching on a cycle the player can learn.
- **Signature mechanic: low gravity.** Long floating jumps. The movement
  solver already supports this — it is a gravity value and a jump velocity in
  `balance.ts`, nothing more.
- **Creatures:** Aurorakit, Skyfin, Starling, Zenithwing, Crownbearer,
  Auroraqueen (Mythic), and **King Fossa**, the Secret, moved here from Amber
  Dunes as the game's final find.
- **Income:** 450,000 → 1,800,000.

## Cross-cutting work the roadmap needs

These are not biomes, but biomes 4–10 will not feel finished without them.

- **Number formatting past a billion.** `formatMoney` handles up to trillions;
  biome 10 gets close enough that the suffix table needs revisiting, and a
  child needs to be able to read the difference between two large numbers at a
  glance.
- **A second progression sink.** By biome 7 the Training Track is maxed. Either
  raise `PACE.cap` and `maxLevel` together, or — better — introduce
  _techniques_ (a longer slide, a double vault) bought with a separate rare
  currency. That would be a second progression track, which design law #2
  forbids, so it should be a **skill** system rather than a stat one: things
  that change what you can do, not how fast you do it.
- **Habitat visual variety.** Twenty pens in one arc will look like a car park.
  The sanctuary should grow into zones as biomes unlock.
- **A world map.** Three biomes fit in a pause menu; ten need a map screen, and
  it is a natural home for the Field Guide's per-biome progress.
- **Per-biome economy assertions** in `tests/unit/pacing.test.ts`, added as
  each biome lands, and a re-tune of the Training Track curve against the
  whole ladder.
- **Loading between biomes.** Three biomes can all be generated at boot; ten
  cannot. Biome generation needs to move to a web worker with a proper loading
  screen, which the loading-tips component already anticipates.

## What should not change

- Failure costs time, never progress.
- Pace is the spine.
- Variance lives on the payout, not the challenge.
- Nothing gets hurt, nothing flashes, nothing is sold, nothing is tracked.

Every one of those is enforced by a test today. Keep it that way.
