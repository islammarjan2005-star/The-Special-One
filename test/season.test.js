// Headless autoplay of full seasons — the acceptance test that the engine
// runs 38 matchweeks with no runtime errors, plus checks on the core rules.

import { describe, it, expect } from 'vitest';
import {
  newGame, myClub, nextFixture, beginPlayerMatch, simulateHalf, applyIntervention,
  finishWeek, buyPlayer, sellPlayer, useGemDraw, signGem, respondToBid,
  pickBestXI, wageBill, canBuy, sortedTable, positionOf, TOTAL_WEEKS, aiClubs,
} from '../src/engine/game.js';
import { validateXI, teamStrength } from '../src/engine/match.js';
import { gemEligible, drawGem } from '../src/engine/transfers.js';
import { generateHeadline } from '../src/engine/headlines.js';
import { createRng } from '../src/engine/rng.js';

function autoplaySeason(clubId, seed, { useInterventions = true, doTransfers = true } = {}) {
  const game = newGame(clubId, seed);
  let weeks = 0;
  while (!game.ended && game.week < TOTAL_WEEKS) {
    if (game.windowOpen && doTransfers) {
      if (game.pendingBid) respondToBid(game, game.week % 2 === 0);
      if (game.gem.available) {
        useGemDraw(game);
        signGem(game);
      }
      // Try to buy the best affordable market player.
      for (const p of game.market) {
        if (!canBuy(p, myClub(game), myClub(game).squad)) {
          buyPlayer(game, p);
          break;
        }
      }
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
  }
  return game;
}

describe('full season autoplay', () => {
  for (const clubId of ['CHE', 'BHA', 'IPS']) {
    for (const seed of [1, 42, 1337]) {
      it(`completes a season as ${clubId} (seed ${seed}) without errors`, () => {
        const game = autoplaySeason(clubId, seed);
        if (!game.sacked) {
          expect(game.week).toBe(TOTAL_WEEKS);
          const table = sortedTable(game.table);
          expect(table).toHaveLength(20);
          for (const row of table) expect(row.played).toBe(TOTAL_WEEKS);
          // Goals and points are consistent.
          const totalPoints = table.reduce((s, r) => s + r.points, 0);
          expect(totalPoints).toBeGreaterThanOrEqual(380 * 2); // min if all draws
          expect(totalPoints).toBeLessThanOrEqual(380 * 3);
          expect(game.seasonOutcome).toBeTruthy();
        }
        expect(game.headlines.length).toBeGreaterThan(0);
      });
    }
  }

  it('state survives JSON round-trip mid-season (localStorage shape)', () => {
    const game = newGame('BHA', 7);
    const xi = pickBestXI(myClub(game).squad);
    const match = beginPlayerMatch(game, xi, 'balanced');
    simulateHalf(match);
    simulateHalf(match);
    finishWeek(game, match);
    const restored = JSON.parse(JSON.stringify(game));
    expect(restored.week).toBe(1);
    expect(restored.rng.s).toBe(game.rng.s);
    // Restored state can keep playing.
    const xi2 = pickBestXI(myClub(restored).squad);
    const match2 = beginPlayerMatch(restored, xi2, 'balanced');
    simulateHalf(match2);
    simulateHalf(match2);
    finishWeek(restored, match2);
    expect(restored.week).toBe(2);
  });
});

describe('economy rules', () => {
  it('blocks buying a star whose wages break the wage budget', () => {
    const game = newGame('IPS', 3);
    const club = myClub(game);
    const star = { id: 99999, name: 'Test Star', position: 'ATT', rating: 90, age: 26, wage: 600000, value: 1000, injuryWeeks: 0, form: 0, goals: 0 };
    const reason = canBuy(star, club, club.squad);
    expect(reason).toMatch(/wage/i);
    expect(buyPlayer(game, star)).toMatch(/wage/i);
    expect(club.squad.find((p) => p.id === 99999)).toBeUndefined();
  });

  it('blocks buying when the fee exceeds the transfer budget', () => {
    const game = newGame('IPS', 3);
    const club = myClub(game);
    const pricey = { id: 99998, name: 'Pricey', position: 'MID', rating: 70, age: 26, wage: 1000, value: club.transferBudget + 1e6, injuryWeeks: 0, form: 0, goals: 0 };
    expect(canBuy(pricey, club, club.squad)).toMatch(/transfer budget/i);
  });

  it('selling adds the fee to the budget and frees wages', () => {
    const game = newGame('CHE', 5);
    const club = myClub(game);
    const before = club.transferBudget;
    const billBefore = wageBill(club.squad);
    const victim = club.squad[0];
    expect(sellPlayer(game, victim.id)).toBeNull();
    expect(club.transferBudget).toBe(before + victim.value);
    expect(wageBill(club.squad)).toBe(billBefore - victim.wage);
  });
});

describe('the gem draw', () => {
  it('triggers for the broke club in pre-season', () => {
    const game = newGame('IPS', 11);
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
    const game = newGame('BHA', 2);
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
      const h = generateHeadline(rng, 'bigWin', { club: 'Ipswich', opponent: 'Man Blue', score: '2-1', player: 'Harry Kane' });
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
