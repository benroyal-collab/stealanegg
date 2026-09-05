/**
 * The audio director.
 *
 * One place that decides what is heard: the biome's ambient bed, the
 * footstep material, and the dynamic chase layer that fades in when a
 * guardian notices you and resolves when you get away.
 *
 * Crucially, this is also the only path a sound can take to the speakers, and
 * it pushes a caption for every non-continuous cue on the way through. That
 * is how "every audio cue has a matching visual cue" stays true at runtime
 * rather than only in a test.
 */

import { BIOME_DEFS } from '../../data/biomes';
import type { BiomeId } from '../../sim/types';
import { CUES, type CueId } from './cues';
import { playCue, Synth } from './synth';

export type ThreatLevel = 'calm' | 'alert' | 'chase';

export interface CaptionSink {
  (icon: string, text: string, seconds: number): void;
}

export class AudioDirector {
  private readonly synth = new Synth();
  private caption: CaptionSink | null = null;

  private biome: BiomeId | null = null;
  private bed: { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null =
    null;
  private chaseGain: GainNode | null = null;
  private chaseOscillators: OscillatorNode[] = [];

  private threat: ThreatLevel = 'calm';
  private wildlifeTimer = 0;
  private footstepTimer = 0;
  private variation = 0;
  private muted = false;

  attachCaptions(sink: CaptionSink | null): void {
    this.caption = sink;
  }

  /** Must be called from a user gesture. */
  unlock(): void {
    this.synth.start();
    this.synth.resume();
  }

  get ready(): boolean {
    return this.synth.ready;
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.muted = master <= 0.001;
    this.synth.setVolumes(master, music, sfx);
  }

  /**
   * Play a cue, and caption it.
   *
   * Continuous cues (footsteps, coins) are captioned only in the sense that
   * they are declared with text -- pushing one on every footstep would make
   * the caption track unreadable, which would defeat the purpose.
   */
  play(id: CueId, variation = 0): void {
    const cue = CUES[id];
    playCue(this.synth, id, variation);
    if (!cue.continuous) this.caption?.(cue.icon, cue.caption, cue.seconds);
  }

  /** Switch the ambient bed when the player travels. */
  setBiome(biome: BiomeId): void {
    if (this.biome === biome || !this.synth.ready) return;
    this.biome = biome;
    this.stopBed();
    this.startBed(biome);
  }

  /**
   * The chase layer.
   *
   * Fades in over 400ms on alert, sits under the ambience during a chase, and
   * resolves over a full second on escape. The slow resolve matters: a sting
   * that cuts off the instant you break line of sight makes the escape feel
   * like a switch rather than an achievement.
   */
  setThreat(level: ThreatLevel): void {
    if (level === this.threat) return;
    const previous = this.threat;
    this.threat = level;

    const context = this.synth.ctx;
    const buses = this.synth.buses;
    if (context === null || buses === null) return;

    if (this.chaseGain === null) {
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(buses.music);
      this.chaseGain = gain;

      // Two detuned saw voices a fifth apart: enough to read as "urgent"
      // without being remotely frightening.
      for (const [frequency, detune] of [
        [110, -6],
        [164.81, 6],
      ] as const) {
        const osc = context.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = frequency;
        osc.detune.value = detune;
        const voice = context.createBiquadFilter();
        voice.type = 'lowpass';
        voice.frequency.value = 620;
        osc.connect(voice).connect(gain);
        osc.start();
        this.chaseOscillators.push(osc);
      }
    }

    const now = context.currentTime;
    const target = level === 'chase' ? 0.13 : level === 'alert' ? 0.055 : 0;
    const time = level === 'calm' ? 1.0 : 0.4;
    this.chaseGain.gain.cancelScheduledValues(now);
    this.chaseGain.gain.setValueAtTime(this.chaseGain.gain.value, now);
    this.chaseGain.gain.linearRampToValueAtTime(target, now + time);

    if (level === 'chase' && previous !== 'chase') this.play('guardian-chase');
    if (level === 'calm' && previous === 'chase') this.play('guardian-giveup');
  }

  /** Per-frame: wildlife one-shots and footsteps. */
  update(
    dt: number,
    context: {
      readonly gait: 'idle' | 'crouch' | 'walk' | 'sprint';
      readonly speed: number;
      readonly inWater: boolean;
      readonly biome: BiomeId;
    },
  ): void {
    if (!this.synth.ready || this.muted) return;

    // --- wildlife --------------------------------------------------------
    const ambience = BIOME_DEFS[context.biome].ambience;
    this.wildlifeTimer -= dt;
    if (this.wildlifeTimer <= 0) {
      const [low, high] = ambience.wildlifeIntervalSeconds;
      this.wildlifeTimer = low + Math.random() * (high - low);
      const [pitchLow, pitchHigh] = ambience.wildlifePitch;
      this.synth.tone(pitchLow + Math.random() * (pitchHigh - pitchLow), 0.16, {
        type: 'sine',
        gain: 0.06,
        channel: 'ambience',
        sweepTo: pitchLow * 1.3,
      });
    }

    // --- footsteps -------------------------------------------------------
    if (context.gait === 'idle' || context.speed < 0.4) {
      this.footstepTimer = 0;
      return;
    }
    // Step rate follows speed, so a sprint patters and a crouch creeps.
    const interval = context.gait === 'sprint' ? 0.28 : context.gait === 'crouch' ? 0.62 : 0.42;
    this.footstepTimer -= dt;
    if (this.footstepTimer > 0) return;
    this.footstepTimer = interval;
    this.variation = (this.variation + 1) % 4;

    const material: CueId = context.inWater
      ? 'footstep-water'
      : context.biome === 'dunes'
        ? 'footstep-sand'
        : 'footstep-grass';
    this.play(material, this.variation);
  }

  dispose(): void {
    this.stopBed();
    for (const osc of this.chaseOscillators) osc.stop();
    this.chaseOscillators = [];
    this.chaseGain = null;
  }

  /**
   * The ambient bed: filtered noise for wind, plus a low drone.
   *
   * Each biome moves the filter and the drone, which is enough to make the
   * three of them sound like different places without any recorded audio.
   */
  private startBed(biome: BiomeId): void {
    const context = this.synth.ctx;
    const buses = this.synth.buses;
    if (context === null || buses === null) return;

    const def = BIOME_DEFS[biome].ambience;

    const length = context.sampleRate * 4;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 991;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x3fffffff - 1) * 0.5;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = def.bedFrequency;
    filter.Q.value = def.bedQ;

    const gain = context.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(def.windLevel, context.currentTime + 2);

    source.connect(filter).connect(gain).connect(buses.ambience);
    source.start();

    this.bed = { source, gain, filter };
  }

  private stopBed(): void {
    if (this.bed === null) return;
    try {
      this.bed.source.stop();
    } catch {
      // Already stopped; nothing to do.
    }
    this.bed = null;
  }
}

export const audioDirector = new AudioDirector();
