import { describe, expect, it } from 'vitest';
import { CUES, CUE_IDS, type CueId } from '../../src/systems/audio/cues';

/**
 * The M7 gate.
 *
 * "Every meaningful audio cue must also exist as a visual cue" is an
 * accessibility requirement, and this is where it stops being a promise. The
 * test walks the whole registry: a sound added without a caption fails the
 * build, not a review.
 */

describe('audio cue registry', () => {
  it('has a caption for every single cue', () => {
    for (const id of CUE_IDS) {
      const cue = CUES[id];
      expect(cue.caption, `${id} has no caption`).toBeTruthy();
      expect(cue.caption.trim().length, `${id}'s caption is empty`).toBeGreaterThan(3);
    }
  });

  it('has an icon for every caption, so no caption is text alone', () => {
    for (const id of CUE_IDS) {
      expect(CUES[id].icon, `${id} has no icon`).toBeTruthy();
    }
  });

  it('keeps captions short enough to read before they vanish', () => {
    for (const id of CUE_IDS) {
      const cue = CUES[id];
      // Roughly 15 characters a second is a comfortable reading rate for a
      // child; anything denser than that is on screen too briefly to help.
      const readable = cue.caption.length / 15;
      expect(
        cue.seconds,
        `${id}'s caption is on screen too briefly to read`,
      ).toBeGreaterThanOrEqual(Math.min(readable, 4));
    }
  });

  it('writes captions at a reading age of about eight', () => {
    for (const id of CUE_IDS) {
      const caption = CUES[id].caption;
      const words = caption.split(/\s+/);
      expect(words.length, `${id}'s caption is a paragraph, not a caption`).toBeLessThanOrEqual(12);
      // No jargon. These are the words a spec writer reaches for and a child
      // does not.
      for (const banned of ['detected', 'aggro', 'entity', 'initiate', 'proximity', 'threshold']) {
        expect(caption.toLowerCase(), `${id} uses jargon: ${banned}`).not.toContain(banned);
      }
    }
  });

  it('declares a channel for every cue so volume settings actually apply', () => {
    for (const id of CUE_IDS) {
      expect(['sfx', 'music', 'ambience']).toContain(CUES[id].channel);
    }
  });

  it('marks the high-frequency cues as continuous', () => {
    // Footsteps and coins fire many times a second. Pushing each one to the
    // caption track would make it unreadable and drown the cues that matter.
    const mustBeContinuous: CueId[] = [
      'footstep-grass',
      'footstep-stone',
      'footstep-water',
      'footstep-sand',
      'coin',
      'jump',
      'land',
    ];
    for (const id of mustBeContinuous) {
      expect(CUES[id].continuous, `${id} should be continuous`).toBe(true);
    }
  });

  it('captions every cue that a player could miss without sound', () => {
    // The inverse check: anything that communicates game state must NOT be
    // continuous, or its caption never reaches the screen.
    const mustBeCaptioned: CueId[] = [
      'guardian-alert',
      'guardian-chase',
      'guardian-giveup',
      'caught',
      'egg-hatch',
      'rival-target',
      'rival-claim',
      'discovery',
      'biome-unlock',
      'ui-deny',
    ];
    for (const id of mustBeCaptioned) {
      expect(CUES[id].continuous, `${id} must reach the caption track`).toBe(false);
    }
  });

  it('has no duplicate captions, so two different events never read the same', () => {
    const captions = CUE_IDS.filter((id) => !CUES[id].continuous).map((id) => CUES[id].caption);
    expect(new Set(captions).size).toBe(captions.length);
  });

  it('registers every id exactly once and consistently', () => {
    for (const id of CUE_IDS) {
      expect(CUES[id].id, `${id} is registered under the wrong key`).toBe(id);
    }
  });
});
