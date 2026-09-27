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
  (icon: string, text: string, seconds: number, urgent: boolean): void;
}

export class AudioDirector {
  private readonly synth = new Synth();
  private caption: CaptionSink | null = null;

  private biome: BiomeId | null = null;
  private bed: { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null =
    null;
  private chaseGain: GainNode | null = null;
  private chaseOscillators: OscillatorNode[] = [];
  /** The night's low dread drone, which swells as a guardian closes in. */
  private drone: { oscillators: OscillatorNode[]; gain: GainNode } | null = null;
  private heartTimer = 0;

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
    if (!cue.continuous) this.caption?.(cue.icon, cue.caption, cue.seconds, cue.urgent === true);
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

      // A low cluster -- a root, a minor second rubbing against it and a
      // tritone over both. The film-score chord for "something is behind
      // you": tense and unresolved, never loud.
      for (const [frequency, detune] of [
        [110, -6],
        [116.54, 4],
        [155.56, 6],
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

    // No sting here on entering a chase: the loop's `chaseStarted` event plays
    // 'chase-start' for that moment. Both used to fire, which put two sounds
    // and two captions -- "spotted you" and "chasing you" -- on one event.
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
      /**
       * One-shot movement verbs, true only on the frame they happen.
       *
       * These cues were written, synthesised and registered months ago and
       * then never played by anything: jumping, landing, vaulting and sliding
       * were all completely silent. A jump that makes no sound does not feel
       * like a jump, and it is the cheapest polish in any game.
       */
      readonly jumped: boolean;
      readonly landed: boolean;
      readonly vaulted: boolean;
      readonly slid: boolean;
      /** How close the nearest pursuer is, 0..1. Drives the chase mix. */
      readonly pursuitPressure: number;
    },
  ): void {
    if (!this.synth.ready || this.muted) return;

    if (context.jumped) this.play('jump');
    if (context.vaulted) this.play('vault');
    if (context.slid) this.play('slide');
    if (context.landed) this.play(context.inWater ? 'splash' : 'land');

    /*
     * Wind rush.
     *
     * Speed is sold at least as much through the ears as the eyes, and this
     * game had nothing: sprinting sounded exactly like standing still, which
     * is half of why it read as ponderous. Filtered noise whose level and
     * brightness both rise with speed, plus a lift under pursuit so a chase
     * is audibly more frantic than an errand.
     */
    const rush = Math.min(1, context.speed / 7) ** 1.6;
    const chased = Math.min(1, context.pursuitPressure);
    this.setWind(rush * (0.55 + chased * 0.45));
    this.setDread(chased);

    /*
     * The heartbeat, under pursuit only, quickening as the guardian closes.
     * Same rate as the vignette's pulse (`NightGradeEffect`), so what you
     * hear and what you see beat together.
     */
    if (chased > 0.12) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        this.heartTimer = 1 / (1.1 + 0.8 * chased);
        this.play('heartbeat');
      }
    } else {
      this.heartTimer = 0;
    }

    // --- wildlife --------------------------------------------------------
    const ambience = BIOME_DEFS[context.biome].ambience;
    this.wildlifeTimer -= dt;
    if (this.wildlifeTimer <= 0) {
      const [low, high] = ambience.wildlifeIntervalSeconds;
      this.wildlifeTimer = low + Math.random() * (high - low);
      this.nightCall(ambience.nightCall);
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

  /** Something calls out of the dark, a long way off. */
  private nightCall(call: 'owl' | 'loon' | 'howl'): void {
    const options = { type: 'sine' as const, channel: 'ambience' as const };
    const drift = 0.94 + Math.random() * 0.12;
    switch (call) {
      case 'owl':
        // Hoo -- hoo-hoo.
        this.synth.tone(392 * drift, 0.3, { ...options, gain: 0.05, sweepTo: 350 * drift });
        this.synth.tone(330 * drift, 0.45, {
          ...options,
          gain: 0.045,
          sweepTo: 300 * drift,
          delay: 0.5,
        });
        this.synth.tone(330 * drift, 0.35, {
          ...options,
          gain: 0.04,
          sweepTo: 305 * drift,
          delay: 1.05,
        });
        break;
      case 'loon':
        // A rising wail across the water, and a falling answer.
        this.synth.tone(600 * drift, 1.3, { ...options, gain: 0.03, sweepTo: 900 * drift });
        this.synth.tone(900 * drift, 1.2, {
          ...options,
          gain: 0.026,
          sweepTo: 680 * drift,
          delay: 1.25,
        });
        break;
      case 'howl':
        // Far off, and more felt than heard.
        this.synth.tone(290 * drift, 1.8, { ...options, gain: 0.026, sweepTo: 510 * drift });
        this.synth.tone(510 * drift, 1.6, {
          ...options,
          gain: 0.022,
          sweepTo: 360 * drift,
          delay: 1.7,
        });
        break;
    }
  }

  /** The drone rises under pursuit: the sound of the dark getting closer. */
  private setDread(pressure: number): void {
    const drone = this.drone;
    const context = this.synth.ctx;
    if (drone === null || context === null) return;
    const now = context.currentTime;
    const gain = drone.gain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(DRONE_LEVEL * (1 + pressure * 2.4), now + 0.1);
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
  /**
   * Ride the ambient bed with the player's speed.
   *
   * Reuses the bed rather than adding a second noise source: opening the
   * bandpass and lifting the gain turns the same wind from "a quiet meadow"
   * into "air going past your ears" for the cost of two parameter ramps a
   * frame. Ramped rather than set, or it clicks.
   */
  private setWind(amount: number): void {
    const bed = this.bed;
    const context = this.synth.ctx;
    if (bed === null || context === null || this.biome === null) return;

    const def = BIOME_DEFS[this.biome].ambience;
    const now = context.currentTime;

    /*
     * Re-anchor before ramping.
     *
     * `startBed` schedules a two-second fade-in, and a bare
     * `linearRampToValueAtTime` continues from the last *scheduled* value
     * rather than the current one -- so the first frame of movement after
     * entering a biome would yank the gain to full and the wind would pop in.
     * Cancelling and pinning the live value makes each frame's ramp start
     * from what is actually being heard.
     */
    const gain = bed.gain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(def.windLevel * (1 + amount * 2.6), now + 0.08);

    // Brighter as it rises: real wind noise gains high end with speed.
    const cutoff = bed.filter.frequency;
    cutoff.cancelScheduledValues(now);
    cutoff.setValueAtTime(cutoff.value, now);
    cutoff.linearRampToValueAtTime(def.bedFrequency * (1 + amount * 1.5), now + 0.08);
  }

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

    /*
     * Under the wind, a drone: two low sines a tritone apart, rubbing. Not a
     * tune and not loud -- just the sense, all night, that the wood is not
     * quite empty.
     */
    const droneGain = context.createGain();
    droneGain.gain.value = 0;
    droneGain.gain.linearRampToValueAtTime(DRONE_LEVEL, context.currentTime + 4);
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 240;
    lowpass.connect(droneGain).connect(buses.ambience);
    const oscillators = [49, 69.3].map((frequency) => {
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      osc.connect(lowpass);
      osc.start();
      return osc;
    });
    this.drone = { oscillators, gain: droneGain };
  }

  private stopBed(): void {
    if (this.drone !== null) {
      for (const osc of this.drone.oscillators) {
        try {
          osc.stop();
        } catch {
          // Already stopped.
        }
      }
      this.drone = null;
    }
    if (this.bed === null) return;
    try {
      this.bed.source.stop();
    } catch {
      // Already stopped; nothing to do.
    }
    this.bed = null;
  }
}

/** Resting level of the night drone, before pursuit swells it. */
const DRONE_LEVEL = 0.05;

export const audioDirector = new AudioDirector();
