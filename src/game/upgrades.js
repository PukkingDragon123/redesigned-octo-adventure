// Retired: Bessie no longer has upgrades (progression is riding skill, see skills.js).
// This empty shim only exists so older screens that still import it keep loading.
export const UPGRADES = [];

export function computeStats() {
  return {};
}

export function canBuy() {
  return { ok: false, why: 'Retired' };
}
