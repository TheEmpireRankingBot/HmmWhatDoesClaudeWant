// App shell for the "living systems" gallery.
//
// Owns the canvas, the animation loop, the shared palette and the pointer, and
// builds the UI from whatever controls the active sketch declares. Each sketch
// is handed a tiny `env` that always reflects current shell state.

import { PaletteBook } from './core/palette.js';
import { randomSeed } from './core/utils.js';
import { AudioEngine } from './core/audio.js';
import { config, isLink, verifyLicence } from './core/config.js';
import { Currents } from './sketches/currents.js';
import { Murmuration } from './sketches/murmuration.js';
import { Coral } from './sketches/coral.js';
import { Heartwood } from './sketches/heartwood.js';
import { Mycelium } from './sketches/mycelium.js';
import { Ink } from './sketches/ink.js';
import { Cosmos } from './sketches/cosmos.js';

const SKETCHES = [Currents, Murmuration, Coral, Heartwood, Mycelium, Ink, Cosmos];

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });

const book = new PaletteBook();
const audio = new AudioEngine();

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
  // The ambient audio engine — sketches may ring an accent via env.audio.ping().
  audio,
  // Sketches call this after mutating their own params (e.g. presets) so the
  // sliders catch up to the new values.
  refreshControls: () => syncControlInputs(),
};

let active = null;
let paused = false;
let lastTime = performance.now();
const controlInputs = new Map(); // param key -> { input, readout }

// Auto-cycle ("gallery" / screensaver) mode.
let autoCycle = false;
let autoCycleTimer = 0;
const CYCLE_SECONDS = 20;

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
function selectSketch(SketchClass, { fresh = true, seed = null, params = null } = {}) {
  active = new SketchClass(ctx, env);
  // Restore parameters (e.g. from a shared link) before reset so the sketch
  // initialises with them.
  if (params) Object.assign(active.params, params);
  if (seed != null) env.seed = seed >>> 0;
  else if (fresh) env.seed = randomSeed();
  ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
  active.reset();
  buildControls();
  updateInfo(SketchClass);
  highlightTab(SketchClass.id);
  syncHash();
}

function regenerate() {
  if (!active) return;
  env.seed = randomSeed();
  active.reset();
  syncHash();
}

// ---- Animation loop -------------------------------------------------------
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30); // clamp big gaps
  lastTime = now;
  // Update the reactive audio level first, so sketches read a fresh value.
  audio.update(dt);
  if (autoCycle && !paused) {
    autoCycleTimer -= dt;
    if (autoCycleTimer <= 0) advanceCycle();
  }
  if (active && !paused) {
    active.frame(dt);
  }
  // justPressed is a one-frame pulse.
  env.pointer.justPressed = false;
  requestAnimationFrame(loop);
}

// Advance to the next piece with a fresh palette and seed (gallery mode).
function advanceCycle() {
  const i = SKETCHES.findIndex((S) => active && S.id === active.constructor.id);
  const next = SKETCHES[(i + 1) % SKETCHES.length];
  cyclePalette();
  selectSketch(next);
  autoCycleTimer = CYCLE_SECONDS;
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
        syncHash();
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
        syncHash();
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
        syncHash();
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
  syncHash();
}
function updatePaletteName() {
  paletteNameEl.textContent = book.current.name;
}

// ---- Shareable permalinks -------------------------------------------------
// The whole scene — piece, palette, seed and every parameter — is encoded in
// the URL hash. Because all randomness flows through the seed, opening a link
// reproduces the exact scene. The hash is kept in sync via replaceState (no
// history spam), and parsed on load and on manual hashchange.
function syncHash() {
  if (!active) return;
  const sp = new URLSearchParams();
  sp.set('s', active.constructor.id);
  sp.set('p', book.current.name);
  sp.set('seed', String(env.seed >>> 0));
  for (const [k, v] of Object.entries(active.params)) sp.set(k, String(v));
  try {
    history.replaceState(null, '', '#' + sp.toString());
  } catch (e) {
    location.hash = sp.toString();
  }
}

function applyHash() {
  const h = location.hash.replace(/^#/, '');
  if (!h) return false;
  const sp = new URLSearchParams(h);
  const S = SKETCHES.find((x) => x.id === sp.get('s'));
  if (!S) return false;
  const palName = sp.get('p');
  if (palName) {
    book.setByName(palName);
    updatePaletteName();
  }
  // Coerce each shared param to the type of its default value.
  const probe = new S(ctx, env);
  const params = {};
  for (const c of probe.controls()) {
    if (!sp.has(c.key)) continue;
    const raw = sp.get(c.key);
    const def = probe.params[c.key];
    if (typeof def === 'number') {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) params[c.key] = n;
    } else if (typeof def === 'boolean') {
      params[c.key] = raw === 'true';
    } else {
      params[c.key] = raw;
    }
  }
  const seedStr = sp.get('seed');
  const seed = seedStr && /^\d+$/.test(seedStr) ? parseInt(seedStr, 10) >>> 0 : null;
  selectSketch(S, { fresh: seed == null, seed, params });
  return true;
}

let toastTimer = 0;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

async function shareLink() {
  syncHash();
  const url = location.origin + location.pathname + location.hash;
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied — it reopens this exact scene');
  } catch (e) {
    showToast('Link is in the address bar');
  }
}

// ---- Export: stills, video, embed -----------------------------------------
function exportDims(choice) {
  if (choice === '2x') return { w: Math.round(env.width * 2), h: Math.round(env.height * 2) };
  if (choice === '4k') return { w: 3840, h: 2160 };
  if (choice === 'phone') return { w: 1080, h: 1920 };
  if (choice === 'square') return { w: 2160, h: 2160 };
  if (choice === '8k') return { w: 7680, h: 4320 };
  return { w: env.width, h: env.height };
}

/**
 * Render the current scene to an offscreen canvas at an arbitrary resolution.
 * A fresh sketch instance is run for a couple of seconds of frames with the
 * same seed, params and palette — so it reproduces the look at any size, with
 * no audio/pointer influence (deterministic).
 */
function renderStill(w, h) {
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const c2 = off.getContext('2d', { alpha: false });
  c2.setTransform(1, 0, 0, 1, 0, 0);
  const tEnv = {
    width: w, height: h, dpr: 1, seed: env.seed,
    get palette() { return book.current; },
    pointer: { x: -1, y: -1, px: -1, py: -1, down: false, inside: false, justPressed: false },
    audio: { level: 0, beat: false },
    refreshControls: () => {},
  };
  const S = active.constructor;
  const s = new S(c2, tEnv);
  Object.assign(s.params, active.params);
  s.reset();
  for (let i = 0; i < 200; i++) s.frame(1 / 60); // settle into a mature frame
  return off;
}

async function savePNG() {
  if (!active) return;
  const name = active.constructor.id;
  const sel = document.getElementById('export-size');
  const choice = sel ? sel.value : 'screen';
  if (choice === '8k' && !pro) {
    showToast('8K export is a Pro feature');
    if (isLink(config.links.shop)) window.open(config.links.shop, '_blank', 'noopener');
    return;
  }
  let dataURL;
  let w = env.width, h = env.height;
  if (choice === 'screen') {
    dataURL = canvas.toDataURL('image/png');
  } else {
    const d = exportDims(choice);
    w = d.w; h = d.h;
    showToast(`Rendering ${w}×${h}…`);
    // Let the toast paint before the synchronous render blocks the thread.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    dataURL = renderStill(w, h).toDataURL('image/png');
  }
  window.LivingSystems._lastExport = { w, h, bytes: dataURL.length };
  const link = document.createElement('a');
  link.download = `living-systems-${name}-${w}x${h}-${Date.now()}.png`;
  link.href = dataURL;
  link.click();
  showToast('Image saved');
}

// ---- Video recording (WebM via MediaRecorder) -----------------------------
let mediaRecorder = null;
let recChunks = [];
function toggleRecord() {
  const btn = document.getElementById('btn-record');
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    return;
  }
  if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
    showToast('Recording is not supported in this browser');
    return;
  }
  const stream = canvas.captureStream(60);
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || 'video/webm';
  recChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
  mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recChunks, { type: 'video/webm' });
    window.LivingSystems._lastRecBytes = blob.size;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = `living-systems-${active ? active.constructor.id : 'scene'}-${Date.now()}.webm`;
    a.href = url;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    btn.classList.remove('on');
    btn.textContent = 'Record';
    showToast('Clip saved');
  };
  mediaRecorder.start();
  btn.classList.add('on');
  btn.textContent = 'Stop ●';
  showToast('Recording… press Stop to save');
}

// ---- Embed: copy an <iframe> snippet for this scene -----------------------
function copyEmbed() {
  syncHash();
  const src = `${location.origin}${location.pathname}?embed=1${location.hash}`;
  const snippet =
    `<iframe src="${src}" style="width:100%;height:100%;border:0" ` +
    `loading="lazy" allow="autoplay; fullscreen" title="Living Systems"></iframe>`;
  const done = () => showToast('Embed code copied');
  if (navigator.clipboard) navigator.clipboard.writeText(snippet).then(done, done);
  else done();
}

// ---- Monetisation: support links + a Pro licence --------------------------
let pro = false;
try { pro = localStorage.getItem('ls_pro') === '1'; } catch (e) { /* no storage */ }

function applyPro() {
  document.body.classList.toggle('pro', pro);
  const btn = document.getElementById('btn-pro');
  if (btn) {
    btn.textContent = pro ? 'Pro ✓ unlocked' : 'Unlock Pro';
    btn.disabled = pro;
    btn.classList.toggle('on', pro);
  }
}

function setPro(on) {
  pro = on;
  try { localStorage.setItem('ls_pro', on ? '1' : '0'); } catch (e) { /* ignore */ }
  applyPro();
}

async function unlockPro() {
  const key = window.prompt(`Enter your ${config.brand} licence key:`);
  if (key == null) return;
  showToast('Checking licence…');
  const ok = await verifyLicence(key);
  if (ok) { setPro(true); showToast('Pro unlocked — thank you ✦'); }
  else showToast('That key didn’t check out');
}

/** Reveal the support card / buttons that have actually been configured. */
function buildSupportUI() {
  const card = document.getElementById('support-card');
  const sup = document.getElementById('link-support');
  const shop = document.getElementById('link-shop');
  const proBtn = document.getElementById('btn-pro');
  let any = false;
  if (isLink(config.links.support)) { sup.href = config.links.support; sup.hidden = false; any = true; }
  if (isLink(config.links.shop)) { shop.href = config.links.shop; shop.hidden = false; any = true; }
  const proConfigured =
    (config.pro.keyHashes && config.pro.keyHashes.length > 0) || !!config.pro.gumroadProductId;
  if (proConfigured || pro) { proBtn.hidden = false; any = true; }
  if (any) card.hidden = false;
  if (proBtn) proBtn.addEventListener('click', unlockPro);
  applyPro();
}

/** On a free embed, drop a small back-link badge (your discovery loop). */
function maybeAddEmbedBadge() {
  if (!document.body.classList.contains('embed')) return;
  if (pro || !isLink(config.siteUrl)) return;
  const a = document.createElement('a');
  a.className = 'embed-badge';
  a.href = config.siteUrl + (config.siteUrl.includes('?') ? '&' : '?') + 'ref=embed';
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = '✦ ' + config.brand;
  document.body.appendChild(a);
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

// ---- Ambient audio --------------------------------------------------------
const btnSound = document.getElementById('btn-sound');
function setSoundButton(on) {
  btnSound.textContent = on ? 'Sound: on' : 'Sound: off';
  btnSound.classList.toggle('on', on);
  if (!audio.available) {
    btnSound.textContent = 'Sound: n/a';
    btnSound.disabled = true;
  }
}
async function toggleSound() {
  // enable() must run inside this user-gesture handler to satisfy autoplay rules.
  const on = await audio.toggle();
  setSoundButton(on);
}

/**
 * One-tap "sleep / chill" mode: drift among the stars with a calm palette,
 * soft generative audio, no interface, fullscreen. The click itself is the
 * gesture that lets audio and fullscreen start.
 */
async function sleepMode() {
  book.setByName('Galaxy');
  updatePaletteName();
  selectSketch(Cosmos);
  audio.setVolume(0.4);
  await audio.enable();
  setSoundButton(audio.isOn);
  if (!document.body.classList.contains('ui-hidden')) toggleUI();
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
}

/** Auto-cycle / "gallery" mode: drift between pieces and palettes on a timer. */
function toggleAutoCycle() {
  autoCycle = !autoCycle;
  autoCycleTimer = CYCLE_SECONDS;
  const btn = document.getElementById('btn-cycle');
  btn.classList.toggle('on', autoCycle);
  btn.textContent = autoCycle ? 'Auto-cycle: on' : 'Auto-cycle';
}

// ---- Buttons --------------------------------------------------------------
document.getElementById('btn-pause').addEventListener('click', togglePause);
document.getElementById('btn-regen').addEventListener('click', regenerate);
document.getElementById('btn-palette').addEventListener('click', cyclePalette);
document.getElementById('btn-save').addEventListener('click', savePNG);
document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
document.getElementById('btn-share').addEventListener('click', shareLink);
document.getElementById('btn-hide').addEventListener('click', toggleUI);
btnSound.addEventListener('click', toggleSound);
document.getElementById('btn-sleep').addEventListener('click', sleepMode);
document.getElementById('btn-cycle').addEventListener('click', toggleAutoCycle);
document.getElementById('btn-record').addEventListener('click', toggleRecord);
document.getElementById('btn-embed').addEventListener('click', copyEmbed);

const volInput = document.getElementById('vol');
const twinkleInput = document.getElementById('twinkle');
volInput.addEventListener('input', () => audio.setVolume(parseFloat(volInput.value)));
twinkleInput.addEventListener('input', () => audio.setTwinkle(parseFloat(twinkleInput.value)));
audio.setVolume(parseFloat(volInput.value));
audio.setTwinkle(parseFloat(twinkleInput.value));
setSoundButton(false);

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
    case 'm': toggleSound(); break;
    case 'c': shareLink(); break;
    case 'g': toggleAutoCycle(); break;
    case 'v': toggleRecord(); break;
    case 'e': copyEmbed(); break;
    default: {
      // Number keys 1..N switch pieces.
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= SKETCHES.length) selectSketch(SKETCHES[n - 1]);
    }
  }
});

window.addEventListener('resize', resize);
// Restore a scene when the hash is changed by hand or by navigation.
window.addEventListener('hashchange', applyHash);

// A tiny read-only public hook — handy for embedding, debugging or scripting.
window.LivingSystems = {
  get sketch() { return active ? active.constructor.id : null; },
  get palette() { return book.current.name; },
  get audioLevel() { return audio.level; },
  get autoCycle() { return autoCycle; },
  get pro() { return pro; },
  _lastRecBytes: 0,
  _lastExport: null,
  share: shareLink,
};

// ---- Boot -----------------------------------------------------------------
buildTabs();
updatePaletteName();
resize();
// Open a shared scene from the URL hash, or fall back to the first piece.
if (!applyHash()) selectSketch(SKETCHES[0], { fresh: false });

// Embed mode (?embed=1) strips the chrome to a bare live background; ?cycle=1
// starts the gallery drifting. Both are meant for the iframe embed snippet.
const boot = new URLSearchParams(location.search);
if (boot.get('embed') === '1') document.body.classList.add('embed');
if (boot.get('cycle') === '1') toggleAutoCycle();

// Monetisation surfaces (all opt-in via src/core/config.js).
buildSupportUI();
maybeAddEmbedBadge();

requestAnimationFrame(loop);
