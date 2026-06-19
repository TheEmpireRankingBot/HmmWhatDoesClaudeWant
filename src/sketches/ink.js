// Ink — an interactive fluid, simulated.
//
// This is a real fluid solver: Jos Stam's "stable fluids" scheme for the
// incompressible Navier–Stokes equations, the method that won a SIGGRAPH
// technical Oscar and put smoke and water into films and games. Each frame the
// velocity field is:
//   1. made divergence-free (a Poisson pressure solve — fluid can't pile up),
//   2. advected through itself (it carries itself along),
//   3. made divergence-free again,
//   4. given its swirl back (vorticity confinement, so eddies don't wash out),
// and a dye field is carried along for the ride and drawn. Stable for any time
// step because advection is done by tracing backwards (semi-Lagrangian), not
// stepping forwards — hence "stable fluids".
//
// The simulation runs on a square grid (with a one-cell wall border) and is
// stretched onto the canvas, exactly like the other field pieces. Drag to push
// the fluid and lay down ink; it keeps drifting on its own between touches.

import { Sketch } from '../core/sketch.js';
import { mulberry32, clamp, TAU } from '../core/utils.js';

const RES = { low: 96, med: 128, high: 160 };
const COLOR_K = 0.28;  // soft-saturation constant for dye → brightness (smaller = brighter)

export class Ink extends Sketch {
  static id = 'ink';
  static title = 'Ink';
  static blurb =
    'A real fluid — Stam’s stable-fluids Navier–Stokes solver, with a ' +
    'pressure projection and vorticity confinement. Drag to push it and drop ink.';

  controls() {
    return [
      { key: 'swirl', label: 'Swirl', type: 'range', min: 0, max: 40, step: 1, value: 18 },
      { key: 'force', label: 'Force', type: 'range', min: 1, max: 14, step: 0.5, value: 7 },
      { key: 'fade', label: 'Dye fade', type: 'range', min: 0.95, max: 0.999, step: 0.001, value: 0.992 },
      { key: 'iters', label: 'Quality', type: 'range', min: 6, max: 24, step: 1, value: 16 },
      { key: 'resolution', label: 'Resolution', type: 'select', value: 'med',
        options: [
          { value: 'low', label: 'Low (96)' },
          { value: 'med', label: 'Medium (128)' },
          { value: 'high', label: 'High (160)' },
        ] },
      { key: 'colour', label: 'Colour by', type: 'select', value: 'both',
        options: [
          { value: 'dye', label: 'Dye' },
          { value: 'speed', label: 'Speed' },
          { value: 'both', label: 'Dye + speed' },
        ] },
    ];
  }

  reset() {
    this.seed = this.env.seed;
    this.buildGrid();
    this.clear();
  }

  resize() {
    // The simulation is square and size-independent; only the stretch to the
    // canvas and the pointer mapping change, so there's nothing to rebuild.
    this.clear();
  }

  onParam(key) {
    if (key === 'resolution') {
      this.buildGrid();
      this.clear();
    }
    // swirl / force / fade / iters / colour are read live each frame.
  }

  buildGrid() {
    const N = RES[this.params.resolution] || RES.med;
    const W = N + 2;
    const S = W * W;
    this.N = N;
    this.W = W;
    this.u = new Float32Array(S);
    this.v = new Float32Array(S);
    this.u0 = new Float32Array(S);
    this.v0 = new Float32Array(S);
    this.dye = new Float32Array(S);
    this.dye0 = new Float32Array(S);
    this.p = new Float32Array(S);
    this.div = new Float32Array(S);
    this.curl = new Float32Array(S);

    this.offscreen = document.createElement('canvas');
    this.offscreen.width = N;
    this.offscreen.height = N;
    this.octx = this.offscreen.getContext('2d');
    this.image = this.octx.createImageData(N, N);

    this.autoTimer = 0;
    this.seedSwirls();
  }

  /** A few deterministic swirls so the scene is alive from the first frame. */
  seedSwirls() {
    const N = this.N;
    const rng = mulberry32(this.seed ^ 0x2f6e2b1d);
    const blobs = 6 + (rng() * 4 | 0);
    for (let s = 0; s < blobs; s++) {
      const i = 2 + (rng() * (N - 3) | 0);
      const j = 2 + (rng() * (N - 3) | 0);
      const ang = rng() * TAU;
      const mag = 9 + rng() * 8;
      this.splat(i, j, Math.cos(ang) * mag, Math.sin(ang) * mag, 1.4, Math.max(4, N / 20));
    }
  }

  // ---- Stam solver primitives ---------------------------------------------
  setBnd(b, x) {
    const { N, W } = this;
    const IX = (i, j) => i + W * j;
    for (let i = 1; i <= N; i++) {
      x[IX(0, i)] = b === 1 ? -x[IX(1, i)] : x[IX(1, i)];
      x[IX(N + 1, i)] = b === 1 ? -x[IX(N, i)] : x[IX(N, i)];
      x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
      x[IX(i, N + 1)] = b === 2 ? -x[IX(i, N)] : x[IX(i, N)];
    }
    x[IX(0, 0)] = 0.5 * (x[IX(1, 0)] + x[IX(0, 1)]);
    x[IX(0, N + 1)] = 0.5 * (x[IX(1, N + 1)] + x[IX(0, N)]);
    x[IX(N + 1, 0)] = 0.5 * (x[IX(N, 0)] + x[IX(N + 1, 1)]);
    x[IX(N + 1, N + 1)] = 0.5 * (x[IX(N, N + 1)] + x[IX(N + 1, N)]);
  }

  linSolve(b, x, x0, a, c, iters) {
    const { N, W } = this;
    const invc = 1 / c;
    for (let k = 0; k < iters; k++) {
      for (let j = 1; j <= N; j++) {
        const row = W * j;
        for (let i = 1; i <= N; i++) {
          const id = i + row;
          x[id] = (x0[id] + a * (x[id - 1] + x[id + 1] + x[id - W] + x[id + W])) * invc;
        }
      }
      this.setBnd(b, x);
    }
  }

  advect(b, d, d0, u, v, dt) {
    const { N, W } = this;
    const dt0 = dt * N;
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        const id = i + W * j;
        let x = i - dt0 * u[id];
        let y = j - dt0 * v[id];
        if (x < 0.5) x = 0.5; else if (x > N + 0.5) x = N + 0.5;
        if (y < 0.5) y = 0.5; else if (y > N + 0.5) y = N + 0.5;
        const i0 = x | 0, i1 = i0 + 1;
        const j0 = y | 0, j1 = j0 + 1;
        const s1 = x - i0, s0 = 1 - s1, t1 = y - j0, t0 = 1 - t1;
        const r0 = W * j0, r1 = W * j1;
        d[id] =
          s0 * (t0 * d0[i0 + r0] + t1 * d0[i0 + r1]) +
          s1 * (t0 * d0[i1 + r0] + t1 * d0[i1 + r1]);
      }
    }
    this.setBnd(b, d);
  }

  project(u, v, p, div, iters) {
    const { N, W } = this;
    const h = 1 / N;
    for (let j = 1; j <= N; j++) {
      const row = W * j;
      for (let i = 1; i <= N; i++) {
        const id = i + row;
        div[id] = -0.5 * h * (u[id + 1] - u[id - 1] + v[id + W] - v[id - W]);
        p[id] = 0;
      }
    }
    this.setBnd(0, div);
    this.setBnd(0, p);
    this.linSolve(0, p, div, 1, 4, iters);
    for (let j = 1; j <= N; j++) {
      const row = W * j;
      for (let i = 1; i <= N; i++) {
        const id = i + row;
        u[id] -= 0.5 * (p[id + 1] - p[id - 1]) / h;
        v[id] -= 0.5 * (p[id + W] - p[id - W]) / h;
      }
    }
    this.setBnd(1, u);
    this.setBnd(2, v);
  }

  /** Vorticity confinement: find each eddy and nudge velocity to spin it more. */
  vorticity(eps, dt) {
    const { N, W, u, v, curl } = this;
    for (let j = 1; j <= N; j++) {
      const row = W * j;
      for (let i = 1; i <= N; i++) {
        const id = i + row;
        curl[id] = 0.5 * ((v[id + 1] - v[id - 1]) - (u[id + W] - u[id - W]));
      }
    }
    for (let j = 2; j <= N - 1; j++) {
      const row = W * j;
      for (let i = 2; i <= N - 1; i++) {
        const id = i + row;
        const dwdx = 0.5 * (Math.abs(curl[id + 1]) - Math.abs(curl[id - 1]));
        const dwdy = 0.5 * (Math.abs(curl[id + W]) - Math.abs(curl[id - W]));
        const len = Math.hypot(dwdx, dwdy) + 1e-5;
        const w = curl[id];
        u[id] += eps * dt * (dwdy / len) * w;
        v[id] += eps * dt * -(dwdx / len) * w;
      }
    }
    this.setBnd(1, u);
    this.setBnd(2, v);
  }

  /** Stamp velocity + dye into a soft disc (grid coords). */
  splat(ci, cj, fx, fy, amt, radius) {
    const { N, W, u, v, dye } = this;
    const r = Math.ceil(radius);
    const r2 = radius * radius;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const q = di * di + dj * dj;
        if (q > r2) continue;
        const ii = ci + di, jj = cj + dj;
        if (ii < 1 || ii > N || jj < 1 || jj > N) continue;
        const id = ii + W * jj;
        const fall = 1 - q / r2;
        u[id] += fx * fall;
        v[id] += fy * fall;
        dye[id] += amt * fall;
      }
    }
  }

  frame(dt) {
    const P = this.params;
    const { env, N } = this;
    const { width, height, pointer } = env;

    // --- Forcing: pointer drag pushes the fluid and lays down ink ----------
    if (pointer.inside) {
      const gi = clamp((pointer.x / width) * N, 1, N);
      const gj = clamp((pointer.y / height) * N, 1, N);
      if (pointer.down) {
        const dxp = pointer.x - pointer.px;
        const dyp = pointer.y - pointer.py;
        const fScale = P.force * 0.9;
        const fx = (dxp / width) * N * fScale;
        const fy = (dyp / height) * N * fScale;
        const moving = Math.abs(dxp) + Math.abs(dyp) > 0.01;
        this.splat(gi | 0, gj | 0, fx, fy, moving ? 1.3 : 0.7, Math.max(3, N / 26));
        if (pointer.justPressed) {
          // A click with no drag still blooms outward a little.
          this.splat(gi | 0, gj | 0, 0, 0, 0.9, Math.max(4, N / 18));
        }
      }
    }

    // --- Audio-reactive: each chime kicks a swirl into the fluid -----------
    const level = env.audio?.level || 0;
    if (env.audio?.beat) {
      const a = Math.random() * TAU;
      const mag = (7 + level * 16);
      this.splat(
        2 + (Math.random() * (N - 3) | 0), 2 + (Math.random() * (N - 3) | 0),
        Math.cos(a) * mag, Math.sin(a) * mag, 0.9, Math.max(4, N / 22)
      );
    }

    // --- Gentle automatic thermals so it stays alive unattended ------------
    this.autoTimer -= dt;
    if (this.autoTimer <= 0) {
      const r = Math.random;
      const ang = r() * TAU;
      const mag = 5 + r() * 7;
      this.splat(
        2 + (r() * (N - 3) | 0), 2 + (r() * (N - 3) | 0),
        Math.cos(ang) * mag, Math.sin(ang) * mag, 1.1, Math.max(4, N / 24)
      );
      this.autoTimer = 1.0 + r() * 1.8;
    }

    // --- Solve ------------------------------------------------------------
    const iters = P.iters | 0;
    this.project(this.u, this.v, this.p, this.div, iters);
    this.u0.set(this.u);
    this.v0.set(this.v);
    this.advect(1, this.u, this.u0, this.u0, this.v0, dt);
    this.advect(2, this.v, this.v0, this.u0, this.v0, dt);
    this.project(this.u, this.v, this.p, this.div, iters);
    const swirl = P.swirl * (1 + level * 0.6);
    if (swirl > 0) this.vorticity(swirl, dt);
    this.dye0.set(this.dye);
    this.advect(0, this.dye, this.dye0, this.u, this.v, dt);

    // --- Dissipate --------------------------------------------------------
    const dyeK = P.fade;
    const velK = 0.999;
    const { u, v, dye } = this;
    for (let k = 0; k < u.length; k++) {
      u[k] *= velK; v[k] *= velK; dye[k] *= dyeK;
    }

    this.draw();
  }

  draw() {
    const { N, W, dye, u, v, image, octx, ctx, env } = this;
    const { width, height, palette } = env;
    const data = image.data;
    const bg = palette.bgRgb;
    const mode = this.params.colour;
    const useSpeed = mode === 'speed' || mode === 'both';
    const useDye = mode !== 'speed';

    for (let j = 0; j < N; j++) {
      const row = W * (j + 1);
      for (let i = 0; i < N; i++) {
        const id = (i + 1) + row;
        const dv = dye[id];
        const dT = dv / (dv + COLOR_K); // soft saturation → [0,1)
        let t, k;
        if (useSpeed) {
          const sp = Math.min((Math.abs(u[id]) + Math.abs(v[id])) * 0.6, 1);
          if (mode === 'speed') { t = sp; k = clamp(sp * 1.2, 0, 1); }
          else { t = clamp(dT * 0.8 + sp * 0.4, 0, 1); k = clamp(dT * 1.25 + sp * 0.3, 0, 1); }
        } else {
          t = dT; k = clamp(dT * 1.3, 0, 1);
        }
        const c = palette.colorAt(0.1 + t * 0.85);
        const o = (i + N * j) * 4;
        data[o] = bg.r + (c.r - bg.r) * k;
        data[o + 1] = bg.g + (c.g - bg.g) * k;
        data[o + 2] = bg.b + (c.b - bg.b) * k;
        data[o + 3] = 255;
      }
    }
    octx.putImageData(image, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.offscreen, 0, 0, N, N, 0, 0, width, height);

    // Soft additive bloom for a wet, luminous look.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18;
    const m = Math.max(width, height) * 0.01;
    ctx.drawImage(this.offscreen, 0, 0, N, N, -m, -m, width + m * 2, height + m * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
