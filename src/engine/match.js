// Match simulation engine.
//
// Team strength = weighted positional ratings (GK ×1.3, DEF ×1.15,
// MID ×1.1, ATT ×1.0) adjusted by form, with a weakest-link penalty so one
// terrible position caps results. Strength differential maps to Poisson
// lambdas; mentality shifts each side's lambda and variance.

import { next, randInt, pick, poisson } from './rng.js';
import { effectiveRating, isAvailable } from './player.js';

export const POS_WEIGHTS = { GK: 1.3, DEF: 1.15, MID: 1.1, ATT: 1.0 };
export const FORMATION = { GK: 1, DEF: 4, MID: 4, ATT: 2 }; // fixed 4-4-2 for v1
export const HOME_ADVANTAGE = 3;

export const MENTALITIES = {
  defensive: { label: 'Defensive', forMult: 0.82, againstMult: 0.78 },
  balanced: { label: 'Balanced', forMult: 1.0, againstMult: 1.0 },
  attacking: { label: 'Attacking', forMult: 1.25, againstMult: 1.3 },
};

export function teamStrength(xi) {
  let weighted = 0;
  let totalWeight = 0;
  let weakest = Infinity;
  for (const p of xi) {
    const w = POS_WEIGHTS[p.position];
    const r = effectiveRating(p);
    weighted += r * w;
    totalWeight += w;
    if (r < weakest) weakest = r;
  }
  const avg = weighted / totalWeight;
  // Weakest-link penalty: a single very weak starter (e.g. a 45-rated GK)
  // drags the whole side down non-linearly.
  const gap = Math.max(0, avg - weakest);
  const penalty = Math.pow(gap, 1.35) * 0.18;
  return avg - penalty;
}

// Best legal 4-4-2 from a squad (used by AI clubs and the autoplay test).
export function pickBestXI(squad) {
  const xi = [];
  const chosen = new Set();
  for (const [pos, count] of Object.entries(FORMATION)) {
    const pool = squad
      .filter((p) => p.position === pos && isAvailable(p) && !chosen.has(p.id))
      .sort((a, b) => effectiveRating(b) - effectiveRating(a))
      .slice(0, count);
    if (pool.length < count) {
      // Out-of-position fillers; the weakest-link penalty punishes this.
      // Spare goalkeepers never fill outfield slots unless nobody is left.
      const candidates = squad
        .filter((p) => isAvailable(p) && !chosen.has(p.id) && !pool.includes(p) && p.position !== pos)
        .sort(
          (a, b) =>
            (pos !== 'GK' ? (a.position === 'GK') - (b.position === 'GK') : 0) ||
            effectiveRating(b) - effectiveRating(a)
        );
      pool.push(...candidates.slice(0, count - pool.length));
    }
    for (const p of pool) chosen.add(p.id);
    xi.push(...pool);
  }
  return xi;
}

export function validateXI(xi, squad) {
  if (xi.length !== 11) return 'Pick exactly 11 players.';
  const gks = xi.filter((p) => p.position === 'GK').length;
  const fitGks = squad.filter((p) => p.position === 'GK' && isAvailable(p)).length;
  // Exactly one keeper — unless every keeper is injured, in which case an
  // outfielder goes in goal (and the weakest-link penalty will hurt).
  if (gks > 1) return 'You can only field one goalkeeper.';
  if (gks === 0 && fitGks > 0) return 'You must field exactly one goalkeeper.';
  if (xi.some((p) => !isAvailable(p))) return 'Injured players cannot start.';
  const ids = new Set(xi.map((p) => p.id));
  if (ids.size !== 11) return 'Duplicate player selected.';
  if (xi.some((p) => !squad.some((s) => s.id === p.id))) return 'Player not in squad.';
  return null;
}

function lambdas(strengthA, strengthB, mentA, mentB, homeSide) {
  const adjA = strengthA + (homeSide === 'A' ? HOME_ADVANTAGE : 0);
  const adjB = strengthB + (homeSide === 'B' ? HOME_ADVANTAGE : 0);
  const diff = adjA - adjB;
  // Baseline ~1.35 goals each, swinging with the strength differential.
  const base = 1.35;
  const lambdaA = Math.max(0.15, base * Math.pow(1.085, diff)) * mentA.forMult * mentB.againstMult;
  const lambdaB = Math.max(0.15, base * Math.pow(1.085, -diff)) * mentB.forMult * mentA.againstMult;
  return [Math.min(5.5, lambdaA), Math.min(5.5, lambdaB)];
}

function sampleScorer(rng, xi) {
  // Attackers most likely, then mids, then defenders.
  const weights = xi.map((p) => (p.position === 'ATT' ? 6 : p.position === 'MID' ? 3 : p.position === 'DEF' ? 1 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = next(rng) * total;
  for (let i = 0; i < xi.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return xi[i];
  }
  return xi[xi.length - 1];
}

const FLAVOUR = [
  '{team} knock it around patiently in midfield.',
  'A crunching tackle in the centre circle — the ref waves play on.',
  '{team} win a corner; it comes to nothing.',
  '{player} tries his luck from 25 yards — just wide!',
  'Half-chance for {team} but the keeper gathers comfortably.',
  'The away end is in full voice.',
  '{player} skips past his man but the cross is cleared.',
  'Scrappy spell — neither side can keep the ball.',
  '{team} press high, forcing a hurried clearance.',
  'A free kick on the edge of the box… straight into the wall.',
];

function flavourLine(rng, minute, teamName, xi) {
  const tmpl = pick(rng, FLAVOUR);
  return {
    minute,
    type: 'flavour',
    text: tmpl.replace('{team}', teamName).replace('{player}', pick(rng, xi).name),
  };
}

// A match is simulated in two halves so the UI can pause for the
// half-time intervention. `sides` is { A, B } with xi/mentality per side.
export function startMatch(rng, home, away) {
  return {
    rng,
    home: { ...home, side: 'A' },
    away: { ...away, side: 'B' },
    homeGoals: 0,
    awayGoals: 0,
    events: [],
    half: 0,
    hairdryerUsed: false,
    secondHalfBoost: { A: 0, B: 0 },
  };
}

export function simulateHalf(match) {
  const { rng } = match;
  match.half++;
  const isFirst = match.half === 1;
  const boostA = match.secondHalfBoost.A;
  const boostB = match.secondHalfBoost.B;
  const strengthA = teamStrength(match.home.xi) + (isFirst ? 0 : boostA);
  const strengthB = teamStrength(match.away.xi) + (isFirst ? 0 : boostB);
  const [lA, lB] = lambdas(
    strengthA,
    strengthB,
    MENTALITIES[match.home.mentality],
    MENTALITIES[match.away.mentality],
    'A'
  );
  const goalsA = poisson(rng, lA / 2);
  const goalsB = poisson(rng, lB / 2);
  const minMinute = isFirst ? 1 : 46;
  const maxMinute = isFirst ? 45 : 93;

  const events = [];
  for (let i = 0; i < goalsA; i++) {
    const scorer = sampleScorer(rng, match.home.xi);
    scorer.goals++;
    events.push({
      minute: randInt(rng, minMinute, maxMinute),
      type: 'goal',
      side: 'home',
      scorer: scorer.name,
      scorerId: scorer.id,
      text: `GOAL! ${scorer.name} scores for ${match.home.name}!`,
    });
  }
  for (let i = 0; i < goalsB; i++) {
    const scorer = sampleScorer(rng, match.away.xi);
    scorer.goals++;
    events.push({
      minute: randInt(rng, minMinute, maxMinute),
      type: 'goal',
      side: 'away',
      scorer: scorer.name,
      scorerId: scorer.id,
      text: `GOAL! ${scorer.name} scores for ${match.away.name}!`,
    });
  }
  // Pad with flavour so each half reads as 3–5 lines.
  const flavourCount = Math.max(0, randInt(rng, 3, 5) - events.length);
  for (let i = 0; i < flavourCount; i++) {
    const homeSide = next(rng) < 0.5;
    events.push(
      flavourLine(
        rng,
        randInt(rng, minMinute, maxMinute),
        homeSide ? match.home.name : match.away.name,
        homeSide ? match.home.xi : match.away.xi
      )
    );
  }
  events.sort((a, b) => a.minute - b.minute);
  match.homeGoals += goalsA;
  match.awayGoals += goalsB;
  match.events.push(...events);
  return events;
}

// Half-time interventions, player side only.
export function applyIntervention(match, playerSide, intervention, newMentality) {
  const side = playerSide === 'home' ? match.home : match.away;
  const key = side.side;
  if (intervention === 'mentality' && newMentality) {
    side.mentality = newMentality;
  } else if (intervention === 'hairdryer') {
    match.hairdryerUsed = true;
    match.secondHalfBoost[key] += 2.5; // temporary fire in the bellies
  }
}

// Post-match effects: injuries (~3% per starter, 1–6 weeks) and the
// hairdryer's morale risk. Returns list of new injuries.
export function resolveMatchEffects(match, playerSide) {
  const { rng } = match;
  const injuries = [];
  for (const sideKey of ['home', 'away']) {
    for (const p of match[sideKey].xi) {
      if (next(rng) < 0.03) {
        p.injuryWeeks = randInt(rng, 1, 6);
        injuries.push({ side: sideKey, player: p });
      }
    }
  }
  if (match.hairdryerUsed && next(rng) < 0.3 && playerSide) {
    // Morale backlash: one of your players takes it badly.
    const xi = match[playerSide].xi;
    const victim = pick(rng, xi);
    victim.form = Math.max(-3, victim.form - 2);
    return { injuries, hairdryerVictim: victim };
  }
  return { injuries, hairdryerVictim: null };
}

// Form drifts with the result: winners up, losers down, draws toward zero.
export function updateForm(rng, xi, goalDiff) {
  for (const p of xi) {
    let delta = goalDiff > 0 ? 1 : goalDiff < 0 ? -1 : p.form > 0 ? -0.5 : p.form < 0 ? 0.5 : 0;
    if (next(rng) < 0.25) delta += goalDiff >= 0 ? 0.5 : -0.5;
    p.form = Math.max(-3, Math.min(3, Math.round((p.form + delta) * 2) / 2));
  }
}

// Quick sim for AI-vs-AI fixtures: no events, just a scoreline plus
// scorer bookkeeping for the top-scorer chart.
export function quickSim(rng, homeSquad, awaySquad, homeName, awayName) {
  const homeXI = pickBestXI(homeSquad);
  const awayXI = pickBestXI(awaySquad);
  const [lA, lB] = lambdas(
    teamStrength(homeXI),
    teamStrength(awayXI),
    MENTALITIES.balanced,
    MENTALITIES.balanced,
    'A'
  );
  const homeGoals = poisson(rng, lA);
  const awayGoals = poisson(rng, lB);
  for (let i = 0; i < homeGoals; i++) sampleScorer(rng, homeXI).goals++;
  for (let i = 0; i < awayGoals; i++) sampleScorer(rng, awayXI).goals++;
  // Injuries + form for AI sides too, so the league lives.
  for (const xi of [homeXI, awayXI]) {
    for (const p of xi) {
      if (next(rng) < 0.03) p.injuryWeeks = randInt(rng, 1, 6);
    }
  }
  updateForm(rng, homeXI, homeGoals - awayGoals);
  updateForm(rng, awayXI, awayGoals - homeGoals);
  return { homeGoals, awayGoals };
}
