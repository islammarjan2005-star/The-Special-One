// Fixture generation (double round-robin via the circle method) and
// league-table computation.

import { next } from './rng.js';

export function generateFixtures(clubIds, rng) {
  const n = clubIds.length;
  const teams = clubIds.slice();
  // Shuffle so fixture order differs between careers.
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(next(rng) * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }
  const rounds = [];
  const half = n / 2;
  const rotating = teams.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    const lineup = [teams[0], ...rotating];
    for (let i = 0; i < half; i++) {
      const a = lineup[i];
      const b = lineup[n - 1 - i];
      // Alternate home/away by round so nobody gets long home runs.
      round.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    rounds.push(round);
    rotating.unshift(rotating.pop());
  }
  const secondHalf = rounds.map((round) => round.map(({ home, away }) => ({ home: away, away: home })));
  return [...rounds, ...secondHalf]; // 38 rounds of 10 fixtures
}

export function emptyTableRow(clubId) {
  return { clubId, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 };
}

export function applyResult(table, result) {
  const home = table[result.home];
  const away = table[result.away];
  home.played++;
  away.played++;
  home.gf += result.homeGoals;
  home.ga += result.awayGoals;
  away.gf += result.awayGoals;
  away.ga += result.homeGoals;
  if (result.homeGoals > result.awayGoals) {
    home.won++;
    away.lost++;
    home.points += 3;
  } else if (result.homeGoals < result.awayGoals) {
    away.won++;
    home.lost++;
    away.points += 3;
  } else {
    home.drawn++;
    away.drawn++;
    home.points++;
    away.points++;
  }
}

export function sortedTable(table) {
  return Object.values(table).sort(
    (a, b) =>
      b.points - a.points ||
      b.gf - b.ga - (a.gf - a.ga) ||
      b.gf - a.gf ||
      a.clubId.localeCompare(b.clubId)
  );
}

export function positionOf(table, clubId) {
  return sortedTable(table).findIndex((row) => row.clubId === clubId) + 1;
}
