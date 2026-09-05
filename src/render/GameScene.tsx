/**
 * Assembles a playable scene: physics world, lighting, the biome (or the
 * greybox gym), the player and the camera.
 *
 * M1 renders the gym with placeholder lighting. M2 replaces the lighting and
 * the world; the player, camera and physics wiring here do not change.
 */

import { Physics } from '@react-three/rapier';
import { Suspense, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { ACESFilmicToneMapping } from 'three';
import { InputManager } from '../systems/input';
import { useGame } from '../state/store';
import { PlayerController } from './player/PlayerController';
import { PlayerAvatar } from './player/PlayerAvatar';
import { playerRef } from './player/playerRuntime';
import {
  GREYBOX_HALF_EXTENT,
  GREYBOX_SPAWN,
  GREYBOX_WATER_LEVEL,
  GreyboxArena,
} from './world/GreyboxArena';
import { markReady, recordSample, testHookEnabled, virtualInput } from '../systems/testHook';

export function GameScene(): React.ReactElement {
  const settings = useGame((s) => s.save.settings);
  const pace = useGame((s) => s.save.pace);

  const input = useMemo(
    () =>
      new InputManager({
        holdToSprint: settings.holdToSprint,
        holdToCrouch: settings.holdToCrouch,
        invertY: settings.invertY,
        lookSensitivity: settings.lookSensitivity,
        bindings: settings.bindings,
      }),
    // Constructed once; options are pushed in below so the manager keeps its
    // latched state across a settings change.
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

  return (
    <Suspense fallback={null}>
      <ToneMapping exposure={settings.exposure} />
      <VirtualInputBridge input={input} />
      <PlaceholderLighting />
      <Physics gravity={[0, -26, 0]} timeStep="vary" paused={false}>
        <GreyboxArena />
        <PlayerController
          input={input}
          spawn={GREYBOX_SPAWN}
          waterLevel={GREYBOX_WATER_LEVEL}
          pace={pace}
        />
      </Physics>
      <PlayerAvatar />
      <SampleRecorder />
    </Suspense>
  );
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

function SampleRecorder(): null {
  useFrame((state) => {
    const { position } = state.camera;
    recordSample(playerRef, position.x, position.y, position.z);
  });
  return null;
}

/**
 * Linear working space in, sRGB out, ACES filmic in between, with exposure
 * exposed as a player setting. Applied on a frame rather than in an effect so
 * a settings change takes hold immediately.
 */
function ToneMapping({ exposure }: { exposure: number }): null {
  useFrame((state) => {
    const gl = state.gl;
    if (gl.toneMapping !== ACESFilmicToneMapping) gl.toneMapping = ACESFilmicToneMapping;
    if (gl.toneMappingExposure !== exposure) gl.toneMappingExposure = exposure;
  });
  return null;
}

/** Stand-in until M2 lands the real rig. Enough to read shape and depth. */
function PlaceholderLighting(): React.ReactElement {
  return (
    <>
      <color attach="background" args={['#93a8b4']} />
      <fog attach="fog" args={['#b9c6cc', 30, GREYBOX_HALF_EXTENT * 2.4]} />
      <hemisphereLight args={['#a8c4d8', '#485038', 0.55]} />
      <directionalLight
        position={[18, 26, 14]}
        intensity={3.0}
        color="#ffd9a0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0008}
        shadow-normalBias={0.03}
      />
    </>
  );
}
