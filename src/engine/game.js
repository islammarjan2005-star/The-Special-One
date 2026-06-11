// Game orchestrator: career state, the weekly loop, transfer windows,
// board patience, and season end. Pure data + functions — the React layer
// is a thin shell over this so the whole game is testable headlessly.

import { CLUBS, STARTER_CLUB_IDS, DERBIES } from './data.js';
import { createRng, next, randInt, pick } from './rng.js';
import { makeRealPlayer, resetPlayerIds, peekPlayerId, fmtMoney, valueOf } from './player.js';
import { generateFixtures, emptyTableRow, applyResult, sortedTable, positionOf } from './league.js';
import {
  startMatch, simulateHalf, applyIntervention, resolveMatchEffects, updateForm,
  quickSim, pickBestXI, teamStrength, validateXI,
} from './match.js';
import { wageBill, feeFor, canBuy, canSell, gemEligible, drawGem, maybeAiBid } from './transfers.js';
import { generateHeadline, headlineTypeForResult } from './headlines.js';

export const TOTAL_WEEKS = 38;

export function starterChoices(seed) {
  // Stable preview of the three offered clubs with their budgets.
  return STARTER_CLUB_IDS.map((id) => CLUBS.find((c) => c.id === id));
}

export function newGame(clubId, seed = Date.now() & 0xffffffff) {
  resetPlayerIds(1);
  const rng = createRng(seed);
  const clubs = {};
  for (const def of CLUBS) {
    const squad = def.squad.map((p) => makeRealPlayer(rng, p));
    // Scale derived wages so every club starts at ~85% of its wage
    // budget — headroom exists, but it's proportional to the budget, so
    // broke clubs have very little of it.
    const bill = squad.reduce((s, p) => s + p.wage, 0);
    const scale = (def.wageBudget * 0.85) / bill;
    for (const p of squad) p.wage = Math.max(1000, Math.round((p.wage * scale) / 500) * 500);
    clubs[def.id] = { ...def, squad };
  }
  const table = {};
  for (const def of CLUBS) table[def.id] = emptyTableRow(def.id);
  const game = {
    version: 2,
    seed,
    rng,
    clubId,
    week: 0, // 0 = pre-season; matches are weeks 1..38
    clubs,
    patience: 50,
    fixtures: generateFixtures(CLUBS.map((c) => c.id), rng),
    table,
    results: [],
    inbox: [{ type: 'board', text: `Welcome to ${clubs[clubId].name}. The board expects a finish around ${ordinal(clubs[clubId].expectation)}. Don't let us down.` }],
    pendingDeals: [],
    windowOpen: false,
    gem: { available: false, used: false, result: null },
    pendingBid: null,
    streak: 0,
    headlines: [],
    pendingHeadline: null,
    stats: { spent: 0, earned: 0, signings: [] },
    sacked: false,
    ended: false,
    nextPlayerId: 0,
  };
  openWindow(game); // pre-season window
  game.nextPlayerId = peekPlayerId();
  return game;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function myClub(game) {
  return game.clubs[game.clubId];
}

export function aiClubs(game) {
  return Object.values(game.clubs).filter((c) => c.id !== game.clubId);
}

export function nextFixture(game) {
  if (game.week >= TOTAL_WEEKS) return null;
  const round = game.fixtures[game.week];
  return round.find((f) => f.home === game.clubId || f.away === game.clubId);
}

// ---- Transfer windows -------------------------------------------------

export function isWindowWeek(game) {
  // Pre-season (week 0) and January (after MW19 has been played).
  return game.week === 0 || game.week === 19;
}

function openWindow(game) {
  game.windowOpen = true;
  executePendingDeals(game);
  const club = myClub(game);
  game.gem.available = !game.gem.usedThisWindow && gemEligible(club, club.squad, Object.values(game.clubs));
  game.gem.usedThisWindow = false;
  game.pendingBid = maybeAiBid(game.rng, club.squad, aiClubs(game));
  if (game.pendingBid) {
    game.inbox.push({
      type: 'bid',
      text: `${game.pendingBid.fromClub} have bid ${fmtMoney(game.pendingBid.fee)} for ${game.pendingBid.playerName}. Accept or reject in the transfer market.`,
    });
  }
  if (game.gem.available) {
    game.inbox.push({
      type: 'gem',
      text: 'Your scouts have been working the lower leagues. They think they\'ve found someone — one Gem Draw is available in the market.',
    });
  }
}

function closeWindow(game) {
  game.windowOpen = false;
  game.pendingBid = null;
  game.gem.available = false;
}

// 'now' = window open, deals complete instantly. 'january' = window shut,
// deals agreed now complete when the January window opens. null = the
// January window has been and gone — browse all you like, nobody signs.
export function dealMode(game) {
  if (game.ended) return null;
  if (game.windowOpen) return 'now';
  if (game.week >= 1 && game.week <= 18) return 'january';
  return null;
}

export function projectedSquadSize(game) {
  const buys = game.pendingDeals.filter((d) => d.kind === 'buy').length;
  const sells = game.pendingDeals.filter((d) => d.kind === 'sell').length;
  return myClub(game).squad.length + buys - sells;
}

export function projectedWageBill(game) {
  let bill = wageBill(myClub(game).squad);
  for (const d of game.pendingDeals) bill += d.kind === 'buy' ? d.wage : -d.wage;
  return bill;
}

function transferIn(game, seller, player, fee) {
  seller.squad = seller.squad.filter((p) => p.id !== player.id);
  player.form = 0;
  player.unsettled = false;
  myClub(game).squad.push(player);
  game.stats.signings.push({ name: player.name, fee, rating: player.rating, id: player.id });
}

// Agree to buy a player from another club. Funds are committed on
// agreement; the move completes now (window open) or in January.
export function agreeBuy(game, sellerId, playerId) {
  const mode = dealMode(game);
  if (!mode) return 'The transfer window is shut for the season. You can browse, but nobody signs until summer.';
  const seller = game.clubs[sellerId];
  const player = seller?.squad.find((p) => p.id === playerId);
  if (!player) return 'Player no longer available.';
  if (game.pendingDeals.some((d) => d.playerId === playerId)) return 'You already have a deal agreed for him.';
  const sellerOutgoing = game.pendingDeals.filter((d) => d.kind === 'buy' && d.fromClubId === sellerId).length;
  if (seller.squad.length - sellerOutgoing <= 16) return `${seller.short} won't sell — their squad is already stretched.`;
  const fee = feeFor(player, seller.squad);
  const club = myClub(game);
  const err = canBuy({
    fee,
    wage: player.wage,
    budget: club.transferBudget,
    projectedBill: projectedWageBill(game),
    wageBudget: club.wageBudget,
    squadSize: projectedSquadSize(game),
  });
  if (err) return err;
  club.transferBudget -= fee;
  game.stats.spent += fee;
  if (mode === 'now') {
    transferIn(game, seller, player, fee);
  } else {
    game.pendingDeals.push({ kind: 'buy', playerId, playerName: player.name, fromClubId: sellerId, fee, wage: player.wage });
  }
  return null;
}

// Agree to sell one of your own players. The fee lands when the deal
// completes; until January he keeps playing for you.
export function agreeSell(game, playerId) {
  const mode = dealMode(game);
  if (!mode) return 'The transfer window is shut for the season.';
  const club = myClub(game);
  const player = club.squad.find((p) => p.id === playerId);
  if (!player) return 'Player not found.';
  if (game.pendingDeals.some((d) => d.playerId === playerId)) return 'A deal is already agreed for him.';
  const sizeErr = canSell(projectedSquadSize(game));
  if (sizeErr) return sizeErr;
  if (mode === 'now') {
    club.transferBudget += player.value;
    game.stats.earned += player.value;
    club.squad = club.squad.filter((p) => p.id !== playerId);
  } else {
    game.pendingDeals.push({ kind: 'sell', playerId, playerName: player.name, fee: player.value, wage: player.wage });
  }
  return null;
}

export function cancelDeal(game, playerId) {
  const deal = game.pendingDeals.find((d) => d.playerId === playerId);
  if (!deal) return;
  if (deal.kind === 'buy') {
    myClub(game).transferBudget += deal.fee;
    game.stats.spent -= deal.fee;
  }
  game.pendingDeals = game.pendingDeals.filter((d) => d !== deal);
}

// Called when a window opens: queued deals go through (or collapse if the
// world changed underneath them — player sold elsewhere, squad too thin).
function executePendingDeals(game) {
  const club = myClub(game);
  for (const deal of game.pendingDeals) {
    if (deal.kind === 'buy') {
      const seller = game.clubs[deal.fromClubId];
      const player = seller.squad.find((p) => p.id === deal.playerId);
      if (player && seller.squad.length > 16) {
        transferIn(game, seller, player, deal.fee);
        game.inbox.push({ type: 'bid', text: `Deal done: ${deal.playerName} has arrived from ${seller.short} for ${fmtMoney(deal.fee)}.` });
      } else {
        club.transferBudget += deal.fee;
        game.stats.spent -= deal.fee;
        game.inbox.push({ type: 'bid', text: `The ${deal.playerName} deal collapsed — your ${fmtMoney(deal.fee)} has been refunded.` });
      }
    } else {
      const player = club.squad.find((p) => p.id === deal.playerId);
      if (player && club.squad.length > 16) {
        club.transferBudget += deal.fee;
        game.stats.earned += deal.fee;
        club.squad = club.squad.filter((p) => p.id !== deal.playerId);
        game.inbox.push({ type: 'bid', text: `${deal.playerName} has completed his move away for ${fmtMoney(deal.fee)}.` });
      }
    }
  }
  game.pendingDeals = [];
}

export function useGemDraw(game) {
  if (!game.gem.available) return null;
  const result = drawGem(game.rng);
  game.gem.available = false;
  game.gem.usedThisWindow = true;
  game.gem.result = result;
  return result;
}

export function signGem(game) {
  const result = game.gem.result;
  if (!result || result.signed) return 'No gem to sign.';
  const club = myClub(game);
  if (projectedSquadSize(game) >= 22) return 'Squad is full (22 players max, counting agreed deals).';
  if (result.player.gemFee > club.transferBudget) return 'Even this fee is beyond your budget.';
  if (projectedWageBill(game) + result.player.wage > club.wageBudget) return 'No wage headroom even for him.';
  club.transferBudget -= result.player.gemFee;
  game.stats.spent += result.player.gemFee;
  game.stats.signings.push({ name: result.player.name, fee: result.player.gemFee, rating: result.player.rating, id: result.player.id });
  club.squad.push(result.player);
  result.signed = true;
  if (result.grade !== 'dud') {
    game.pendingHeadline = generateHeadline(game.rng, 'gem', {
      club: club.short,
      player: result.player.name,
    });
    game.headlines.push(game.pendingHeadline);
  }
  return null;
}

export function respondToBid(game, accept) {
  const bid = game.pendingBid;
  if (!bid) return;
  const club = myClub(game);
  const player = club.squad.find((p) => p.id === bid.playerId);
  game.pendingBid = null;
  if (!player) return;
  if (accept) {
    if (canSell(projectedSquadSize(game))) return; // squad too thin — treat as forced reject
    club.transferBudget += bid.fee;
    game.stats.earned += bid.fee;
    club.squad = club.squad.filter((p) => p.id !== player.id);
    game.inbox.push({ type: 'bid', text: `${player.name} has joined ${bid.fromClub} for ${fmtMoney(bid.fee)}.` });
  } else {
    player.unsettled = true;
    player.form = Math.max(-3, player.form - 2);
    game.inbox.push({ type: 'bid', text: `${player.name} is unsettled after you rejected ${bid.fromClub}'s bid. His form has dipped.` });
  }
}

// ---- The weekly loop ---------------------------------------------------

// 1) UI calls beginPlayerMatch with the chosen XI + mentality.
export function beginPlayerMatch(game, xi, mentality) {
  const club = myClub(game);
  const err = validateXI(xi, club.squad);
  if (err) throw new Error(err);
  const fixture = nextFixture(game);
  const isHome = fixture.home === game.clubId;
  const opp = game.clubs[isHome ? fixture.away : fixture.home];
  const oppSide = { name: opp.short, xi: pickBestXI(opp.squad), mentality: 'balanced' };
  const mySide = { name: club.short, xi, mentality };
  const match = startMatch(game.rng, isHome ? mySide : oppSide, isHome ? oppSide : mySide);
  match.playerSide = isHome ? 'home' : 'away';
  match.fixture = fixture;
  match.oppId = opp.id;
  return match;
}

export { simulateHalf, applyIntervention };

// 2) After both halves, settle the week: table, AI fixtures, injuries,
//    form, patience, inbox, headlines, window transitions.
export function finishWeek(game, match) {
  const club = myClub(game);
  const rng = game.rng;
  if (game.windowOpen) closeWindow(game);
  game.inbox = [];

  const effects = resolveMatchEffects(match, match.playerSide);
  const myGoals = match.playerSide === 'home' ? match.homeGoals : match.awayGoals;
  const oppGoals = match.playerSide === 'home' ? match.awayGoals : match.homeGoals;
  updateForm(rng, match.home.xi, match.homeGoals - match.awayGoals);
  updateForm(rng, match.away.xi, match.awayGoals - match.homeGoals);
  // Unsettled players cool off after a couple of weeks.
  for (const p of club.squad) {
    if (p.unsettled && next(rng) < 0.5) p.unsettled = false;
  }

  const weekResults = [{ home: match.fixture.home, away: match.fixture.away, homeGoals: match.homeGoals, awayGoals: match.awayGoals }];
  applyResult(game.table, weekResults[0]);

  // AI vs AI fixtures.
  for (const f of game.fixtures[game.week]) {
    if (f === match.fixture) continue;
    const r = quickSim(rng, game.clubs[f.home].squad, game.clubs[f.away].squad);
    const result = { home: f.home, away: f.away, homeGoals: r.homeGoals, awayGoals: r.awayGoals };
    weekResults.push(result);
    applyResult(game.table, result);
  }
  game.results.push(weekResults);
  game.week++;

  // Injuries tick down for everyone (new ones from this match excluded —
  // they were just set, so decrement before reporting would undercount;
  // decrement all squads EXCEPT players injured this week).
  const freshIds = new Set(effects.injuries.map((i) => i.player.id));
  for (const c of Object.values(game.clubs)) {
    for (const p of c.squad) {
      if (p.injuryWeeks > 0 && !freshIds.has(p.id)) p.injuryWeeks--;
    }
  }

  // Young players grow toward their hidden potential.
  if (game.week % 5 === 0) {
    for (const c of Object.values(game.clubs)) {
      for (const p of c.squad) {
        if (p.age < 24 && p.rating < p.potential && next(rng) < 0.5) {
          p.rating++;
          p.value = valueOf(p);
        }
      }
    }
  }

  // Streak + result inbox.
  const won = myGoals > oppGoals;
  const lost = myGoals < oppGoals;
  game.streak = won ? game.streak + 1 : 0;

  // Board patience: results vs expectation.
  const pos = positionOf(game.table, game.clubId);
  const posDelta = Math.max(-3, Math.min(3, (club.expectation - pos) * 0.5));
  const resultDelta = won ? 2.5 : lost ? -2.5 : 0;
  game.patience = Math.max(0, Math.min(100, Math.round(game.patience + posDelta + resultDelta)));

  // Inbox for next week.
  const myInjuries = effects.injuries.filter((i) => match[i.side].xi === match[match.playerSide].xi);
  for (const inj of myInjuries) {
    game.inbox.push({ type: 'injury', text: `${inj.player.name} is injured — out for ${inj.player.injuryWeeks} week${inj.player.injuryWeeks === 1 ? '' : 's'}.` });
  }
  if (effects.hairdryerVictim) {
    game.inbox.push({ type: 'morale', text: `${effects.hairdryerVictim.name} took the half-time hairdryer badly. His form has dropped.` });
  }
  if (game.patience <= 0) {
    game.sacked = true;
    game.ended = true;
    game.pendingHeadline = generateHeadline(rng, 'sacked', { club: club.short, position: pos });
    game.headlines.push(game.pendingHeadline);
  } else if (game.patience < 25) {
    game.inbox.push({ type: 'board', text: `⚠️ The board is losing patience (${game.patience}/100). A few bad results and you're gone.` });
  } else {
    game.inbox.push({ type: 'board', text: boardMood(game.patience) });
  }
  // One line of league news.
  const leaders = sortedTable(game.table)[0];
  game.inbox.push({ type: 'news', text: `${game.clubs[leaders.clubId].short} top the table on ${leaders.points} points after MW${game.week}.` });

  // Headline card for notable results.
  if (!game.sacked) {
    const opp = game.clubs[match.oppId];
    const isDerby = DERBIES.some(([a, b]) => (a === game.clubId && b === opp.id) || (b === game.clubId && a === opp.id));
    const type = headlineTypeForResult({
      won, lost, goalsFor: myGoals, goalsAgainst: oppGoals,
      isDerby, oppTier: opp.tier, myTier: club.tier, streak: game.streak,
    });
    if (type) {
      const myGoalEvents = match.events.filter((e) => e.type === 'goal' && e.side === match.playerSide);
      const keyPlayer = myGoalEvents.length ? pick(rng, myGoalEvents).scorer : pick(rng, match[match.playerSide].xi).name;
      const score = match.playerSide === 'home' ? `${match.homeGoals}-${match.awayGoals}` : `${match.awayGoals}-${match.homeGoals}`;
      game.pendingHeadline = generateHeadline(rng, type, {
        club: club.short, opponent: opp.short, score, player: keyPlayer, streak: game.streak,
      });
      game.headlines.push(game.pendingHeadline);
    }
  }

  // January window opens after MW19.
  if (!game.ended && isWindowWeek(game)) {
    game.inbox.push({ type: 'news', text: 'The January transfer window is open.' });
    openWindow(game);
  }

  // Season end.
  if (game.week >= TOTAL_WEEKS && !game.ended) {
    endSeason(game);
  }
  game.nextPlayerId = peekPlayerId();
  return { myGoals, oppGoals, won, lost };
}

function boardMood(patience) {
  if (patience >= 75) return 'The board is delighted with your work.';
  if (patience >= 50) return 'The board is satisfied for now.';
  return 'The board is watching results closely.';
}

function endSeason(game) {
  game.ended = true;
  const club = myClub(game);
  const pos = positionOf(game.table, game.clubId);
  let type;
  if (pos === 1) type = 'title';
  else if (pos <= 5) type = 'europe';
  else if (pos >= 18) type = 'relegated';
  else if (club.expectation >= 18 && pos < 18) type = 'survived';
  else type = 'midtable';
  game.seasonOutcome = type;
  game.pendingHeadline = generateHeadline(game.rng, type, { club: club.short, position: pos });
  game.headlines.push(game.pendingHeadline);
}

// Season review data for the end screen.
export function seasonReview(game) {
  const club = myClub(game);
  const pos = positionOf(game.table, game.clubId);
  const allPlayers = Object.values(game.clubs).flatMap((c) => c.squad.map((p) => ({ ...p, clubShort: c.short })));
  const topScorer = allPlayers.sort((a, b) => b.goals - a.goals)[0];
  const myTopScorer = club.squad.slice().sort((a, b) => b.goals - a.goals)[0];
  const bestSigning = game.stats.signings
    .map((s) => ({ ...s, current: club.squad.find((p) => p.id === s.id) }))
    .filter((s) => s.current)
    .sort((a, b) => (b.current.rating - b.rating) - (a.current.rating - a.rating))[0];
  return {
    position: pos,
    expectation: club.expectation,
    outcome: game.seasonOutcome ?? (game.sacked ? 'sacked' : null),
    spent: game.stats.spent,
    earned: game.stats.earned,
    wageBill: wageBill(club.squad),
    wageBudget: club.wageBudget,
    transferBudget: club.transferBudget,
    topScorer,
    myTopScorer,
    bestSigning,
  };
}

export { wageBill, feeFor, canBuy, canSell, pickBestXI, teamStrength, sortedTable, positionOf, fmtMoney };
