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
    skills: { best: {}, tiers: {}, poses: {} }, // Harold's riding notes (skills.js)
    keepsakes: {}, // id -> 'found' | 'given'
    orders: [],
    board: [],
    weather: 'clear',
    stats: { deliveries: 0, tips: 0, crashes: 0, jumps: 0, bestAir: 0, distance: 0, dayEarned: 0, dayTips: 0, dayDeliveries: 0 },
    cat: false,
    lastSafe: null,
    quests: {},
    pantry: { milk_bottle: 4, cocoa_powder: 6, sugar: 6, marshmallows: 2, maple_syrup: 1, cinnamon: 1, mint: 0, pumpkin: 0, nutmeg: 1, cream: 1, coffee_beans: 0, dark_chocolate: 1 },
    bag: {},
    photos: {},
    candy: 0,
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
    // older saves may carry `upgrades` (retired, ignored) and no skills yet
    const d = newState();
    return { ...d, ...s, stats: { ...d.stats, ...(s.stats || {}) }, skills: { ...d.skills, ...(s.skills || {}) } };
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

export const DEFAULT_SETTINGS = { pixel: 1, gfx: 3, master: 0.8, music: 0.55, sfx: 0.85, quality: 'high', camDist: 1, fps: false, autoQuality: true };

// phones and small tablets start one notch lower; the governor in game.js steps further if needed
function deviceDefaults() {
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  return coarse ? { quality: 'medium' } : {};
}

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    // settings from before the HD renderer: drop the old chunky pixel size
    if ((saved.gfx || 1) < 2) { delete saved.pixel; delete saved.autoQuality; }
    // before device-pixel rendering: 'Ultra' is now plain HD, and a resolution the
    // frame-rate governor lowered (not the player) starts fresh at HD again
    if ((saved.gfx || 1) < 3 && (saved.pixel < 1 || (saved.autoQuality !== false && saved.pixel > 1))) saved.pixel = 1;
    return { ...DEFAULT_SETTINGS, ...deviceDefaults(), ...saved, gfx: 3 };
  } catch {
    return { ...DEFAULT_SETTINGS, ...deviceDefaults() };
  }
}
export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
