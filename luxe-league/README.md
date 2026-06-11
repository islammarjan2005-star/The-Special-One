# Luxe League — Supercar Soccer

A Rocket League-inspired 3D car-soccer game for the browser, except the
battle-cars are replaced with high-end sports and luxury cars. Pick your
exotic, hit the pitch, and put the ball in the orange goal before the clock
runs out.

## Play

From the repo root:

```bash
npm install   # once, for vite
npm run luxe
```

…or serve this folder with any static file server:

```bash
cd luxe-league
python3 -m http.server 8000   # then open http://localhost:8000
```

No build step, no CDN: Three.js is vendored in `vendor/`, everything else is
hand-rolled (physics, AI, particles, even the sound effects are synthesized
with WebAudio at runtime).

## The garage

Six machines, each with its own stat line (top speed, boost, handling, hit
power, mass) and a procedurally built body — wedge profile, cabin, spoiler
and paint are all driven by per-car parameters:

| Car | Character |
| --- | --- |
| **Vantelli Rosso GT** | Italian V12 grand tourer. Balanced at everything. |
| **Toro F-77** | Raging-bull wedge. Highest top speed in the league. |
| **Zuffen S-Type** | German precision coupe. Best handling and acceleration. |
| **Sovereign Wraith** | Hand-built ultra-luxury. Slow, heavy, hits like a freight train. |
| **Papaya V1X** | Track-day hypercar. Monstrous boost. |
| **Eichberg Quanta** | Electric hyper-GT. Instant torque off the line. |

## How it plays

- **Drive** with W/A/S/D or arrows. **Space** jumps; press it again in the
  air with a direction held to dodge/flip (RL-style front flips for power
  hits). **Shift** boosts.
- **Boost economy**: you start each kickoff with 33. Small floor pads give
  +12, the six big corner/midfield pads fill you to 100. Pads go on cooldown
  after pickup.
- **Ball cam** is on by default (camera frames you and the ball); press
  **C** for a classic chase cam. **P** pauses, **M** mutes.
- Matches are 2/5/10 minutes against a **Rookie**, **Pro** or **Legend** AI
  driver. A tie at zero goes to golden-goal **overtime**.
- Touch devices get an on-screen joystick plus boost/jump buttons.

## Architecture

- `sim.js` — the entire simulation, DOM-free: arcade car physics (throttle,
  grip, jumps, dodges, air control), ball physics with goal-mouth and
  beveled-corner collision, boost pads, the match state machine
  (countdown → play → goal → overtime), and the AI driver (target selection,
  turning-circle awareness, stuck recovery, kickoff rushes, dodge shots).
- `game.js` — Three.js renderer (procedural cars, arena, particles, ball
  trail), WebAudio synth SFX, keyboard/touch input, camera, HUD and menus.
- `test.mjs` — headless Node smoke tests: scoring rules, wall/crossbar
  rejections, pads, power hits, dodges, overtime, plus full AI-vs-AI matches
  asserted to stay in bounds and produce goals. Run with:

```bash
node luxe-league/test.mjs
```
