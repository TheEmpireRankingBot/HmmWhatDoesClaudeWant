// Cosmos — a calm, drifting deep-space scene.
//
// Three layers, deliberately slow and meditative (it's the centrepiece of the
// "sleep / chill" mode):
//   1. a soft nebula baked from fractal noise and blurred by upscaling,
//   2. a parallax starfield — nearer stars drift and twinkle faster, and the
//      pointer gently shifts the whole field by depth,
//   3. shooting stars that streak across now and then (and on click), each one
//      ringing a soft bell through the audio engine.

import { Sketch } from '../core/sketch.js';
import { Noise } from '../core/noise.js';
import { mulberry32, clamp, lerp, smoothstep, TAU } from '../core/utils.js';

export class Cosmos extends Sketch {
  static id = 'cosmos';
  static title = 'Cosmos';
  static blurb =
    'A slow drift through stars and nebula. Parallax by depth, the odd ' +
    'shooting star — made to be stared into. Click to send one across.';

  controls() {
    return [
      { key: 'stars', label: 'Stars', type: 'range', min: 200, max: 2200, step: 50, value: 850 },
      { key: 'drift', label: 'Drift speed', type: 'range', min: 0, max: 3, step: 0.1, value: 0.7 },
      { key: 'nebula', label: 'Nebula', type: 'range', min: 0, max: 1.4, step: 0.05, value: 0.8 },
      { key: 'twinkle', label: 'Twinkle', type: 'range', min: 0, max: 1, step: 0.05, value: 0.55 },
      { key: 'meteors', label: 'Shooting stars', type: 'range', min: 0, max: 1, step: 0.05, value: 0.3 },
      { key: 'parallax', label: 'Parallax', type: 'range', min: 0, max: 1, step: 0.05, value: 0.5 },
    ];
  }

  reset() {
    this.seed = this.env.seed;
    this.noise = new Noise(this.seed);
    this.time = 0;
    this.driftAngle = (this.seed % 1000) / 1000 * TAU;
    this.meteorTimer = 0;
    this.shooting = [];
    this.buildField();
    this.buildNebula();
    this.recolorNebula();
    this._lastPalette = this.env.palette.name;
    this.clear();
  }

  resize() {
    // Keep the same scene; just rebuild for the new size.
    this.noise = new Noise(this.seed);
    this.buildField();
    this.buildNebula();
    this.recolorNebula();
    this.clear();
  }

  onParam(key) {
    if (key === 'nebula') {
      this.buildNebula();
      this.recolorNebula();
    } else if (key === 'stars') {
      this.buildField();
    }
  }

  buildField() {
    const { width, height } = this.env;
    const rng = mulberry32(this.seed ^ 0x9e3779b9);
    const n = this.params.stars | 0;
    this.stars = new Array(n);
    for (let i = 0; i < n; i++) {
      // Depth biased toward distance, so most stars are small and far.
      const z = Math.pow(rng(), 1.6) * 0.85 + 0.15;
      this.stars[i] = {
        x: rng() * width,
        y: rng() * height,
        z,
        size: (0.4 + z * 2.0) * (0.7 + rng() * 0.6),
        phase: rng() * TAU,
        tw: 0.6 + rng() * 1.8,        // twinkle rate
        hue: rng(),                   // where on the palette this star tints
      };
    }
  }

  buildNebula() {
    const { width, height } = this.env;
    const nw = Math.max(24, Math.ceil(width / 8));
    const nh = Math.max(24, Math.ceil(height / 8));
    this.nw = nw;
    this.nh = nh;
    this.nebInt = new Float32Array(nw * nh);

    const density = this.params.nebula;
    const scale = 3.2;
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        // Two-octave fbm, then a soft threshold to carve wispy clouds.
        let v = this.noise.fbm2D((x / nw) * scale, (y / nh) * scale, 4, 2.1, 0.55);
        v = (v + 1) * 0.5;
        v = smoothstep(clamp((v - 0.42) / 0.5, 0, 1));
        this.nebInt[y * nw + x] = v * density;
      }
    }

    this.nebCanvas = document.createElement('canvas');
    this.nebCanvas.width = nw;
    this.nebCanvas.height = nh;
    this.nebCtx = this.nebCanvas.getContext('2d');
    this.nebImage = this.nebCtx.createImageData(nw, nh);
  }

  /** Paint the baked intensity through the current palette over the bg. */
  recolorNebula() {
    const { palette } = this.env;
    const bg = palette.bgRgb;
    const data = this.nebImage.data;
    const n = this.nw * this.nh;
    for (let i = 0; i < n; i++) {
      const v = clamp(this.nebInt[i], 0, 1);
      const c = palette.colorAt(0.25 + v * 0.6);
      const k = v;
      const j = i * 4;
      data[j] = bg.r + (c.r - bg.r) * k;
      data[j + 1] = bg.g + (c.g - bg.g) * k;
      data[j + 2] = bg.b + (c.b - bg.b) * k;
      data[j + 3] = 255;
    }
    this.nebCtx.putImageData(this.nebImage, 0, 0);
  }

  spawnMeteor(rng = Math.random) {
    const { width, height } = this.env;
    // Start somewhere along the top/left, head down-right-ish with variation.
    const fromTop = rng() < 0.6;
    const x = fromTop ? rng() * width : -40;
    const y = fromTop ? -40 : rng() * height * 0.6;
    const ang = lerp(0.15, 1.15, rng()); // radians, down-right
    const speed = 520 + rng() * 520;
    this.shooting.push({
      x, y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      len: 90 + rng() * 160,
      life: 0,
      max: 0.9 + rng() * 0.6,
      hue: 0.7 + rng() * 0.3,
    });
    // Ring a soft, high bell to match the visual accent.
    this.env.audio?.ping({ pitch: 0.6 + rng() * 0.4, gain: 0.09, decay: 3 });
  }

  frame(dt) {
    const { ctx, env } = this;
    const { width, height, palette, pointer } = env;
    const P = this.params;
    this.time += dt;

    if (env.palette.name !== this._lastPalette) {
      this.recolorNebula();
      this._lastPalette = env.palette.name;
    }

    // --- Background + nebula (drawn fresh each frame; no trails) ----------
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);

    // Pointer offset, used by both nebula and stars for a parallax feel.
    const pcx = pointer.inside ? (pointer.x - width / 2) : 0;
    const pcy = pointer.inside ? (pointer.y - height / 2) : 0;

    if (P.nebula > 0) {
      const M = 48;
      const drift = this.time * 4;
      const ox = -M + Math.cos(this.driftAngle) * (drift % (M * 2)) - (pcx / width) * P.parallax * M;
      const oy = -M + Math.sin(this.driftAngle * 1.3) * 8 - (pcy / height) * P.parallax * M;
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 1;
      ctx.drawImage(this.nebCanvas, 0, 0, this.nw, this.nh, ox, oy, width + M * 2, height + M * 2);
    }

    // Faint galactic core glow.
    const glow = ctx.createRadialGradient(
      width * 0.5, height * 0.46, 0,
      width * 0.5, height * 0.46, Math.max(width, height) * 0.5
    );
    glow.addColorStop(0, palette.css(0.7, 0.10));
    glow.addColorStop(1, palette.css(0.7, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // --- Stars ------------------------------------------------------------
    this.driftAngle += dt * 0.02;
    const speed = P.drift * 14;
    for (const s of this.stars) {
      // Drift (nearer = faster) with wrap-around.
      s.x += Math.cos(this.driftAngle) * speed * s.z * dt;
      s.y += Math.sin(this.driftAngle) * speed * s.z * dt;
      if (s.x < 0) s.x += width; else if (s.x >= width) s.x -= width;
      if (s.y < 0) s.y += height; else if (s.y >= height) s.y -= height;

      const px = s.x + (pcx * s.z * P.parallax * 0.06);
      const py = s.y + (pcy * s.z * P.parallax * 0.06);

      const tw = 0.55 + 0.45 * Math.sin(this.time * s.tw + s.phase);
      const alpha = clamp(0.35 + tw * (0.4 + P.twinkle * 0.6), 0, 1);
      const c = palette.colorAt(s.hue);
      // Stars are mostly starlight-white, lightly tinted by the palette.
      const r = lerp(255, c.r, 0.45);
      const g = lerp(255, c.g, 0.45);
      const b = lerp(255, c.b, 0.45);
      ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`;

      const size = s.size;
      if (size < 1.1) {
        ctx.fillRect(px, py, size + 0.6, size + 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(px, py, size * 0.6, 0, TAU);
        ctx.fill();
        // A faint halo on the brightest near stars.
        if (size > 2 && P.twinkle > 0) {
          ctx.globalAlpha = alpha * 0.18 * P.twinkle;
          ctx.beginPath();
          ctx.arc(px, py, size * 1.8, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }

    // --- Shooting stars ---------------------------------------------------
    if (pointer.justPressed && pointer.inside) {
      // Launch one from near the click toward lower-right.
      this.shooting.push({
        x: pointer.x, y: pointer.y,
        vx: 560, vy: 360, len: 140, life: 0, max: 1.0, hue: 0.85,
      });
      this.env.audio?.ping({ pitch: 0.8, gain: 0.1, decay: 3 });
    }
    // Random spawns, rate set by the meteors slider.
    this.meteorTimer -= dt;
    if (this.meteorTimer <= 0) {
      if (P.meteors > 0.001) this.spawnMeteor();
      this.meteorTimer = lerp(9, 1.2, P.meteors) * (0.5 + Math.random());
    }

    ctx.lineCap = 'round';
    for (let i = this.shooting.length - 1; i >= 0; i--) {
      const m = this.shooting[i];
      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const fade = clamp(1 - m.life / m.max, 0, 1);
      const sp = Math.hypot(m.vx, m.vy) || 1;
      const tailX = m.x - (m.vx / sp) * m.len;
      const tailY = m.y - (m.vy / sp) * m.len;
      const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
      const c = palette.colorAt(m.hue);
      grad.addColorStop(0, `rgba(255,255,255,${fade})`);
      grad.addColorStop(0.3, `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${fade * 0.8})`);
      grad.addColorStop(1, `rgba(${c.r | 0},${c.g | 0},${c.b | 0},0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      // Bright head.
      ctx.fillStyle = `rgba(255,255,255,${fade})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.8, 0, TAU);
      ctx.fill();

      if (m.life >= m.max || m.x > width + m.len || m.y > height + m.len) {
        this.shooting.splice(i, 1);
      }
    }
  }
}
