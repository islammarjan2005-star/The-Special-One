// Luxe League — simulation core: arena physics, match rules, and the AI driver.
// No DOM access here: this module runs in the browser and in Node (see test.mjs).
import * as THREE from './vendor/three.module.js';

// ---------------------------------------------------------------------------
// Arena + tuning constants
// ---------------------------------------------------------------------------

export const FIELD = {
  halfW: 62,   // x extent
  halfL: 92,   // z extent (goals on +z / -z)
  wallH: 38,
  ceil: 44,
  corner: 26,  // size of the 45° corner bevels
  goal: { halfW: 16, height: 12, depth: 14 },
};

export const GRAVITY = 80;
export const BALL = { r: 4, bounce: 0.72, maxSpeed: 135 };
export const CAR_DIMS = { hx: 2.2, hy: 1.05, hz: 4.0 };
export const BOOST = { max: 100, drain: 33, small: 12, smallCooldown: 5, bigCooldown: 10 };

// ---------------------------------------------------------------------------
// The garage. Stats are the gameplay identity; body params drive the renderer.
// ---------------------------------------------------------------------------

export const CARS = [
  {
    id: 'vantelli', name: 'Vantelli Rosso GT',
    tagline: 'Front-mid V12 grand tourer from the Maranello school. Does everything beautifully.',
    color: 0xc8102e, accent: 0x1a1a1a, glass: 0x101820, flame: 0xffa030,
    stats: { topSpeed: 58, boostTopSpeed: 92, accel: 54, boostAccel: 68, turn: 2.6, mass: 1.05, jump: 36, hitPower: 1.0 },
    body: { length: 8.2, width: 4.4, height: 2.0, wedge: 0.45, cabinPos: -0.6, cabinLen: 0.42, spoiler: 0.35 },
  },
  {
    id: 'toro', name: 'Toro F-77',
    tagline: 'A raging-bull wedge with scissor doors and zero chill. Fastest paint in the league.',
    color: 0x9acd00, accent: 0x222222, glass: 0x0c0f14, flame: 0xffa030,
    stats: { topSpeed: 62, boostTopSpeed: 97, accel: 53, boostAccel: 70, turn: 2.4, mass: 1.1, jump: 36, hitPower: 1.05 },
    body: { length: 8.4, width: 4.6, height: 1.8, wedge: 0.62, cabinPos: -0.2, cabinLen: 0.5, spoiler: 0.8 },
  },
  {
    id: 'zuffen', name: 'Zuffen S-Type',
    tagline: 'Stuttgart precision, rear-engine heritage. Turns like it owes you an apex.',
    color: 0xd8d8de, accent: 0x333333, glass: 0x10141c, flame: 0xffa030,
    stats: { topSpeed: 57, boostTopSpeed: 90, accel: 60, boostAccel: 66, turn: 3.0, mass: 0.95, jump: 37, hitPower: 0.92 },
    body: { length: 7.6, width: 4.2, height: 2.1, wedge: 0.3, cabinPos: -0.25, cabinLen: 0.55, spoiler: 0.15 },
  },
  {
    id: 'sovereign', name: 'Sovereign Wraith',
    tagline: 'Hand-built ultra-luxury. Two and a half tonnes of walnut, wool and malice.',
    color: 0x14141a, accent: 0xc0c0c8, glass: 0x1c2026, flame: 0xffa030,
    stats: { topSpeed: 55, boostTopSpeed: 87, accel: 47, boostAccel: 62, turn: 2.25, mass: 1.45, jump: 34, hitPower: 1.35 },
    body: { length: 8.8, width: 4.6, height: 2.5, wedge: 0.15, cabinPos: -0.1, cabinLen: 0.5, spoiler: 0 },
  },
  {
    id: 'papaya', name: 'Papaya V1X',
    tagline: 'A road-legal track weapon in heritage orange. The boost button is a lifestyle.',
    color: 0xff7a00, accent: 0x101010, glass: 0x0e1218, flame: 0xffc060,
    stats: { topSpeed: 57, boostTopSpeed: 99, accel: 56, boostAccel: 78, turn: 2.7, mass: 0.92, jump: 37, hitPower: 0.95 },
    body: { length: 8.0, width: 4.4, height: 1.9, wedge: 0.55, cabinPos: -0.1, cabinLen: 0.46, spoiler: 1.0 },
  },
  {
    id: 'quanta', name: 'Eichberg Quanta',
    tagline: 'Silent electric hyper-GT. One hundred percent torque, zero rpm, no remorse.',
    color: 0xf2f4f7, accent: 0x00c2b8, glass: 0x0c1016, flame: 0x40e0d8,
    stats: { topSpeed: 56, boostTopSpeed: 89, accel: 65, boostAccel: 66, turn: 2.75, mass: 1.0, jump: 36, hitPower: 1.0 },
    body: { length: 8.0, width: 4.4, height: 2.0, wedge: 0.35, cabinPos: -0.3, cabinLen: 0.6, spoiler: 0.25 },
  },
];

// Boost pad layout (mirrored across midfield). Big pads fill to 100.
export const BOOST_PADS = (() => {
  const pads = [];
  for (const [x, z] of [[-50, -72], [50, -72], [-58, 0], [58, 0], [-50, 72], [50, 72]]) {
    pads.push({ x, z, big: true });
  }
  for (const [x, z] of [
    [0, -62], [-30, -48], [30, -48], [-44, -24], [44, -24], [0, -28],
    [-30, 0], [30, 0],
    [0, 28], [-44, 24], [44, 24], [-30, 48], [30, 48], [0, 62],
  ]) {
    pads.push({ x, z, big: false });
  }
  return pads;
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function wrapAngle(a) {
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Coarse ballistic prediction of where the ball will be in t seconds.
export function predictBall(ball, t) {
  const p = ball.pos.clone(), v = ball.vel.clone();
  let rem = t;
  while (rem > 0) {
    const h = Math.min(1 / 30, rem);
    v.y -= GRAVITY * h;
    p.addScaledVector(v, h);
    if (p.y < BALL.r) { p.y = BALL.r; if (v.y < 0) v.y = -v.y * BALL.bounce; }
    rem -= h;
  }
  return p;
}

const SQ2 = Math.SQRT2;
const CORNER_LIM = (FIELD.halfW + FIELD.halfL - FIELD.corner) / SQ2;
const CORNER_SIGNS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const TV1 = new THREE.Vector3(), TV2 = new THREE.Vector3(), TV3 = new THREE.Vector3();
const TV4 = new THREE.Vector3(), TV5 = new THREE.Vector3();
const TQ = new THREE.Quaternion();
const TE = new THREE.Euler();

// ---------------------------------------------------------------------------
// Ball
// ---------------------------------------------------------------------------

export class Ball {
  constructor() {
    this.pos = new THREE.Vector3(0, BALL.r, 0);
    this.vel = new THREE.Vector3();
  }

  reset() {
    this.pos.set(0, BALL.r, 0);
    this.vel.set(0, 0, 0);
  }

  update(dt, events) {
    const p = this.pos, v = this.vel;
    v.y -= GRAVITY * dt;
    v.multiplyScalar(Math.max(0, 1 - 0.022 * dt)); // mild air drag

    p.addScaledVector(v, dt);

    // floor
    if (p.y < BALL.r) {
      p.y = BALL.r;
      if (v.y < 0) {
        if (v.y < -12 && events) events.push({ type: 'bounce', speed: -v.y });
        v.y = -v.y * BALL.bounce;
        if (v.y < 6) v.y = 0;
        v.x *= 0.92; v.z *= 0.92;
      }
    }
    // rolling friction
    if (p.y <= BALL.r + 0.05 && Math.abs(v.y) < 1) {
      const f = Math.max(0, 1 - 0.35 * dt);
      v.x *= f; v.z *= f; v.y = 0; p.y = BALL.r;
    }

    this.collideWalls(events);

    const sp = v.length();
    if (sp > BALL.maxSpeed) v.multiplyScalar(BALL.maxSpeed / sp);
  }

  collideWalls(events) {
    const p = this.pos, v = this.vel, r = BALL.r, G = FIELD.goal;

    // ceiling
    if (p.y > FIELD.ceil - r) {
      p.y = FIELD.ceil - r;
      if (v.y > 0) v.y = -v.y * BALL.bounce;
    }

    const insideField = Math.abs(p.z) <= FIELD.halfL;
    if (insideField) {
      // side walls
      if (Math.abs(p.x) > FIELD.halfW - r) {
        const s = Math.sign(p.x);
        p.x = s * (FIELD.halfW - r);
        if (v.x * s > 0) {
          if (events && Math.abs(v.x) > 14) events.push({ type: 'bounce', speed: Math.abs(v.x) });
          v.x = -v.x * BALL.bounce;
        }
      }
      // beveled corners
      for (const [sx, sz] of CORNER_SIGNS) {
        const d = (p.x * sx + p.z * sz) / SQ2;
        if (d > CORNER_LIM - r) {
          const pen = d - (CORNER_LIM - r);
          p.x -= sx * pen / SQ2;
          p.z -= sz * pen / SQ2;
          const vn = (v.x * sx + v.z * sz) / SQ2;
          if (vn > 0) {
            v.x -= (1 + BALL.bounce) * vn * sx / SQ2;
            v.z -= (1 + BALL.bounce) * vn * sz / SQ2;
          }
        }
      }
    }

    // end walls + goal channels
    const s = Math.sign(p.z || 1);
    if (s * p.z > FIELD.halfL - r) {
      const pastPlane = s * p.z > FIELD.halfL;
      const mouth = Math.abs(p.x) < G.halfW && p.y < G.height;
      if (!mouth && !pastPlane) {
        p.z = s * (FIELD.halfL - r);
        if (v.z * s > 0) {
          if (events && Math.abs(v.z) > 14) events.push({ type: 'bounce', speed: Math.abs(v.z) });
          v.z = -v.z * BALL.bounce;
        }
      } else {
        // inside the goal channel
        if (s * p.z > FIELD.halfL + G.depth - r) {
          p.z = s * (FIELD.halfL + G.depth - r);
          if (v.z * s > 0) v.z = -v.z * 0.4;
        }
        if (pastPlane) {
          if (Math.abs(p.x) > G.halfW - r) {
            const sx = Math.sign(p.x);
            p.x = sx * (G.halfW - r);
            if (v.x * sx > 0) v.x = -v.x * 0.4;
          }
          if (p.y > G.height - r) {
            p.y = G.height - r;
            if (v.y > 0) v.y = -v.y * 0.4;
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Car
// ---------------------------------------------------------------------------

const CAR_WALL_R = 2.6;

export class Car {
  constructor(spec, team) {
    this.spec = spec;
    this.stats = spec.stats;
    this.team = team;
    this.pos = new THREE.Vector3(0, CAR_DIMS.hy, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0; // + is nose up
    this.boost = 33;
    this.boosting = false;
    this.onGround = true;
    this.controls = { throttle: 0, steer: 0, boost: false, jump: false };
    this.prevJump = false;
    this.usedDodge = false;
    this.dodgeWindow = 0;
    this.flipTimer = 0;
    this.flipDir = { x: 0, z: 1 };
    this.lastHitTime = -10;
    this.quat = new THREE.Quaternion();
  }

  forward(out) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  placeAt(x, z, yaw) {
    this.pos.set(x, CAR_DIMS.hy, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.onGround = true;
    this.boosting = false;
    this.flipTimer = 0;
    this.dodgeWindow = 0;
    this.usedDodge = false;
    this.controls.throttle = 0; this.controls.steer = 0;
    this.controls.boost = false; this.controls.jump = false;
    this.prevJump = false;
    this.updateQuat();
  }

  updateQuat() {
    this.quat.setFromEuler(TE.set(-this.pitch, this.yaw, 0, 'YXZ'));
  }

  update(dt, events) {
    const c = this.controls, st = this.stats;
    const jumpPressed = c.jump && !this.prevJump;
    this.prevJump = c.jump;
    this.flipTimer = Math.max(0, this.flipTimer - dt);
    this.boosting = false;

    if (this.onGround) {
      this.pitch *= Math.max(0, 1 - 12 * dt);
      const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
      const fx = sinY, fz = cosY;        // forward
      const rx = -cosY, rz = sinY;       // driver's right
      let sF = this.vel.x * fx + this.vel.z * fz;
      let sL = this.vel.x * rx + this.vel.z * rz;

      // steering (keeps some authority at a crawl, slightly heavier at top speed)
      const speedFac = Math.min(1, (Math.abs(sF) + 4) / 16) / (1 + Math.abs(sF) / 130);
      const dirSign = Math.abs(sF) > 0.5 ? Math.sign(sF) : (c.throttle >= 0 ? 1 : -1);
      this.yaw -= st.turn * c.steer * speedFac * dirSign * dt;

      const wantBoost = c.boost && this.boost > 0;
      const maxF = wantBoost ? st.boostTopSpeed : st.topSpeed;

      if (c.throttle > 0) {
        if (sF < 0) sF = Math.min(0, sF + st.accel * 2.2 * dt);          // brake from reverse
        else if (sF < maxF) sF = Math.min(maxF, sF + st.accel * c.throttle * dt);
      } else if (c.throttle < 0) {
        if (sF > 0) sF = Math.max(0, sF - st.accel * 2.2 * dt);          // brake
        else sF = Math.max(-st.topSpeed * 0.55, sF + st.accel * 0.9 * c.throttle * dt);
      } else {
        sF -= sF * Math.min(1, 1.2 * dt);                                // coast
      }

      if (wantBoost) {
        sF = Math.min(st.boostTopSpeed, sF + st.boostAccel * dt);
        this.boost = Math.max(0, this.boost - BOOST.drain * dt);
        this.boosting = true;
      }
      if (sF > maxF) sF = Math.max(maxF, sF - 50 * dt); // bleed off overspeed

      sL -= sL * Math.min(1, 9 * dt); // lateral grip

      this.vel.x = fx * sF + rx * sL;
      this.vel.z = fz * sF + rz * sL;
      this.vel.y = 0;

      if (jumpPressed) {
        this.vel.y = st.jump;
        this.onGround = false;
        this.pos.y += 0.05;
        this.dodgeWindow = 1.3;
        this.usedDodge = false;
        if (events) events.push({ type: 'jump', team: this.team });
      }
    } else {
      // airborne
      this.dodgeWindow = Math.max(0, this.dodgeWindow - dt);
      this.yaw -= c.steer * 2.0 * dt;
      this.pitch = clamp(this.pitch - c.throttle * 2.3 * dt, -1.25, 1.25);
      this.vel.y -= GRAVITY * dt;

      if (c.boost && this.boost > 0) {
        this.forward(TV1);
        this.vel.addScaledVector(TV1, st.boostAccel * 0.95 * dt);
        const sp = this.vel.length();
        if (sp > st.boostTopSpeed) this.vel.multiplyScalar(st.boostTopSpeed / sp);
        this.boost = Math.max(0, this.boost - BOOST.drain * dt);
        this.boosting = true;
      }

      if (jumpPressed && !this.usedDodge && this.dodgeWindow > 0) {
        this.usedDodge = true;
        if (Math.abs(c.steer) + Math.abs(c.throttle) < 0.2) {
          // double jump
          this.vel.y = Math.max(this.vel.y, 0) + st.jump * 0.8;
        } else {
          // dodge / flip
          const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
          let dx = sinY * c.throttle - cosY * c.steer;
          let dz = cosY * c.throttle + sinY * c.steer;
          const len = Math.hypot(dx, dz) || 1;
          dx /= len; dz /= len;
          this.vel.x += dx * 30;
          this.vel.z += dz * 30;
          this.vel.y *= 0.25;
          this.flipTimer = 0.55;
          this.flipDir = { x: c.steer, z: c.throttle };
          if (events) events.push({ type: 'dodge', team: this.team });
        }
      }
    }

    this.pos.addScaledVector(this.vel, dt);

    // landing
    if (this.pos.y <= CAR_DIMS.hy) {
      if (!this.onGround && this.vel.y < -25 && events) {
        events.push({ type: 'land', speed: -this.vel.y, team: this.team });
      }
      this.pos.y = CAR_DIMS.hy;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
    } else if (this.pos.y > CAR_DIMS.hy + 0.01) {
      this.onGround = false;
    }

    this.collideWalls();
    this.updateQuat();
  }

  collideWalls() {
    const p = this.pos, v = this.vel, rc = CAR_WALL_R, G = FIELD.goal;

    if (p.y > FIELD.ceil - 2) {
      p.y = FIELD.ceil - 2;
      if (v.y > 0) v.y = -v.y * 0.3;
    }

    const s = Math.sign(p.z || 1);
    const mouth = Math.abs(p.x) < G.halfW - rc * 0.8 && p.y < G.height - 1.0;
    const inChannel = s * p.z > FIELD.halfL - rc && (mouth || s * p.z > FIELD.halfL);

    if (inChannel) {
      if (Math.abs(p.x) > G.halfW - rc) {
        const sx = Math.sign(p.x);
        p.x = sx * (G.halfW - rc);
        if (v.x * sx > 0) v.x *= -0.3;
      }
      if (s * p.z > FIELD.halfL + G.depth - rc) {
        p.z = s * (FIELD.halfL + G.depth - rc);
        if (v.z * s > 0) v.z *= -0.3;
      }
      if (s * p.z > FIELD.halfL && p.y > G.height - 1.2) {
        p.y = G.height - 1.2;
        if (v.y > 0) v.y = -v.y * 0.3;
      }
    } else {
      if (Math.abs(p.x) > FIELD.halfW - rc) {
        const sx = Math.sign(p.x);
        p.x = sx * (FIELD.halfW - rc);
        if (v.x * sx > 0) v.x *= -0.3;
      }
      if (s * p.z > FIELD.halfL - rc) {
        p.z = s * (FIELD.halfL - rc);
        if (v.z * s > 0) v.z *= -0.3;
      }
      for (const [sx, sz] of CORNER_SIGNS) {
        const d = (p.x * sx + p.z * sz) / SQ2;
        if (d > CORNER_LIM - rc) {
          const pen = d - (CORNER_LIM - rc);
          p.x -= sx * pen / SQ2;
          p.z -= sz * pen / SQ2;
          const vn = (v.x * sx + v.z * sz) / SQ2;
          if (vn > 0) {
            v.x -= 1.3 * vn * sx / SQ2;
            v.z -= 1.3 * vn * sz / SQ2;
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Collisions between actors
// ---------------------------------------------------------------------------

export function carBallCollide(car, ball, now, events) {
  TQ.copy(car.quat).invert();
  TV1.copy(ball.pos).sub(car.pos).applyQuaternion(TQ);
  TV2.set(
    clamp(TV1.x, -CAR_DIMS.hx, CAR_DIMS.hx),
    clamp(TV1.y, -CAR_DIMS.hy, CAR_DIMS.hy),
    clamp(TV1.z, -CAR_DIMS.hz, CAR_DIMS.hz),
  );
  TV2.applyQuaternion(car.quat).add(car.pos); // closest point on the car, world space

  TV3.copy(ball.pos).sub(TV2);
  const dist = TV3.length();
  if (dist >= BALL.r) return;

  let n;
  if (dist > 1e-4) n = TV3.multiplyScalar(1 / dist);
  else n = TV3.copy(ball.pos).sub(car.pos).normalize();

  ball.pos.addScaledVector(n, BALL.r - dist + 0.02);

  TV4.copy(ball.vel).sub(car.vel);
  const vn = TV4.dot(n);
  const st = car.stats;
  if (vn < 0) {
    ball.vel.addScaledVector(n, -vn * 1.55);
    car.vel.addScaledVector(n, vn * 0.2 / st.mass);
  }

  // arcade "power hit": extra impulse away from the car's center, biased upward
  if (vn < -6 && now - car.lastHitTime > 0.18) {
    car.lastHitTime = now;
    TV5.copy(ball.pos).sub(car.pos).normalize();
    TV5.y += 0.32;
    TV5.normalize();
    const power = Math.min(55, 4 + -vn * 0.5 * st.hitPower * (st.mass / (st.mass + 0.5)));
    ball.vel.addScaledVector(TV5, power);
    if (events) events.push({ type: 'hit', strength: -vn, team: car.team });
  }

  const sp = ball.vel.length();
  if (sp > BALL.maxSpeed) ball.vel.multiplyScalar(BALL.maxSpeed / sp);
}

export function carCarCollide(a, b, events) {
  TV1.copy(b.pos).sub(a.pos);
  const dist = TV1.length();
  const minDist = 5.2;
  if (dist >= minDist || dist < 1e-4) return;
  const n = TV1.multiplyScalar(1 / dist);
  const overlap = (minDist - dist) / 2;
  a.pos.addScaledVector(n, -overlap);
  b.pos.addScaledVector(n, overlap);
  TV2.copy(b.vel).sub(a.vel);
  const vn = TV2.dot(n);
  if (vn < 0) {
    const ma = a.stats.mass, mb = b.stats.mass;
    const jm = -(1 + 0.2) * vn * (ma * mb) / (ma + mb);
    a.vel.addScaledVector(n, -jm / ma);
    b.vel.addScaledVector(n, jm / mb);
    if (events && -vn > 24) events.push({ type: 'bump', strength: -vn });
  }
}

// ---------------------------------------------------------------------------
// AI driver
// ---------------------------------------------------------------------------

const AI_PRESETS = {
  rookie: { speed: 0.74, reaction: 0.55, aimErr: 7, dodge: false, boostAggro: 0.4 },
  pro:    { speed: 0.9,  reaction: 0.3,  aimErr: 3, dodge: true,  boostAggro: 0.75 },
  legend: { speed: 1.0,  reaction: 0.16, aimErr: 1, dodge: true,  boostAggro: 1.0 },
};

export class AIController {
  constructor(level = 'pro') {
    this.p = AI_PRESETS[level] || AI_PRESETS.pro;
    this.timer = 0;
    this.target = new THREE.Vector3();
    this.mode = 'attack';
    this.kickoffRush = false;
    this.dodgePhase = 0;
    this.dodgeT = 0;
    this.stuckTimer = 0;
    this.recoverT = 0;
    this.controls = { throttle: 0, steer: 0, boost: false, jump: false };
  }

  decide(match, car, dt) {
    const c = this.controls;
    const ball = match.ball;
    c.jump = false;
    c.boost = false;

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.p.reaction;
      this.retarget(match, car);
    }

    const dx = this.target.x - car.pos.x;
    const dz = this.target.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    const diff = wrapAngle(Math.atan2(dx, dz) - car.yaw);
    const ballDist = car.pos.distanceTo(ball.pos);
    const speed = car.vel.length();

    // wedged against a wall while trying to drive: back out for a moment
    if (this.recoverT > 0) {
      this.recoverT -= dt;
      c.throttle = -1;
      c.steer = clamp(diff * 3, -1, 1);
      if (this.recoverT <= 0) { this.stuckTimer = 0; this.timer = 0; }
      return c;
    }
    if (speed < 4 && car.onGround) this.stuckTimer += dt;
    else this.stuckTimer = Math.max(0, this.stuckTimer - 2 * dt);
    if (this.stuckTimer > 0.7) {
      this.recoverT = 0.7;
      return this.decide(match, car, 0);
    }

    c.throttle = 1;
    c.steer = clamp(-diff * 3, -1, 1);

    // target behind us and close: back up and spin around
    if (Math.abs(diff) > 2.2 && dist < 28) {
      c.throttle = -1;
      c.steer = clamp(diff * 3, -1, 1);
    } else if (Math.abs(diff) > 0.55 && dist < 40) {
      // target inside our turning circle: slow down so the circle tightens
      c.throttle = clamp(1.3 - Math.abs(diff), 0.15, 1);
    }

    // difficulty speed governor
    if (speed > car.stats.topSpeed * this.p.speed && !this.kickoffRush) c.throttle = Math.min(c.throttle, 0);

    // settle on a defensive post
    if (this.mode === 'defend' && dist < 6) c.throttle = speed > 8 ? -0.5 : 0;

    // boost when lined up
    if (Math.abs(diff) < 0.22 && car.boost > 8 && (dist > 30 || this.kickoffRush) &&
        Math.random() < this.p.boostAggro) {
      c.boost = true;
    }

    // jump for high balls dropping nearby
    if (ball.pos.y > 7 && ballDist < 13 && ball.vel.y < 5 && car.onGround && Math.random() < 2.0 * dt) {
      c.jump = true;
    }

    // dodge into the ball for a power hit
    if (this.p.dodge && this.dodgePhase === 0 && car.onGround && ballDist < 14 &&
        Math.abs(diff) < 0.3 && ball.pos.y < 5.5 && Math.random() < 1.2 * dt) {
      this.dodgePhase = 1;
      this.dodgeT = 0;
    }
    if (this.dodgePhase > 0) {
      this.dodgeT += dt;
      c.jump = this.dodgeT < 0.09 ? true : this.dodgeT < 0.16 ? false : this.dodgeT < 0.26;
      if (this.dodgeT >= 0.16) c.throttle = 1;
      if (this.dodgeT > 0.4) { this.dodgePhase = 0; this.dodgeT = 0; }
    }

    return c;
  }

  retarget(match, car) {
    const ball = match.ball;
    const p = this.p;
    const dir = car.team === 'blue' ? 1 : -1; // blue attacks +z
    const ownGoalZ = -dir * FIELD.halfL;

    // escape the goal channel first
    if (Math.abs(car.pos.z) > FIELD.halfL - 6) {
      this.mode = 'escape';
      this.target.set(0, 0, Math.sign(car.pos.z) * (FIELD.halfL - 30));
      return;
    }

    this.kickoffRush = ball.pos.x === 0 && ball.pos.z === 0 && ball.vel.lengthSq() < 1;

    const ballDist = car.pos.distanceTo(ball.pos);

    // top up on boost when the play is far away
    if (car.boost < 16 && !this.kickoffRush && ballDist > 45) {
      let best = null, bd = 70;
      for (const pad of match.pads) {
        if (!pad.big || pad.timer > 0) continue;
        const d = Math.hypot(pad.x - car.pos.x, pad.z - car.pos.z);
        if (d < bd) { bd = d; best = pad; }
      }
      if (best) {
        this.mode = 'boost';
        this.target.set(best.x, 0, best.z);
        return;
      }
    }

    const pred = predictBall(ball, Math.min(1.0, ballDist / 55));
    let attacking = (pred.z - car.pos.z) * dir > 2 || this.kickoffRush;

    // panic clear when the ball threatens our goal
    if (!attacking && Math.abs(pred.z - ownGoalZ) < 35) attacking = true;

    if (attacking) {
      // approach point slightly behind the ball, on the line to the opponent goal
      TV1.set((Math.random() * 2 - 1) * p.aimErr * 2, 0, dir * FIELD.halfL);
      TV2.copy(TV1).sub(pred); TV2.y = 0; TV2.normalize();
      this.mode = 'attack';
      this.target.copy(pred).addScaledVector(TV2, -8);
      this.target.x += (Math.random() * 2 - 1) * p.aimErr * 0.5;
    } else {
      this.mode = 'defend';
      this.target.set(
        clamp(ball.pos.x * 0.4, -FIELD.goal.halfW + 3, FIELD.goal.halfW - 3),
        0,
        ownGoalZ + dir * 14,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Match: state machine + fixed-step world update
// ---------------------------------------------------------------------------

export class Match {
  constructor(opts = {}) {
    const {
      playerCar = CARS[0],
      aiCar = CARS[1],
      duration = 300,
      difficulty = 'pro',
      onEvent = () => {},
    } = opts;

    this.onEvent = onEvent;
    this.duration = duration;
    this.timeLeft = duration;
    this.overtime = false;
    this.otTime = 0;
    this.score = { blue: 0, orange: 0 };

    this.ball = new Ball();
    this.player = new Car(playerCar, 'blue');
    this.opponent = new Car(aiCar, 'orange');
    this.cars = [this.player, this.opponent];
    this.ai = new AIController(difficulty);

    this.pads = BOOST_PADS.map((b) => ({ ...b, timer: 0 }));
    this.elapsed = 0;
    this.pendingEnd = false;
    this.state = 'countdown';
    this.stateTimer = 3;
    this.lastTick = 4;

    this.kickoffReset();
  }

  kickoffReset() {
    this.ball.reset();
    const lane = [-24, 0, 24][Math.floor(Math.random() * 3)];
    this.player.placeAt(lane, -64, Math.atan2(-lane, 64));
    this.opponent.placeAt(-lane, 64, Math.atan2(lane, -64));
    for (const c of this.cars) c.boost = 33;
    this.ai.timer = 0;
    this.ai.dodgePhase = 0;
  }

  finish() {
    this.state = 'finished';
    const { blue, orange } = this.score;
    this.onEvent({
      type: 'end',
      score: { blue, orange },
      winner: blue > orange ? 'blue' : orange > blue ? 'orange' : 'draw',
    });
  }

  step(dt) {
    const events = [];
    Object.assign(this.opponent.controls, this.ai.decide(this, this.opponent, dt));
    for (const car of this.cars) car.update(dt, events);
    carCarCollide(this.player, this.opponent, events);
    for (const car of this.cars) carBallCollide(car, this.ball, this.elapsed, events);
    this.ball.update(dt, events);
    this.updatePads(dt, events);
    for (const e of events) this.onEvent(e);
  }

  updatePads(dt, events) {
    for (const pad of this.pads) {
      if (pad.timer > 0) { pad.timer -= dt; continue; }
      for (const car of this.cars) {
        if (car.boost >= BOOST.max) continue;
        const dx = car.pos.x - pad.x, dz = car.pos.z - pad.z;
        if (dx * dx + dz * dz < (pad.big ? 49 : 20) && car.pos.y < 6) {
          car.boost = pad.big ? BOOST.max : Math.min(BOOST.max, car.boost + BOOST.small);
          pad.timer = pad.big ? BOOST.bigCooldown : BOOST.smallCooldown;
          events.push({ type: 'pad', big: pad.big, team: car.team });
          break;
        }
      }
    }
  }

  checkGoal() {
    const z = this.ball.pos.z;
    if (Math.abs(z) > FIELD.halfL + BALL.r) {
      const team = z > 0 ? 'blue' : 'orange';
      this.score[team]++;
      this.state = 'goal';
      this.stateTimer = 3;
      if (this.overtime) this.pendingEnd = true;
      this.onEvent({
        type: 'goal',
        team,
        score: { ...this.score },
        overtime: this.overtime,
        pos: this.ball.pos.clone(),
      });
    }
  }

  update(dt, input) {
    if (this.state === 'finished') return;
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    if (input) Object.assign(this.player.controls, input);

    switch (this.state) {
      case 'countdown': {
        this.stateTimer -= dt;
        const t = Math.ceil(this.stateTimer);
        if (t !== this.lastTick && this.stateTimer > 0) {
          this.lastTick = t;
          this.onEvent({ type: 'tick', n: t });
        }
        if (this.stateTimer <= 0) {
          this.state = this.overtime ? 'overtime' : 'play';
          this.onEvent({ type: 'go' });
        }
        break;
      }
      case 'play':
      case 'overtime': {
        if (this.state === 'play') {
          this.timeLeft -= dt;
          if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            if (this.score.blue === this.score.orange) {
              this.overtime = true;
              this.state = 'countdown';
              this.stateTimer = 3;
              this.lastTick = 4;
              this.kickoffReset();
              this.onEvent({ type: 'overtime' });
              break;
            }
            return this.finish();
          }
        } else {
          this.otTime += dt;
        }
        this.step(dt);
        this.checkGoal();
        break;
      }
      case 'goal': {
        this.stateTimer -= dt;
        this.step(dt); // ball sits in the net, cars can still drive
        if (this.stateTimer <= 0) {
          if (this.pendingEnd) return this.finish();
          this.state = 'countdown';
          this.stateTimer = 3;
          this.lastTick = 4;
          this.kickoffReset();
        }
        break;
      }
    }
  }
}
