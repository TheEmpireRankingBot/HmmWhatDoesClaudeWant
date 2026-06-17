// App shell for the "living systems" gallery.
//
// Owns the canvas, the animation loop, the shared palette and the pointer, and
// builds the UI from whatever controls the active sketch declares. Each sketch
// is handed a tiny `env` that always reflects current shell state.

import { PaletteBook } from './core/palette.js';
import { randomSeed } from './core/utils.js';
import { Currents } from './sketches/currents.js';
import { Murmuration } from './sketches/murmuration.js';
import { Coral } from './sketches/coral.js';
import { Heartwood } from './sketches/heartwood.js';

const SKETCHES = [Currents, Murmuration, Coral, Heartwood];

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });

const book = new PaletteBook();

// ---- Live shell state shared with the active sketch -----------------------
const env = {
  width: 0,
  height: 0,
  dpr: 1,
  seed: randomSeed(),
  get palette() {
    return book.current;
  },
  pointer: { x: -1, y: -1, px: -1, py: -1, down: false, inside: false, justPressed: false },
  // Sketches call this after mutating their own params (e.g. presets) so the
  // sliders catch up to the new values.
  refreshControls: () => syncControlInputs(),
};

let active = null;
let paused = false;
let lastTime = performance.now();
const controlInputs = new Map(); // param key -> { input, readout }

// ---- Canvas sizing with device-pixel-ratio --------------------------------
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  env.dpr = dpr;
  env.width = w;
  env.height = h;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (active) active.resize();
}

// ---- Sketch management ----------------------------------------------------
function selectSketch(SketchClass, { fresh = true } = {}) {
  active = new SketchClass(ctx, env);
  if (fresh) env.seed = randomSeed();
  ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
  active.reset();
  buildControls();
  updateInfo(SketchClass);
  highlightTab(SketchClass.id);
}

function regenerate() {
  if (!active) return;
  env.seed = randomSeed();
  active.reset();
}

// ---- Animation loop -------------------------------------------------------
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30); // clamp big gaps
  lastTime = now;
  if (active && !paused) {
    active.frame(dt);
  }
  // justPressed is a one-frame pulse.
  env.pointer.justPressed = false;
  requestAnimationFrame(loop);
}

// ---- Pointer --------------------------------------------------------------
function pointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  const p = env.pointer;
  p.px = p.x;
  p.py = p.y;
  p.x = e.clientX - rect.left;
  p.y = e.clientY - rect.top;
  p.inside = p.x >= 0 && p.y >= 0 && p.x <= env.width && p.y <= env.height;
}

canvas.addEventListener('pointermove', pointerPos);
canvas.addEventListener('pointerdown', (e) => {
  pointerPos(e);
  env.pointer.down = true;
  env.pointer.justPressed = true;
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointerup', () => { env.pointer.down = false; });
canvas.addEventListener('pointerleave', () => { env.pointer.inside = false; env.pointer.down = false; });

// ---- UI: tabs -------------------------------------------------------------
const tabsEl = document.getElementById('tabs');
function buildTabs() {
  tabsEl.innerHTML = '';
  for (const S of SKETCHES) {
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.dataset.id = S.id;
    btn.textContent = S.title;
    btn.addEventListener('click', () => selectSketch(S));
    tabsEl.appendChild(btn);
  }
}
function highlightTab(id) {
  for (const btn of tabsEl.children) {
    btn.classList.toggle('active', btn.dataset.id === id);
  }
}

// ---- UI: info -------------------------------------------------------------
const titleEl = document.getElementById('sketch-title');
const blurbEl = document.getElementById('sketch-blurb');
function updateInfo(S) {
  titleEl.textContent = S.title;
  blurbEl.textContent = S.blurb;
}

// ---- UI: controls ---------------------------------------------------------
const controlsEl = document.getElementById('controls');
function buildControls() {
  controlsEl.innerHTML = '';
  controlInputs.clear();
  if (!active) return;
  for (const c of active.controls()) {
    const row = document.createElement('div');
    row.className = 'control';

    const label = document.createElement('label');
    label.textContent = c.label;
    row.appendChild(label);

    if (c.type === 'range') {
      const readout = document.createElement('span');
      readout.className = 'readout';
      readout.textContent = formatNumber(active.params[c.key]);
      label.appendChild(readout);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = c.min;
      input.max = c.max;
      input.step = c.step;
      input.value = active.params[c.key];
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        active.params[c.key] = v;
        readout.textContent = formatNumber(v);
        active.onParam(c.key);
      });
      row.appendChild(input);
      controlInputs.set(c.key, { input, readout });
    } else if (c.type === 'select') {
      const select = document.createElement('select');
      for (const opt of c.options) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === active.params[c.key]) o.selected = true;
        select.appendChild(o);
      }
      select.addEventListener('change', () => {
        active.params[c.key] = select.value;
        active.onParam(c.key);
      });
      row.appendChild(select);
      controlInputs.set(c.key, { input: select });
    } else if (c.type === 'toggle') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!active.params[c.key];
      input.addEventListener('change', () => {
        active.params[c.key] = input.checked;
        active.onParam(c.key);
      });
      row.appendChild(input);
      controlInputs.set(c.key, { input });
    }
    controlsEl.appendChild(row);
  }
}

/** Push current param values back into the slider DOM (after presets, etc). */
function syncControlInputs() {
  if (!active) return;
  for (const [key, { input, readout }] of controlInputs) {
    const v = active.params[key];
    if (input.type === 'checkbox') input.checked = !!v;
    else input.value = v;
    if (readout) readout.textContent = formatNumber(v);
  }
}

function formatNumber(v) {
  if (typeof v !== 'number') return v;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(v < 0.1 ? 4 : v < 1 ? 3 : 2);
}

// ---- Palette + actions ----------------------------------------------------
const paletteNameEl = document.getElementById('palette-name');
function cyclePalette() {
  book.next();
  paletteNameEl.textContent = book.current.name;
}
function updatePaletteName() {
  paletteNameEl.textContent = book.current.name;
}

function savePNG() {
  const link = document.createElement('a');
  const name = active ? active.constructor.id : 'sketch';
  link.download = `living-systems-${name}-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) el.requestFullscreen?.();
  else document.exitFullscreen?.();
}

function toggleUI() {
  document.body.classList.toggle('ui-hidden');
}

function togglePause() {
  paused = !paused;
  document.getElementById('btn-pause').textContent = paused ? 'Play' : 'Pause';
}

// ---- Buttons --------------------------------------------------------------
document.getElementById('btn-pause').addEventListener('click', togglePause);
document.getElementById('btn-regen').addEventListener('click', regenerate);
document.getElementById('btn-palette').addEventListener('click', cyclePalette);
document.getElementById('btn-save').addEventListener('click', savePNG);
document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
document.getElementById('btn-hide').addEventListener('click', toggleUI);

// ---- Keyboard shortcuts ---------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  switch (e.key.toLowerCase()) {
    case ' ': e.preventDefault(); togglePause(); break;
    case 'r': regenerate(); break;
    case 'p': cyclePalette(); break;
    case 's': savePNG(); break;
    case 'h': toggleUI(); break;
    case 'f': toggleFullscreen(); break;
    case '1': selectSketch(SKETCHES[0]); break;
    case '2': selectSketch(SKETCHES[1]); break;
    case '3': selectSketch(SKETCHES[2]); break;
    case '4': selectSketch(SKETCHES[3]); break;
  }
});

window.addEventListener('resize', resize);

// ---- Boot -----------------------------------------------------------------
buildTabs();
updatePaletteName();
resize();
selectSketch(SKETCHES[0], { fresh: false });
requestAnimationFrame(loop);
