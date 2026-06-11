// One career slot persisted to localStorage. The whole game state —
// including the RNG state — is plain JSON, so save/load is trivial.

import { resetPlayerIds } from './player.js';

const KEY = 'perfect-season-save-v1';

export function saveGame(game) {
  try {
    localStorage.setItem(KEY, JSON.stringify(game));
  } catch {
    // Storage full or unavailable — the game keeps running in memory.
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const game = JSON.parse(raw);
    if (game.version !== 1) return null;
    resetPlayerIds(game.nextPlayerId || 100000);
    return game;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
