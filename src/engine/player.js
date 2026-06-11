import { FIRST_NAMES, LAST_NAMES } from './data.js';
import { next, randInt, pick, jitter } from './rng.js';

let nextPlayerId = 1;
export function resetPlayerIds(start = 1) {
  nextPlayerId = start;
}
export function peekPlayerId() {
  return nextPlayerId;
}

const POSITIONS = ['GK', 'DEF', 'MID', 'ATT'];

// Weekly wage scales superlinearly with rating: stars are disproportionately
// expensive, which is what makes the wage budget bite.
export function wageForRating(rng, rating) {
  const base = 2000 * Math.pow(1.118, rating - 40); // ~£2k at 40, ~£700k at 92
  const noise = 1 + jitter(rng) * 0.2;
  return Math.round((base * noise) / 500) * 500;
}

// Market value from rating, age and (hidden) potential.
export function valueOf(player) {
  const base = 30000 * Math.pow(1.16, player.rating - 40);
  const ageFactor =
    player.age <= 23 ? 1.4 : player.age <= 27 ? 1.2 : player.age <= 30 ? 1.0 : player.age <= 32 ? 0.7 : 0.45;
  const potentialFactor = 1 + Math.max(0, player.potential - player.rating) * 0.04;
  return Math.round((base * ageFactor * potentialFactor) / 50000) * 50000 || 50000;
}

export function makePlayer(rng, { position, rating, age, potentialBoost = 0 }) {
  const pos = position ?? pick(rng, POSITIONS);
  const r = Math.max(40, Math.min(92, Math.round(rating)));
  const a = age ?? randInt(rng, 18, 33);
  // Younger players carry more hidden upside.
  const headroom = Math.max(0, Math.round((28 - a) * 1.2 * next(rng)) + potentialBoost);
  const potential = Math.min(95, r + headroom);
  const player = {
    id: nextPlayerId++,
    name: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`,
    age: a,
    position: pos,
    rating: r,
    potential,
    wage: wageForRating(rng, r),
    injuryWeeks: 0,
    form: 0,
    goals: 0,
    unsettled: false,
  };
  player.value = valueOf(player);
  return player;
}

// Squad shape: 2 GK, 6 DEF, 6 MID, 4 ATT core + a couple of extras.
export function makeSquad(rng, baseRating) {
  const slots = [
    ...Array(2).fill('GK'),
    ...Array(6).fill('DEF'),
    ...Array(6).fill('MID'),
    ...Array(4).fill('ATT'),
  ];
  const extraCount = randInt(rng, 0, 4);
  for (let i = 0; i < extraCount; i++) slots.push(pick(rng, ['DEF', 'MID', 'ATT']));
  return slots.map((position, i) => {
    // First-choice players sit near the club's base rating; depth falls off.
    const depthPenalty = i % 2 === 0 ? 0 : 4;
    const rating = baseRating - depthPenalty + jitter(rng) * 5;
    return makePlayer(rng, { position, rating });
  });
}

export function isAvailable(player) {
  return player.injuryWeeks <= 0;
}

// Effective match rating: base rating shifted by form.
export function effectiveRating(player) {
  return player.rating + player.form * 1.5;
}

export function fmtMoney(n) {
  if (Math.abs(n) >= 1e6) return `£${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1e3) return `£${Math.round(n / 1e3)}k`;
  return `£${n}`;
}
