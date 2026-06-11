// Seedable RNG (mulberry32) so a whole game state — including randomness —
// can be serialized to localStorage and resumed deterministically.

export function createRng(seed) {
  return { s: seed >>> 0 };
}

export function next(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(rng, min, max) {
  // inclusive both ends
  return min + Math.floor(next(rng) * (max - min + 1));
}

export function pick(rng, arr) {
  return arr[Math.floor(next(rng) * arr.length)];
}

export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next(rng) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Knuth Poisson sampler; lambdas here are small (< 6) so this is fast.
export function poisson(rng, lambda) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= next(rng);
  } while (p > L);
  return k - 1;
}

// Roughly normal in [-1, 1] via sum of uniforms.
export function jitter(rng) {
  return (next(rng) + next(rng) + next(rng)) / 1.5 - 1;
}
