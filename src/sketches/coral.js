// Coral — Gray–Scott reaction–diffusion.
//
// Two virtual chemicals, A and B, sit on a grid. A is fed in everywhere; B is
// removed everywhere; where they meet, B converts A into more B. Each chemical
// also diffuses. From those four terms alone you get spots, stripes, mazes,
// mitosis and coral — the same family of "Turing patterns" that paints seashells
// and animal coats. Tiny changes to feed/kill flip between whole regimes.
//
// The simulation runs on a downscaled grid (heavy per-cell maths) and is then
// upscaled with smoothing onto the canvas. Drag to inject chemical B.

import { Sketch } from '../core/sketch.js';
import { clamp, map } from '../core/utils.js';

export class Coral extends Sketch {
  static id = 'coral';
  static title = 'Coral';
  static blurb =
    'Gray–Scott reaction–diffusion. Two chemicals feeding, killing and ' +
    'spreading — the maths behind seashells and leopard spots. Drag to seed.';

  controls() {
    return [
      // Defaults sit in the persistent "coral growth" regime and match the
      // preset shown below; lower-feed regimes tend to wash out over time.
      { key: 'feed', label: 'Feed', type: 'range', min: 0.01, max: 0.09, step: 0.001, value: 0.0545 },
      { key: 'kill', label: 'Kill', type: 'range', min: 0.045, max: 0.07, step: 0.0005, value: 0.062 },
      { key: 'dA', label: 'Diffuse A', type: 'range', min: 0.6, max: 1.2, step: 0.02, value: 1.0 },
      { key: 'dB', label: 'Diffuse B', type: 'range', min: 0.3, max: 0.7, step: 0.02, value: 0.5 },
      { key: 'speed', label: 'Iterations/frame', type: 'range', min: 2, max: 18, step: 1, value: 10 },
      { key: 'preset', label: 'Preset', type: 'select', value: 'coral',
        options: [
          { value: 'coral', label: 'Coral' },
          { value: 'mitosis', label: 'Mitosis' },
          { value: 'maze', label: 'Maze' },
          { value: 'spots', label: 'Spots' },
          { value: 'waves', label: 'Waves' },
        ] },
    ];
  }

  reset() {
    this.buildGrid();
    this.clear();
  }

  resize() {
    this.buildGrid();
    this.clear();
  }

  onParam(key) {
    if (key === 'preset') {
      const p = PRESETS[this.params.preset];
      if (p) {
        this.params.feed = p.feed;
        this.params.kill = p.kill;
        // Tell the shell sliders to follow the preset.
        this.env.refreshControls?.();
      }
      this.seed();
    }
  }

  buildGrid() {
    const { width, height } = this.env;
    // Cap total cells for a steady frame-rate; preserve aspect ratio.
    const maxCells = 46000;
    const aspect = width / height;
    let gh = Math.round(Math.sqrt(maxCells / aspect));
    let gw = Math.round(gh * aspect);
    gw = clamp(gw, 60, 320);
    gh = clamp(gh, 60, 320);
    this.gw = gw;
    this.gh = gh;
    const n = gw * gh;
    this.a = new Float32Array(n).fill(1);
    this.b = new Float32Array(n).fill(0);
    this.a2 = new Float32Array(n);
    this.b2 = new Float32Array(n);

    this.offscreen = document.createElement('canvas');
    this.offscreen.width = gw;
    this.offscreen.height = gh;
    this.octx = this.offscreen.getContext('2d');
    this.image = this.octx.createImageData(gw, gh);
    this.seed();
  }

  /** Reset chemicals and drop a few seed blobs of B. */
  seed() {
    const { gw, gh, a, b } = this;
    a.fill(1);
    b.fill(0);
    const blobs = 14;
    for (let i = 0; i < blobs; i++) {
      const cx = Math.floor(Math.random() * gw);
      const cy = Math.floor(Math.random() * gh);
      this.paint(cx, cy, 5 + Math.random() * 6);
    }
  }

  /** Stamp a soft disc of chemical B at grid cell (cx,cy). */
  paint(cx, cy, radius) {
    const { gw, gh, b } = this;
    const r = Math.ceil(radius);
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        if (ox * ox + oy * oy > radius * radius) continue;
        const x = clamp(cx + ox, 0, gw - 1);
        const y = clamp(cy + oy, 0, gh - 1);
        b[y * gw + x] = 1;
      }
    }
  }

  frame() {
    const { env } = this;
    const { width, height, pointer } = env;
    const P = this.params;
    const { gw, gh } = this;

    // Inject chemical where the pointer is held down.
    if (pointer.inside && pointer.down) {
      const cx = Math.floor((pointer.x / width) * gw);
      const cy = Math.floor((pointer.y / height) * gh);
      this.paint(cx, cy, 4);
    }

    // Audio-reactive: each chime seeds a little fresh growth.
    if (env.audio?.beat) {
      for (let k = 0; k < 2; k++) {
        this.paint(Math.floor(Math.random() * gw), Math.floor(Math.random() * gh), 2.5);
      }
    }

    const iters = P.speed | 0;
    for (let i = 0; i < iters; i++) this.step(P);

    this.draw();
  }

  step(P) {
    const { gw, gh } = this;
    let a = this.a, b = this.b, a2 = this.a2, b2 = this.b2;
    const feed = P.feed, kill = P.kill, dA = P.dA, dB = P.dB;

    for (let y = 0; y < gh; y++) {
      const yUp = (y === 0 ? gh - 1 : y - 1) * gw;
      const yDn = (y === gh - 1 ? 0 : y + 1) * gw;
      const yC = y * gw;
      for (let x = 0; x < gw; x++) {
        const xL = x === 0 ? gw - 1 : x - 1;
        const xR = x === gw - 1 ? 0 : x + 1;
        const i = yC + x;

        const av = a[i];
        const bv = b[i];

        // 3x3 Laplacian: orthogonal neighbours weight 0.2, diagonals 0.05.
        const lapA =
          a[yC + xL] * 0.2 + a[yC + xR] * 0.2 + a[yUp + x] * 0.2 + a[yDn + x] * 0.2 +
          a[yUp + xL] * 0.05 + a[yUp + xR] * 0.05 + a[yDn + xL] * 0.05 + a[yDn + xR] * 0.05 -
          av;
        const lapB =
          b[yC + xL] * 0.2 + b[yC + xR] * 0.2 + b[yUp + x] * 0.2 + b[yDn + x] * 0.2 +
          b[yUp + xL] * 0.05 + b[yUp + xR] * 0.05 + b[yDn + xL] * 0.05 + b[yDn + xR] * 0.05 -
          bv;

        const reaction = av * bv * bv;
        let na = av + (dA * lapA - reaction + feed * (1 - av));
        let nb = bv + (dB * lapB + reaction - (kill + feed) * bv);
        // Concentrations are physically in [0,1]; clamping keeps the explicit
        // scheme from running away to Infinity/NaN for unlucky seeds (which
        // would otherwise blank the whole field).
        a2[i] = na < 0 ? 0 : na > 1 ? 1 : na;
        b2[i] = nb < 0 ? 0 : nb > 1 ? 1 : nb;
      }
    }
    // Swap buffers.
    this.a = a2; this.b = b2;
    this.a2 = a; this.b2 = b;
  }

  draw() {
    const { gw, gh, a, b, image, octx, ctx, env } = this;
    const { width, height, palette } = env;
    const data = image.data;
    const bg = palette.bgRgb;

    for (let i = 0; i < gw * gh; i++) {
      // Concentration difference is the classic Gray–Scott display value.
      let v = clamp(a[i] - b[i], 0, 1);
      const t = 1 - v; // more B => further along the palette
      const c = palette.colorAt(map(t, 0, 1, 0.0, 1.0));
      // Fade toward the background where there's nothing happening.
      const k = clamp(t * 1.4, 0, 1);
      const j = i * 4;
      data[j] = bg.r + (c.r - bg.r) * k;
      data[j + 1] = bg.g + (c.g - bg.g) * k;
      data[j + 2] = bg.b + (c.b - bg.b) * k;
      data[j + 3] = 255;
    }
    octx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.offscreen, 0, 0, gw, gh, 0, 0, width, height);
  }
}

const PRESETS = {
  coral: { feed: 0.0545, kill: 0.062 },
  mitosis: { feed: 0.0367, kill: 0.0649 },
  maze: { feed: 0.029, kill: 0.057 },
  spots: { feed: 0.025, kill: 0.06 },
  waves: { feed: 0.014, kill: 0.045 },
};
