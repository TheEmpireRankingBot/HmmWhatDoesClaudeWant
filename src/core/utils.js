// Small, dependency-free math + helper utilities shared by every sketch.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a, b, t) => a + (b - a) * t;

/** Re-map `v` from the range [inMin,inMax] onto [outMin,outMax]. */
export const map = (v, inMin, inMax, outMin, outMax) =>
  outMin + ((v - inMin) * (outMax - outMin)) / (inMax - inMin);

/** Smoothstep easing on the unit interval. */
export const smoothstep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/** Wrap a value into the half-open range [0, size). */
export const wrap = (v, size) => ((v % size) + size) % size;

export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

/**
 * Mulberry32 — a tiny, fast, seedable PRNG. Returns a function producing
 * floats in [0,1). Deterministic for a given seed, which is what lets the
 * "regenerate" button reproduce or reroll a scene predictably.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a fresh 32-bit seed, e.g. for "regenerate". */
export const randomSeed = () => (Math.random() * 0xffffffff) >>> 0;

/** HSL -> "hsl(...)" string, convenience for sketches that think in hue. */
export const hsl = (h, s, l, a = 1) =>
  a >= 1 ? `hsl(${h}, ${s}%, ${l}%)` : `hsla(${h}, ${s}%, ${l}%, ${a})`;

/** Format a hex byte (0-255) with leading zero. */
const hex2 = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');

/** {r,g,b} in 0-255 -> "#rrggbb". */
export const rgbToHex = ({ r, g, b }) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** "#rrggbb" or "#rgb" -> {r,g,b} in 0-255. */
export function hexToRgb(hex) {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
