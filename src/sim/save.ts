/**
 * Save schema, versioning and migration.
 *
 * The save lives in localStorage and nowhere else. It never leaves the
 * device, it contains no personal information, and the Parent Panel can
 * export or wipe it at any time.
 *
 * `migrate()` takes any historical shape and returns a current SaveV1. When
 * a v2 arrives, add a branch -- never mutate the v1 reader.
 */

import { ECONOMY, MOVEMENT, TOOL_DEFS } from '../data/balance';
import { computePace, unlockedBiomesForPace } from './economy';
import type { GameSettings, SaveV1, ToolId, UpgradeId } from './types';
import { BIOMES, DIFFICULTIES, MUTATIONS, RARITIES, SIZES } from './types';

export const SAVE_KEY = 'egg-heist-wildlands/save';
export const CURRENT_SAVE_VERSION = 1;

export const DEFAULT_BINDINGS: Record<string, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  jump: 'Space',
  crouch: 'ControlLeft',
  interact: 'KeyE',
  tool: 'KeyQ',
  photo: 'KeyP',
  menu: 'Escape',
  perf: 'F3',
};

export function defaultSettings(): GameSettings {
  return {
    difficulty: 'standard',
    quality: 'auto',
    reducedMotion: false,
    colourblind: 'off',
    captions: true,
    uiScale: 1,
    masterVolume: 0.8,
    musicVolume: 0.55,
    sfxVolume: 0.9,
    holdToSprint: true,
    holdToCrouch: true,
    invertY: false,
    lookSensitivity: 1,
    cameraShake: true,
    exposure: 1,
    breakReminderMinutes: ECONOMY.breakReminderMinutes,
    bindings: { ...DEFAULT_BINDINGS },
  };
}

export function defaultSave(nowMs: number = Date.now()): SaveV1 {
  const upgrades: Record<UpgradeId, number> = {
    trainingTrack: 0,
    boots: 0,
    incubator: 0,
    habitatSlots: 0,
    fieldGuide: 0,
  };
  const tools: Record<ToolId, number> = {
    seedPouch: TOOL_DEFS.seedPouch.startingCount,
    sleepyBerries: TOOL_DEFS.sleepyBerries.startingCount,
    whistle: TOOL_DEFS.whistle.startingCount,
  };
  return {
    version: 1,
    money: ECONOMY.startingMoney,
    playSeconds: 0,
    lastSeenEpochMs: nowMs,
    pace: MOVEMENT.basePace,
    upgrades,
    creatures: [],
    incubator: null,
    discovered: [],
    unlockedBiomes: ['glade'],
    currentBiome: 'glade',
    tools,
    settings: defaultSettings(),
    tutorialStep: 0,
    stats: { eggsRecovered: 0, timesCaught: 0, racesLost: 0 },
  };
}

/**
 * Coerce an unknown blob into a valid SaveV1.
 *
 * This is defensive on purpose: the only way a bad save gets here is a
 * hand-edited localStorage entry or a version we no longer recognise, and
 * neither of those should ever cost a child their sanctuary. Anything
 * unreadable falls back to a default rather than throwing.
 */
export function migrate(raw: unknown, nowMs: number = Date.now()): SaveV1 {
  if (!isRecord(raw)) return defaultSave(nowMs);

  const version = typeof raw.version === 'number' ? raw.version : 0;
  if (version > CURRENT_SAVE_VERSION) {
    // A save from a newer build. Refuse to guess; start clean rather than
    // silently corrupting whatever the future added.
    return defaultSave(nowMs);
  }

  const base = defaultSave(nowMs);
  const upgrades = { ...base.upgrades };
  if (isRecord(raw.upgrades)) {
    for (const key of Object.keys(upgrades) as UpgradeId[]) {
      const v = raw.upgrades[key];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) upgrades[key] = Math.floor(v);
    }
  }

  const tools = { ...base.tools };
  if (isRecord(raw.tools)) {
    for (const key of Object.keys(tools) as ToolId[]) {
      const v = raw.tools[key];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) tools[key] = Math.floor(v);
    }
  }

  const creatures = Array.isArray(raw.creatures)
    ? raw.creatures.flatMap((c) => {
        const parsed = parseCreature(c);
        return parsed === null ? [] : [parsed];
      })
    : [];

  const pace = computePace(upgrades);

  return {
    version: 1,
    money: finite(raw.money, base.money, 0),
    playSeconds: finite(raw.playSeconds, 0, 0),
    lastSeenEpochMs: finite(raw.lastSeenEpochMs, nowMs, 0),
    pace,
    upgrades,
    creatures,
    incubator: parseIncubator(raw.incubator),
    discovered: Array.isArray(raw.discovered)
      ? raw.discovered.filter((d): d is string => typeof d === 'string')
      : [],
    unlockedBiomes: unlockedBiomesForPace(pace),
    currentBiome: isOneOf(raw.currentBiome, BIOMES) ? raw.currentBiome : 'glade',
    tools,
    settings: parseSettings(raw.settings),
    tutorialStep: Math.max(0, Math.floor(finite(raw.tutorialStep, 0, 0))),
    stats: {
      eggsRecovered: Math.floor(finite(isRecord(raw.stats) ? raw.stats.eggsRecovered : 0, 0, 0)),
      timesCaught: Math.floor(finite(isRecord(raw.stats) ? raw.stats.timesCaught : 0, 0, 0)),
      racesLost: Math.floor(finite(isRecord(raw.stats) ? raw.stats.racesLost : 0, 0, 0)),
    },
  };
}

function parseCreature(value: unknown): SaveV1['creatures'][number] | null {
  if (!isRecord(value)) return null;
  if (typeof value.speciesId !== 'string') return null;
  if (!isOneOf(value.rarity, RARITIES)) return null;
  if (!isOneOf(value.mutation, MUTATIONS)) return null;
  if (!isOneOf(value.size, SIZES)) return null;
  const slot = typeof value.slot === 'number' && Number.isFinite(value.slot) ? Math.floor(value.slot) : null;
  return {
    uid: typeof value.uid === 'string' ? value.uid : createUid(),
    speciesId: value.speciesId,
    rarity: value.rarity,
    mutation: value.mutation,
    size: value.size,
    slot: slot !== null && slot >= 0 ? slot : null,
  };
}

function parseIncubator(value: unknown): SaveV1['incubator'] {
  if (!isRecord(value) || !isRecord(value.roll)) return null;
  const roll = parseCreature({ ...value.roll, uid: 'x', slot: null });
  if (roll === null) return null;
  const total = finite(value.total, 30, 1);
  return {
    roll: { speciesId: roll.speciesId, rarity: roll.rarity, mutation: roll.mutation, size: roll.size },
    remaining: Math.min(total, finite(value.remaining, total, 0)),
    total,
  };
}

function parseSettings(value: unknown): GameSettings {
  const d = defaultSettings();
  if (!isRecord(value)) return d;
  const bindings = { ...d.bindings };
  if (isRecord(value.bindings)) {
    for (const key of Object.keys(bindings)) {
      const v = value.bindings[key];
      if (typeof v === 'string' && v.length > 0 && v.length < 32) bindings[key] = v;
    }
  }
  return {
    difficulty: isOneOf(value.difficulty, DIFFICULTIES) ? value.difficulty : d.difficulty,
    quality: isOneOf(value.quality, ['low', 'medium', 'high', 'ultra', 'auto'] as const)
      ? value.quality
      : d.quality,
    reducedMotion: bool(value.reducedMotion, d.reducedMotion),
    colourblind: isOneOf(value.colourblind, ['off', 'deuteranopia', 'protanopia', 'tritanopia'] as const)
      ? value.colourblind
      : d.colourblind,
    captions: bool(value.captions, d.captions),
    uiScale: clamp(finite(value.uiScale, d.uiScale, 1), 1, 1.5),
    masterVolume: clamp(finite(value.masterVolume, d.masterVolume, 0), 0, 1),
    musicVolume: clamp(finite(value.musicVolume, d.musicVolume, 0), 0, 1),
    sfxVolume: clamp(finite(value.sfxVolume, d.sfxVolume, 0), 0, 1),
    holdToSprint: bool(value.holdToSprint, d.holdToSprint),
    holdToCrouch: bool(value.holdToCrouch, d.holdToCrouch),
    invertY: bool(value.invertY, d.invertY),
    lookSensitivity: clamp(finite(value.lookSensitivity, d.lookSensitivity, 0.1), 0.2, 3),
    cameraShake: bool(value.cameraShake, d.cameraShake),
    exposure: clamp(finite(value.exposure, d.exposure, 0.1), 0.5, 1.8),
    breakReminderMinutes: clamp(finite(value.breakReminderMinutes, d.breakReminderMinutes, 0), 0, 180),
    bindings,
  };
}

export function serialise(save: SaveV1): string {
  return JSON.stringify(save);
}

export function deserialise(text: string, nowMs: number = Date.now()): SaveV1 {
  try {
    return migrate(JSON.parse(text) as unknown, nowMs);
  } catch {
    return defaultSave(nowMs);
  }
}

let uidCounter = 0;
export function createUid(): string {
  uidCounter += 1;
  return `c${Date.now().toString(36)}${uidCounter.toString(36)}`;
}

// --- small guards ----------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isOneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v);
}

function finite(v: unknown, fallback: number, min: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
