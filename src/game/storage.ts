import { createInitialSaveState, DEFAULT_SETTINGS } from './data';
import type { GameSettings, SaveState } from './types';

const SAVE_KEY = 'ashenveil_save_v1';
const SETTINGS_KEY = 'ashenveil_settings_v1';

export function hasSavedGame(): boolean {
  try {
    return Boolean(window.localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

export function loadSaveState(): SaveState {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return createInitialSaveState();
    const parsed = JSON.parse(raw) as Partial<SaveState>;
    const base = createInitialSaveState();
    const mergedStatuses = { ...base.activeStatuses, ...(parsed.activeStatuses ?? {}) };
    const validIds = new Set(['poison', 'frost', 'bleed']);
    const parsedArr = Array.isArray(parsed.statusEffects)
      ? parsed.statusEffects.filter((s): s is 'poison' | 'frost' | 'bleed' => validIds.has(s))
      : [];
    const statusSet = new Set<'poison' | 'frost' | 'bleed'>(parsedArr);
    if (mergedStatuses.poison) statusSet.add('poison');
    if (mergedStatuses.frost) statusSet.add('frost');
    if (mergedStatuses.bleed) statusSet.add('bleed');
    const normalizedEffects = Array.from(statusSet);

    return {
      ...base,
      ...parsed,
      attributes: { ...base.attributes, ...(parsed.attributes ?? {}) },
      appearance: { ...base.appearance, ...(parsed.appearance ?? {}) },
      activeStatuses: {
        poison: statusSet.has('poison'),
        frost: statusSet.has('frost'),
        bleed: statusSet.has('bleed'),
      },
      statusEffects: normalizedEffects,
      weaponLevels: { ...base.weaponLevels, ...(parsed.weaponLevels ?? {}) },
      consumables: { ...base.consumables, ...(parsed.consumables ?? {}) },
      quests: Array.isArray(parsed.quests) && parsed.quests.length > 0 ? parsed.quests : base.quests,
      deaths:
        typeof parsed.deaths === 'number' && Number.isFinite(parsed.deaths) && parsed.deaths >= 0
          ? Math.floor(parsed.deaths)
          : base.deaths,
    };
  } catch {
    return createInitialSaveState();
  }
}

export function persistSaveState(save: SaveState): void {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Ignore storage quota errors in private browsing
  }
}

export function clearSaveState(): void {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignore
  }
}

export function loadSettings(): GameSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, keybinds: { ...DEFAULT_SETTINGS.keybinds } };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      keybinds: { ...DEFAULT_SETTINGS.keybinds, ...(parsed.keybinds ?? {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS, keybinds: { ...DEFAULT_SETTINGS.keybinds } };
  }
}

export function persistSettings(settings: GameSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore
  }
}
