/**
 * The post-processing chain.
 *
 * Order matters and this is the order:
 *
 *   GTAO/SSAO -> god rays -> heat haze -> bloom -> sprint blur -> SMAA
 *   -> depth of field (menus only) -> grain -> chromatic aberration -> vignette
 *
 * AO first because it belongs in the lighting, before anything adds energy to
 * the frame. Bloom after the volumetrics so the shafts can bloom. Antialiasing
 * after the blurs, because running SMAA and then smearing the result throws
 * the edge work away. Grain, aberration and vignette last: they are lens
 * artefacts and a lens is the last thing light passes through.
 *
 * Every effect is individually gated by the quality preset, and the three
 * that could upset someone -- blur, aberration and grain -- are also gated by
 * reduced motion.
 */

import { useFrame } from '@react-three/fiber';
import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  GodRays,
  Noise,
  SMAA,
  SSAO,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { useEffect, useMemo } from 'react';
import { HalfFloatType, Vector2, type Mesh } from 'three';
import type { BiomeLighting } from '../../data/biomes';
import type { QualitySettings } from '../quality';
import { playerRef } from '../player/playerRuntime';
import { HeatHazeEffect } from './HeatHazeEffect';
import { SprintBlurEffect } from './SprintBlurEffect';

export interface PostChainProps {
  quality: QualitySettings;
  lighting: BiomeLighting;
  reducedMotion: boolean;
  /** The sun sphere, so god rays have an occludable source. */
  sunMesh: Mesh | null;
  /** Menus, dialogue and Photo Mode only. Never during play. */
  depthOfField: boolean;
  /** Amber Dunes only. */
  heatHaze: boolean;
  /** Top speed, used to normalise the sprint blur. */
  topSpeed: number;
}

export function PostChain({
  quality,
  lighting,
  reducedMotion,
  sunMesh,
  depthOfField,
  heatHaze,
  topSpeed,
}: PostChainProps): React.ReactElement {
  const sprintBlur = useMemo(() => new SprintBlurEffect(6), []);
  const haze = useMemo(() => new HeatHazeEffect(), []);
  const aberration = useMemo(() => new Vector2(0.0006, 0.0006), []);

  useEffect(() => {
    return () => {
      sprintBlur.dispose();
      haze.dispose();
    };
  }, [sprintBlur, haze]);

  const hazeStrength = heatHaze && quality.heatHaze && !reducedMotion ? 0.0016 : 0;
  useEffect(() => {
    haze.strength = hazeStrength;
  }, [haze, hazeStrength]);

  const blurEnabled = quality.motionBlur && !reducedMotion;
  useFrame(() => {
    if (!blurEnabled) {
      sprintBlur.strength = 0;
      return;
    }
    // Ramps in over the top third of the speed range, so ordinary running
    // stays completely clean and only a real sprint smears.
    const normalised = (playerRef.speed / Math.max(topSpeed, 0.001) - 0.66) / 0.34;
    sprintBlur.strength = Math.max(0, Math.min(1, normalised));
  });

  return (
    <EffectComposer
      multisampling={0}
      enableNormalPass={quality.aoNormalPass}
      // God rays render an extra internal pass and need the composer to keep
      // the previous frame's buffer, or their occlusion mask comes out wrong.
      autoClear={false}
      // Half-float so bloom and the sky's HDR values survive the round trip
      // instead of being clipped to 1.0 before the tone mapper ever sees them.
      frameBufferType={HalfFloatType}
    >
      {quality.ambientOcclusion ? (
        <SSAO
          blendFunction={BlendFunction.MULTIPLY}
          samples={quality.aoSamples}
          rings={4}
          /*
           * Intensity is a multiplier on the occlusion term, not a percentage.
           * An earlier pass had this at 22, which drove occlusion to full
           * across the whole frame: the scene multiplied to black and the only
           * thing left on screen was the god-ray glow. Around two is the range
           * where AO reads as contact shadow rather than as a bug.
           */
          intensity={2.2}
          radius={0.08}
          // In metres: big enough to darken the crease where a trunk meets the
          // ground, small enough not to halo the whole tree.
          worldDistanceThreshold={1.0}
          worldDistanceFalloff={0.4}
          worldProximityThreshold={0.4}
          worldProximityFalloff={0.1}
          luminanceInfluence={0.55}
          bias={0.025}
          fade={0.02}
        />
      ) : (
        <></>
      )}

      {quality.godRays && sunMesh !== null ? (
        /*
         * Tuned down hard after comparing the Ultra and High screenshots side
         * by side: Ultra was the milkier, flatter image of the two, which is
         * the wrong way round for the top preset.
         *
         * The cause is screen blending with an unclamped maximum. When the sun
         * sits behind the camera -- which is most of the time, since the
         * shafts are worth having at dawn precisely when the light is raking
         * from behind you -- the effect has no visible source to radiate from
         * and lays a flat veil over the whole frame instead. Clamping the
         * maximum well below one keeps the shafts where the sun actually is
         * and costs nothing anywhere else.
         */
        <GodRays
          sun={sunMesh}
          blendFunction={BlendFunction.SCREEN}
          samples={quality.godRaySamples}
          density={0.92}
          decay={0.94}
          weight={0.22 * lighting.volumetricStrength}
          exposure={0.26 * lighting.volumetricStrength}
          clampMax={0.55}
          blur
        />
      ) : (
        <></>
      )}

      {hazeStrength > 0 ? <primitive object={haze} /> : <></>}

      {quality.bloom ? (
        <Bloom
          // Threshold at 1.0: only genuinely over-bright things bloom. Lower
          // and the whole image gets a soft glaze, which reads as cheap.
          luminanceThreshold={1.0}
          luminanceSmoothing={0.28}
          intensity={lighting.bloomIntensity}
          mipmapBlur
          radius={0.62}
        />
      ) : (
        <></>
      )}

      {blurEnabled ? <primitive object={sprintBlur} /> : <></>}

      {quality.antialias === 'smaa' ? <SMAA /> : <></>}

      {depthOfField ? (
        <DepthOfField focusDistance={0.012} focalLength={0.05} bokehScale={3.2} height={480} />
      ) : (
        <></>
      )}

      {quality.grain && !reducedMotion ? (
        <Noise opacity={0.015} blendFunction={BlendFunction.OVERLAY} premultiply />
      ) : (
        <></>
      )}

      {quality.chromaticAberration && !reducedMotion ? (
        <ChromaticAberration
          offset={aberration}
          radialModulation
          modulationOffset={0.42}
          blendFunction={BlendFunction.NORMAL}
        />
      ) : (
        <></>
      )}

      {quality.vignette ? <Vignette offset={0.32} darkness={0.25} eskil={false} /> : <></>}
    </EffectComposer>
  );
}
