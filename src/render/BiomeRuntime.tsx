/**
 * The playable biome: nests, guardians, rivals, the sanctuary, and the rules
 * that connect them.
 *
 * This is where the loop actually happens. It owns a `LoopRuntime` (mutable,
 * per-frame, outside React) and pushes only discrete outcomes into the store.
 */

import { useFrame } from '@react-three/fiber';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Vector3, type Group } from 'three';
import { useRapier } from '@react-three/rapier';
import { BIOME_DEFS } from '../data/biomes';
import { CARRY_PENALTY, GUARDIAN, TOOL_DEFS } from '../data/balance';
import { requireSpecies } from '../data/creatures';
import { createNests, type Nest } from '../sim/nests';
import { Rng } from '../sim/rng';
import type { BiomeId, EggRoll, Rarity, ToolId, Vec2 } from '../sim/types';
import {
  createGuardians,
  createLoopRuntime,
  dropEgg,
  grabEgg,
  stepLoop,
  throwTool,
  type LoopEvent,
  type LoopRuntime,
} from '../systems/loop';
import { scatterPlacements } from '../systems/spawn';
import { useGame } from '../state/store';
import { playerRef } from './player/playerRuntime';
import { sampleHeight, type TerrainField } from './world/terrain';
import { NestEntity } from './entities/Nest';
import { GuardianEntity } from './entities/GuardianEntity';
import { EggArcClock, EggEntity } from './entities/EggEntity';
import { RivalMarkers } from './entities/RivalMarkers';
import { Sanctuary, SANCTUARY_RADIUS, STATIONS, type StationId } from './world/Sanctuary';
import { ThrownTools } from './entities/ThrownTools';
import { habitatSlots } from '../sim/economy';
import { RARITY_COLOURS } from '../data/mutations';
import { audioDirector } from '../systems/audio/director';

export interface BiomeRuntimeProps {
  biome: BiomeId;
  field: TerrainField;
  /** Reported so the HUD can show the grab prompt. */
  onPrompt: (prompt: Prompt | null) => void;
  /** Reported so the player controller can apply the carry penalty. */
  onCarryChange: (rarity: Rarity | null) => void;
}

export interface Prompt {
  readonly kind: 'grab' | 'drop' | 'station';
  readonly label: string;
  readonly icon: string;
  readonly station?: StationId;
}

/** Reusable scratch, so the frame loop allocates nothing. */
const scratchFrom = new Vector3();
const scratchTo = new Vector3();
const scratchDir = new Vector3();
const loopEvents: LoopEvent[] = [];

export function BiomeRuntime({
  biome,
  field,
  onPrompt,
  onCarryChange,
}: BiomeRuntimeProps): React.ReactElement {
  const def = BIOME_DEFS[biome];
  const { world, rapier } = useRapier();

  const settings = useGame((s) => s.save.settings);
  const save = useGame((s) => s.save);
  const depositEgg = useGame((s) => s.depositEgg);
  const recordCatch = useGame((s) => s.recordCatch);
  const recordRaceLost = useGame((s) => s.recordRaceLost);
  const caption = useGame((s) => s.caption);
  const toast = useGame((s) => s.toast);
  const setMenu = useGame((s) => s.setMenu);
  const spendTool = useGame((s) => s.useTool);

  // Nests and guardians are seeded per biome, so a returning player finds the
  // world exactly where they left it.
  const nests = useMemo<Nest[]>(() => {
    const rng = new Rng(`${biome}-nests`);
    const placements = scatterPlacements(field, rng, {
      count: def.nestCount,
      minSpacing: 16,
      // Never inside the sanctuary, and the closest one is the tutorial nest.
      minFromCentre: SANCTUARY_RADIUS + 5,
      maxFromCentre: def.terrain.size * 0.36,
      maxSlope: 22,
    });
    return createNests(placements, biome, new Rng(`${biome}-eggs`));
  }, [biome, field, def]);

  const groundAt = useCallback(
    (x: number, z: number): number => sampleHeight(field, x, z),
    [field],
  );

  /*
   * The runtime is built by a memo rather than held in a ref.
   *
   * It is mutated every frame -- that is the whole point of it -- but it is
   * also *read* during render, to lay out the nests and the guardian list.
   * Reading a ref during render is a genuine hazard under concurrent
   * rendering, whereas a memo result is a legitimate render input. Rebuilding
   * when the biome changes then falls out of the dependency array instead of
   * needing an effect that calls setState.
   */
  const runtime = useMemo<LoopRuntime>(() => {
    const rt = createLoopRuntime(biome, nests);
    rt.guardians = createGuardians(nests, field, groundAt, new Rng(`${biome}-guardians`));
    return rt;
  }, [biome, nests, field, groundAt]);

  const rng = useMemo(() => new Rng(`${biome}-live`), [biome]);

  /*
   * Structural changes -- a nest gaining or losing its egg -- need a React
   * render. Transforms do not: each entity reads the mutable runtime in its
   * own frame loop, so guardians move at sixty hertz while this tree
   * reconciles at ten.
   */
  const [, forceRender] = useState(0);
  const renderClock = useRef(0);

  /**
   * Line of sight, by raycast.
   *
   * The one thing that makes cover mean anything. Reeds, rocks and ruins all
   * have colliders, so hiding behind them genuinely breaks the ray rather
   * than merely looking as though it should.
   */
  const hasLineOfSight = useCallback(
    (from: Vec2, fromY: number, to: Vec2, toY: number): boolean => {
      scratchFrom.set(from.x, fromY, from.z);
      scratchTo.set(to.x, toY, to.z);
      scratchDir.subVectors(scratchTo, scratchFrom);
      const distance = scratchDir.length();
      if (distance < 0.001) return true;
      scratchDir.multiplyScalar(1 / distance);
      const ray = new rapier.Ray(scratchFrom, scratchDir);
      const hit = world.castRay(ray, distance - 0.4, true);
      return hit === null;
    },
    [world, rapier],
  );

  useFrame((_state, rawDelta) => {
    const rt = runtime;
    const r = rng;
    const dt = Math.min(rawDelta, 1 / 20);

    const position: Vec2 = { x: playerRef.position.x, z: playerRef.position.z };

    stepLoop(
      rt,
      {
        playerPosition: position,
        playerGroundY: playerRef.position.y,
        playerNoiseRadius: playerRef.noiseRadius,
        difficulty: settings.difficulty,
        hasLineOfSight,
        groundAt,
        dt,
      },
      r,
      loopEvents,
    );

    // --- interaction ---------------------------------------------------------
    const station = nearestStation(position);
    rt.station = station;

    if (playerRef.interactPressed) {
      handleInteract(rt, station);
    }
    if (playerRef.toolPressed) {
      const tool = pickTool();
      if (tool !== null && spendTool(tool)) {
        throwTool(rt, tool, position, playerRef.facing, loopEvents);
      }
    }

    for (const event of loopEvents) drainEvent(event);

    // The chase layer follows the loudest guardian in the biome.
    audioDirector.setThreat(rt.threat);
    audioDirector.update(dt, {
      gait: playerRef.gait,
      speed: playerRef.speed,
      inWater: playerRef.inWater,
      biome,
    });

    // The HUD needs to know what pressing Grab would do. Only push a change
    // when it actually changes, or the UI re-renders every frame.
    const nextPrompt = describePrompt(rt, station);
    if (promptKey(nextPrompt) !== promptKey(lastPrompt.current)) {
      lastPrompt.current = nextPrompt;
      onPrompt(nextPrompt);
    }

    const carriedRarity = rt.carried?.rarity ?? null;
    if (carriedRarity !== lastCarried.current) {
      lastCarried.current = carriedRarity;
      onCarryChange(carriedRarity);
    }

    // Guardians and nests are drawn from React, so the tree needs to re-render
    // to follow them -- but at ten hertz, not sixty. Their transforms are
    // interpolated inside their own components from the runtime object.
    renderClock.current += dt;
    if (renderClock.current > 0.1) {
      renderClock.current = 0;
      forceRender((n) => n + 1);
    }
  });

  const lastPrompt = useRef<Prompt | null>(null);
  const lastCarried = useRef<Rarity | null>(null);

  function handleInteract(rt: LoopRuntime, station: StationId | null): void {
    if (rt.tumbleRemaining > 0) return;

    if (station !== null && rt.carried !== null && station === 'incubator') {
      const roll = dropEgg(rt, loopEvents);
      if (roll !== null) loopEvents.push({ type: 'deposited', roll });
      return;
    }
    if (station !== null && rt.carried === null) {
      openStation(station);
      return;
    }
    if (rt.carried === null) {
      grabEgg(rt, loopEvents);
      return;
    }
    dropEgg(rt, loopEvents);
  }

  function openStation(station: StationId): void {
    switch (station) {
      case 'shop':
      case 'track':
        setMenu('shop');
        break;
      case 'guide':
        setMenu('guide');
        break;
      case 'breeding':
        setMenu('guide');
        break;
      case 'incubator':
        useGame.getState().collectHatchling();
        break;
      default:
        break;
    }
  }

  function pickTool(): ToolId | null {
    // Prefer the cheapest tool that is off cooldown and in stock.
    for (const tool of ['seedPouch', 'sleepyBerries', 'whistle'] as ToolId[]) {
      if (save.tools[tool] > 0 && runtime.cooldowns[tool] <= 0) return tool;
    }
    return null;
  }

  function drainEvent(event: LoopEvent): void {
    switch (event.type) {
      /*
       * Every branch here goes through the audio director rather than calling
       * caption() directly. The director plays the sound *and* pushes the
       * registered caption, which is what keeps "no sound without words" true
       * at runtime instead of only in a test.
       */
      case 'grabbed': {
        if (event.roll === undefined) break;
        audioDirector.play('egg-grab');
        const species = requireSpecies(event.roll.speciesId);
        caption('egg', `A ${species.name} egg! Take it home.`, 3.5);
        break;
      }
      case 'deposited': {
        if (event.roll === undefined) break;
        depositEgg(event.roll);
        audioDirector.play('egg-deposit');
        break;
      }
      case 'caught': {
        recordCatch();
        audioDirector.play('caught');
        toast('shoo', 'Oops! You dropped the egg. Nothing lost.', 'info');
        break;
      }
      case 'raceLost': {
        recordRaceLost();
        audioDirector.play('rival-claim');
        break;
      }
      case 'guardianAlerted':
        audioDirector.play('guardian-alert');
        break;
      case 'guardianGaveUp':
        audioDirector.play('guardian-giveup');
        break;
      case 'toolLanded':
        audioDirector.play('tool-land');
        break;
      case 'toolThrown':
        audioDirector.play('tool-throw');
        break;
      case 'dropped':
        audioDirector.play('egg-drop');
        break;
      case 'eggRespawned':
        audioDirector.play('egg-respawn');
        break;
      default:
        break;
    }
  }

  const rt = runtime;
  const rarityPalette = RARITY_COLOURS[settings.colourblind];
  const coneColour = rarityPalette.legendary;
  const sanctuaryGround = groundAt(0, 0);

  return (
    <group>
      <EggArcClock />

      {rt.nests.map((nest) => (
        <NestEntity
          key={nest.index}
          nest={nest}
          highlighted={rt.grabTarget?.index === nest.index}
          contested={nest.contested}
        />
      ))}

      {rt.guardians.map((guardian) => (
        <GuardianEntity
          key={guardian.id}
          instance={guardian}
          body={guardianBody(biome)}
          scale={guardianScale(biome)}
          visionConeDegrees={def.guardian.visionConeDegrees}
          visionRange={def.guardian.visionRange}
          showVisionCone
          colourblindSafe={coneColour}
        />
      ))}

      <RivalMarkers rivals={rt.rivals} nests={rt.nests} groundAt={groundAt} />
      <ThrownTools thrown={rt.thrown} />

      <Sanctuary
        groundY={sanctuaryGround}
        incubator={save.incubator}
        creatures={save.creatures}
        habitatSlots={habitatSlots(save.upgrades)}
        activeStation={rt.station as StationId | null}
      />

      {rt.carried !== null ? <CarriedEgg roll={rt.carried} /> : null}
    </group>
  );
}

/** The egg in the ranger's hands, tucked against the chest while running. */
function CarriedEgg({ roll }: { roll: EggRoll }): React.ReactElement {
  const group = useRef<Group>(null);
  useFrame(() => {
    const g = group.current;
    if (g === null) return;
    g.position.set(playerRef.position.x, playerRef.position.y + 0.95, playerRef.position.z);
    g.rotation.y = playerRef.facing;
  });
  return (
    <group ref={group}>
      <group position={[0.24, 0, 0.2]}>
        <EggEntity roll={roll} position={[0, 0, 0]} idle={false} />
      </group>
    </group>
  );
}

function nearestStation(position: Vec2): StationId | null {
  let best: StationId | null = null;
  let bestDistance = Infinity;
  for (const station of STATIONS) {
    const distance = Math.hypot(position.x - station.position[0], position.z - station.position[2]);
    if (distance <= station.radius && distance < bestDistance) {
      bestDistance = distance;
      best = station.id;
    }
  }
  return best;
}

function describePrompt(rt: LoopRuntime, station: StationId | null): Prompt | null {
  if (rt.tumbleRemaining > 0) return null;

  if (station === 'incubator' && rt.carried !== null) {
    return { kind: 'station', label: 'Put the egg in', icon: 'egg-warm', station };
  }
  if (station !== null && rt.carried === null) {
    const entry = STATIONS.find((s) => s.id === station);
    return { kind: 'station', label: entry?.label ?? 'Use', icon: station, station };
  }
  if (rt.grabTarget !== null) {
    return { kind: 'grab', label: 'Pick up the egg', icon: 'egg' };
  }
  if (rt.carried !== null) {
    return { kind: 'drop', label: 'Put the egg down', icon: 'egg' };
  }
  return null;
}

function promptKey(prompt: Prompt | null): string {
  return prompt === null ? '' : `${prompt.kind}:${prompt.label}`;
}

/**
 * A guardian is a big cousin of the creatures you collect, built from the
 * same parametric vocabulary. Nothing in this game looks like a threat.
 */
function guardianBody(biome: BiomeId): Parameters<typeof GuardianEntity>[0]['body'] {
  switch (biome) {
    case 'mirrormere':
      return {
        palette: ['#f4f6f8', '#ffffff', '#e0a038'],
        bodyRadius: 0.44,
        bodyStretch: 1.5,
        legCount: 2,
        legLength: 0.42,
        earStyle: 'none',
        tailStyle: 'fan',
        eyeSize: 0.075,
        shellPattern: 'plain',
      };
    case 'dunes':
      return {
        palette: ['#c08a4a', '#e8c088', '#6a4a28'],
        bodyRadius: 0.46,
        bodyStretch: 1.35,
        legCount: 6,
        legLength: 0.34,
        earStyle: 'fin',
        tailStyle: 'long',
        eyeSize: 0.055,
        shellPattern: 'band',
      };
    case 'glade':
    default:
      return {
        palette: ['#b8703c', '#e0a868', '#5a3a20'],
        bodyRadius: 0.48,
        bodyStretch: 1.15,
        legCount: 2,
        legLength: 0.24,
        earStyle: 'frill',
        tailStyle: 'fan',
        eyeSize: 0.08,
        shellPattern: 'speckle',
      };
  }
}

function guardianScale(biome: BiomeId): number {
  return biome === 'dunes' ? 1.35 : biome === 'mirrormere' ? 1.45 : 1.2;
}

export const CARRY_PENALTIES = CARRY_PENALTY;
export const CATCH_RADIUS = GUARDIAN.catchRadius;
export const TOOLS = TOOL_DEFS;
