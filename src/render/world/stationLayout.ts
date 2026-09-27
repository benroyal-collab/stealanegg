/**
 * Where the sanctuary's stations stand.
 *
 * Plain data, apart from the React scene that draws it, so the tests -- the
 * lane check and the end-to-end loop that walks to the incubator -- can read
 * the real layout without loading a renderer.
 */

import { EGG, WORLD } from '../../data/balance';

export type StationId = 'incubator' | 'shop' | 'guide' | 'breeding' | 'track';

export interface Station {
  readonly id: StationId;
  readonly position: readonly [number, number, number];
  readonly label: string;
  readonly radius: number;
}

/**
 * The clear lane between the spawn and the tutorial nest.
 *
 * Nest zero is placed straight ahead of the spawn in every biome (see
 * CLAUDE.md), which only helps if a child can actually walk that way. No
 * station may stand within this distance of the centre line.
 *
 * This is not hypothetical. The incubator used to sit at x=0, z=-1.5,
 * described in its own comment as being placed there "so a child carrying
 * their first egg home walks straight into it". They did walk straight into
 * it -- on the way *out*, at z=-0.55, where its collider stopped them dead. A
 * cold start could not reach the first nest at all.
 */
export const SPAWN_CORRIDOR_HALF_WIDTH = WORLD.spawnCorridorHalfWidth;

/**
 * Fixed layout, so a returning player finds everything where they left it.
 *
 * The incubator sits just off the path home with a deposit radius that
 * reaches it, so a child carrying their first egg gets the prompt without
 * having to aim. Interaction radii come from `EGG.depositRadius` rather than
 * being invented here.
 */
export const STATIONS: readonly Station[] = [
  { id: 'incubator', position: [-2.6, 0, -1.5], label: 'Incubator', radius: EGG.depositRadius },
  { id: 'shop', position: [5.6, 0, 2.4], label: 'Ranger Store', radius: EGG.depositRadius },
  { id: 'guide', position: [-5.6, 0, 2.4], label: 'Field Guide', radius: EGG.depositRadius },
  { id: 'breeding', position: [-4.4, 0, -3.6], label: 'Breeding Hut', radius: EGG.depositRadius },
  { id: 'track', position: [4.4, 0, -3.6], label: 'Training Track', radius: EGG.depositRadius },
];
