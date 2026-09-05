/**
 * The gameplay loop's mutable runtime.
 *
 * Everything here changes every frame, so none of it lives in React state.
 * The renderer reads this object; discrete events (an egg deposited, a biome
 * unlocked) are pushed into the zustand store, which is what re-renders the
 * UI. That split is the whole reason the HUD does not re-render sixty times
 * a second.
 */

import { EGG, GUARDIAN, MOVEMENT, RIVALS, TOOL_DEFS } from '../data/balance';
import { BIOME_DEFS } from '../data/biomes';
import {
  createGuardianRuntime,
  perceive,
  stepGuardian,
  type PerceptionResult,
} from '../sim/guardian';
import { patrolRoute } from './spawn';
import { claimByRival, nearestEgg, takeEgg, tickNests, type Nest } from '../sim/nests';
import { createRivals, stepRivals, type Rival, type RivalEvent } from '../sim/rivals';
import { Rng } from '../sim/rng';
import type { BiomeId, Difficulty, EggRoll, GuardianRuntime, ToolId, Vec2 } from '../sim/types';

export interface GuardianInstance {
  readonly id: number;
  readonly runtime: GuardianRuntime;
  /** Waypoints it walks when nothing is happening. */
  readonly route: readonly Vec2[];
  waypoint: number;
  position: Vec2;
  groundY: number;
  facing: number;
  /** Smoothed 0..1 for the HUD alert meter and the cone opacity. */
  alertness: number;
  /** The nest it is guarding, for placing it sensibly on load. */
  readonly nestIndex: number;
  perception: PerceptionResult;
}

export interface ThrownTool {
  readonly tool: ToolId;
  position: Vec2;
  velocity: Vec2;
  height: number;
  verticalVelocity: number;
  /** Seconds the landed lure keeps pulling attention. */
  lureRemaining: number;
  landed: boolean;
}

export interface LoopRuntime {
  biome: BiomeId;
  nests: Nest[];
  guardians: GuardianInstance[];
  rivals: Rival[];
  thrown: ThrownTool[];
  /** The egg in the player's hands, or null. */
  carried: EggRoll | null;
  /** Seconds of tumble left after a catch. */
  tumbleRemaining: number;
  /** Frames of hitstop left, for the 80ms freeze on a catch. */
  hitstopRemaining: number;
  /** Nest the player could grab from right now. */
  grabTarget: Nest | null;
  /** Sanctuary station the player is standing at. */
  station: string | null;
  /** Loudest guardian state anywhere, for the music director. */
  threat: 'calm' | 'alert' | 'chase';
  cooldowns: Record<ToolId, number>;
}

export interface LoopEvent {
  readonly type:
    | 'grabbed'
    | 'dropped'
    | 'deposited'
    | 'caught'
    | 'raceLost'
    | 'eggRespawned'
    | 'guardianAlerted'
    | 'guardianGaveUp'
    | 'toolThrown'
    | 'toolLanded';
  readonly nest?: number;
  readonly roll?: EggRoll;
  readonly club?: string;
  readonly tool?: ToolId;
}

/**
 * Place one guardian per nest, each walking a loop around the nest it guards.
 *
 * A loop rather than a there-and-back: the player can pick up the timing from
 * any point in the cycle, which is what makes the stealth a readable puzzle
 * instead of a memory test.
 */
export function createGuardians(
  nests: readonly Nest[],
  field: Parameters<typeof patrolRoute>[0],
  groundAt: (x: number, z: number) => number,
  rng: Rng,
): GuardianInstance[] {
  return nests.map((nest, index) => {
    const route = patrolRoute(field, nest.position, 6.5 + rng.next() * 3.5, 5, rng);
    const start = route[0] ?? nest.position;
    return {
      id: index,
      runtime: createGuardianRuntime(),
      route,
      waypoint: 0,
      position: { ...start },
      groundY: groundAt(start.x, start.z),
      facing: rng.next() * Math.PI * 2,
      alertness: 0,
      nestIndex: nest.index,
      perception: { sees: false, hears: false, strength: 0 },
    };
  });
}

export function createLoopRuntime(biome: BiomeId, nests: Nest[]): LoopRuntime {
  return {
    biome,
    nests,
    guardians: [],
    rivals: createRivals(
      BIOME_DEFS[biome].rivalClubs,
      BIOME_DEFS[biome].terrain.size,
      new Rng(`${biome}-rivals`),
    ),
    thrown: [],
    carried: null,
    tumbleRemaining: 0,
    hitstopRemaining: 0,
    grabTarget: null,
    station: null,
    threat: 'calm',
    cooldowns: { seedPouch: 0, sleepyBerries: 0, whistle: 0 },
  };
}

export interface LoopStepInput {
  readonly playerPosition: Vec2;
  readonly playerGroundY: number;
  readonly playerNoiseRadius: number;
  readonly difficulty: Difficulty;
  /** Callback that answers "can this guardian see through to there?" */
  readonly hasLineOfSight: (from: Vec2, fromY: number, to: Vec2, toY: number) => boolean;
  readonly groundAt: (x: number, z: number) => number;
  readonly dt: number;
}

const rivalEvents: RivalEvent[] = [];
const nestTick = { respawned: [] as number[] };

/**
 * Advance the whole loop one frame.
 *
 * Allocation-free apart from the event list, which the caller drains and
 * reuses. This runs every frame with up to a dozen guardians, nine nests and
 * three rivals in flight.
 */
export function stepLoop(
  runtime: LoopRuntime,
  input: LoopStepInput,
  rng: Rng,
  events: LoopEvent[],
): void {
  events.length = 0;
  const { dt } = input;

  // --- hitstop -------------------------------------------------------------
  if (runtime.hitstopRemaining > 0) {
    runtime.hitstopRemaining -= dt;
    // Everything freezes for 80ms on a catch. It is the single cheapest way
    // to make an impact land, and it costs nothing but a return.
    return;
  }

  if (runtime.tumbleRemaining > 0)
    runtime.tumbleRemaining = Math.max(0, runtime.tumbleRemaining - dt);
  for (const tool of Object.keys(runtime.cooldowns) as ToolId[]) {
    runtime.cooldowns[tool] = Math.max(0, runtime.cooldowns[tool] - dt);
  }

  // --- nests ---------------------------------------------------------------
  tickNests(runtime.nests, runtime.biome, rng, dt, nestTick);
  for (const index of nestTick.respawned) {
    events.push({ type: 'eggRespawned', nest: index });
  }

  // --- thrown tools --------------------------------------------------------
  stepThrown(runtime, input, events);

  // --- guardians -----------------------------------------------------------
  const config = BIOME_DEFS[runtime.biome].guardian;
  let threat: LoopRuntime['threat'] = 'calm';

  for (const guardian of runtime.guardians) {
    const toPlayer = {
      x: input.playerPosition.x - guardian.position.x,
      z: input.playerPosition.z - guardian.position.z,
    };
    const distance = Math.hypot(toPlayer.x, toPlayer.z);
    const bearing = Math.atan2(toPlayer.x, toPlayer.z);
    let angle = ((bearing - guardian.facing) * 180) / Math.PI;
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;

    const lineOfSight = input.hasLineOfSight(
      guardian.position,
      guardian.groundY + 0.8,
      input.playerPosition,
      input.playerGroundY + 0.9,
    );

    guardian.perception = perceive(
      config,
      {
        distance,
        angleToPlayer: angle,
        hasLineOfSight: lineOfSight,
        noiseRadius: input.playerNoiseRadius,
        playerIsCarrying: runtime.carried !== null,
      },
      input.difficulty,
      guardian.runtime.state === 'drowsy',
    );

    // A landed lure within reach pulls the guardian's attention.
    let lure: Vec2 | null = null;
    let sleep = false;
    for (const tool of runtime.thrown) {
      if (!tool.landed || tool.lureRemaining <= 0) continue;
      const def = TOOL_DEFS[tool.tool];
      const toLure = Math.hypot(
        tool.position.x - guardian.position.x,
        tool.position.z - guardian.position.z,
      );
      if (toLure > def.lureRadius) continue;
      if (tool.tool === 'sleepyBerries') sleep = true;
      else lure = tool.position;
    }

    const before = guardian.runtime.state;
    const result = stepGuardian(guardian.runtime, {
      config,
      perception: guardian.perception,
      difficulty: input.difficulty,
      playerPosition: input.playerPosition,
      lure,
      sleepTriggered: sleep,
      dt,
    });

    if (result.changed) {
      if (result.state === 'alert' && before === 'patrol') {
        events.push({ type: 'guardianAlerted' });
      }
      if (result.state === 'giveUp') events.push({ type: 'guardianGaveUp' });
    }

    // Smooth the alert meter so the HUD ring fills rather than snapping.
    const target = guardian.perception.strength;
    guardian.alertness += (target - guardian.alertness) * Math.min(1, dt * 6);

    moveGuardian(guardian, result.target, result.speed, config.turnRate, input, dt);

    if (result.state === 'chase') threat = 'chase';
    else if (result.state === 'alert' && threat === 'calm') threat = 'alert';

    // --- the catch ---------------------------------------------------------
    if (
      result.state === 'chase' &&
      distance <= GUARDIAN.catchRadius &&
      runtime.tumbleRemaining <= 0
    ) {
      runtime.tumbleRemaining = GUARDIAN.tumbleSeconds;
      runtime.hitstopRemaining = MOVEMENT.hitstopMs / 1000;
      const dropped = runtime.carried;
      runtime.carried = null;
      events.push({ type: 'caught', ...(dropped === null ? {} : { roll: dropped }) });
    }
  }

  runtime.threat = threat;

  // --- rivals --------------------------------------------------------------
  const world = {
    nests: runtime.nests.map((n) => n.position),
    occupied: runtime.nests.map((n) => n.egg !== null),
  };
  stepRivals(runtime.rivals, world, rng, dt, rivalEvents);

  for (const nest of runtime.nests) nest.contested = false;
  for (const rival of runtime.rivals) {
    if (rival.targetNest !== null) {
      const nest = runtime.nests[rival.targetNest];
      if (nest !== undefined) nest.contested = true;
    }
  }

  for (const event of rivalEvents) {
    if (event.type !== 'claimed') continue;
    const nest = runtime.nests[event.nest];
    if (nest === undefined) continue;
    claimByRival(nest);
    const rival = runtime.rivals.find((r) => r.id === event.rivalId);
    events.push({
      type: 'raceLost',
      nest: event.nest,
      ...(rival === undefined ? {} : { club: rival.club }),
    });
  }

  // --- what can the player interact with right now? ------------------------
  runtime.grabTarget =
    runtime.carried === null
      ? nearestEgg(runtime.nests, input.playerPosition, EGG.grabRadius)
      : null;
}

/** Player pressed Grab on a nest. */
export function grabEgg(runtime: LoopRuntime, events: LoopEvent[]): boolean {
  const nest = runtime.grabTarget;
  if (nest === null || runtime.carried !== null) return false;
  const egg = takeEgg(nest);
  if (egg === null) return false;
  runtime.carried = egg;
  runtime.grabTarget = null;
  events.push({ type: 'grabbed', nest: nest.index, roll: egg });
  return true;
}

/** Player pressed Grab with nothing in reach: put the egg down gently. */
export function dropEgg(runtime: LoopRuntime, events: LoopEvent[]): EggRoll | null {
  const egg = runtime.carried;
  if (egg === null) return null;
  runtime.carried = null;
  events.push({ type: 'dropped', roll: egg });
  return egg;
}

export function throwTool(
  runtime: LoopRuntime,
  tool: ToolId,
  from: Vec2,
  facing: number,
  events: LoopEvent[],
): boolean {
  if (runtime.cooldowns[tool] > 0) return false;
  const def = TOOL_DEFS[tool];
  runtime.cooldowns[tool] = def.cooldownSeconds;

  runtime.thrown.push({
    tool,
    position: { ...from },
    velocity: { x: Math.sin(facing) * def.throwSpeed, z: Math.cos(facing) * def.throwSpeed },
    height: 1.2,
    verticalVelocity: 4.2,
    lureRemaining: def.lureSeconds,
    landed: def.throwSpeed === 0,
  });
  events.push({ type: 'toolThrown', tool });
  return true;
}

function stepThrown(runtime: LoopRuntime, input: LoopStepInput, events: LoopEvent[]): void {
  for (let i = runtime.thrown.length - 1; i >= 0; i--) {
    const tool = runtime.thrown[i]!;

    if (!tool.landed) {
      tool.position.x += tool.velocity.x * input.dt;
      tool.position.z += tool.velocity.z * input.dt;
      tool.verticalVelocity -= 22 * input.dt;
      tool.height += tool.verticalVelocity * input.dt;

      const ground = input.groundAt(tool.position.x, tool.position.z);
      if (tool.height <= ground) {
        tool.height = ground;
        tool.landed = true;
        events.push({ type: 'toolLanded', tool: tool.tool });
      }
    } else {
      tool.lureRemaining -= input.dt;
      if (tool.lureRemaining <= -2) runtime.thrown.splice(i, 1);
    }
  }
}

function moveGuardian(
  guardian: GuardianInstance,
  target: Vec2 | null,
  speed: number,
  turnRate: number,
  input: LoopStepInput,
  dt: number,
): void {
  let destination = target;

  if (destination === null) {
    // No target: walk the patrol loop.
    const waypoint = guardian.route[guardian.waypoint];
    if (waypoint === undefined) return;
    const reached =
      Math.hypot(waypoint.x - guardian.position.x, waypoint.z - guardian.position.z) < 1.1;
    if (reached) guardian.waypoint = (guardian.waypoint + 1) % guardian.route.length;
    destination = guardian.route[guardian.waypoint] ?? waypoint;
  }

  const dx = destination.x - guardian.position.x;
  const dz = destination.z - guardian.position.z;
  const distance = Math.hypot(dx, dz);

  if (distance > 0.05 && speed > 0) {
    /*
     * Turn towards the destination at a limited rate, and only move along the
     * way we are actually facing.
     *
     * This is what makes the Sentinel Swan's "fast in a straight line, poor
     * at corners" mechanic emerge from data rather than special-case code:
     * give it a high chaseSpeed and a low turnRate and it overshoots every
     * corner on its own.
     */
    const wanted = Math.atan2(dx, dz);
    let diff = wanted - guardian.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const maxTurn = ((turnRate * Math.PI) / 180) * dt;
    guardian.facing += Math.abs(diff) <= maxTurn ? diff : Math.sign(diff) * maxTurn;

    // Alignment gate: a guardian pointing the wrong way barely advances.
    const alignment = Math.max(0, Math.cos(diff));
    const step = speed * dt * (0.25 + alignment * 0.75);
    guardian.position.x += Math.sin(guardian.facing) * step;
    guardian.position.z += Math.cos(guardian.facing) * step;
  }

  guardian.groundY = input.groundAt(guardian.position.x, guardian.position.z);
}

export const RACE_PENALTY_SECONDS = RIVALS.lossPenaltySeconds;
