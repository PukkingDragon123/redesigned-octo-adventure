// Persistent game state + settings (localStorage).
const SAVE_KEY = 'deliverydead.save.v1';
const SETTINGS_KEY = 'deliverydead.settings.v1';

export function newState() {
  return {
    version: 1,
    day: 1,
    hour: 8,
    money: 0,
    earned: 0,
    outfit: 'hankBuried',
    flags: {},
    upgrades: {},
    keepsakes: {}, // id -> 'found' | 'given'
    orders: [],
    board: [],
    weather: 'clear',
    stats: { deliveries: 0, tips: 0, crashes: 0, jumps: 0, bestAir: 0, distance: 0, dayEarned: 0, dayTips: 0, dayDeliveries: 0 },
    cat: false,
    lastSafe: null,
  };
}

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!s || s.version !== 1) return null;
    return { ...newState(), ...s, stats: { ...newState().stats, ...(s.stats || {}) } };
  } catch {
    return null;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export const DEFAULT_SETTINGS = { pixel: 3, master: 0.8, music: 0.55, sfx: 0.85, quality: 'high', camDist: 1, fps: false };

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
