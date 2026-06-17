// Base class for every generative piece in the gallery.
//
// The app shell (main.js) owns the canvas, the animation loop, the palette and
// the pointer. A sketch just implements a handful of lifecycle hooks and draws
// into the 2D context it is handed. Keeping that contract tiny is what lets the
// shell treat all four pieces identically.

export class Sketch {
  // Subclasses override these three static fields for the UI.
  static id = 'sketch';
  static title = 'Sketch';
  static blurb = '';

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} env  live view of shell state: width, height, palette,
   *                      pointer, seed (all read fresh each frame).
   */
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.params = {};
    // Materialise default values from the control definitions.
    for (const c of this.controls()) {
      if (c.value !== undefined) this.params[c.key] = c.value;
    }
  }

  /** Control definitions used to build the side panel. Override to add UI. */
  controls() {
    return [];
  }

  // ---- Lifecycle hooks (override as needed) -------------------------------
  /** (Re)initialise all state. Called on first show and on "regenerate". */
  reset() {}
  /** Canvas logical size changed. */
  resize() {}
  /** A control value changed; `key` is the param that moved. */
  onParam() {}
  /** Draw exactly one frame. dt is seconds since last frame. */
  frame() {}

  // ---- Shared helpers -----------------------------------------------------
  /** Hard-clear to the palette background. */
  clear() {
    const { ctx, env } = this;
    ctx.fillStyle = env.palette.bg;
    ctx.fillRect(0, 0, env.width, env.height);
  }

  /**
   * Paint a translucent wash of the background colour — the trick behind every
   * trailing-motion effect. Lower alpha => longer, dreamier trails.
   */
  fade(alpha) {
    const { ctx, env } = this;
    const { r, g, b } = env.palette.bgRgb;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.fillRect(0, 0, env.width, env.height);
  }
}
