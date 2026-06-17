// Heartwood — a garden that grows itself.
//
// Each tree is a recursive branching structure (a hand-rolled L-system): a
// branch splits into smaller branches, which split again, down to twigs that
// blossom. Two things make it feel alive rather than fractal-stiff:
//   1. Growth is animated — every node has a "birth time", so the tree unfurls
//      from trunk to tips instead of appearing all at once.
//   2. Wind is a noise field that rotates each branch a little, and the
//      rotation accumulates down the tree, so trunks barely stir while the
//      outermost twigs sway. Click the ground to plant another.

import { Sketch } from '../core/sketch.js';
import { Noise } from '../core/noise.js';
import { mulberry32, clamp, easeOutCubic, lerp, TAU } from '../core/utils.js';

const MAX_TREES = 12;
const NODE_BUDGET = 1500;

export class Heartwood extends Sketch {
  static id = 'heartwood';
  static title = 'Heartwood';
  static blurb =
    'A recursive garden. Each tree is one branching rule applied to itself, ' +
    'unfurling trunk-to-tip and swaying in a noise wind. Click to plant.';

  controls() {
    return [
      { key: 'depth', label: 'Recursion depth', type: 'range', min: 5, max: 11, step: 1, value: 9 },
      { key: 'spread', label: 'Branch spread', type: 'range', min: 12, max: 70, step: 1, value: 32 },
      { key: 'falloff', label: 'Length falloff', type: 'range', min: 0.6, max: 0.82, step: 0.01, value: 0.74 },
      { key: 'wind', label: 'Wind', type: 'range', min: 0, max: 2, step: 0.05, value: 0.7 },
      { key: 'growth', label: 'Growth speed', type: 'range', min: 0.3, max: 4, step: 0.1, value: 1.6 },
      { key: 'blossom', label: 'Blossom size', type: 'range', min: 0, max: 6, step: 0.5, value: 2.5 },
    ];
  }

  reset() {
    this.noise = new Noise(this.env.seed);
    this.rng = mulberry32(this.env.seed);
    this.time = 0;
    this.trees = [];
    this.clear();
    // Plant a small starter grove.
    const { width } = this.env;
    const n = 3;
    for (let i = 0; i < n; i++) {
      this.plant(width * (i + 1) / (n + 1) + (this.rng() - 0.5) * 80);
    }
  }

  onParam(key) {
    // Only the structural sliders change the branching shape; regrow those in
    // place. Wind / growth / blossom are read live each frame, so changing them
    // must not reset the grove's growth animation.
    if (key !== 'depth' && key !== 'spread' && key !== 'falloff') return;
    for (const tree of this.trees) {
      tree.root = this.buildTree(tree.seed);
      tree.age = 0;
    }
  }

  resize() {
    // Keep trees rooted to the (recomputed) ground line.
    const gy = this.groundY();
    for (const tree of this.trees) tree.y = gy;
    this.clear();
  }

  groundY() {
    return this.env.height * 0.94;
  }

  plant(x) {
    const { width } = this.env;
    x = clamp(x, 20, width - 20);
    const seed = (this.rng() * 0xffffffff) >>> 0;
    const tree = {
      x,
      y: this.groundY(),
      seed,
      age: 0,
      phase: this.rng() * 1000,
      scale: 0.8 + this.rng() * 0.5,
      root: this.buildTree(seed),
    };
    this.trees.push(tree);
    if (this.trees.length > MAX_TREES) this.trees.shift();
  }

  buildTree(seed) {
    const rng = mulberry32(seed);
    const { height } = this.env;
    const baseLen = height * 0.17;
    const budget = { n: NODE_BUDGET };
    return this.buildNode(0, baseLen, 0, rng, budget);
  }

  buildNode(relAngle, length, depth, rng, budget) {
    const node = {
      relAngle,
      length,
      depth,
      birth: depth * 0.85 + rng() * 0.4,
      children: [],
      leaf: false,
    };
    budget.n--;
    const maxDepth = this.params.depth;
    if (depth >= maxDepth || length < 4 || budget.n <= 0) {
      node.leaf = true;
      return node;
    }

    const spread = (this.params.spread * Math.PI) / 180;
    const falloff = this.params.falloff;
    // Mostly binary splits; occasionally a third shoot for fullness.
    const triple = rng() < 0.25 && depth > 1;
    const childLen = () => length * falloff * (0.85 + rng() * 0.25);

    if (triple) {
      node.children.push(this.buildNode(-spread * (0.7 + rng() * 0.3), childLen(), depth + 1, rng, budget));
      node.children.push(this.buildNode((rng() - 0.5) * spread * 0.4, childLen(), depth + 1, rng, budget));
      node.children.push(this.buildNode(spread * (0.7 + rng() * 0.3), childLen(), depth + 1, rng, budget));
    } else {
      const jitter = (rng() - 0.5) * spread * 0.3;
      node.children.push(this.buildNode(-spread * 0.5 + jitter, childLen(), depth + 1, rng, budget));
      node.children.push(this.buildNode(spread * 0.5 + jitter, childLen(), depth + 1, rng, budget));
    }
    return node;
  }

  frame(dt) {
    const { ctx, env } = this;
    const { width, height, palette, pointer } = env;
    this.time += dt;

    // Plant where the user clicks near the ground.
    if (pointer.inside && pointer.justPressed) {
      this.plant(pointer.x);
    }

    // Background with a soft ground gradient.
    this.clear();
    const gy = this.groundY();
    const grad = ctx.createLinearGradient(0, gy, 0, height);
    grad.addColorStop(0, palette.css(0.12, 0.0));
    grad.addColorStop(1, palette.css(0.18, 0.35));
    ctx.fillStyle = grad;
    ctx.fillRect(0, gy, width, height - gy);

    const maxDepth = this.params.depth;
    for (const tree of this.trees) {
      tree.age += dt * this.params.growth;
      this.drawNode(tree, tree.root, tree.x, tree.y, -Math.PI / 2, maxDepth);
    }
  }

  drawNode(tree, node, x, y, parentAngle, maxDepth) {
    const t = easeOutCubic(clamp(tree.age - node.birth, 0, 1));
    if (t <= 0) return;

    const { ctx, env } = this;
    const { palette } = env;
    const P = this.params;

    // Wind: a noise value per depth band, accumulated through parentAngle so
    // the sway compounds toward the twigs.
    const wind =
      this.noise.noise2D(this.time * 0.4 + tree.phase, node.depth * 0.5) *
      P.wind * 0.06;

    const angle = parentAngle + node.relAngle + wind;
    const len = node.length * tree.scale * t;
    const ex = x + Math.cos(angle) * len;
    const ey = y + Math.sin(angle) * len;

    const depthT = node.depth / maxDepth;
    // Trunk is thick and woody (low palette t); twigs thin and bright.
    ctx.lineWidth = Math.max(0.6, lerp(7 * tree.scale, 0.6, depthT));
    ctx.strokeStyle = palette.css(0.12 + depthT * 0.4, 0.92);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    if (t < 1) return; // children only after this branch is fully grown

    if (node.leaf) {
      const r = P.blossom * tree.scale;
      if (r > 0.1) {
        // Gentle blossom bob, distinct from the branch wind.
        const bob = this.noise.noise2D(this.time * 0.6 + tree.phase, node.depth + 3) * 1.5;
        ctx.fillStyle = palette.css(0.75 + 0.2 * ((node.birth % 1)), 0.9);
        ctx.beginPath();
        ctx.arc(ex + bob, ey, r, 0, TAU);
        ctx.fill();
      }
      return;
    }

    for (const child of node.children) {
      this.drawNode(tree, child, ex, ey, angle, maxDepth);
    }
  }
}
