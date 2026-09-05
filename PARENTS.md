# Egg Heist: Wildlands — information for parents and carers

A short, plain answer to the questions worth asking about a game your child
is going to play.

## What is it?

A gentle 3D game for roughly ages 8–12. Your child is a junior ranger at a
wildlife sanctuary. Rare eggs have been scattered across the reserve, and
rival collector clubs are after them too. They sneak past the guardians
looking after each nest, carry an egg home, incubate it, and release the
hatchling into a habitat where visitors leave donations. Donations buy
better gear, better gear opens up wilder parts of the reserve.

## What it does not do

Every item on this list is enforced by an automated test in the project, not
just by intention. The test that enforces it is named beside each one.

| Promise                                                                                                                           | How it is enforced                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No accounts, no sign-in, no personal data.** The game never asks who your child is.                                             | There is no account code in the project.                                                                                                                                                                                               |
| **Nothing leaves the device.** No analytics, no telemetry, no third-party request of any kind.                                    | `tests/e2e/network.spec.ts` intercepts every network request the page makes and fails the build if one leaves the origin. The deployed site also sends a Content-Security-Policy that tells the browser to block outbound connections. |
| **No adverts and nothing to buy.** No in-app purchases, no currency packs, no loot boxes, no "watch a video to continue".         | The same test greps the shipped JavaScript for payment and analytics SDKs.                                                                                                                                                             |
| **No chat and no user-generated content.** Nobody can send your child a message.                                                  | There is no networking code at all.                                                                                                                                                                                                    |
| **Only one item is stored on your device**, and it is the save file. No cookies, no identifiers.                                  | `tests/e2e/network.spec.ts` asserts exactly one storage key and zero cookies.                                                                                                                                                          |
| **No dark patterns.** No daily-login streaks, no countdown offers, no energy meters, nothing that punishes putting the game down. | Offline earnings are capped at two hours and paid at half rate, asserted in `tests/unit/economy.test.ts`.                                                                                                                              |
| **Nothing gets hurt.** No weapons, no combat, no death, no jump-scares.                                                           | Guardians shoo; the player tumbles over and gets up. `tests/unit/loop.test.ts` asserts that no tool can express damage.                                                                                                                |
| **Nothing flashes.** No effect pulses faster than three times a second anywhere in the game.                                      | Every animation in the project is written against that limit; the fastest is 1Hz.                                                                                                                                                      |
| **Failing costs time, never progress.**                                                                                           | Being caught costs three seconds and drops the egg. It never costs money, hatchlings, upgrades or a session. Asserted in `tests/unit/loop.test.ts`.                                                                                    |

## Accessibility

- **Captions for every sound**, on by default. A test walks the sound registry
  and fails the build if any sound lacks a caption.
- **Nothing depends on colour.** Rarity is shown as a word, a row of dots and
  a colour. Guardian state is shown as a shape. Three colourblind palettes are
  available.
- **Reduced motion** turns off camera shake, motion blur, screen warp and film
  grain.
- **Full button remapping**, and hold-or-press-once for sprint and crouch, so
  the game can be played one-handed.
- **Text scaling** from 100% to 150%, with a 16px floor.
- **Three difficulties**, changeable at any time including mid-run, with no
  penalty for changing.
- Keyboard, gamepad and touch all work at once, with no mode to choose.

## Time

The game shows how long this sitting has lasted in the "For grown-ups" panel,
which is reachable from the pause menu at any time.

A **break reminder** appears after 45 minutes by default. It is friendly, it
does not block play, it never guilt-trips, and it can be set to any interval
or turned off entirely.

There is no reason for a child to leave the game running. Offline earnings are
capped at two hours and paid at half rate, so playing is always better than
idling — which is the opposite of how most games of this shape are built, and
it is deliberate.

## The save file

It lives in this browser and nowhere else. From the "For grown-ups" panel you
can:

- **Save a copy** — downloads a small JSON file.
- **Load a copy** — restores from one.
- **Delete the save** — wipes everything, immediately, with one confirmation.

Nobody needs to be asked and nothing needs to be synced.

## Where the content comes from

Everything in the game — every tree, egg, creature, sound and piece of music —
is generated by the code that runs it. Nothing is downloaded while your child
plays, and no third-party asset, font or tracker is included.

## Questions a child might ask you

**"Is stealing bad?"** In this game "stealing" is mischief between rival
collector clubs racing for the same eggs. Nothing is taken from anyone who
needs it, nothing is broken, and every egg ends up safe in a sanctuary. If
your child would rather not think of it that way, the About page in-game
frames it as a race, which is exactly what it mechanically is.

**"Do the guardians get hurt?"** No. They are looking after their nests. If
one spots your child they will make a fuss and shoo them off, and that is all
they ever do.
