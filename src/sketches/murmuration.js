// Murmuration — classic Reynolds boids.
//
// Every bird follows three local rules — separation, alignment, cohesion — and
// nothing else. No bird knows about the flock; the flock is what the rules add
// up to. A uniform spatial hash keeps neighbour lookups cheap so the count can
// climb into the thousands. The pointer is a hawk (repel) or a roost (attract).

import { Sketch } from '../core/sketch.js';
import { clamp, TAU } from '../core/utils.js';

export class Murmuration extends Sketch {
  static id = 'murmuration';
  static title = 'Murmuration';
  static blurb =
    'Boids. Three local rules — keep apart, align, draw together — and a ' +
    'flock emerges that no single bird intends. The pointer is a hawk.';

  controls() {
    return [
      { key: 'count', label: 'Birds', type: 'range', min: 200, max: 2500, step: 50, value: 900 },
      { key: 'perception', label: 'Perception', type: 'range', min: 20, max: 90, step: 2, value: 46 },
      { key: 'separation', label: 'Separation', type: 'range', min: 0, max: 3, step: 0.05, value: 1.4 },
      { key: 'alignment', label: 'Alignment', type: 'range', min: 0, max: 3, step: 0.05, value: 1.0 },
      { key: 'cohesion', label: 'Cohesion', type: 'range', min: 0, max: 3, step: 0.05, value: 0.9 },
      { key: 'maxSpeed', label: 'Max speed', type: 'range', min: 1, max: 6, step: 0.2, value: 3.2 },
      { key: 'trail', label: 'Trail length', type: 'range', min: 0.04, max: 1, step: 0.02, value: 0.22 },
      { key: 'pointer', label: 'Pointer', type: 'select', value: 'hawk',
        options: [
          { value: 'hawk', label: 'Hawk (repel)' },
          { value: 'roost', label: 'Roost (attract)' },
          { value: 'off', label: 'Ignore' },
        ] },
    ];
  }

  reset() {
    const { width, height } = this.env;
    this.boids = [];
    for (let i = 0; i < this.params.count; i++) {
      const a = Math.random() * TAU;
      this.boids.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(a) * 2,
        vy: Math.sin(a) * 2,
      });
    }
    this.grid = new Map();
    this.clear();
  }

  syncCount() {
    const { width, height } = this.env;
    const b = this.boids;
    while (b.length < this.params.count) {
      const a = Math.random() * TAU;
      b.push({ x: Math.random() * width, y: Math.random() * height, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2 });
    }
    if (b.length > this.params.count) b.length = this.params.count;
  }

  frame(dt) {
    const { ctx, env } = this;
    const { width, height, palette, pointer } = env;
    const P = this.params;
    if (this.boids.length !== P.count) this.syncCount();

    this.fade(P.trail);

    const R = P.perception;
    const R2 = R * R;
    const cell = R;
    const cols = Math.max(1, Math.ceil(width / cell));

    // Rebuild the spatial hash: bucket key = gridY * cols + gridX.
    const grid = this.grid;
    grid.clear();
    for (const b of this.boids) {
      const gx = clamp(Math.floor(b.x / cell), 0, cols - 1);
      const gy = Math.max(0, Math.floor(b.y / cell));
      const key = gy * cols + gx;
      let bucket = grid.get(key);
      if (!bucket) grid.set(key, (bucket = []));
      bucket.push(b);
    }

    // Normalise rule weights so the three forces stay balanced as sliders move.
    const wSep = P.separation;
    const wAli = P.alignment;
    const wCoh = P.cohesion;
    const maxSpeed = P.maxSpeed;
    const maxForce = 0.06 * maxSpeed;
    // Frame-rate compensation so motion is consistent regardless of fps.
    const tStep = clamp(dt * 60, 0.5, 2);

    for (const b of this.boids) {
      let sepX = 0, sepY = 0;
      let aliX = 0, aliY = 0;
      let cohX = 0, cohY = 0;
      let count = 0;

      const gx = clamp(Math.floor(b.x / cell), 0, cols - 1);
      const gy = Math.max(0, Math.floor(b.y / cell));

      // Only the 3x3 block of buckets around the boid can hold neighbours.
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = gx + ox;
          if (nx < 0 || nx >= cols) continue;
          const ny = gy + oy;
          if (ny < 0) continue;
          const bucket = grid.get(ny * cols + nx);
          if (!bucket) continue;
          for (const o of bucket) {
            if (o === b) continue;
            const dx = b.x - o.x;
            const dy = b.y - o.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > R2 || d2 === 0) continue;
            // Separation is weighted by inverse distance: closer pushes harder.
            const inv = 1 / d2;
            sepX += dx * inv;
            sepY += dy * inv;
            aliX += o.vx;
            aliY += o.vy;
            cohX += o.x;
            cohY += o.y;
            count++;
          }
        }
      }

      let ax = 0, ay = 0;
      if (count > 0) {
        ax += steer(sepX, sepY, maxSpeed, maxForce) * wSep;
        ay += steerY * wSep;
        ax += steer(aliX / count, aliY / count, maxSpeed, maxForce) * wAli;
        ay += steerY * wAli;
        ax += steer(cohX / count - b.x, cohY / count - b.y, maxSpeed, maxForce) * wCoh;
        ay += steerY * wCoh;
      }

      // Pointer interaction.
      if (P.pointer !== 'off' && pointer.inside) {
        const dx = b.x - pointer.x;
        const dy = b.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        const reach = 160;
        if (d2 < reach * reach) {
          const d = Math.sqrt(d2) + 0.001;
          const f = (1 - d / reach) * maxForce * 6;
          const sign = P.pointer === 'hawk' ? 1 : -1;
          ax += (dx / d) * f * sign;
          ay += (dy / d) * f * sign;
        }
      }

      b.vx += ax * tStep;
      b.vy += ay * tStep;

      const sp = Math.hypot(b.vx, b.vy);
      if (sp > maxSpeed) {
        b.vx = (b.vx / sp) * maxSpeed;
        b.vy = (b.vy / sp) * maxSpeed;
      } else if (sp < maxSpeed * 0.4 && sp > 0) {
        // Keep birds from stalling.
        b.vx = (b.vx / sp) * maxSpeed * 0.4;
        b.vy = (b.vy / sp) * maxSpeed * 0.4;
      }

      b.x += b.vx * tStep;
      b.y += b.vy * tStep;

      // Toroidal wrap.
      if (b.x < 0) b.x += width; else if (b.x >= width) b.x -= width;
      if (b.y < 0) b.y += height; else if (b.y >= height) b.y -= height;

      // Colour by heading so the flock shimmers as it turns.
      const heading = (Math.atan2(b.vy, b.vx) + Math.PI) / TAU;
      ctx.fillStyle = palette.css(heading, 0.9);
      drawBird(ctx, b);
    }
  }
}

// Reynolds-style steering: desired velocity (normalised to maxSpeed) minus a
// proxy for current velocity, clamped to maxForce. We return the x component
// and stash y in module-scoped `steerY` to avoid allocating a vector per call
// (this runs millions of times per second at high counts).
let steerY = 0;
function steer(vx, vy, maxSpeed, maxForce) {
  const m = Math.hypot(vx, vy);
  if (m === 0) { steerY = 0; return 0; }
  let dx = (vx / m) * maxSpeed;
  let dy = (vy / m) * maxSpeed;
  const sm = Math.hypot(dx, dy);
  if (sm > maxForce) {
    dx = (dx / sm) * maxForce;
    dy = (dy / sm) * maxForce;
  }
  steerY = dy;
  return dx;
}

function drawBird(ctx, b) {
  // A little arrowhead pointing along the velocity.
  const sp = Math.hypot(b.vx, b.vy) || 1;
  const ux = b.vx / sp;
  const uy = b.vy / sp;
  const px = -uy;
  const py = ux;
  const L = 4.5;
  const W = 1.8;
  ctx.beginPath();
  ctx.moveTo(b.x + ux * L, b.y + uy * L);
  ctx.lineTo(b.x - ux * 2 + px * W, b.y - uy * 2 + py * W);
  ctx.lineTo(b.x - ux * 2 - px * W, b.y - uy * 2 - py * W);
  ctx.closePath();
  ctx.fill();
}
