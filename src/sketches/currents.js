// Currents — a flow-field particle system.
//
// Thousands of particles drift through an invisible vector field defined by 3D
// simplex noise (the third dimension is time, so the field slowly breathes).
// Each particle leaves a faint trail; the trails accumulate into the silky,
// hair-like structures that flow fields are loved for. The pointer stirs a
// vortex into the field.

import { Sketch } from '../core/sketch.js';
import { Noise } from '../core/noise.js';
import { TAU, map, clamp } from '../core/utils.js';

export class Currents extends Sketch {
  static id = 'currents';
  static title = 'Currents';
  static blurb =
    'A flow field of simplex noise. Particles ride invisible currents; ' +
    'the pointer stirs a vortex. Built from one rule, repeated.';

  controls() {
    return [
      { key: 'count', label: 'Particles', type: 'range', min: 500, max: 9000, step: 100, value: 4000 },
      { key: 'scale', label: 'Field scale', type: 'range', min: 0.4, max: 4, step: 0.1, value: 1.4 },
      { key: 'speed', label: 'Speed', type: 'range', min: 0.2, max: 4, step: 0.1, value: 1.6 },
      { key: 'turns', label: 'Curl', type: 'range', min: 0.5, max: 4, step: 0.1, value: 2 },
      { key: 'trail', label: 'Trail length', type: 'range', min: 0.005, max: 0.2, step: 0.005, value: 0.04 },
      { key: 'flow', label: 'Field drift', type: 'range', min: 0, max: 1, step: 0.05, value: 0.25 },
    ];
  }

  reset() {
    this.noise = new Noise(this.env.seed);
    this.t = 0;
    this.particles = [];
    this.spawnTo(this.params.count);
    this.clear();
  }

  spawnTo(n) {
    const { width, height } = this.env;
    const p = this.particles;
    while (p.length < n) {
      p.push(this.makeParticle(Math.random() * width, Math.random() * height));
    }
    if (p.length > n) p.length = n;
  }

  makeParticle(x, y) {
    return { x, y, px: x, py: y, life: 60 + Math.random() * 180, hue: Math.random() };
  }

  respawn(part) {
    const { width, height } = this.env;
    part.x = Math.random() * width;
    part.y = Math.random() * height;
    part.px = part.x;
    part.py = part.y;
    part.life = 60 + Math.random() * 180;
  }

  frame(dt) {
    const { ctx, env } = this;
    const { width, height, palette, pointer } = env;
    const P = this.params;

    if (this.particles.length !== P.count) this.spawnTo(P.count);

    this.fade(P.trail);
    this.t += dt * P.flow * 0.12;

    const fieldScale = P.scale * 0.0016;
    // Audio-reactive: the flow quickens with the soundtrack (0 when silent).
    const level = env.audio?.level || 0;
    const step = P.speed * 60 * dt * (1 + level * 1.3); // px per frame, ~60fps
    ctx.lineWidth = 1;

    for (const part of this.particles) {
      // Sample the field. noise3D returns ~[-1,1]; widen into several turns.
      const n = this.noise.noise3D(part.x * fieldScale, part.y * fieldScale, this.t);
      let angle = n * TAU * P.turns;
      let vx = Math.cos(angle);
      let vy = Math.sin(angle);

      // The pointer adds a tangential swirl that falls off with distance.
      if (pointer.inside) {
        const dx = part.x - pointer.x;
        const dy = part.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        const radius = 180;
        if (d2 < radius * radius) {
          const d = Math.sqrt(d2) + 0.001;
          const falloff = 1 - d / radius;
          // Perpendicular vector => rotation around the pointer.
          vx += (-dy / d) * falloff * 2.2;
          vy += (dx / d) * falloff * 2.2;
        }
      }

      const len = Math.hypot(vx, vy) || 1;
      part.px = part.x;
      part.py = part.y;
      part.x += (vx / len) * step;
      part.y += (vy / len) * step;

      // Colour by how aligned the particle is with the field, blended with a
      // per-particle hue so the palette is sampled across its whole range.
      const speedT = clamp(map(n, -1, 1, 0, 1), 0, 1);
      const t = (speedT * 0.7 + part.hue * 0.3) % 1;
      ctx.strokeStyle = palette.css(t, 0.5);

      ctx.beginPath();
      ctx.moveTo(part.px, part.py);
      ctx.lineTo(part.x, part.y);
      ctx.stroke();

      part.life -= 1;
      if (part.life <= 0 || part.x < 0 || part.x > width || part.y < 0 || part.y > height) {
        this.respawn(part);
      }
    }
  }
}
