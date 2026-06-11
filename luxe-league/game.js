// Luxe League — renderer, input, audio and game shell.
import * as THREE from './vendor/three.module.js';
import {
  FIELD, BALL, CAR_DIMS, CARS, BOOST_PADS,
  Match, clamp,
} from './sim.js';

const TEAM_COLOR = { blue: 0x3d8bff, orange: 0xff8c1a };

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $('game-canvas'),
  menu: $('menu'), pause: $('pause'), end: $('end'),
  scoreboard: $('scoreboard'), scoreBlue: $('score-blue'), scoreOrange: $('score-orange'),
  clock: $('clock'), banner: $('banner'), subBanner: $('sub-banner'),
  boostWrap: $('boost-wrap'), boostFill: $('boost-fill'), speed: $('speed'),
  carName: $('car-name'), carTagline: $('car-tagline'),
  stSpeed: $('st-speed'), stBoost: $('st-boost'), stHandling: $('st-handling'), stPower: $('st-power'),
  endTitle: $('end-title'), endScore: $('end-score'),
  touch: $('touch'), tStick: $('t-stick'), tKnob: $('t-knob'), tStickZone: $('t-stick-zone'),
  tBoost: $('t-boost'), tJump: $('t-jump'),
};

// ---------------------------------------------------------------------------
// Audio: everything synthesized, no assets
// ---------------------------------------------------------------------------

const SFX = {
  ctx: null, master: null, muted: false,
  engineOsc: null, engineGain: null, boostGain: null,

  ensure() {
    if (!this.ctx) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(ctx.destination);

      // engine: saw through a lowpass
      this.engineOsc = ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 480;
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(lp).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();

      // boost: looped noise through a bandpass
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer();
      noise.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
      this.boostGain = ctx.createGain();
      this.boostGain.gain.value = 0;
      noise.connect(bp).connect(this.boostGain).connect(this.master);
      noise.start();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  noiseBuffer() {
    if (this._noise) return this._noise;
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  },

  engine(speed01, boosting) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(50 + 150 * speed01, t, 0.06);
    this.engineGain.gain.setTargetAtTime(speed01 > 0.02 ? 0.035 + 0.075 * speed01 : 0, t, 0.08);
    this.boostGain.gain.setTargetAtTime(boosting ? 0.13 : 0, t, 0.05);
  },

  blip(freq, dur = 0.12, type = 'square', vol = 0.18) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  thud(vol = 0.5, bright = 0.4) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 180 + bright * 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.6, vol), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.25);
  },

  whoosh(vol = 0.12) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.3);
  },

  horn() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [f, v] of [[415, 0.16], [311, 0.13], [208, 0.08]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12;
      g.gain.setValueAtTime(v, t);
      g.gain.setValueAtTime(v, t + 0.55);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 1.05);
    }
    // crowd swell
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 2);
  },
};

// ---------------------------------------------------------------------------
// Renderer + scene
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x070b14, 260, 700);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.5, 1500);
camera.position.set(0, 30, -120);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// lights
scene.add(new THREE.HemisphereLight(0x6d8cc4, 0x141828, 1.5));
const keyLight = new THREE.DirectionalLight(0xfff4e0, 2.4);
keyLight.position.set(60, 95, -45);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -130; keyLight.shadow.camera.right = 130;
keyLight.shadow.camera.top = 140; keyLight.shadow.camera.bottom = -140;
keyLight.shadow.camera.far = 320;
keyLight.shadow.bias = -0.0005;
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x8fb4ff, 0.9);
fillLight.position.set(-55, 70, 60);
scene.add(fillLight);

for (const team of ['blue', 'orange']) {
  const l = new THREE.PointLight(TEAM_COLOR[team], 45, 110, 1.4);
  l.position.set(0, 16, (team === 'blue' ? -1 : 1) * (FIELD.halfL + 4));
  scene.add(l);
}

const flashLight = new THREE.PointLight(0xffffff, 0, 160, 1.2);
scene.add(flashLight);
let flashIntensity = 0;

// ---------------------------------------------------------------------------
// Canvas texture helpers
// ---------------------------------------------------------------------------

function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const skyTex = makeCanvas(64, 512, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#02030a');
  g.addColorStop(0.55, '#0b1230');
  g.addColorStop(0.78, '#27224d');
  g.addColorStop(1, '#3a2a3c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

const floorTex = makeCanvas(1024, 1536, (ctx, w, h) => {
  // canvas top maps to -z (blue end)
  ctx.fillStyle = '#0d1322';
  ctx.fillRect(0, 0, w, h);
  // subtle asphalt mottle
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  // team tints at each end
  const tintB = ctx.createLinearGradient(0, 0, 0, h * 0.3);
  tintB.addColorStop(0, 'rgba(61,139,255,0.16)');
  tintB.addColorStop(1, 'rgba(61,139,255,0)');
  ctx.fillStyle = tintB; ctx.fillRect(0, 0, w, h * 0.3);
  const tintO = ctx.createLinearGradient(0, h, 0, h * 0.7);
  tintO.addColorStop(0, 'rgba(255,140,26,0.16)');
  tintO.addColorStop(1, 'rgba(255,140,26,0)');
  ctx.fillStyle = tintO; ctx.fillRect(0, h * 0.7, w, h * 0.3);

  ctx.strokeStyle = 'rgba(170,195,255,0.5)';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  // halfway line + center circle
  ctx.beginPath(); ctx.moveTo(14, h / 2); ctx.lineTo(w - 14, h / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 130, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 10, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(170,195,255,0.5)'; ctx.fill();
  // goal boxes
  const pxPerX = w / (FIELD.halfW * 2);
  const boxW = FIELD.goal.halfW * 2.6 * pxPerX, boxH = 200;
  ctx.strokeRect(w / 2 - boxW / 2, 14, boxW, boxH);
  ctx.strokeRect(w / 2 - boxW / 2, h - 14 - boxH, boxW, boxH);
  // center mark
  ctx.fillStyle = 'rgba(232,198,106,0.5)';
  ctx.font = 'italic 900 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(w / 2, h / 2 - 160);
  ctx.fillText('LUXE LEAGUE', 0, 0);
  ctx.restore();
});

const ballTex = makeCanvas(512, 256, (ctx, w, h) => {
  ctx.fillStyle = '#f2f3f6';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c8a23c';
  ctx.lineWidth = 7;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo((w / 8) * i, 0); ctx.lineTo((w / 8) * i, h); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.lineWidth = 10; ctx.stroke();
  ctx.fillStyle = '#1a1d26';
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.arc((w / 8) * i + w / 16, h / 2 + (i % 2 ? -h / 5 : h / 5), 17, 0, Math.PI * 2);
    ctx.fill();
  }
});

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------

function buildArena() {
  const arena = new THREE.Group();

  // sky + stars
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(700, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  arena.add(sky);
  {
    const n = 350, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.45 + 0.08;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * 640;
      pos[i * 3 + 1] = Math.sin(e) * 640;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 640;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    arena.add(new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xbfd0ff, size: 1.6, sizeAttenuation: false, fog: false,
    })));
  }

  // outer ground
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(650, 48),
    new THREE.MeshStandardMaterial({ color: 0x05070d, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  arena.add(ground);

  // pitch
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD.halfW * 2, FIELD.halfL * 2),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85, metalness: 0.1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  arena.add(floor);

  // walls: data-driven segments {cx, cz, len, rotY}
  const c = FIELD.corner, hw = FIELD.halfW, hl = FIELD.halfL, G = FIELD.goal;
  const segs = [
    { cx: hw, cz: 0, len: 2 * (hl - c), rotY: -Math.PI / 2 },
    { cx: -hw, cz: 0, len: 2 * (hl - c), rotY: Math.PI / 2 },
    // corner bevels
    { cx: hw - c / 2, cz: hl - c / 2, len: c * Math.SQRT2, rotY: -Math.PI * 0.75 },
    { cx: hw - c / 2, cz: -(hl - c / 2), len: c * Math.SQRT2, rotY: -Math.PI * 0.25 },
    { cx: -(hw - c / 2), cz: hl - c / 2, len: c * Math.SQRT2, rotY: Math.PI * 0.75 },
    { cx: -(hw - c / 2), cz: -(hl - c / 2), len: c * Math.SQRT2, rotY: Math.PI * 0.25 },
    // end walls beside the goals
    { cx: (G.halfW + (hw - c)) / 2, cz: hl, len: (hw - c) - G.halfW, rotY: Math.PI },
    { cx: -(G.halfW + (hw - c)) / 2, cz: hl, len: (hw - c) - G.halfW, rotY: Math.PI },
    { cx: (G.halfW + (hw - c)) / 2, cz: -hl, len: (hw - c) - G.halfW, rotY: 0 },
    { cx: -(G.halfW + (hw - c)) / 2, cz: -hl, len: (hw - c) - G.halfW, rotY: 0 },
  ];
  const wallMat = new THREE.MeshBasicMaterial({
    color: 0x9cc4ff, transparent: true, opacity: 0.055,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const trimMat = new THREE.MeshBasicMaterial({ color: 0xe8c66a });
  for (const s of segs) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(s.len, FIELD.wallH), wallMat);
    wall.position.set(s.cx, FIELD.wallH / 2, s.cz);
    wall.rotation.y = s.rotY;
    arena.add(wall);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(s.len, 0.5, 0.5), trimMat);
    trim.position.set(s.cx, FIELD.wallH, s.cz);
    trim.rotation.y = s.rotY;
    arena.add(trim);
  }
  // panels above the goal mouths
  for (const sz of [1, -1]) {
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(G.halfW * 2, FIELD.wallH - G.height), wallMat);
    wall.position.set(0, G.height + (FIELD.wallH - G.height) / 2, sz * hl);
    arena.add(wall);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(G.halfW * 2, 0.5, 0.5), trimMat);
    trim.position.set(0, FIELD.wallH, sz * hl);
    arena.add(trim);
  }

  // goals
  for (const team of ['blue', 'orange']) {
    const sz = team === 'blue' ? -1 : 1; // the goal this team defends
    const col = TEAM_COLOR[team];
    const frameMat = new THREE.MeshBasicMaterial({ color: col });
    const post = new THREE.BoxGeometry(0.9, G.height, 0.9);
    for (const sx of [1, -1]) {
      const p = new THREE.Mesh(post, frameMat);
      p.position.set(sx * G.halfW, G.height / 2, sz * hl);
      arena.add(p);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(G.halfW * 2 + 0.9, 0.9, 0.9), frameMat);
    bar.position.set(0, G.height, sz * hl);
    arena.add(bar);
    const net = new THREE.Mesh(
      new THREE.BoxGeometry(G.halfW * 2, G.height, G.depth, 8, 4, 4),
      new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.28 }),
    );
    net.position.set(0, G.height / 2, sz * (hl + G.depth / 2));
    arena.add(net);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(G.halfW * 2, G.height),
      new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    glow.position.set(0, G.height / 2, sz * (hl + G.depth - 0.5));
    glow.rotation.y = sz > 0 ? Math.PI : 0;
    arena.add(glow);
  }

  // skyline silhouettes + floodlight towers
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + 0.12;
    const r = 215 + Math.random() * 70;
    const hgt = 26 + Math.random() * 70;
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(18 + Math.random() * 22, hgt, 14 + Math.random() * 16),
      new THREE.MeshStandardMaterial({ color: 0x0a0f1d, roughness: 1 }),
    );
    b.position.set(Math.cos(a) * r, hgt / 2, Math.sin(a) * r);
    b.rotation.y = Math.random() * Math.PI;
    arena.add(b);
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.3, 64, 8),
      new THREE.MeshStandardMaterial({ color: 0x1b2238, roughness: 0.7 }),
    );
    pole.position.set(sx * (FIELD.halfW + 22), 32, sz * (FIELD.halfL + 22));
    arena.add(pole);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(9, 4.5, 2.2),
      new THREE.MeshBasicMaterial({ color: 0xfff6dc }),
    );
    head.position.set(sx * (FIELD.halfW + 21), 64, sz * (FIELD.halfL + 21));
    head.lookAt(0, 0, 0);
    arena.add(head);
  }

  scene.add(arena);
}

buildArena();

// boost pad meshes (same order as match.pads)
const padViews = BOOST_PADS.map((pad) => {
  const group = new THREE.Group();
  group.position.set(pad.x, 0, pad.z);
  const mat = new THREE.MeshBasicMaterial({
    color: pad.big ? 0xffc83a : 0xffe9a8, transparent: true, opacity: 0.9,
  });
  if (pad.big) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.42, 8, 28), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.6;
    group.add(ring);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.1, 2.6, 10), mat);
    core.position.y = 1.3;
    group.add(core);
  } else {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.7, 12), mat);
    disc.position.y = 0.35;
    group.add(disc);
  }
  scene.add(group);
  return { group, mat, big: pad.big, phase: Math.random() * Math.PI * 2 };
});

// ---------------------------------------------------------------------------
// Ball + trail
// ---------------------------------------------------------------------------

const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(BALL.r, 32, 22),
  new THREE.MeshStandardMaterial({ map: ballTex, metalness: 0.45, roughness: 0.35 }),
);
ballMesh.castShadow = true;
scene.add(ballMesh);

const TRAIL_N = 36;
const trailGeo = new THREE.BufferGeometry();
const trailPos = new Float32Array(TRAIL_N * 3);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
const trailMat = new THREE.LineBasicMaterial({
  color: 0x7fd4ff, transparent: true, opacity: 0,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
const trail = new THREE.Line(trailGeo, trailMat);
trail.frustumCulled = false;
scene.add(trail);

function resetTrail(p) {
  for (let i = 0; i < TRAIL_N; i++) {
    trailPos[i * 3] = p.x; trailPos[i * 3 + 1] = p.y; trailPos[i * 3 + 2] = p.z;
  }
  trailGeo.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

class ParticleSystem {
  constructor(max = 1200) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.life0 = new Float32Array(max);
    this.base = new Float32Array(max * 3);
    this.grav = new Float32Array(max);
    this.head = 0;
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 1.5, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(p, v, color, life, grav = 0.25) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.base[i * 3] = color.r; this.base[i * 3 + 1] = color.g; this.base[i * 3 + 2] = color.b;
    this.life[i] = life; this.life0[i] = life;
    this.grav[i] = grav;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.vel[i * 3 + 1] -= 80 * this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.life0[i];
      this.col[i * 3] = this.base[i * 3] * f;
      this.col[i * 3 + 1] = this.base[i * 3 + 1] * f;
      this.col[i * 3 + 2] = this.base[i * 3 + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

const particles = new ParticleSystem();
const COL_WHITE = new THREE.Color(0xffffff);
const tmpColor = new THREE.Color();
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3();

function goalExplosion(pos, team) {
  const base = new THREE.Color(TEAM_COLOR[team]);
  for (let i = 0; i < 220; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
    const sp = 18 + Math.random() * 50;
    tmpV.set(Math.cos(a) * Math.cos(e) * sp, Math.abs(Math.sin(e)) * sp + 8, Math.sin(a) * Math.cos(e) * sp);
    tmpColor.copy(Math.random() < 0.35 ? COL_WHITE : base);
    particles.spawn(pos, tmpV, tmpColor, 0.7 + Math.random() * 0.9, 0.35);
  }
  flashLight.position.copy(pos).setY(10);
  flashLight.color.set(TEAM_COLOR[team]);
  flashIntensity = 320;
}

// ---------------------------------------------------------------------------
// Car meshes
// ---------------------------------------------------------------------------

function buildCarMesh(spec, team) {
  const g = new THREE.Group();
  const b = spec.body;
  const W = b.width, L = b.length, H = b.height;

  const paint = new THREE.MeshPhysicalMaterial({
    color: spec.color, metalness: 0.85, roughness: 0.3,
    clearcoat: 1, clearcoatRoughness: 0.15,
  });
  const accentMat = new THREE.MeshStandardMaterial({ color: spec.accent, metalness: 0.75, roughness: 0.35 });
  const glassMat = new THREE.MeshStandardMaterial({ color: spec.glass, metalness: 0.9, roughness: 0.1 });

  // hull, tapered toward the nose
  const hullGeo = new THREE.BoxGeometry(W, H, L, 1, 1, 4);
  const pa = hullGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i);
    if (y <= 0) continue;
    const zn = pa.getZ(i) / (L / 2);
    pa.setY(i, y * (1 - b.wedge * 0.8 * Math.max(0, zn)));
    if (zn > 0) pa.setX(i, pa.getX(i) * (1 - 0.1 * zn));
  }
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, paint);
  hull.position.y = -0.05;
  hull.castShadow = true;
  g.add(hull);

  // cabin
  const cabGeo = new THREE.BoxGeometry(W * 0.6, H * 0.85, L * b.cabinLen, 1, 1, 2);
  const ca = cabGeo.attributes.position;
  for (let i = 0; i < ca.count; i++) {
    if (ca.getY(i) > 0) {
      ca.setX(i, ca.getX(i) * 0.66);
      ca.setZ(i, ca.getZ(i) * 0.7 - L * 0.03);
    }
  }
  cabGeo.computeVertexNormals();
  const cabin = new THREE.Mesh(cabGeo, glassMat);
  cabin.position.set(0, H * 0.62, b.cabinPos);
  cabin.castShadow = true;
  g.add(cabin);

  // wheels: steer group (y) -> spin group (x) -> cylinders
  const tireGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.62, 14);
  const hubGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.66, 10);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.9 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd6, metalness: 0.95, roughness: 0.25 });
  const spinGroups = [], steerGroups = [];
  for (const [sx, szn] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const steer = new THREE.Group();
    steer.position.set(sx * (W / 2 - 0.1), -CAR_DIMS.hy + 0.95, szn * (L / 2 - 1.6));
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    spin.add(tire, hub);
    steer.add(spin);
    g.add(steer);
    spinGroups.push(spin);
    if (szn === 1) steerGroups.push(steer);
  }

  // spoiler
  if (b.spoiler > 0) {
    const postH = 0.5 + 0.6 * b.spoiler;
    for (const sx of [1, -1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, postH, 0.3), accentMat);
      post.position.set(sx * W * 0.28, H * 0.5 + postH / 2 - 0.1, -L / 2 + 0.6);
      g.add(post);
    }
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.92, 0.13, 0.8 + 0.5 * b.spoiler), accentMat);
    wing.position.set(0, H * 0.5 + postH - 0.05, -L / 2 + 0.55);
    wing.rotation.x = -0.12;
    g.add(wing);
  }

  // lights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff8e0 });
  for (const sx of [1, -1]) {
    const hl2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.12), headMat);
    hl2.position.set(sx * W * 0.3, 0.05 + H * 0.1, L / 2 * 0.99);
    g.add(hl2);
  }
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.72, 0.16, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
  );
  tail.position.set(0, H * 0.32, -L / 2 - 0.02);
  g.add(tail);

  // team underglow
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 1.8, L + 1.8),
    new THREE.MeshBasicMaterial({
      color: TEAM_COLOR[team], transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -CAR_DIMS.hy + 0.06;
  g.add(glow);
  const teamLight = new THREE.PointLight(TEAM_COLOR[team], 9, 15, 1.2);
  teamLight.position.y = -0.3;
  g.add(teamLight);

  const nozzles = [
    new THREE.Vector3(W * 0.16, -0.15, -L / 2 - 0.05),
    new THREE.Vector3(-W * 0.16, -0.15, -L / 2 - 0.05),
  ];
  return { group: g, spinGroups, steerGroups, nozzles };
}

const E1 = new THREE.Euler();
const Q1 = new THREE.Quaternion();
const AX = new THREE.Vector3();

class CarView {
  constructor(spec, team) {
    Object.assign(this, buildCarMesh(spec, team));
    this.spec = spec;
    this.roll = 0;
    this.spin = 0;
    scene.add(this.group);
  }

  update(car, dt, withFlames) {
    this.group.position.copy(car.pos);
    const speed = car.vel.length();
    const targetRoll = car.onGround ? car.controls.steer * 0.09 * Math.min(1, speed / 30) : 0;
    this.roll += (targetRoll - this.roll) * Math.min(1, 10 * dt);
    this.group.quaternion.setFromEuler(E1.set(-car.pitch, car.yaw, this.roll, 'YXZ'));
    if (car.flipTimer > 0) {
      const ang = (1 - car.flipTimer / 0.55) * Math.PI * 2;
      AX.set(car.flipDir.z, 0, car.flipDir.x);
      if (AX.lengthSq() < 0.01) AX.set(1, 0, 0);
      AX.normalize();
      this.group.quaternion.multiply(Q1.setFromAxisAngle(AX, ang));
    }
    // wheels
    const sF = car.vel.x * Math.sin(car.yaw) + car.vel.z * Math.cos(car.yaw);
    this.spin -= (sF / 0.95) * dt;
    for (const s of this.spinGroups) s.rotation.x = this.spin;
    for (const s of this.steerGroups) s.rotation.y = -car.controls.steer * 0.32;
    // boost flames
    if (withFlames && car.boosting) {
      car.forward(tmpV2).multiplyScalar(-22);
      for (const n of this.nozzles) {
        tmpV.copy(n);
        this.group.localToWorld(tmpV);
        tmpV3.copy(tmpV2);
        tmpV3.x += (Math.random() - 0.5) * 6;
        tmpV3.y += (Math.random() - 0.5) * 6;
        tmpV3.z += (Math.random() - 0.5) * 6;
        tmpColor.set(this.spec.flame).lerp(COL_WHITE, Math.random() * 0.6);
        particles.spawn(tmpV, tmpV3, tmpColor, 0.18 + Math.random() * 0.1, 0);
      }
    }
  }

  dispose() {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}

// ---------------------------------------------------------------------------
// Showroom (menu background)
// ---------------------------------------------------------------------------

const podium = new THREE.Group();
{
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(8.5, 9.5, 0.9, 36),
    new THREE.MeshStandardMaterial({ color: 0x131a2e, roughness: 0.4, metalness: 0.6 }),
  );
  base.position.y = 0.45;
  podium.add(base);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(9.0, 0.18, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0xe8c66a }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.92;
  podium.add(rim);
}
scene.add(podium);

let previewView = null;
function setPreviewCar(spec) {
  if (previewView) previewView.dispose();
  previewView = new CarView(spec, 'blue');
  previewView.group.position.set(0, CAR_DIMS.hy + 0.9, 0);
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const keys = new Set();
const touch = { active: false, steer: 0, throttle: 0, boost: false, jump: false };

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyC') camMode = camMode === 'ball' ? 'chase' : 'ball';
  if (e.code === 'KeyM') SFX.setMuted(!SFX.muted);
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

function getInput() {
  let throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
                 (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  let steer = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
              (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
  let jump = keys.has('Space');
  if (touch.active || touch.boost || touch.jump) {
    if (touch.throttle) throttle = touch.throttle;
    if (touch.steer) steer = touch.steer;
    boost = boost || touch.boost;
    jump = jump || touch.jump;
  }
  return { throttle, steer, boost, jump };
}

// touch joystick + buttons
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (IS_TOUCH) {
  let originX = 0, originY = 0, stickId = null;
  ui.tStickZone.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    stickId = t.identifier;
    originX = t.clientX; originY = t.clientY;
    touch.active = true;
    ui.tStick.style.display = 'block';
    ui.tStick.style.left = `${originX - 55}px`;
    ui.tStick.style.top = `${originY - 55}px`;
    e.preventDefault();
  }, { passive: false });
  ui.tStickZone.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      const dx = t.clientX - originX, dy = t.clientY - originY;
      touch.steer = clamp(dx / 42, -1, 1);
      touch.throttle = clamp(-dy / 42, -1, 1);
      ui.tKnob.style.left = `${31 + clamp(dx, -40, 40)}px`;
      ui.tKnob.style.top = `${31 + clamp(dy, -40, 40)}px`;
    }
    e.preventDefault();
  }, { passive: false });
  const endStick = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      stickId = null;
      touch.active = false; touch.steer = 0; touch.throttle = 0;
      ui.tStick.style.display = 'none';
      ui.tKnob.style.left = '31px'; ui.tKnob.style.top = '31px';
    }
  };
  ui.tStickZone.addEventListener('touchend', endStick);
  ui.tStickZone.addEventListener('touchcancel', endStick);

  for (const [el, prop] of [[ui.tBoost, 'boost'], [ui.tJump, 'jump']]) {
    el.addEventListener('touchstart', (e) => {
      touch[prop] = true; el.classList.add('active'); e.preventDefault();
    }, { passive: false });
    const off = () => { touch[prop] = false; el.classList.remove('active'); };
    el.addEventListener('touchend', off);
    el.addEventListener('touchcancel', off);
  }
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

let camMode = 'ball';
let shake = 0;
const camTarget = new THREE.Vector3(0, 4, 0);
const camDesired = new THREE.Vector3();
const lookDesired = new THREE.Vector3();
let showroomAngle = 0;

function updateCamera(dt) {
  if (appState === 'menu') {
    showroomAngle += dt * 0.35;
    camDesired.set(Math.sin(showroomAngle) * 17, 6.5, Math.cos(showroomAngle) * 17);
    camera.position.lerp(camDesired, Math.min(1, 3 * dt));
    camTarget.lerp(lookDesired.set(0, 2.2, 0), Math.min(1, 3 * dt));
    camera.lookAt(camTarget);
    return;
  }
  const car = match.player;
  const ball = match.ball;
  if (camMode === 'ball') {
    tmpV.copy(ball.pos).sub(car.pos);
    tmpV.y = 0;
    if (tmpV.lengthSq() < 1) car.forward(tmpV).setY(0);
    tmpV.normalize();
    camDesired.copy(car.pos).addScaledVector(tmpV, -25).add(tmpV2.set(0, 10.5, 0));
    lookDesired.copy(car.pos).multiplyScalar(0.35).addScaledVector(ball.pos, 0.65);
    lookDesired.y += 2.5;
  } else {
    car.forward(tmpV).setY(0).normalize();
    camDesired.copy(car.pos).addScaledVector(tmpV, -25).add(tmpV2.set(0, 10.5, 0));
    lookDesired.copy(car.pos).addScaledVector(tmpV, 20);
    lookDesired.y += 2;
  }
  if (camDesired.y < 3) camDesired.y = 3;
  camera.position.lerp(camDesired, Math.min(1, 7 * dt));
  camTarget.lerp(lookDesired, Math.min(1, 9 * dt));
  if (shake > 0.001) {
    shake *= Math.exp(-5 * dt);
    camTarget.x += (Math.random() - 0.5) * shake * 4;
    camTarget.y += (Math.random() - 0.5) * shake * 4;
  }
  camera.lookAt(camTarget);
}

// ---------------------------------------------------------------------------
// Menu / app state
// ---------------------------------------------------------------------------

let appState = 'menu'; // 'menu' | 'playing' | 'paused' | 'over'
let match = null;
let playerView = null, opponentView = null;
let playerSpec = CARS[0], opponentSpec = CARS[1];
let difficulty = 'pro';
let duration = 300;
let carIndex = Number(localStorage.getItem('luxe-car') || 0) % CARS.length;
let bannerTimer = null, subTimer = null;

function statRange(metric) {
  const vals = CARS.map(metric);
  return [Math.min(...vals), Math.max(...vals)];
}
const R_SPEED = statRange((c) => c.stats.boostTopSpeed);
const R_BOOST = statRange((c) => c.stats.boostAccel);
const R_TURN = statRange((c) => c.stats.turn);
const R_POWER = statRange((c) => c.stats.hitPower * c.stats.mass);

function pct(v, [lo, hi]) {
  return `${Math.round(20 + 78 * (v - lo) / (hi - lo || 1))}%`;
}

function renderCarCard() {
  const c = CARS[carIndex];
  ui.carName.textContent = c.name;
  ui.carName.style.color = `#${new THREE.Color(c.color).clone().lerp(COL_WHITE, 0.45).getHexString()}`;
  ui.carTagline.textContent = c.tagline;
  ui.stSpeed.style.width = pct(c.stats.boostTopSpeed, R_SPEED);
  ui.stBoost.style.width = pct(c.stats.boostAccel, R_BOOST);
  ui.stHandling.style.width = pct(c.stats.turn, R_TURN);
  ui.stPower.style.width = pct(c.stats.hitPower * c.stats.mass, R_POWER);
  setPreviewCar(c);
}

$('prev-car').addEventListener('click', () => {
  carIndex = (carIndex - 1 + CARS.length) % CARS.length;
  localStorage.setItem('luxe-car', carIndex);
  renderCarCard();
});
$('next-car').addEventListener('click', () => {
  carIndex = (carIndex + 1) % CARS.length;
  localStorage.setItem('luxe-car', carIndex);
  renderCarCard();
});

for (const [segId, setter] of [
  ['seg-difficulty', (v) => { difficulty = v; }],
  ['seg-duration', (v) => { duration = Number(v); }],
]) {
  const seg = $(segId);
  seg.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    for (const b of seg.querySelectorAll('button')) b.classList.toggle('on', b === btn);
    setter(btn.dataset.v);
  });
}

function showBanner(text, color = '#fff', hold = 1100) {
  ui.banner.textContent = text;
  ui.banner.style.color = color;
  ui.banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => ui.banner.classList.remove('show'), hold);
}

function showSub(text, hold = 2200) {
  ui.subBanner.textContent = text;
  ui.subBanner.classList.add('show');
  clearTimeout(subTimer);
  subTimer = setTimeout(() => ui.subBanner.classList.remove('show'), hold);
}

function handleEvent(e) {
  switch (e.type) {
    case 'tick':
      showBanner(String(e.n), '#e8c66a', 700);
      SFX.blip(520, 0.12, 'square', 0.14);
      break;
    case 'go':
      showBanner('GO!', '#e8c66a', 600);
      SFX.blip(880, 0.28, 'square', 0.18);
      break;
    case 'goal': {
      const col = e.team === 'blue' ? '#6ea8ff' : '#ffa64d';
      const scorer = e.team === 'blue' ? playerSpec.name : opponentSpec.name;
      showBanner('GOAL!', col, 2200);
      showSub(`${scorer} ${e.team === 'blue' ? '· you score!' : '· opponent scores'}`, 2400);
      ui.scoreBlue.textContent = e.score.blue;
      ui.scoreOrange.textContent = e.score.orange;
      goalExplosion(e.pos, e.team);
      shake = Math.max(shake, 0.9);
      SFX.horn();
      break;
    }
    case 'overtime':
      showBanner('OVERTIME', '#e8c66a', 2000);
      showSub('next goal wins', 2600);
      ui.clock.classList.add('ot');
      SFX.blip(330, 0.5, 'sawtooth', 0.16);
      break;
    case 'end': {
      appState = 'over';
      const won = e.winner === 'blue';
      ui.endTitle.textContent = won ? 'Victory' : 'Defeat';
      ui.endTitle.style.filter = won
        ? 'drop-shadow(0 2px 18px rgba(232,198,106,0.5))'
        : 'drop-shadow(0 2px 18px rgba(255,80,60,0.4)) grayscale(0.6)';
      ui.endScore.textContent = `${e.score.blue} — ${e.score.orange}`;
      ui.end.classList.remove('hidden');
      SFX.blip(620, 0.18, 'square', 0.16);
      setTimeout(() => SFX.blip(620, 0.18, 'square', 0.16), 240);
      setTimeout(() => SFX.blip(won ? 930 : 410, 0.55, 'square', 0.18), 480);
      break;
    }
    case 'hit':
      SFX.thud(Math.min(0.55, e.strength / 90), Math.min(1, e.strength / 50));
      if (e.strength > 35) shake = Math.max(shake, 0.25);
      break;
    case 'bounce':
      SFX.thud(Math.min(0.25, e.speed / 160), 0.3);
      break;
    case 'bump':
      SFX.thud(0.4, 0.7);
      shake = Math.max(shake, 0.2);
      break;
    case 'pad':
      if (e.team === 'blue') SFX.blip(e.big ? 1500 : 1200, 0.07, 'sine', 0.1);
      break;
    case 'jump':
      if (e.team === 'blue') SFX.whoosh(0.06);
      break;
    case 'dodge':
      if (e.team === 'blue') SFX.whoosh(0.14);
      break;
    case 'land':
      if (e.team === 'blue') SFX.thud(0.15, 0.25);
      break;
  }
}

function startMatch() {
  SFX.ensure();
  playerSpec = CARS[carIndex];
  const others = CARS.filter((c) => c !== playerSpec);
  opponentSpec = others[Math.floor(Math.random() * others.length)];

  if (playerView) playerView.dispose();
  if (opponentView) opponentView.dispose();
  if (previewView) { previewView.dispose(); previewView = null; }
  podium.visible = false;

  match = new Match({
    playerCar: playerSpec, aiCar: opponentSpec,
    duration, difficulty, onEvent: handleEvent,
  });
  playerView = new CarView(playerSpec, 'blue');
  opponentView = new CarView(opponentSpec, 'orange');
  resetTrail(match.ball.pos);

  ui.menu.classList.add('hidden');
  ui.end.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.scoreboard.classList.remove('hidden');
  ui.boostWrap.classList.remove('hidden');
  ui.scoreBlue.textContent = '0';
  ui.scoreOrange.textContent = '0';
  ui.clock.classList.remove('ot');
  if (IS_TOUCH) ui.touch.classList.remove('hidden');

  showSub(`vs ${opponentSpec.name} · ${difficulty.toUpperCase()}`, 2600);
  appState = 'playing';
  acc = 0;
}

function backToGarage() {
  appState = 'menu';
  match = null;
  if (playerView) { playerView.dispose(); playerView = null; }
  if (opponentView) { opponentView.dispose(); opponentView = null; }
  podium.visible = true;
  renderCarCard();
  ui.menu.classList.remove('hidden');
  ui.pause.classList.add('hidden');
  ui.end.classList.add('hidden');
  ui.scoreboard.classList.add('hidden');
  ui.boostWrap.classList.add('hidden');
  ui.touch.classList.add('hidden');
  ui.banner.classList.remove('show');
  ui.subBanner.classList.remove('show');
  ballMesh.position.set(0, -999, 0);
  resetTrail(ballMesh.position);
  SFX.engine(0, false);
}

function togglePause() {
  if (appState === 'playing') {
    appState = 'paused';
    ui.pause.classList.remove('hidden');
    SFX.engine(0, false);
  } else if (appState === 'paused') {
    appState = 'playing';
    ui.pause.classList.add('hidden');
  }
}

$('start-btn').addEventListener('click', startMatch);
$('rematch-btn').addEventListener('click', startMatch);
$('resume-btn').addEventListener('click', togglePause);
$('quit-btn').addEventListener('click', backToGarage);
$('garage-btn').addEventListener('click', backToGarage);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && appState === 'playing') togglePause();
});

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function updateHUD() {
  if (!match) return;
  if (match.overtime) {
    ui.clock.textContent = `+${fmtTime(match.otTime)}`;
  } else {
    ui.clock.textContent = fmtTime(match.timeLeft);
  }
  ui.boostFill.style.width = `${match.player.boost}%`;
  ui.speed.firstChild.textContent = `${Math.round(match.player.vel.length() * 2.2)} `;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const STEP = 1 / 120;
let acc = 0;
let last = performance.now();
const ballSpinAxis = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (appState === 'playing' && match) {
    const input = getInput();
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 10) {
      match.update(STEP, input);
      acc -= STEP;
      n++;
    }
    if (n >= 10) acc = 0;
  }

  const simActive = appState === 'playing' && match;

  if (match) {
    // ball
    ballMesh.position.copy(match.ball.pos);
    const bs = match.ball.vel.length();
    if (bs > 0.5 && simActive) {
      ballSpinAxis.set(match.ball.vel.z, 0, -match.ball.vel.x).normalize();
      ballMesh.rotateOnWorldAxis(ballSpinAxis, (bs * dt) / BALL.r);
    }
    // trail
    if (simActive) {
      for (let i = TRAIL_N - 1; i > 0; i--) {
        trailPos[i * 3] = trailPos[(i - 1) * 3];
        trailPos[i * 3 + 1] = trailPos[(i - 1) * 3 + 1];
        trailPos[i * 3 + 2] = trailPos[(i - 1) * 3 + 2];
      }
      trailPos[0] = match.ball.pos.x;
      trailPos[1] = match.ball.pos.y;
      trailPos[2] = match.ball.pos.z;
      trailGeo.attributes.position.needsUpdate = true;
    }
    trailMat.opacity = clamp((bs - 35) / 90, 0, 0.6);

    playerView.update(match.player, dt, simActive);
    opponentView.update(match.opponent, dt, simActive);

    // pads
    for (let i = 0; i < padViews.length; i++) {
      const pv = padViews[i];
      const ready = match.pads[i].timer <= 0;
      pv.mat.opacity = ready ? 0.9 : 0.1;
      pv.phase += dt * (pv.big ? 1.6 : 2.2);
      pv.group.rotation.y += dt * (pv.big ? 1.2 : 0);
      pv.group.position.y = ready ? Math.sin(pv.phase) * 0.25 + 0.25 : 0;
    }

    SFX.engine(
      simActive ? Math.min(1, match.player.vel.length() / 95) : 0,
      simActive && match.player.boosting,
    );
  } else {
    for (const pv of padViews) {
      pv.mat.opacity = 0.9;
      pv.phase += dt * 2;
      pv.group.position.y = Math.sin(pv.phase) * 0.25 + 0.25;
    }
  }

  particles.update(dt);
  flashIntensity *= Math.exp(-6 * dt);
  flashLight.intensity = flashIntensity;

  updateCamera(dt);
  updateHUD();
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

ballMesh.position.set(0, -999, 0);
renderCarCard();
window.addEventListener('pointerdown', () => SFX.ensure(), { once: true });
requestAnimationFrame(frame);

// test/debug hook (used by the headless smoke test; harmless in normal play)
Object.defineProperty(window, '__luxe', {
  value: {
    get match() { return match; },
    get appState() { return appState; },
    step(seconds, input = {}) {
      if (!match) return;
      const n = Math.round(seconds / STEP);
      for (let i = 0; i < n; i++) match.update(STEP, input);
    },
  },
});
