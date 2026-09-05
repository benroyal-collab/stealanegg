/**
 * The single zustand store.
 *
 * Rule: the store holds *discrete* state -- money, upgrades, which biome,
 * whether the shop is open. It does not hold anything that changes every
 * frame. Player position, guardian transforms and camera state live in
 * mutable refs owned by the render layer, because pushing those through
 * React would re-render the UI sixty times a second for no reason.
 *
 * Writes here come from systems and from UI intent. React only reads.
 */

import { create } from 'zustand';
import { ECONOMY } from '../data/balance';
import type {
  BiomeId,
  EggRoll,
  GameSettings,
  OwnedCreature,
  SaveV1,
  ToolId,
  UpgradeId,
} from '../sim/types';
import {
  computePace,
  discoveryBonus,
  donationsPerSecond,
  habitatSlots,
  incubationSeconds,
  offlineEarnings,
  unlockedBiomesForPace,
  upgradeCost,
} from '../sim/economy';
import { requireSpecies, speciesForBiome } from '../data/creatures';
import { SAVE_KEY, createUid, defaultSave, deserialise, serialise } from '../sim/save';

export type Phase = 'title' | 'loading' | 'playing' | 'paused' | 'photo' | 'sanctuary';

export interface Toast {
  readonly id: number;
  readonly icon: string;
  readonly text: string;
  readonly tone: 'good' | 'info' | 'warn';
}

export interface Caption {
  readonly id: number;
  readonly text: string;
  readonly icon: string;
  readonly expiresAt: number;
}

interface GameStore {
  phase: Phase;
  save: SaveV1;
  /** Wall-clock ms this browser session has been in `playing`. */
  sessionMs: number;
  breakPromptShown: boolean;
  showBreakPrompt: boolean;
  toasts: Toast[];
  captions: Caption[];
  /** Set when the offline payout should be shown to the player once. */
  offlinePayout: number | null;
  perfOverlay: boolean;
  activeMenu: 'none' | 'settings' | 'parents' | 'guide' | 'shop' | 'about';
  /** Non-null while a "you found something" card is on screen. */
  reveal: EggRoll | null;
  /** What pressing Grab would do right now, or null. Written by the runtime. */
  prompt: { kind: string; label: string; icon: string } | null;

  // --- lifecycle
  load: () => void;
  persist: () => void;
  wipe: () => void;
  exportSave: () => string;
  importSave: (text: string) => boolean;

  setPhase: (phase: Phase) => void;
  setMenu: (menu: GameStore['activeMenu']) => void;
  tick: (dtMs: number) => void;

  // --- gameplay intent
  depositEgg: (roll: EggRoll) => void;
  collectHatchling: () => OwnedCreature | null;
  placeInHabitat: (uid: string) => boolean;
  recallFromHabitat: (uid: string) => void;
  fuse: (uids: readonly string[]) => OwnedCreature | null;
  buyUpgrade: (id: UpgradeId) => boolean;
  useTool: (id: ToolId) => boolean;
  grantTool: (id: ToolId, count: number) => void;
  travelTo: (biome: BiomeId) => void;
  recordCatch: () => void;
  recordRaceLost: () => void;
  advanceTutorial: (step: number) => void;

  // --- settings
  updateSettings: (patch: Partial<GameSettings>) => void;

  // --- feedback
  toast: (icon: string, text: string, tone?: Toast['tone']) => void;
  caption: (icon: string, text: string, seconds?: number) => void;
  dismissBreakPrompt: () => void;
  clearOfflinePayout: () => void;
  setReveal: (roll: EggRoll | null) => void;
  setPrompt: (prompt: { kind: string; label: string; icon: string } | null) => void;
  togglePerfOverlay: () => void;
}

let toastId = 0;
let captionId = 0;

/** localStorage can throw in private mode; never let that cost a session. */
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Nothing sensible to do. The game stays fully playable in memory.
  }
}

export const useGame = create<GameStore>((set, get) => ({
  phase: 'title',
  save: defaultSave(),
  sessionMs: 0,
  breakPromptShown: false,
  showBreakPrompt: false,
  toasts: [],
  captions: [],
  offlinePayout: null,
  perfOverlay: false,
  activeMenu: 'none',
  reveal: null,
  prompt: null,

  load: () => {
    const now = Date.now();
    const raw = readStorage(SAVE_KEY);
    const save = raw === null ? defaultSave(now) : deserialise(raw, now);

    // Offline earnings: capped hard at two hours, paid at half rate. Idling
    // must never beat playing -- that is a safety requirement, not balance.
    let payout: number | null = null;
    if (raw !== null) {
      const away = Math.max(0, now - save.lastSeenEpochMs);
      const earned = offlineEarnings(donationsPerSecond(save.creatures), away);
      if (earned > 0) {
        save.money += earned;
        payout = earned;
      }
    }
    save.lastSeenEpochMs = now;
    set({ save, offlinePayout: payout });
  },

  persist: () => {
    const save = get().save;
    save.lastSeenEpochMs = Date.now();
    writeStorage(SAVE_KEY, serialise(save));
  },

  wipe: () => {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      // ignored -- see writeStorage
    }
    set({ save: defaultSave(), phase: 'title', sessionMs: 0, offlinePayout: null });
  },

  exportSave: () => serialise(get().save),

  importSave: (text) => {
    try {
      const save = deserialise(text, Date.now());
      set({ save });
      get().persist();
      return true;
    } catch {
      return false;
    }
  },

  setPhase: (phase) => set({ phase }),
  setMenu: (activeMenu) => set({ activeMenu }),

  tick: (dtMs) => {
    const state = get();
    if (state.phase !== 'playing' && state.phase !== 'sanctuary') return;
    const dt = dtMs / 1000;
    const save = state.save;

    save.playSeconds += dt;
    save.money += donationsPerSecond(save.creatures) * dt;

    if (save.incubator !== null) {
      const remaining = save.incubator.remaining - dt;
      save.incubator = { ...save.incubator, remaining: Math.max(0, remaining) };
    }

    const sessionMs = state.sessionMs + dtMs;
    const breakAfter = save.settings.breakReminderMinutes * 60_000;
    const due = breakAfter > 0 && sessionMs >= breakAfter && !state.breakPromptShown;

    // Expire captions on the same clock the game runs on, so pausing pauses
    // them too.
    const nowSec = save.playSeconds;
    const captions = state.captions.filter((c) => c.expiresAt > nowSec);

    set({
      sessionMs,
      captions: captions.length === state.captions.length ? state.captions : captions,
      ...(due ? { showBreakPrompt: true, breakPromptShown: true } : {}),
    });
  },

  depositEgg: (roll) => {
    const save = get().save;
    if (save.incubator !== null) {
      get().toast('egg-warm', 'The incubator is full. Collect that one first.', 'warn');
      return;
    }
    const total = incubationSeconds(save.upgrades.incubator);
    save.incubator = { roll, remaining: total, total };
    save.stats = { ...save.stats, eggsRecovered: save.stats.eggsRecovered + 1 };
    set({ save: { ...save }, reveal: roll });
    get().persist();
  },

  collectHatchling: () => {
    const save = get().save;
    const inc = save.incubator;
    if (inc === null || inc.remaining > 0) return null;

    const creature: OwnedCreature = { ...inc.roll, uid: createUid(), slot: null };
    save.incubator = null;
    save.creatures = [...save.creatures, creature];

    if (!save.discovered.includes(creature.speciesId)) {
      save.discovered = [...save.discovered, creature.speciesId];
      const species = requireSpecies(creature.speciesId);
      const bonus = discoveryBonus(save.upgrades.fieldGuide, species.biome);
      save.money += bonus;
      get().toast('book', `New species! ${species.name}. Field Guide bonus.`, 'good');
    }

    set({ save: { ...save } });
    get().persist();
    return creature;
  },

  placeInHabitat: (uid) => {
    const save = get().save;
    const total = habitatSlots(save.upgrades);
    const used = new Set(save.creatures.filter((c) => c.slot !== null).map((c) => c.slot));
    if (used.size >= total) {
      get().toast('fence', 'All your habitats are full. Build another one.', 'warn');
      return false;
    }
    let free = 0;
    while (used.has(free)) free += 1;
    save.creatures = save.creatures.map((c) => (c.uid === uid ? { ...c, slot: free } : c));
    set({ save: { ...save } });
    get().persist();
    return true;
  },

  recallFromHabitat: (uid) => {
    const save = get().save;
    save.creatures = save.creatures.map((c) => (c.uid === uid ? { ...c, slot: null } : c));
    set({ save: { ...save } });
    get().persist();
  },

  fuse: (uids) => {
    const save = get().save;
    if (uids.length !== 3) return null;
    const chosen = save.creatures.filter((c) => uids.includes(c.uid));
    if (chosen.length !== 3) return null;
    const first = chosen[0];
    if (first === undefined) return null;
    if (!chosen.every((c) => c.speciesId === first.speciesId)) return null;

    const next = nextRarityUp(first.speciesId);
    if (next === null) {
      get().toast('fuse', 'That is already the rarest of its kind.', 'warn');
      return null;
    }
    const created: OwnedCreature = {
      uid: createUid(),
      speciesId: next,
      rarity: requireSpecies(next).rarity,
      mutation: chosen.reduce(
        (best, c) => (rankMutation(c.mutation) > rankMutation(best) ? c.mutation : best),
        first.mutation,
      ),
      size: first.size,
      slot: null,
    };
    save.creatures = [...save.creatures.filter((c) => !uids.includes(c.uid)), created];
    set({ save: { ...save } });
    get().persist();
    get().toast('fuse', `Three became one: ${requireSpecies(next).name}!`, 'good');
    return created;
  },

  buyUpgrade: (id) => {
    const save = get().save;
    const level = save.upgrades[id];
    const cost = upgradeCost(id, level);
    if (save.money < cost) {
      get().toast('coin', 'Not enough donations yet. Keep collecting!', 'warn');
      return false;
    }
    save.money -= cost;
    save.upgrades = { ...save.upgrades, [id]: level + 1 };

    const before = save.unlockedBiomes.length;
    save.pace = computePace(save.upgrades);
    save.unlockedBiomes = unlockedBiomesForPace(save.pace);
    if (save.unlockedBiomes.length > before) {
      const opened = save.unlockedBiomes[save.unlockedBiomes.length - 1];
      get().toast('map', `New place to explore: ${opened}!`, 'good');
    }
    set({ save: { ...save } });
    get().persist();
    return true;
  },

  useTool: (id) => {
    const save = get().save;
    if (save.tools[id] <= 0) return false;
    save.tools = { ...save.tools, [id]: save.tools[id] - 1 };
    set({ save: { ...save } });
    return true;
  },

  grantTool: (id, count) => {
    const save = get().save;
    save.tools = { ...save.tools, [id]: save.tools[id] + count };
    set({ save: { ...save } });
  },

  travelTo: (biome) => {
    const save = get().save;
    if (!save.unlockedBiomes.includes(biome)) return;
    save.currentBiome = biome;
    set({ save: { ...save }, phase: 'loading' });
    get().persist();
  },

  recordCatch: () => {
    const save = get().save;
    save.stats = { ...save.stats, timesCaught: save.stats.timesCaught + 1 };
    set({ save: { ...save } });
  },

  recordRaceLost: () => {
    const save = get().save;
    save.stats = { ...save.stats, racesLost: save.stats.racesLost + 1 };
    set({ save: { ...save } });
  },

  advanceTutorial: (step) => {
    const save = get().save;
    if (save.tutorialStep >= step) return;
    save.tutorialStep = step;
    set({ save: { ...save } });
    get().persist();
  },

  updateSettings: (patch) => {
    const save = get().save;
    save.settings = { ...save.settings, ...patch };
    set({ save: { ...save } });
    get().persist();
  },

  toast: (icon, text, tone = 'info') => {
    toastId += 1;
    const entry: Toast = { id: toastId, icon, text, tone };
    set((s) => ({ toasts: [...s.toasts.slice(-3), entry] }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== entry.id) }));
    }, 4200);
  },

  /**
   * Every audio cue routes through here as well as through the mixer, which
   * is how the "no sound without a caption" rule is kept true at runtime
   * rather than just asserted in a test.
   */
  caption: (icon, text, seconds = 3) => {
    const state = get();
    if (!state.save.settings.captions) return;
    captionId += 1;
    const entry: Caption = {
      id: captionId,
      icon,
      text,
      expiresAt: state.save.playSeconds + seconds,
    };
    set((s) => ({ captions: [...s.captions.slice(-2), entry] }));
  },

  dismissBreakPrompt: () => set({ showBreakPrompt: false }),
  clearOfflinePayout: () => set({ offlinePayout: null }),
  setReveal: (reveal) => set({ reveal }),
  setPrompt: (prompt) => set({ prompt }),
  togglePerfOverlay: () => set((s) => ({ perfOverlay: !s.perfOverlay })),
}));

const MUTATION_RANK = ['none', 'golden', 'frosted', 'storm', 'prism'];
function rankMutation(m: string): number {
  const i = MUTATION_RANK.indexOf(m);
  return i < 0 ? 0 : i;
}

/** Breeding Hut: three of a kind become one of the next rarity in that biome. */
function nextRarityUp(speciesId: string): string | null {
  const current = requireSpecies(speciesId);
  const order = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'secret'];
  const currentIndex = order.indexOf(current.rarity);
  const candidates = speciesForBiome(current.biome)
    .filter((s) => order.indexOf(s.rarity) === currentIndex + 1)
    .map((s) => s.id);
  return candidates[0] ?? null;
}

export const OFFLINE_CAP_HOURS = ECONOMY.offlineCapHours;
