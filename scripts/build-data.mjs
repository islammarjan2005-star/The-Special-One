// Generates src/engine/realData.js from the open Fantasy Premier League
// dataset (github.com/vaastav/Fantasy-Premier-League, 2025-26 season).
// Run: node scripts/build-data.mjs
// The output file is committed, so the game needs no network at runtime.

import { writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2025-26';

// Club metadata the dataset doesn't carry: budgets (the difficulty curve),
// board expectation, tier and colours. Keyed by FPL short_name.
const CLUB_META = {
  MCI: { tier: 1, transferBudget: 180e6, wageBudget: 3600000, expectation: 1, color: '#6CABDD' },
  LIV: { tier: 1, transferBudget: 160e6, wageBudget: 3400000, expectation: 2, color: '#C8102E' },
  ARS: { tier: 1, transferBudget: 160e6, wageBudget: 3300000, expectation: 3, color: '#EF0107' },
  CHE: { tier: 1, transferBudget: 170e6, wageBudget: 3200000, expectation: 4, color: '#034694' },
  MUN: { tier: 2, transferBudget: 130e6, wageBudget: 3300000, expectation: 5, color: '#DA291C' },
  NEW: { tier: 2, transferBudget: 110e6, wageBudget: 2400000, expectation: 6, color: '#241F20' },
  TOT: { tier: 2, transferBudget: 110e6, wageBudget: 2500000, expectation: 7, color: '#132257' },
  AVL: { tier: 2, transferBudget: 80e6, wageBudget: 2200000, expectation: 8, color: '#670E36' },
  BHA: { tier: 3, transferBudget: 60e6, wageBudget: 1600000, expectation: 9, color: '#0057B8' },
  CRY: { tier: 3, transferBudget: 50e6, wageBudget: 1500000, expectation: 10, color: '#1B458F' },
  WHU: { tier: 3, transferBudget: 55e6, wageBudget: 1800000, expectation: 11, color: '#7A263A' },
  BRE: { tier: 3, transferBudget: 45e6, wageBudget: 1300000, expectation: 12, color: '#E30613' },
  FUL: { tier: 3, transferBudget: 45e6, wageBudget: 1400000, expectation: 13, color: '#1D1D1B' },
  EVE: { tier: 3, transferBudget: 45e6, wageBudget: 1500000, expectation: 14, color: '#003399' },
  NFO: { tier: 3, transferBudget: 45e6, wageBudget: 1400000, expectation: 15, color: '#DD0000' },
  BOU: { tier: 4, transferBudget: 35e6, wageBudget: 1200000, expectation: 16, color: '#B50E12' },
  WOL: { tier: 4, transferBudget: 35e6, wageBudget: 1200000, expectation: 17, color: '#FDB913' },
  LEE: { tier: 4, transferBudget: 30e6, wageBudget: 1100000, expectation: 18, color: '#1D428A' },
  SUN: { tier: 4, transferBudget: 25e6, wageBudget: 900000, expectation: 19, color: '#EB172B' },
  BUR: { tier: 4, transferBudget: 20e6, wageBudget: 800000, expectation: 20, color: '#6C1D45' },
};

const DERBIES = [
  ['MCI', 'MUN'], ['LIV', 'EVE'], ['ARS', 'TOT'], ['CHE', 'FUL'],
  ['WHU', 'TOT'], ['CRY', 'BHA'], ['SUN', 'NEW'], ['LEE', 'MUN'],
];

const STARTER_CLUB_IDS = ['CHE', 'WHU', 'BUR']; // rich / mid-table / broke

function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); field = ''; row = []; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

async function fetchCsv(name) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return parseCsv(await res.text());
}

const POS = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'ATT' };
const SEASON_START = new Date('2025-08-01');

function ageOf(birthDate) {
  const ms = SEASON_START - new Date(birthDate || '');
  if (!Number.isFinite(ms)) return 24;
  return Math.max(17, Math.min(40, Math.floor(ms / (365.25 * 24 * 3600 * 1000))));
}

// Rating 45–92 derived from FPL price — but normalized per position, since
// FPL prices are position-relative (the best keeper costs £5.5m, the best
// striker £14.6m). Minutes nudge it: regular starters beat their price tag.
const RATING_BANDS = { GK: [52, 86], DEF: [52, 88], MID: [52, 91], ATT: [52, 92] };

function makeRater(allPlayers) {
  const range = {};
  for (const pos of Object.keys(RATING_BANDS)) {
    const costs = allPlayers.filter((p) => POS[p.element_type] === pos).map((p) => Number(p.now_cost));
    range[pos] = [Math.min(...costs), Math.max(...costs)];
  }
  return (pos, cost, minutes) => {
    const [lo, hi] = range[pos];
    const [rLo, rHi] = RATING_BANDS[pos];
    const t = hi > lo ? (cost - lo) / (hi - lo) : 0.5;
    let r = rLo + (rHi - rLo) * Math.pow(Math.max(0, t), 0.6);
    if (minutes > 1500) r += 2;
    else if (minutes > 800) r += 1;
    else if (minutes < 200) r -= 2;
    return Math.max(45, Math.min(92, Math.round(r)));
  };
}

const [players, teams] = await Promise.all([fetchCsv('players_raw.csv'), fetchCsv('teams.csv')]);

const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));
const rate = makeRater(players.filter((p) => POS[p.element_type] && p.removed !== 'True'));
const clubs = [];

for (const team of teams) {
  const meta = CLUB_META[team.short_name];
  if (!meta) throw new Error(`No metadata for club ${team.name} (${team.short_name}) — update CLUB_META`);

  const pool = players
    .filter((p) => p.team === team.id && POS[p.element_type] && p.removed !== 'True')
    .map((p) => {
      const full = `${p.first_name} ${p.second_name}`.trim();
      return {
        name: full.length <= 22 ? full : p.web_name,
        position: POS[p.element_type],
        age: ageOf(p.birth_date),
        rating: rate(POS[p.element_type], Number(p.now_cost), Number(p.minutes)),
        minutes: Number(p.minutes),
        cost: Number(p.now_cost),
      };
    })
    .sort((a, b) => b.minutes - a.minutes || b.cost - a.cost);

  // Squad of up to 22: guarantee a playable 4-4-2 core, then best of the rest.
  const minimums = { GK: 2, DEF: 6, MID: 6, ATT: 3 };
  const squad = [];
  for (const [pos, min] of Object.entries(minimums)) {
    squad.push(...pool.filter((p) => p.position === pos).slice(0, min));
  }
  for (const p of pool) {
    if (squad.length >= 21) break;
    if (!squad.includes(p)) squad.push(p);
  }

  clubs.push({
    id: team.short_name,
    name: team.name,
    short: team.name.length <= 12 ? team.name : team.short_name,
    ...meta,
    squad: squad.map(({ name, position, age, rating }) => ({ name, position, age, rating })),
  });
}

clubs.sort((a, b) => a.expectation - b.expectation);

const counts = clubs.map((c) => `${c.id}:${c.squad.length}`).join(' ');
console.log(`${clubs.length} clubs — squad sizes: ${counts}`);
console.log(`total players: ${clubs.reduce((s, c) => s + c.squad.length, 0)}`);

const out = `// GENERATED by scripts/build-data.mjs — do not edit by hand.
// Source: Fantasy Premier League open dataset, 2025-26 season
// (github.com/vaastav/Fantasy-Premier-League). Ratings are derived from
// FPL prices and minutes; budgets/tiers are this game's design values.

export const REAL_CLUBS = ${JSON.stringify(clubs, null, 1)};

export const DERBIES = ${JSON.stringify(DERBIES)};

export const STARTER_CLUB_IDS = ${JSON.stringify(STARTER_CLUB_IDS)};
`;

writeFileSync(new URL('../src/engine/realData.js', import.meta.url), out);
console.log('wrote src/engine/realData.js');
