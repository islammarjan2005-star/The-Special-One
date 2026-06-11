// Headless autoplay of full seasons — the acceptance test that the engine
// runs 38 matchweeks with no runtime errors, plus checks on the core rules.

import { describe, it, expect } from 'vitest';
import {
  newGame, myClub, aiClubs, beginPlayerMatch, simulateHalf, applyIntervention,
  finishWeek, agreeBuy, agreeSell, cancelDeal, dealMode, useGemDraw, signGem, respondToBid,
  pickBestXI, wageBill, feeFor, canBuy, projectedWageBill, projectedSquadSize,
  sortedTable, TOTAL_WEEKS,
} from '../src/engine/game.js';
import { validateXI, teamStrength } from '../src/engine/match.js';
import { gemEligible, drawGem } from '../src/engine/transfers.js';
import { generateHeadline } from '../src/engine/headlines.js';
import { createRng } from '../src/engine/rng.js';
import { CLUBS, STARTER_CLUB_IDS } from '../src/engine/data.js';

function tryCheapBuy(game) {
  // Attempt to buy the cheapest useful player from any other club.
  const targets = aiClubs(game)
    .flatMap((c) => c.squad.map((p) => ({ p, c })))
    .sort((a, b) => a.p.value - b.p.value);
  for (const { p, c } of targets.slice(0, 20)) {
    if (agreeBuy(game, c.id, p.id) === null) return true;
  }
  return false;
}

function autoplaySeason(clubId, seed, { useInterventions = true, doTransfers = true } = {}) {
  const game = newGame(clubId, seed);
  let weeks = 0;
  while (!game.ended && game.week < TOTAL_WEEKS) {
    if (doTransfers && dealMode(game)) {
      if (game.pendingBid) respondToBid(game, game.week % 2 === 0);
      if (game.gem.available) {
        useGemDraw(game);
        signGem(game);
      }
      if (game.week % 7 === 3) tryCheapBuy(game); // mid-season January deals too
      if (game.windowOpen) tryCheapBuy(game);
    }
    const club = myClub(game);
    const xi = pickBestXI(club.squad);
    expect(validateXI(xi, club.squad)).toBeNull();
    const match = beginPlayerMatch(game, xi, ['defensive', 'balanced', 'attacking'][game.week % 3]);
    simulateHalf(match);
    const myGoals = match.playerSide === 'home' ? match.homeGoals : match.awayGoals;
    const oppGoals = match.playerSide === 'home' ? match.awayGoals : match.homeGoals;
    if (useInterventions && myGoals <= oppGoals) {
      applyIntervention(match, match.playerSide, game.week % 2 ? 'hairdryer' : 'mentality', 'attacking');
    }
    simulateHalf(match);
    finishWeek(game, match);
    weeks++;
    expect(weeks).toBeLessThanOrEqual(TOTAL_WEEKS);
    // Wage budget is never violated by completed deals.
    expect(wageBill(club.squad)).toBeLessThanOrEqual(club.wageBudget);
  }
  return game;
}

describe('real dataset', () => {
  it('has 20 clubs with legal squads', () => {
    expect(CLUBS).toHaveLength(20);
    for (const club of CLUBS) {
      expect(club.squad.length).toBeGreaterThanOrEqual(16);
      expect(club.squad.length).toBeLessThanOrEqual(22);
      expect(club.squad.filter((p) => p.position === 'GK').length).toBeGreaterThanOrEqual(2);
      // Some clubs genuinely run one recognised striker (FPL lists Haaland
      // as Man City's only FWD); the XI filler covers the second slot.
      expect(club.squad.filter((p) => p.position === 'ATT').length).toBeGreaterThanOrEqual(1);
      for (const p of club.squad) {
        expect(p.rating).toBeGreaterThanOrEqual(40);
        expect(p.rating).toBeLessThanOrEqual(92);
        expect(p.age).toBeGreaterThanOrEqual(16);
        expect(p.name.length).toBeGreaterThan(2);
      }
    }
    for (const id of STARTER_CLUB_IDS) {
      expect(CLUBS.some((c) => c.id === id)).toBe(true);
    }
  });
});

describe('full season autoplay', () => {
  for (const clubId of STARTER_CLUB_IDS) {
    for (const seed of [1, 42, 1337]) {
      it(`completes a season as ${clubId} (seed ${seed}) without errors`, () => {
        const game = autoplaySeason(clubId, seed);
        if (!game.sacked) {
          expect(game.week).toBe(TOTAL_WEEKS);
          const table = sortedTable(game.table);
          expect(table).toHaveLength(20);
          for (const row of table) expect(row.played).toBe(TOTAL_WEEKS);
          const totalPoints = table.reduce((s, r) => s + r.points, 0);
          expect(totalPoints).toBeGreaterThanOrEqual(380 * 2);
          expect(totalPoints).toBeLessThanOrEqual(380 * 3);
          expect(game.seasonOutcome).toBeTruthy();
        }
        expect(game.headlines.length).toBeGreaterThan(0);
      });
    }
  }

  it('state survives JSON round-trip mid-season (localStorage shape)', () => {
    const game = newGame('WHU', 7);
    const xi = pickBestXI(myClub(game).squad);
    const match = beginPlayerMatch(game, xi, 'balanced');
    simulateHalf(match);
    simulateHalf(match);
    finishWeek(game, match);
    const restored = JSON.parse(JSON.stringify(game));
    expect(restored.week).toBe(1);
    expect(restored.rng.s).toBe(game.rng.s);
    const xi2 = pickBestXI(myClub(restored).squad);
    const match2 = beginPlayerMatch(restored, xi2, 'balanced');
    simulateHalf(match2);
    simulateHalf(match2);
    finishWeek(restored, match2);
    expect(restored.week).toBe(2);
  });
});

describe('transfer system', () => {
  it('window open: buying completes immediately', () => {
    const game = newGame('CHE', 5);
    expect(dealMode(game)).toBe('now');
    const seller = aiClubs(game)[0];
    const target = seller.squad.slice().sort((a, b) => a.value - b.value)[0];
    const before = myClub(game).transferBudget;
    expect(agreeBuy(game, seller.id, target.id)).toBeNull();
    expect(myClub(game).squad.some((p) => p.id === target.id)).toBe(true);
    expect(seller.squad.some((p) => p.id === target.id)).toBe(false);
    expect(myClub(game).transferBudget).toBeLessThan(before);
  });

  it('window closed: deal queues and completes when January opens', () => {
    const game = newGame('CHE', 9);
    // Play past the pre-season window into the season proper.
    const playWeek = () => {
      const m = beginPlayerMatch(game, pickBestXI(myClub(game).squad), 'balanced');
      simulateHalf(m);
      simulateHalf(m);
      finishWeek(game, m);
    };
    playWeek();
    expect(dealMode(game)).toBe('january');
    const seller = aiClubs(game).find((c) => c.squad.length > 17);
    const target = seller.squad.slice().sort((a, b) => a.value - b.value)[0];
    const budgetBefore = myClub(game).transferBudget;
    expect(agreeBuy(game, seller.id, target.id)).toBeNull();
    // Funds committed, but the player hasn't moved yet.
    expect(myClub(game).transferBudget).toBeLessThan(budgetBefore);
    expect(myClub(game).squad.some((p) => p.id === target.id)).toBe(false);
    expect(game.pendingDeals).toHaveLength(1);
    // Play through to the January window (after MW19).
    while (game.week < 19 && !game.ended) playWeek();
    if (!game.ended) {
      expect(game.windowOpen).toBe(true);
      expect(game.pendingDeals).toHaveLength(0);
      expect(myClub(game).squad.some((p) => p.id === target.id)).toBe(true);
    }
  });

  it('cancelling a queued buy refunds the fee', () => {
    const game = newGame('CHE', 9);
    const m = beginPlayerMatch(game, pickBestXI(myClub(game).squad), 'balanced');
    simulateHalf(m);
    simulateHalf(m);
    finishWeek(game, m);
    const seller = aiClubs(game).find((c) => c.squad.length > 17);
    const target = seller.squad.slice().sort((a, b) => a.value - b.value)[0];
    const before = myClub(game).transferBudget;
    expect(agreeBuy(game, seller.id, target.id)).toBeNull();
    cancelDeal(game, target.id);
    expect(myClub(game).transferBudget).toBe(before);
    expect(game.pendingDeals).toHaveLength(0);
  });

  it('after the January window, deals are blocked but browsing data remains', () => {
    const game = newGame('CHE', 9);
    game.week = 25; // deep into the season, window long shut
    game.windowOpen = false;
    expect(dealMode(game)).toBeNull();
    const seller = aiClubs(game)[0];
    const target = seller.squad[0];
    expect(agreeBuy(game, seller.id, target.id)).toMatch(/shut for the season/i);
    expect(agreeSell(game, myClub(game).squad[0].id)).toMatch(/shut for the season/i);
    // Browsing still works: fees are quotable for every league player.
    for (const c of aiClubs(game)) {
      for (const p of c.squad) expect(feeFor(p, c.squad)).toBeGreaterThan(0);
    }
  });

  it('blocks buying a star whose wages break the wage budget', () => {
    const game = newGame('BUR', 3);
    const club = myClub(game);
    const reason = canBuy({
      fee: 1000,
      wage: 600000,
      budget: club.transferBudget,
      projectedBill: projectedWageBill(game),
      wageBudget: club.wageBudget,
      squadSize: projectedSquadSize(game),
    });
    expect(reason).toMatch(/wage/i);
    // And through the real path: Haaland's wages are far beyond Sunderland.
    const city = game.clubs.MCI;
    const haaland = city.squad.find((p) => p.name.includes('Haaland'));
    expect(agreeBuy(game, 'MCI', haaland.id)).toBeTruthy();
    expect(club.squad.some((p) => p.id === haaland.id)).toBe(false);
  });

  it("a club's top players carry a hold-out premium", () => {
    const game = newGame('CHE', 3);
    const city = game.clubs.MCI;
    const best = city.squad.slice().sort((a, b) => b.rating - a.rating)[0];
    const fringe = city.squad.slice().sort((a, b) => a.rating - b.rating)[0];
    expect(feeFor(best, city.squad) / best.value).toBeGreaterThan(1.4);
    expect(feeFor(fringe, city.squad) / fringe.value).toBeLessThan(1.3);
  });

  it('selling adds the fee to the budget and frees wages', () => {
    const game = newGame('CHE', 5);
    const club = myClub(game);
    const before = club.transferBudget;
    const billBefore = wageBill(club.squad);
    const victim = club.squad[0];
    expect(agreeSell(game, victim.id)).toBeNull();
    expect(club.transferBudget).toBe(before + victim.value);
    expect(wageBill(club.squad)).toBe(billBefore - victim.wage);
  });
});

describe('the gem draw', () => {
  it('triggers for the broke club in pre-season', () => {
    const game = newGame('BUR', 11);
    expect(game.windowOpen).toBe(true);
    expect(game.gem.available).toBe(true);
    const result = useGemDraw(game);
    expect(result.player).toBeTruthy();
    expect(['wonderkid', 'solid', 'dud']).toContain(result.grade);
    expect(result.player.gemFee).toBeLessThanOrEqual(1e6);
    expect(result.player.wage).toBeLessThanOrEqual(9000);
    expect(signGem(game)).toBeNull();
    expect(myClub(game).squad.some((p) => p.id === result.player.id)).toBe(true);
  });

  it('does not trigger for the rich club', () => {
    const game = newGame('CHE', 11);
    expect(game.gem.available).toBe(false);
    expect(gemEligible(myClub(game), myClub(game).squad, Object.values(game.clubs))).toBe(false);
  });

  it('grades follow roughly 25/50/25 odds', () => {
    const rng = createRng(99);
    const counts = { wonderkid: 0, solid: 0, dud: 0 };
    for (let i = 0; i < 2000; i++) counts[drawGem(rng).grade]++;
    expect(counts.wonderkid / 2000).toBeGreaterThan(0.2);
    expect(counts.wonderkid / 2000).toBeLessThan(0.3);
    expect(counts.solid / 2000).toBeGreaterThan(0.45);
    expect(counts.dud / 2000).toBeGreaterThan(0.2);
  });
});

describe('match engine', () => {
  it('weakest link drags a strong side down', () => {
    const mk = (pos, rating) => ({ position: pos, rating, form: 0, injuryWeeks: 0 });
    const solid = [mk('GK', 80), ...Array(4).fill(0).map(() => mk('DEF', 80)), ...Array(4).fill(0).map(() => mk('MID', 80)), ...Array(2).fill(0).map(() => mk('ATT', 80))];
    const weakGK = [mk('GK', 45), ...solid.slice(1)];
    expect(teamStrength(weakGK)).toBeLessThan(teamStrength(solid) - 6);
  });

  it('rejects an XI with no goalkeeper', () => {
    const game = newGame('WHU', 2);
    const squad = myClub(game).squad;
    const outfield = squad.filter((p) => p.position !== 'GK').slice(0, 11);
    expect(validateXI(outfield, squad)).toMatch(/goalkeeper/i);
  });
});

describe('headlines', () => {
  it('puns on matching surnames', () => {
    const rng = createRng(1);
    let punned = 0;
    for (let i = 0; i < 50; i++) {
      const h = generateHeadline(rng, 'bigWin', { club: 'Sunderland', opponent: 'Man City', score: '2-1', player: 'Harry Kane' });
      if (h.headline.includes('KANE IS ABLE')) punned++;
    }
    expect(punned).toBeGreaterThan(10);
  });

  it('fills slots for every bank type', () => {
    const rng = createRng(2);
    for (const type of ['bigWin', 'win', 'thrashing', 'heavyDefeat', 'derbyWin', 'derbyLoss', 'streak', 'title', 'europe', 'relegated', 'survived', 'sacked', 'gem', 'midtable']) {
      const h = generateHeadline(rng, type, { club: 'Brighton', opponent: 'Spurs', score: '3-0', player: 'Jack Silva', streak: 5, position: 4 });
      expect(h.headline).toBeTruthy();
      expect(h.sub).toBeTruthy();
      expect(h.headline).not.toMatch(/\{/);
      expect(h.sub).not.toMatch(/\{/);
    }
  });
});
