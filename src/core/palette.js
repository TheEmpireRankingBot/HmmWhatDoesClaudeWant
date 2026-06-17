// Curated colour palettes shared across sketches.
//
// A palette is a background colour plus an ordered list of stop colours. Each
// palette exposes colorAt(t) which interpolates smoothly across the stops, so
// a sketch can ask for "the colour 30% of the way along" without caring how
// many stops there are.

import { clamp, lerp, hexToRgb } from './utils.js';

const PALETTES = [
  {
    name: 'Aurora',
    bg: '#05070d',
    stops: ['#0d324d', '#1c7293', '#2ec4b6', '#7be0ad', '#e9ff70'],
  },
  {
    name: 'Ember',
    bg: '#0a0504',
    stops: ['#2b0a02', '#7a1e05', '#d4421a', '#ff8c42', '#ffd27f'],
  },
  {
    name: 'Bloom',
    bg: '#0b0710',
    stops: ['#3a0ca3', '#7209b7', '#b5179e', '#f72585', '#ffb3c6'],
  },
  {
    name: 'Tide',
    bg: '#03070a',
    stops: ['#012a4a', '#2a6f97', '#468faf', '#89c2d9', '#dff5ff'],
  },
  {
    name: 'Flora',
    bg: '#070a05',
    stops: ['#1b3a1b', '#386641', '#6a994e', '#a7c957', '#f2e8cf'],
  },
  {
    name: 'Mono',
    bg: '#070707',
    stops: ['#1a1a1a', '#4d4d4d', '#8a8a8a', '#c8c8c8', '#ffffff'],
  },
  {
    name: 'Spectral',
    bg: '#060309',
    stops: ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'],
  },
];

export class Palette {
  constructor(def) {
    this.name = def.name;
    this.bg = def.bg;
    this.bgRgb = hexToRgb(def.bg);
    this.stops = def.stops.map(hexToRgb);
  }

  /** Interpolated colour at t in [0,1], returned as {r,g,b} (0-255). */
  colorAt(t) {
    // Coerce non-finite input (a NaN slips past clamp and would index out of
    // bounds) so a stray value can never crash the whole render loop.
    t = Number.isFinite(t) ? clamp(t, 0, 1) : 0;
    const n = this.stops.length - 1;
    const scaled = t * n;
    const i = Math.min(Math.floor(scaled), n - 1);
    const f = scaled - i;
    const a = this.stops[i];
    const b = this.stops[i + 1];
    return {
      r: lerp(a.r, b.r, f),
      g: lerp(a.g, b.g, f),
      b: lerp(a.b, b.b, f),
    };
  }

  /** Same as colorAt but as a ready-to-use CSS string. */
  css(t, alpha = 1) {
    const c = this.colorAt(t);
    return alpha >= 1
      ? `rgb(${c.r | 0}, ${c.g | 0}, ${c.b | 0})`
      : `rgba(${c.r | 0}, ${c.g | 0}, ${c.b | 0}, ${alpha})`;
  }
}

/** Cycle through the built-in palettes. */
export class PaletteBook {
  constructor() {
    this.index = 0;
    this.palettes = PALETTES.map((d) => new Palette(d));
  }
  get current() {
    return this.palettes[this.index];
  }
  next() {
    this.index = (this.index + 1) % this.palettes.length;
    return this.current;
  }
  setByName(name) {
    const i = this.palettes.findIndex((p) => p.name === name);
    if (i >= 0) this.index = i;
    return this.current;
  }
}
