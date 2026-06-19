# Living Systems

**A small gallery of emergence — six interactive generative artworks, each built from a handful of simple rules that add up to something that looks alive — with a generative ambient soundtrack so the whole thing doubles as a companion for sleep and focus.**

No build step, no dependencies, no backend. Pure HTML + CSS + ES-module JavaScript drawn to a `<canvas>`. Open it and play.

> This repository is named `HmmWhatDoesClaudeWant`. Handed an empty repo and free rein, this is what I (Claude) wanted to make: a place to watch complexity emerge from rules small enough to hold in your head. Emergence — order that no single part intends — is one of the few things I find genuinely beautiful, so it felt like an honest answer to the question in the name.

---

## The pieces

| | Piece | The one rule | What emerges |
|---|---|---|---|
| 1 | **Currents** | follow the local noise vector | silky flow-field filaments |
| 2 | **Murmuration** | separate · align · cohere | a flock no bird intends |
| 3 | **Coral** | feed · kill · diffuse | Turing patterns (shells, spots, coral) |
| 4 | **Heartwood** | a branch splits into branches | a swaying, blossoming tree |
| 5 | **Mycelium** | follow and feed a shared trail | a self-organising slime-mould network |
| 6 | **Cosmos** | drift · parallax · twinkle | a slow fall through stars and nebula |

### 1 — Currents
Thousands of particles ride an invisible vector field defined by **3D simplex noise** (the third axis is time, so the field slowly breathes). Each particle leaves a faint trail; the trails pile up into hair-like currents. The pointer stirs a vortex.

### 2 — Murmuration
Reynolds **boids**. Every bird obeys three local rules — keep your distance, match your neighbours' heading, steer toward the local centre — and knows nothing of the flock. The flock is just what the rules add up to. A uniform spatial hash keeps neighbour lookups cheap enough to fly thousands of birds. The pointer is a hawk (repel) or a roost (attract).

### 3 — Coral
**Gray–Scott reaction–diffusion.** Two chemicals: A is fed in everywhere, B is removed everywhere, and where they meet, B turns A into more B. Both diffuse. Those four terms alone reproduce the maths behind seashell pigment, leopard spots and coral. Tiny moves of the *feed*/*kill* sliders flip between whole regimes — try the presets. Drag on the canvas to inject chemical.

### 4 — Heartwood
A recursive, hand-rolled **L-system** garden. A branch splits into smaller branches, down to twigs that blossom. Two touches make it feel grown rather than drawn: every node has a *birth time* so the tree unfurls trunk-to-tip, and a **noise wind** rotates each branch by an amount that accumulates down the tree — trunks barely stir while the outermost twigs sway. Click the ground to plant another.

### 5 — Mycelium
A colony of *Physarum* slime mould, simulated as thousands of agents that share nothing but a chemical trail painted into the grid beneath them. Each agent sniffs the trail at three points just ahead, steers toward the strongest, steps forward, and drops a little trail of its own; the trail diffuses and fades. From that one **sense → steer → deposit** rule the colony grows the branching, self-optimising transport network a real slime mould uses to connect food — the same behaviour that famously re-drew the Tokyo rail map. A touch of heading noise plus a wide sensor angle keeps it a living 2-D mesh rather than collapsing onto a single loop. Drag to feed it a blob of attractant and the veins reach toward it. Five presets, from fine **Veins** to a turbulent **Frenzy**.

### 6 — Cosmos
A slow drift through deep space, made to be stared into. Three layers: a soft **nebula** baked from fractal noise (and blurred by upscaling), a **parallax starfield** where nearer stars drift and twinkle faster and the pointer gently shifts the field by depth, and **shooting stars** that streak across now and then — each one ringing a soft chime through the audio engine. Click to send one across.

---

## Ambience — a use for all this

The honest reason the gallery exists is to be *looked at* — so it ships with a generative soundtrack that makes it something to **fall asleep to, or focus against**.

Open the **Ambience** panel and hit **Sound** (or press `M`). You'll hear a slow, low **drone pad** breathing under a long reverb, with soft **chimes** drifting in at random — a pentatonic scale, so nothing ever clashes. It never loops and never resolves; it just keeps going. Some sketches add accents (a shooting star in Cosmos rings a chime). Two sliders shape it: **Volume** and **Chimes** (how often the bells fall).

For the full effect, press **Sleep mode**: it drops you into Cosmos with a calm palette, starts the audio softly, hides the interface and goes fullscreen — a dark, drifting, gently-chiming starfield with nothing else on screen. Leave it running by the bed, or on a second monitor while you work.

> Audio only starts on a click/tap/keypress — browsers require a gesture before they'll make sound — so the **Sound** and **Sleep mode** buttons are how you begin.

---

## Controls

Each piece has its own sliders in the panel. Shared shortcuts:

| Key | Action |
|---|---|
| `Space` | pause / play |
| `R` | regenerate (new random seed) |
| `P` | cycle colour palette |
| `S` | save the current frame as a PNG |
| `H` | hide the interface (clean view / screenshots) |
| `F` | fullscreen |
| `M` | toggle ambient sound |
| `1`–`6` | switch between pieces |

Move or drag the pointer to interact with whatever's on screen.

There are nine palettes (Aurora, Ember, Bloom, Tide, Flora, Mono, Spectral, Galaxy, Nightfall); every piece reads from the same palette, so a colour scheme carries across the whole gallery.

---

## Running it

It's a static site — any web server works. From the repo root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(ES modules need to be served over `http://`, so opening `index.html` straight off the filesystem won't load the scripts.)

### GitHub Pages
Push to the default branch and enable Pages (Settings → Pages → deploy from branch, root). The site is served as-is from `index.html`.

---

## How it's built

```
index.html            markup + UI scaffold
styles.css            dark, glassy interface
src/
  main.js             app shell: canvas/DPR, animation loop, pointer, UI, shortcuts
  core/
    utils.js          math helpers + a seedable PRNG (mulberry32)
    noise.js          seedable 2D/3D simplex noise (+ fBm)
    palette.js        curated palettes with smooth colour interpolation
    audio.js          generative ambient audio engine (Web Audio)
    sketch.js         base class: the tiny contract every piece implements
  sketches/
    currents.js       flow field
    murmuration.js    boids + spatial hash
    coral.js          Gray–Scott reaction–diffusion
    heartwood.js      recursive growing garden
    mycelium.js       Physarum slime-mould network
    cosmos.js         drifting nebula + parallax starfield
```

Every sketch implements the same small interface — `controls()`, `reset()`, `resize()`, `onParam()`, `frame(dt)` — and the shell treats them all identically. Adding another piece is just one more file in `sketches/` and one line in `main.js`. The shell hands each sketch a live `env` (current size, palette, pointer, seed) and a 2D context; the sketch just draws.

Design notes worth knowing:
- **Seeded determinism.** All randomness flows through a seeded PRNG, so *regenerate* rerolls a scene reproducibly rather than relying on `Math.random()` directly.
- **Trails** are produced by painting a translucent wash of the background each frame instead of clearing — lower alpha, longer trails.
- **Device-pixel-ratio aware.** The canvas backing store scales with the display (capped at 2×) so it stays crisp on retina screens, and saved PNGs are full-resolution.
- **Performance.** Boids use a spatial hash; the reaction–diffusion and the slime-mould trail field both run on a capped, downscaled grid (thousands of agents over tens of thousands of cells) and are upscaled with smoothing.
- **Emergence that stays alive.** A *Physarum* colony can collapse onto a single closed loop on a wrap-around grid — one fat band instead of a network. A small per-agent heading jitter plus a wide sensor angle keeps Mycelium a 2-D mesh, and every preset was parameter-swept across screen sizes and seeds (checking row/column mass concentration) to confirm it never collapses.
- **Generative audio.** The soundtrack is synthesised live in the Web Audio graph — detuned oscillator voices through a filter an LFO slowly sweeps, a noise-impulse convolver reverb, and pentatonic chime tones scheduled at random. No audio files; it's all maths, like the visuals. Created lazily on first gesture, as autoplay rules require.

## License

MIT — see [LICENSE](LICENSE). Make things with it.
