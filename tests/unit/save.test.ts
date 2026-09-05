import { describe, expect, it } from 'vitest';
import { defaultSave, deserialise, migrate, serialise } from '../../src/sim/save';

describe('save schema', () => {
  it('round-trips a default save exactly', () => {
    const save = defaultSave(1_700_000_000_000);
    const back = deserialise(serialise(save), 1_700_000_000_000);
    expect(back).toEqual(save);
  });

  it('round-trips a populated save exactly', () => {
    const save = defaultSave(1_700_000_000_000);
    save.money = 12_345.5;
    save.upgrades.trainingTrack = 7;
    save.upgrades.habitatSlots = 3;
    save.pace = 9.5;
    save.unlockedBiomes = ['glade', 'mirrormere'];
    save.currentBiome = 'mirrormere';
    save.discovered = ['mossling', 'reedskipper'];
    save.creatures = [
      {
        uid: 'c1',
        speciesId: 'mossling',
        rarity: 'common',
        mutation: 'golden',
        size: 'big',
        slot: 0,
      },
      {
        uid: 'c2',
        speciesId: 'glasscarp',
        rarity: 'uncommon',
        mutation: 'none',
        size: 'tiny',
        slot: null,
      },
    ];
    save.incubator = {
      roll: { speciesId: 'pipfinch', rarity: 'common', mutation: 'prism', size: 'huge' },
      remaining: 12.25,
      total: 30,
    };
    save.stats = { eggsRecovered: 9, timesCaught: 2, racesLost: 1 };

    const back = deserialise(serialise(save), 1_700_000_000_000);
    expect(back).toEqual(save);
  });

  it('recovers from a corrupt blob instead of throwing', () => {
    expect(deserialise('not json at all', 1).version).toBe(1);
    expect(migrate(null, 1).money).toBe(0);
    expect(migrate('nonsense', 1).creatures).toEqual([]);
  });

  it('drops malformed creature entries rather than the whole save', () => {
    const result = migrate(
      {
        version: 1,
        money: 50,
        creatures: [
          {
            uid: 'ok',
            speciesId: 'mossling',
            rarity: 'common',
            mutation: 'none',
            size: 'normal',
            slot: 1,
          },
          {
            uid: 'bad',
            speciesId: 'mossling',
            rarity: 'not-a-rarity',
            mutation: 'none',
            size: 'normal',
          },
          'garbage',
          null,
        ],
      },
      1,
    );
    expect(result.money).toBe(50);
    expect(result.creatures).toHaveLength(1);
    expect(result.creatures[0]?.uid).toBe('ok');
  });

  it('refuses a save from a future version and starts clean', () => {
    const result = migrate({ version: 99, money: 999_999 }, 1);
    expect(result.version).toBe(1);
    expect(result.money).toBe(0);
  });

  it('clamps out-of-range settings into legal values', () => {
    const result = migrate(
      {
        version: 1,
        settings: { uiScale: 12, masterVolume: -4, difficulty: 'impossible', exposure: 99 },
      },
      1,
    );
    expect(result.settings.uiScale).toBe(1.5);
    expect(result.settings.masterVolume).toBe(0.8);
    expect(result.settings.difficulty).toBe('standard');
    expect(result.settings.exposure).toBe(1.8);
  });

  it('recomputes pace from upgrades rather than trusting the stored value', () => {
    const result = migrate({ version: 1, pace: 9999, upgrades: { trainingTrack: 4 } }, 1);
    expect(result.pace).toBe(8);
    expect(result.unlockedBiomes).toEqual(['glade']);
  });
});
