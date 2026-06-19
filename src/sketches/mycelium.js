// Mycelium — a Physarum (slime-mould) transport network.
//
// Thousands of agents crawl across the canvas, each one blind to every other.
// The only thing they share is a fading chemical trail painted into the grid
// beneath them. Each agent samples that trail at three points just ahead — left,
// centre, right — steers toward wherever it smells strongest, takes a step, and
// drops a little trail of its own. The trail slowly diffuses and fades.
//
// That single sense-steer-deposit rule, with no agent aware of the whole, is
// enough to grow the branching, self-optimising veins a real slime mould uses to
// connect food sources (famously re-deriving the Tokyo rail map). It is an
// agent simulation and a reaction field at once.
//
// A note on stability: on a wrap-around grid a colony can collapse onto a single
// closed loop (a stable geodesic), which reads as one fat band rather than a
// network. Two ingredients keep it a living 2D mesh — a small random jitter on
// each agent's heading (so they never all lock onto one line) and a wide enough
// sensor angle. The shipped presets were swept across screen sizes and seeds to
// stay in the mesh regime.
//
// The agents live in a downscaled grid (one trail value per cell) which is then
// upscaled with smoothing onto the canvas, so the threads read as soft veins
// rather than pixels. Drag to feed the colony a blob of attractant.

import { Sketch } from '../core/sketch.js';
import { mulberry32, clamp, wrap, TAU } from '../core/utils.js';

const DEPOSIT = 0.22;   // trail dropped per agent per step (grid units)
const ITERATIONS = 2;   // simulation sub-steps per frame
const TRAIL_MAX = 8;    // hard ceiling so a fed spike can never run away
const COLOR_K = 0.65;   // soft-saturation constant for the trail→brightness curve

export class Mycelium extends Sketch {
  static id = 'mycelium';
  static title = 'Mycelium';
  static blurb =
    'A slime mould, simulated. Thousands of agents follow and feed a shared ' +
    'chemical trail; living veins self-organise from one local rule. Drag to feed.';

  controls() {
    return [
      // Defaults are the "Network" preset below.
      { key: 'density', label: 'Density', type: 'range', min: 0.04, max: 0.2, step: 0.01, value: 0.13 },
      { key: 'sensorAngle', label: 'Sensor angle', type: 'range', min: 0.1, max: 1.4, step: 0.02, value: 1.0 },
      { key: 'sensorDist', label: 'Sensor reach', type: 'range', min: 3, max: 18, step: 0.5, value: 9 },
      { key: 'turn', label: 'Turn rate', type: 'range', min: 0.1, max: 0.9, step: 0.02, value: 0.45 },
      { key: 'persist', label: 'Persistence', type: 'range', min: 0.8, max: 0.96, step: 0.005, value: 0.9 },
      { key: 'preset', label: 'Preset', type: 'select', value: 'network',
        options: [
          { value: 'network', label: 'Network' },
          { value: 'veins', label: 'Veins' },
          { value: 'bloom', label: 'Bloom' },
          { value: 'strands', label: 'Strands' },
          { value: 'frenzy', label: 'Frenzy' },
        ] },
    ];
  }

  reset() {
    this.seed = this.env.seed;
    this.applyPresetInternals();
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
        this.params.density = p.density;
        this.params.sensorAngle = p.sensorAngle;
        this.params.sensorDist = p.sensorDist;
        this.params.turn = p.turn;
        this.params.persist = p.persist;
        this.env.refreshControls?.();
      }
      this.applyPresetInternals();
      this.seedAgents();
      this.trail.fill(0);
    } else if (key === 'density') {
      // Population changed — rebuild the agent arrays, keep the trail.
      this.seedAgents();
    }
    // sensorAngle / sensorDist / turn / persist are read live each step.
  }

  /** Pull the two non-slider knobs (jitter, step length) from the active preset. */
  applyPresetInternals() {
    const p = PRESETS[this.params.preset] || PRESETS.network;
    this.jitter = p.jitter;
    this.stepLen = p.step;
  }

  buildGrid() {
    const { width, height } = this.env;
    // Cap total cells for a steady frame-rate; preserve aspect ratio.
    const maxCells = 40000;
    const aspect = width / height;
    let gh = Math.round(Math.sqrt(maxCells / aspect));
    let gw = Math.round(gh * aspect);
    gw = clamp(gw, 90, 280);
    gh = clamp(gh, 90, 280);
    this.gw = gw;
    this.gh = gh;
    const n = gw * gh;
    this.trail = new Float32Array(n);
    this.trail2 = new Float32Array(n);

    this.offscreen = document.createElement('canvas');
    this.offscreen.width = gw;
    this.offscreen.height = gh;
    this.octx = this.offscreen.getContext('2d');
    this.image = this.octx.createImageData(gw, gh);

    this.seedAgents();
  }

  /** Scatter the colony: random position, random heading, deterministic by seed. */
  seedAgents() {
    const { gw, gh } = this;
    const rng = mulberry32(this.seed ^ 0x51ed270b);
    const count = Math.max(64, Math.floor(this.params.density * gw * gh));
    this.count = count;
    this.px = new Float32Array(count);
    this.py = new Float32Array(count);
    this.ph = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.px[i] = rng() * gw;
      this.py[i] = rng() * gh;
      this.ph[i] = rng() * TAU;
    }
  }

  /** Trail value at a wrapped, nearest grid cell. */
  sampleAt(x, y) {
    const { gw, gh, trail } = this;
    let xi = (x | 0) % gw; if (xi < 0) xi += gw;
    let yi = (y | 0) % gh; if (yi < 0) yi += gh;
    return trail[yi * gw + xi];
  }

  /** Stamp a soft disc of attractant — the pointer feeding the colony. */
  feed(cx, cy, radius, amount) {
    const { gw, gh, trail } = this;
    const r = Math.ceil(radius);
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        const d2 = ox * ox + oy * oy;
        if (d2 > radius * radius) continue;
        let x = cx + ox; if (x < 0) x += gw; else if (x >= gw) x -= gw;
        let y = cy + oy; if (y < 0) y += gh; else if (y >= gh) y -= gh;
        const i = y * gw + x;
        const v = trail[i] + amount * (1 - d2 / (radius * radius));
        trail[i] = v > TRAIL_MAX ? TRAIL_MAX : v;
      }
    }
  }

  frame() {
    const { env } = this;
    const { width, height, pointer } = env;
    const { gw, gh } = this;

    // Feed where the pointer is held.
    if (pointer.inside && pointer.down) {
      const cx = Math.floor((pointer.x / width) * gw);
      const cy = Math.floor((pointer.y / height) * gh);
      this.feed(cx, cy, 5, 0.9);
    }

    for (let s = 0; s < ITERATIONS; s++) this.step();
    this.draw();
  }

  step() {
    const { gw, gh, trail, trail2, px, py, ph, count } = this;
    const P = this.params;
    const SA = P.sensorAngle, SD = P.sensorDist, TR = P.turn, DC = P.persist;
    const JT = this.jitter, SS = this.stepLen;
    const rng = Math.random;

    // --- Agents: sense ahead, steer toward the strongest trail, move, drop ---
    for (let i = 0; i < count; i++) {
      const x = px[i], y = py[i];
      let h = ph[i];

      // Three sensors: centre, and heading ± the sensor angle.
      const fc = this.sampleAt(x + Math.cos(h) * SD, y + Math.sin(h) * SD);
      const fl = this.sampleAt(x + Math.cos(h - SA) * SD, y + Math.sin(h - SA) * SD);
      const fr = this.sampleAt(x + Math.cos(h + SA) * SD, y + Math.sin(h + SA) * SD);

      if (fc > fl && fc > fr) {
        // straight on — the trail dead ahead is strongest
      } else if (fc < fl && fc < fr) {
        h += (rng() < 0.5 ? -TR : TR); // both sides better: commit to one
      } else if (fl > fr) {
        h -= TR;
      } else if (fr > fl) {
        h += TR;
      }
      // A little noise so agents never perfectly align into a single line.
      h += (rng() - 0.5) * JT;

      const nx = wrap(x + Math.cos(h) * SS, gw);
      const ny = wrap(y + Math.sin(h) * SS, gh);
      px[i] = nx; py[i] = ny; ph[i] = h;

      const id = ((ny | 0) * gw) + (nx | 0);
      const v = trail[id] + DEPOSIT;
      trail[id] = v > TRAIL_MAX ? TRAIL_MAX : v;
    }

    // --- Field: 3x3 mean blur (diffuse) times decay (evaporate) --------------
    for (let y = 0; y < gh; y++) {
      const yU = (y === 0 ? gh - 1 : y - 1) * gw;
      const yD = (y === gh - 1 ? 0 : y + 1) * gw;
      const yC = y * gw;
      for (let x = 0; x < gw; x++) {
        const xL = x === 0 ? gw - 1 : x - 1;
        const xR = x === gw - 1 ? 0 : x + 1;
        const sum =
          trail[yC + xL] + trail[yC + x] + trail[yC + xR] +
          trail[yU + xL] + trail[yU + x] + trail[yU + xR] +
          trail[yD + xL] + trail[yD + x] + trail[yD + xR];
        const v = (sum * 0.111111) * DC;
        trail2[yC + x] = v > TRAIL_MAX ? TRAIL_MAX : v;
      }
    }
    // Swap buffers.
    this.trail = trail2;
    this.trail2 = trail;
  }

  draw() {
    const { gw, gh, trail, image, octx, ctx, env } = this;
    const { width, height, palette } = env;
    const data = image.data;
    const bg = palette.bgRgb;

    for (let i = 0; i < gw * gh; i++) {
      const v = trail[i];
      // Soft saturation maps an unbounded trail into [0,1) — bright veins glow
      // without ever clipping to a flat slab of colour.
      const t = v / (v + COLOR_K);
      const c = palette.colorAt(0.15 + t * 0.8);
      const k = t < 0.87 ? t * 1.15 : 1; // fade to background where it's quiet
      const j = i * 4;
      data[j] = bg.r + (c.r - bg.r) * k;
      data[j + 1] = bg.g + (c.g - bg.g) * k;
      data[j + 2] = bg.b + (c.b - bg.b) * k;
      data[j + 3] = 255;
    }
    octx.putImageData(image, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.offscreen, 0, 0, gw, gh, 0, 0, width, height);

    // A soft additive bloom: redraw the field a touch larger and lighter so the
    // brightest veins haze outward. Cheap, and it makes the colony feel lit.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.22;
    const m = Math.max(width, height) * 0.008;
    ctx.drawImage(this.offscreen, 0, 0, gw, gh, -m, -m, width + m * 2, height + m * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

// Each preset was swept across desktop and mobile grid sizes and many seeds to
// confirm it grows a 2D mesh rather than collapsing to a single band.
const PRESETS = {
  network: { density: 0.13, sensorAngle: 1.0, sensorDist: 9, turn: 0.45, persist: 0.9, jitter: 0.4, step: 1.1 },
  veins: { density: 0.17, sensorAngle: 0.95, sensorDist: 13, turn: 0.4, persist: 0.88, jitter: 0.55, step: 1.3 },
  bloom: { density: 0.2, sensorAngle: 1.0, sensorDist: 11, turn: 0.48, persist: 0.93, jitter: 0.48, step: 1.0 },
  strands: { density: 0.14, sensorAngle: 0.95, sensorDist: 16, turn: 0.3, persist: 0.9, jitter: 0.55, step: 1.4 },
  frenzy: { density: 0.12, sensorAngle: 1.15, sensorDist: 12, turn: 0.85, persist: 0.85, jitter: 0.7, step: 1.5 },
};
