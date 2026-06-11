// Headless smoke tests for the Luxe League simulation.
// Run with: node luxe-league/test.mjs
import assert from 'node:assert/strict';
import {
  Match, AIController, Ball, CARS, FIELD, BALL, BOOST,
  wrapAngle, predictBall,
} from './sim.js';

const DT = 1 / 120;
let passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

function assertInBounds(label, pos) {
  const m = 0.6;
  assert.ok(Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z), `${label} is finite`);
  assert.ok(Math.abs(pos.x) <= FIELD.halfW + m, `${label} x in bounds (${pos.x.toFixed(1)})`);
  assert.ok(Math.abs(pos.z) <= FIELD.halfL + FIELD.goal.depth + m, `${label} z in bounds (${pos.z.toFixed(1)})`);
  assert.ok(pos.y >= -m && pos.y <= FIELD.ceil + m, `${label} y in bounds (${pos.y.toFixed(1)})`);
}

test('wrapAngle stays in [-pi, pi]', () => {
  for (const a of [-9, -3.2, 0, 3.2, 9, 100]) {
    const w = wrapAngle(a);
    assert.ok(w >= -Math.PI - 1e-9 && w <= Math.PI + 1e-9, `wrap(${a}) = ${w}`);
  }
  assert.ok(Math.abs(wrapAngle(Math.PI * 2 + 0.1) - 0.1) < 1e-9);
});

test('predictBall lands on the floor, never below it', () => {
  const b = new Ball();
  b.pos.set(0, 30, 0);
  b.vel.set(10, 0, 5);
  const p = predictBall(b, 2);
  assert.ok(p.y >= BALL.r - 1e-6);
  assert.ok(p.x > 0 && p.z > 0);
});

test('a shot through the goal mouth scores for blue', () => {
  const events = [];
  const m = new Match({ duration: 300, onEvent: (e) => events.push(e) });
  m.state = 'play';
  m.ball.pos.set(0, BALL.r + 1, 75);
  m.ball.vel.set(0, 0, 70);
  // park the cars out of the way
  m.player.placeAt(-40, -40, 0);
  m.opponent.placeAt(40, -40, 0);
  for (let i = 0; i < 240 && m.state === 'play'; i++) m.update(DT, {});
  const goal = events.find((e) => e.type === 'goal');
  assert.ok(goal, 'goal event fired');
  assert.equal(goal.team, 'blue');
  assert.equal(m.score.blue, 1);
});

test('a shot wide of the goal mouth bounces back off the wall', () => {
  const events = [];
  const m = new Match({ duration: 300, onEvent: (e) => events.push(e) });
  m.state = 'play';
  m.ball.pos.set(30, BALL.r + 1, 75); // outside the 16-unit goal half-width
  m.ball.vel.set(0, 0, 80);
  m.player.placeAt(-40, -40, 0);
  m.opponent.placeAt(40, -40, 0);
  for (let i = 0; i < 240; i++) m.update(DT, {});
  assert.ok(!events.some((e) => e.type === 'goal'), 'no goal scored');
  assert.ok(m.ball.pos.z < FIELD.halfL, 'ball back in the field of play');
});

test('a shot over the crossbar does not score', () => {
  const events = [];
  const m = new Match({ duration: 300, onEvent: (e) => events.push(e) });
  m.state = 'play';
  m.ball.pos.set(0, FIELD.goal.height + 10, 75);
  m.ball.vel.set(0, 12, 80);
  m.player.placeAt(-40, -40, 0);
  m.opponent.placeAt(40, -40, 0);
  for (let i = 0; i < 120; i++) m.update(DT, {});
  assert.ok(!events.some((e) => e.type === 'goal'), 'no goal scored over the bar');
});

test('big boost pad refills to 100', () => {
  const m = new Match({ duration: 300 });
  m.state = 'play';
  const pad = m.pads.find((p) => p.big);
  m.player.placeAt(pad.x, pad.z, 0);
  m.player.boost = 5;
  m.update(DT, {});
  assert.equal(m.player.boost, BOOST.max);
  assert.ok(pad.timer > 0, 'pad goes on cooldown');
});

test('driving into a resting ball produces a forward power hit', () => {
  const m = new Match({ duration: 300 });
  m.state = 'play';
  m.ball.pos.set(0, BALL.r, 0);
  m.ball.vel.set(0, 0, 0);
  m.player.placeAt(0, -14, 0);
  m.player.vel.set(0, 0, 50);
  m.opponent.placeAt(40, 60, Math.PI);
  for (let i = 0; i < 60; i++) m.update(DT, { throttle: 1, steer: 0, boost: false, jump: false });
  assert.ok(m.ball.vel.z > 25, `ball driven toward +z (vz=${m.ball.vel.z.toFixed(1)})`);
  assert.ok(m.ball.vel.length() > 30, 'ball got real pace from the hit');
});

test('jump then second press dodges and flips', () => {
  const m = new Match({ duration: 300 });
  m.state = 'play';
  m.player.placeAt(0, 0, 0);
  m.opponent.placeAt(40, 60, Math.PI);
  m.ball.pos.set(0, BALL.r, 80);
  const idle = { throttle: 0, steer: 0, boost: false, jump: false };
  m.update(DT, { ...idle, jump: true });            // first press: jump
  for (let i = 0; i < 12; i++) m.update(DT, idle);  // release
  assert.ok(!m.player.onGround, 'car is airborne');
  m.update(DT, { ...idle, jump: true, throttle: 1 }); // second press: front dodge
  assert.ok(m.player.flipTimer > 0, 'flip animation armed');
  assert.ok(m.player.vel.z > 20, `dodge impulse forward (vz=${m.player.vel.z.toFixed(1)})`);
});

test('clock expiry with a lead ends the match; a tie goes to overtime', () => {
  let ended = null;
  const m = new Match({ duration: 1, onEvent: (e) => { if (e.type === 'end') ended = e; } });
  m.score.blue = 2; m.score.orange = 1;
  m.state = 'play';
  for (let i = 0; i < 200 && m.state !== 'finished'; i++) m.update(DT, {});
  assert.ok(ended, 'match ended');
  assert.equal(ended.winner, 'blue');

  let ot = false;
  const m2 = new Match({ duration: 1, onEvent: (e) => { if (e.type === 'overtime') ot = true; } });
  m2.state = 'play';
  for (let i = 0; i < 200; i++) m2.update(DT, {});
  assert.ok(ot, 'tied match went to overtime');
  assert.ok(m2.state === 'countdown' || m2.state === 'overtime');
});

test('AI vs AI: full matches stay in bounds and produce goals', () => {
  let totalGoals = 0;
  for (let run = 0; run < 3; run++) {
    const events = [];
    const m = new Match({
      playerCar: CARS[run % CARS.length],
      aiCar: CARS[(run + 3) % CARS.length],
      duration: 120,
      difficulty: 'legend',
      onEvent: (e) => events.push(e),
    });
    const blueBrain = new AIController('legend');
    const maxSteps = Math.round(300 / DT); // hard cap incl. overtime
    let steps = 0;
    while (m.state !== 'finished' && steps < maxSteps) {
      m.update(DT, blueBrain.decide(m, m.player, DT));
      steps++;
      if (steps % 120 === 0) {
        assertInBounds('ball', m.ball.pos);
        assertInBounds('player', m.player.pos);
        assertInBounds('opponent', m.opponent.pos);
        assert.ok(m.player.boost >= 0 && m.player.boost <= BOOST.max, 'player boost in range');
        assert.ok(m.opponent.boost >= 0 && m.opponent.boost <= BOOST.max, 'ai boost in range');
      }
    }
    totalGoals += m.score.blue + m.score.orange;
    console.log(`   run ${run + 1}: ${m.score.blue}-${m.score.orange} (${m.state}, ${(steps * DT).toFixed(0)}s simulated)`);
  }
  assert.ok(totalGoals >= 1, `AI matches produced goals (got ${totalGoals})`);
});

console.log(`\n${passed} tests passed`);
