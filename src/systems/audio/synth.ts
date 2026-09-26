/**
 * Every sound in the game, synthesised.
 *
 * No audio file is fetched, which is what makes the zero-third-party-network
 * guarantee provable. It also means a footstep costs a few oscillator nodes
 * rather than a download, and that the whole soundscape can be retuned by
 * changing numbers.
 *
 * Two hard rules baked in:
 *  - Nothing is louder than it needs to be. Everything routes through a
 *    master limiter so a stacked burst can never spike.
 *  - Nothing plays until the player has interacted with the page. Browsers
 *    require that anyway, and a game that makes noise before you press Play
 *    is a game a parent turns off.
 */

import type { CueId } from './cues';

export interface AudioChannels {
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
  ambience: GainNode;
}

export class Synth {
  private context: AudioContext | null = null;
  private channels: AudioChannels | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private started = false;

  /** Called from a real user gesture. Browsers will not start audio without one. */
  start(): void {
    if (this.started) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) return;

    this.started = true;
    const context = new Ctor();
    this.context = context;

    const master = context.createGain();
    master.gain.value = 0.8;

    // A gentle limiter, so a hatch chime landing on top of a chase sting can
    // never produce a spike. Children often play with the volume up.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 12;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;

    master.connect(limiter).connect(context.destination);

    const make = (value: number): GainNode => {
      const gain = context.createGain();
      gain.gain.value = value;
      gain.connect(master);
      return gain;
    };

    this.channels = { master, sfx: make(0.9), music: make(0.5), ambience: make(0.45) };
    this.noiseBuffer = this.buildNoise(context);
  }

  resume(): void {
    void this.context?.resume();
  }

  setVolumes(master: number, music: number, sfx: number): void {
    if (this.channels === null) return;
    this.channels.master.gain.value = master;
    this.channels.music.gain.value = music * 0.62;
    this.channels.sfx.gain.value = sfx;
    this.channels.ambience.gain.value = master * 0.5;
  }

  get ready(): boolean {
    return this.context !== null && this.channels !== null;
  }

  get ctx(): AudioContext | null {
    return this.context;
  }

  get buses(): AudioChannels | null {
    return this.channels;
  }

  /** Two seconds of white noise, reused by every percussive sound. */
  private buildNoise(context: AudioContext): AudioBuffer {
    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < length; i++) {
      // Deterministic, so a footstep sounds the same on every machine.
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x3fffffff - 1) * 0.5;
    }
    return buffer;
  }

  /** A pitched blip: the workhorse behind most UI and pickup sounds. */
  tone(
    frequency: number,
    duration: number,
    options: {
      type?: OscillatorType;
      gain?: number;
      channel?: keyof Omit<AudioChannels, 'master'>;
      sweepTo?: number;
      delay?: number;
    } = {},
  ): void {
    const context = this.context;
    const channels = this.channels;
    if (context === null || channels === null) return;

    const now = context.currentTime + (options.delay ?? 0);
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(frequency, now);
    if (options.sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.sweepTo), now + duration);
    }

    // A 6ms attack instead of an instant one: a hard start clicks, and a
    // click is the most fatiguing sound a game can make.
    const peak = options.gain ?? 0.25;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain).connect(channels[options.channel ?? 'sfx']);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** Filtered noise: footsteps, rustles, splashes, wind. */
  noise(
    duration: number,
    options: {
      frequency?: number;
      q?: number;
      gain?: number;
      type?: BiquadFilterType;
      channel?: keyof Omit<AudioChannels, 'master'>;
      sweepTo?: number;
    } = {},
  ): void {
    const context = this.context;
    const channels = this.channels;
    if (context === null || channels === null || this.noiseBuffer === null) return;

    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const filter = context.createBiquadFilter();
    filter.type = options.type ?? 'bandpass';
    filter.frequency.setValueAtTime(options.frequency ?? 900, now);
    if (options.sweepTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, options.sweepTo), now + duration);
    }
    filter.Q.value = options.q ?? 1.2;

    const gain = context.createGain();
    const peak = options.gain ?? 0.2;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source
      .connect(filter)
      .connect(gain)
      .connect(channels[options.channel ?? 'sfx']);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  /** A short arpeggio. Used for anything celebratory. */
  arpeggio(root: number, intervals: readonly number[], step = 0.075, gain = 0.2): void {
    intervals.forEach((semitones, i) => {
      this.tone(root * Math.pow(2, semitones / 12), 0.28, {
        type: 'triangle',
        gain,
        delay: i * step,
      });
    });
  }
}

/** How each cue is actually made. One place, so the palette stays coherent. */
export function playCue(synth: Synth, id: CueId, variation = 0): void {
  if (!synth.ready) return;

  switch (id) {
    case 'egg-grab':
      synth.tone(520, 0.16, { type: 'triangle', gain: 0.22, sweepTo: 760 });
      break;
    case 'egg-recover':
      // Brighter and more triumphant than the first pickup. Getting it back
      // is the better story.
      synth.arpeggio(587, [0, 5, 9], 0.06, 0.2);
      break;
    case 'chase-start': {
      /*
       * The alarm. A squawk plus a rising interval -- loud and startling on
       * purpose, but comic rather than frightening: this is a cross bird, not
       * a threat. Nothing in this game hurts anybody.
       */
      synth.noise(0.12, { frequency: 1400, q: 1.1, gain: 0.3, type: 'bandpass' });
      synth.tone(180, 0.3, { type: 'sawtooth', gain: 0.2, sweepTo: 320 });
      break;
    }
    case 'egg-drop':
      synth.tone(360, 0.18, { type: 'sine', gain: 0.16, sweepTo: 240 });
      break;
    case 'egg-deposit':
      synth.arpeggio(392, [0, 4, 7], 0.07, 0.18);
      break;
    case 'egg-hatch':
      // A crack, then the chime. The crack is what makes it land.
      synth.noise(0.09, { frequency: 2600, q: 2.4, gain: 0.28, type: 'highpass' });
      synth.arpeggio(523, [0, 4, 7, 12], 0.08, 0.22);
      break;
    case 'egg-respawn':
      synth.tone(880, 0.12, { type: 'sine', gain: 0.1, sweepTo: 1180 });
      break;
    case 'coin':
      synth.tone(1180 + variation * 40, 0.07, { type: 'square', gain: 0.05 });
      break;
    case 'upgrade':
      synth.arpeggio(330, [0, 5, 9, 12], 0.06, 0.2);
      break;
    case 'discovery':
      synth.arpeggio(440, [0, 4, 7, 11, 16], 0.09, 0.2);
      break;
    case 'fuse':
      synth.tone(220, 0.5, { type: 'sawtooth', gain: 0.14, sweepTo: 660 });
      synth.arpeggio(660, [0, 7, 12], 0.09, 0.16);
      break;
    case 'guardian-alert':
      synth.tone(660, 0.14, { type: 'square', gain: 0.14 });
      synth.tone(880, 0.16, { type: 'square', gain: 0.12, delay: 0.13 });
      break;
    case 'guardian-giveup':
      synth.tone(400, 0.4, { type: 'sine', gain: 0.13, sweepTo: 230, channel: 'music' });
      break;
    case 'guardian-drowsy':
      synth.tone(300, 0.7, { type: 'sine', gain: 0.14, sweepTo: 150 });
      break;
    case 'caught':
      // Comic, never alarming: a descending honk and a soft thud.
      synth.tone(300, 0.26, { type: 'square', gain: 0.18, sweepTo: 130 });
      synth.noise(0.2, { frequency: 180, q: 0.7, gain: 0.22, type: 'lowpass' });
      break;
    case 'rival-target':
      synth.tone(500, 0.12, { type: 'triangle', gain: 0.1 });
      synth.tone(620, 0.12, { type: 'triangle', gain: 0.1, delay: 0.1 });
      break;
    case 'rival-claim':
      synth.tone(420, 0.2, { type: 'triangle', gain: 0.12, sweepTo: 300 });
      break;
    case 'tool-throw':
      synth.noise(0.14, { frequency: 1600, q: 0.9, gain: 0.14, sweepTo: 700 });
      break;
    case 'tool-land':
      synth.noise(0.22, { frequency: 900, q: 1.6, gain: 0.16 });
      break;
    case 'footstep-grass':
      synth.noise(0.075, { frequency: 1500 + variation * 260, q: 1.1, gain: 0.055 });
      break;
    case 'footstep-stone':
      synth.noise(0.055, { frequency: 2400 + variation * 320, q: 2.1, gain: 0.06 });
      break;
    case 'footstep-water':
      synth.noise(0.16, { frequency: 700 + variation * 180, q: 0.8, gain: 0.1, sweepTo: 1900 });
      break;
    case 'footstep-sand':
      synth.noise(0.09, { frequency: 900 + variation * 160, q: 0.6, gain: 0.055 });
      break;
    case 'jump':
      synth.tone(420, 0.1, { type: 'sine', gain: 0.1, sweepTo: 640 });
      break;
    case 'land':
      synth.noise(0.09, { frequency: 320, q: 0.8, gain: 0.1, type: 'lowpass' });
      break;
    case 'vault':
      synth.noise(0.16, { frequency: 1100, q: 0.9, gain: 0.1, sweepTo: 500 });
      break;
    case 'slide':
      synth.noise(0.42, { frequency: 1800, q: 0.7, gain: 0.09, sweepTo: 420 });
      break;
    case 'splash':
      synth.noise(0.26, { frequency: 600, q: 0.7, gain: 0.16, sweepTo: 2400 });
      break;
    case 'biome-unlock':
      synth.arpeggio(392, [0, 4, 7, 12, 16, 19], 0.1, 0.2);
      break;
    case 'ui-open':
      synth.tone(700, 0.07, { type: 'sine', gain: 0.08 });
      break;
    case 'ui-close':
      synth.tone(520, 0.07, { type: 'sine', gain: 0.08 });
      break;
    case 'ui-confirm':
      synth.arpeggio(600, [0, 7], 0.05, 0.12);
      break;
    case 'ui-deny':
      synth.tone(280, 0.16, { type: 'triangle', gain: 0.11, sweepTo: 220 });
      break;
    case 'photo-shutter':
      synth.noise(0.05, { frequency: 3200, q: 3, gain: 0.16, type: 'highpass' });
      break;
    default:
      break;
  }
}
