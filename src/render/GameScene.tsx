/**
 * Assembles a playable scene: physics world, biome, player, camera and post.
 *
 * The scene owns nothing about gameplay -- it reads the store for which biome
 * to build and what quality to build it at, and hands the rest to the systems.
 */

import { Physics } from '@react-three/rapier';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { ACESFilmicToneMapping, SRGBColorSpace, type Mesh } from 'three';
import type { Rarity } from '../sim/types';
import { BIOME_DEFS } from '../data/biomes';
import { InputManager } from '../systems/input';
import { useGame } from '../state/store';
import { PlayerController } from './player/PlayerController';
import { PlayerAvatar } from './player/PlayerAvatar';
import { playerRef } from './player/playerRuntime';
import { Biome, useTerrainField } from './world/Biome';
import { sampleHeight } from './world/terrain';
import { PostChain } from './post/PostChain';
import { resolveQuality, QUALITY_PRESETS, type QualityLevel } from './quality';
import { markReady, recordSample, testHookEnabled, virtualInput } from '../systems/testHook';
import { perfMonitor } from '../systems/perf';
import { BiomeRuntime, type Prompt } from './BiomeRuntime';
import { carriedPace } from '../sim/economy';

export function GameScene(): React.ReactElement {
  const settings = useGame((s) => s.save.settings);
  const pace = useGame((s) => s.save.pace);
  const biomeId = useGame((s) => s.save.currentBiome);
  const phase = useGame((s) => s.phase);
  const menu = useGame((s) => s.activeMenu);

  const [sunMesh, setSunMesh] = useState<Mesh | null>(null);
  const [autoLevel, setAutoLevel] = useState<QualityLevel | null>(null);
  const [carriedRarity, setCarriedRarity] = useState<Rarity | null>(null);
  const setPrompt = useGame((s) => s.setPrompt);

  const quality = useMemo(() => {
    const base = resolveQuality(settings.quality);
    // The adaptive monitor can only ever step the preset down, and only when
    // quality is on 'auto' -- an explicit choice by the player is respected.
    if (settings.quality !== 'auto' || autoLevel === null) return base;
    return QUALITY_PRESETS[autoLevel];
  }, [settings.quality, autoLevel]);

  const biome = BIOME_DEFS[biomeId];
  const field = useTerrainField(biomeId);

  const input = useMemo(
    () =>
      new InputManager({
        holdToSprint: settings.holdToSprint,
        holdToCrouch: settings.holdToCrouch,
        invertY: settings.invertY,
        lookSensitivity: settings.lookSensitivity,
        bindings: settings.bindings,
      }),
    // Constructed once so it keeps its latched state across settings changes;
    // options are pushed in by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    input.attach();
    return () => input.detach();
  }, [input]);

  useEffect(() => {
    input.setOptions({
      holdToSprint: settings.holdToSprint,
      holdToCrouch: settings.holdToCrouch,
      invertY: settings.invertY,
      lookSensitivity: settings.lookSensitivity,
      bindings: settings.bindings,
    });
  }, [input, settings]);

  useEffect(() => {
    markReady();
  }, []);

  const handleQualityDrop = useCallback((level: QualityLevel) => {
    setAutoLevel(level);
  }, []);

  const handlePrompt = useCallback(
    (prompt: Prompt | null) => {
      setPrompt(prompt);
    },
    [setPrompt],
  );

  // Spawn on the flat apron at the middle of the map, which the terrain
  // generator guarantees is level ground.
  const spawn = useMemo<readonly [number, number, number]>(
    () => [0, sampleHeight(field, 0, 0) + 0.4, 6],
    [field],
  );

  /**
   * Keep the sanctuary clearing free of undergrowth.
   *
   * Small on purpose. At 14 metres this swallowed every plant the player
   * could actually see from the spawn, and the foreground read as bare mud
   * with a distant treeline -- the exact opposite of what a dawn woodland
   * should look like.
   */
  const sanctuaryExclusion = useMemo(() => [{ x: 0, z: 0, radius: 5.5 }], []);

  return (
    <Suspense fallback={null}>
      <RendererSetup
        exposure={settings.exposure * biome.lighting.exposure}
        maxDpr={quality.maxDpr}
      />
      <VirtualInputBridge input={input} />
      <SystemKeys input={input} />
      <PerfSampler
        adaptive={settings.quality === 'auto'}
        level={quality.level}
        onDrop={handleQualityDrop}
      />

      {/* Inside Physics: the terrain's heightfield collider is part of the biome. */}
      <Physics gravity={[0, -26, 0]} timeStep="vary" paused={phase === 'paused'}>
        <Biome
          biome={biomeId}
          quality={quality}
          reducedMotion={settings.reducedMotion}
          onSunMesh={setSunMesh}
          exclusions={sanctuaryExclusion}
        />
        <PlayerController
          input={input}
          spawn={spawn}
          waterLevel={biome.terrain.waterLevel}
          // The carry penalty is the risk/reward dial: a rarer egg is a
          // heavier egg, and the escape is correspondingly harder.
          pace={carriedPace(pace, carriedRarity)}
        />
        <BiomeRuntime
          biome={biomeId}
          field={field}
          onPrompt={handlePrompt}
          onCarryChange={setCarriedRarity}
        />
      </Physics>

      <PlayerAvatar />

      <PostChain
        quality={quality}
        lighting={biome.lighting}
        reducedMotion={settings.reducedMotion}
        sunMesh={sunMesh}
        // Depth of field never runs during play. In a stealth game it costs
        // exactly the legibility the whole thing depends on.
        depthOfField={phase === 'paused' || phase === 'photo' || menu !== 'none'}
        heatHaze={biomeId === 'dunes'}
        topSpeed={pace}
      />

      <SampleRecorder />
    </Suspense>
  );
}

/**
 * System keys: pause, photo mode, the perf overlay.
 *
 * Read from the same input manager as everything else, so they honour
 * remapping. Pausing genuinely pauses physics -- a child who steps away
 * mid-chase should not come back to a tumble.
 */
function SystemKeys({ input }: { input: InputManager }): null {
  useFrame(() => {
    const state = useGame.getState();
    const frame = input.peek();

    if (frame.menuPressed) {
      if (state.activeMenu !== 'none') state.setMenu('none');
      else if (state.phase === 'photo') state.setPhase('playing');
      else state.setPhase(state.phase === 'paused' ? 'playing' : 'paused');
    }
    if (frame.photoPressed) {
      state.setPhase(state.phase === 'photo' ? 'playing' : 'photo');
    }
    if (frame.perfPressed) state.togglePerfOverlay();
  });
  return null;
}

/** Applies the e2e virtual stick, when the test hook is enabled. */
function VirtualInputBridge({ input }: { input: InputManager }): null {
  useFrame(() => {
    if (!testHookEnabled()) return;
    input.setExternalStick({
      moveX: virtualInput.moveX,
      moveY: virtualInput.moveY,
      lookX: virtualInput.lookX,
      lookY: virtualInput.lookY,
      sprint: virtualInput.sprint,
      crouch: virtualInput.crouch,
    });
    if (virtualInput.jump) {
      input.press('jump');
      virtualInput.jump = false;
    }
    if (virtualInput.interact) {
      input.press('interact');
      virtualInput.interact = false;
    }
  });
  return null;
}

/**
 * Reads the renderer's counters and starts the next frame's tally.
 *
 * three resets `info.render` inside every `render()` call, so reading it from
 * an ordinary frame callback -- which runs *before* the render -- always
 * returns zeros. Turning autoReset off and clearing it ourselves at the top
 * of each frame means what we read is the previous frame's real totals.
 *
 * Priority -1000 so this is the first thing that runs each frame.
 */
function SampleRecorder(): null {
  useFrame((state) => {
    const { position } = state.camera;
    const info = state.gl.info;
    info.autoReset = false;
    recordSample(
      playerRef,
      position.x,
      position.y,
      position.z,
      info.render.calls,
      info.render.triangles,
    );
    perfMonitor.record(
      info.render.calls,
      info.render.triangles,
      info.programs?.length ?? 0,
      info.memory.textures,
    );
    info.reset();
  }, -1000);
  return null;
}

function PerfSampler({
  adaptive,
  level,
  onDrop,
}: {
  adaptive: boolean;
  level: QualityLevel;
  onDrop: (level: QualityLevel) => void;
}): null {
  const lastLevel = useRef(level);
  useEffect(() => {
    perfMonitor.configure(adaptive, lastLevel.current, onDrop);
  }, [adaptive, onDrop]);

  useFrame((_state, delta) => {
    perfMonitor.frame(delta);
  });
  return null;
}

/**
 * Linear working space in, sRGB out, ACES filmic in between.
 *
 * Set on a frame rather than in an effect so that changing exposure in the
 * settings takes hold on the next frame with no remount.
 */
function RendererSetup({ exposure, maxDpr }: { exposure: number; maxDpr: number }): null {
  useFrame((state) => {
    const gl = state.gl;
    if (gl.toneMapping !== ACESFilmicToneMapping) gl.toneMapping = ACESFilmicToneMapping;
    if (gl.toneMappingExposure !== exposure) gl.toneMappingExposure = exposure;
    if (gl.outputColorSpace !== SRGBColorSpace) gl.outputColorSpace = SRGBColorSpace;
    const target = Math.min(maxDpr, window.devicePixelRatio);
    if (Math.abs(state.viewport.dpr - target) > 0.01) state.setDpr(target);
  });
  return null;
}
