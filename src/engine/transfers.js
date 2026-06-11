// Transfer rules: the market is every player at every other club,
// browsable year-round. Deals agreed outside a window queue up and
// complete when the next window opens — like real life. Plus the Gem
// Draw, the signature mechanic for broke clubs.

import { next, randInt, pick } from './rng.js';
import { makePlayer, valueOf } from './player.js';

export function wageBill(squad) {
  return squad.reduce((sum, p) => sum + p.wage, 0);
}

// Asking price: value plus a 15% premium — and a hefty extra markup for a
// club's top three players, because they don't want to sell.
export function feeFor(player, sellerSquad) {
  const topThree = sellerSquad
    .slice()
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3);
  const premium = topThree.some((p) => p.id === player.id) ? 1.5 : 1.15;
  return Math.round((player.value * premium) / 100000) * 100000 || 100000;
}

// Returns null if the purchase is legal, otherwise a human-readable reason.
// `budget` and `projectedBill` already account for any pending deals.
export function canBuy({ fee, wage, budget, projectedBill, wageBudget, squadSize }) {
  if (squadSize >= 22) return 'Squad is full (22 players max, counting agreed deals).';
  if (fee > budget) return `Fee exceeds your transfer budget by ${fmtGap(fee - budget)}.`;
  const newBill = projectedBill + wage;
  if (newBill > wageBudget)
    return `His wages would push your wage bill ${fmtGap(newBill - wageBudget)} over the weekly budget. Sell or pick a cheaper player.`;
  return null;
}

function fmtGap(n) {
  return n >= 1e6 ? `£${(n / 1e6).toFixed(1)}M` : `£${Math.round(n / 1e3)}k`;
}

export function canSell(squadSize) {
  return squadSize > 16 ? null : 'Squad cannot drop below 16 players (counting agreed sales).';
}

// Gem Draw eligibility: wage bill in the league's bottom third OR transfer
// budget below the median market value of all league players.
export function gemEligible(playerClub, playerSquad, allClubs) {
  const bills = allClubs
    .map((c) => wageBill(c.squad))
    .sort((a, b) => a - b);
  const myBill = wageBill(playerSquad);
  const cutoff = bills[Math.floor(bills.length / 3)];
  if (myBill <= cutoff) return true;
  const values = allClubs
    .flatMap((c) => c.squad.map((p) => p.value))
    .sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  return playerClub.transferBudget < median;
}

// One randomised reveal: 25% wonderkid, 50% useful squad player, 25% dud.
// Always cheap to sign and on low wages — being broke is its own fun.
export function drawGem(rng) {
  const roll = next(rng);
  let player;
  let grade;
  if (roll < 0.25) {
    grade = 'wonderkid';
    player = makePlayer(rng, {
      rating: randInt(rng, 62, 70),
      age: randInt(rng, 17, 20),
      potentialBoost: randInt(rng, 15, 24),
    });
  } else if (roll < 0.75) {
    grade = 'solid';
    player = makePlayer(rng, { rating: randInt(rng, 66, 74), age: randInt(rng, 21, 27) });
  } else {
    grade = 'dud';
    player = makePlayer(rng, { rating: randInt(rng, 48, 58), age: randInt(rng, 24, 32) });
  }
  player.wage = Math.min(player.wage, randInt(rng, 4, 18) * 500); // £2k–£9k
  player.gemFee = randInt(rng, 2, 10) * 100000; // £200k–£1M
  player.value = valueOf(player);
  return { player, grade };
}

// AI clubs occasionally bid for your best players during a window.
// Returns a bid { playerId, playerName, fee, fromClub } or null.
export function maybeAiBid(rng, playerSquad, aiClubs) {
  if (next(rng) > 0.55) return null;
  const targets = playerSquad
    .slice()
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3);
  const target = pick(rng, targets);
  const bidder = pick(rng, aiClubs);
  const fee = Math.round((target.value * (1.05 + next(rng) * 0.4)) / 100000) * 100000;
  return { playerId: target.id, playerName: target.name, fee, fromClub: bidder.short };
}
