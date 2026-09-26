/**
 * Connects the audio director to React.
 *
 * Three jobs: unlock the audio context on the player's first gesture (browsers
 * require it, and a game that makes noise before you press Play is a game a
 * parent turns off), keep the volume settings in sync, and give the director
 * somewhere to push its captions.
 */

import { useEffect } from 'react';
import { audioDirector } from '../systems/audio/director';
import { useGame } from '../state/store';

export function AudioBridge(): null {
  const settings = useGame((s) => s.save.settings);
  const biome = useGame((s) => s.save.currentBiome);
  const phase = useGame((s) => s.phase);
  const caption = useGame((s) => s.caption);

  useEffect(() => {
    audioDirector.attachCaptions((icon, text, seconds, urgent) =>
      caption(icon, text, seconds, urgent),
    );
    return () => audioDirector.attachCaptions(null);
  }, [caption]);

  useEffect(() => {
    const unlock = (): void => {
      audioDirector.unlock();
      audioDirector.setVolumes(settings.masterVolume, settings.musicVolume, settings.sfxVolume);
      audioDirector.setBiome(biome);
    };
    // Any of these counts as the gesture browsers want.
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, [settings.masterVolume, settings.musicVolume, settings.sfxVolume, biome]);

  useEffect(() => {
    audioDirector.setVolumes(settings.masterVolume, settings.musicVolume, settings.sfxVolume);
  }, [settings.masterVolume, settings.musicVolume, settings.sfxVolume]);

  useEffect(() => {
    if (phase === 'playing') audioDirector.setBiome(biome);
  }, [biome, phase]);

  // Everything goes quiet while paused. A menu that keeps a chase sting
  // playing underneath it is genuinely stressful.
  useEffect(() => {
    if (phase === 'paused') audioDirector.setThreat('calm');
  }, [phase]);

  return null;
}
