# Living Systems

**A small gallery of emergence — seven interactive generative artworks, each built from a handful of simple rules that add up to something that looks alive — with a generative ambient soundtrack so the whole thing doubles as a companion for sleep and focus.**

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
| 6 | **Ink** | make the fluid divergence-free, repeat | swirling, eddying clouds of dye |
| 7 | **Cosmos** | drift · parallax · twinkle | a slow fall through stars and nebula |

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

### 6 — Ink
A genuine fluid, not a fake. This is **Jos Stam's "stable fluids"** scheme for the incompressible Navier–Stokes equations — the method that earned a SIGGRAPH technical Oscar and put smoke and water into films and games. Each frame the velocity field is made **divergence-free** with a Poisson pressure solve (fluid can't pile up), **advected through itself** by tracing backwards in time (the trick that makes it stable at any time step), made divergence-free again, and finally given its swirl back with **vorticity confinement** so eddies don't wash out. A dye field rides along and is what you see. Drag to push the fluid and lay down ink; gentle thermals keep it drifting on its own between touches. Sliders for swirl, force, dye fade, solver quality and resolution, and whether colour follows the dye, the speed, or both.

### 7 — Cosmos
A slow drift through deep space, made to be stared into. Three layers: a soft **nebula** baked from fractal noise (and blurred by upscaling), a **parallax starfield** where nearer stars drift and twinkle faster and the pointer gently shifts the field by depth, and **shooting stars** that streak across now and then — each one ringing a soft chime through the audio engine. Click to send one across.

---

## Ambience — a use for all this

The honest reason the gallery exists is to be *looked at* — so it ships with a generative soundtrack that makes it something to **fall asleep to, or focus against**.

Open the **Ambience** panel and hit **Sound** (or press `M`). You'll hear a slow, low **drone pad** breathing under a long reverb, with soft **chimes** drifting in at random — a pentatonic scale, so nothing ever clashes. It never loops and never resolves; it just keeps going. Two sliders shape it: **Volume** and **Chimes** (how often the bells fall).

**The visuals listen back.** With sound on, every piece reacts to it: the flock surges on swells, the fluid pulses and a chime kicks a swirl into it, the coral throws out fresh growth, the trees sway harder, and the stars brighten — a loud chime can even fling a shooting star across Cosmos. An analyser taps the live mix, so the gallery breathes with its own soundtrack. (Muted, everything behaves exactly as before.)

For the full effect, press **Sleep mode**: it drops you into Cosmos with a calm palette, starts the audio softly, hides the interface and goes fullscreen — a dark, drifting, gently-chiming starfield with nothing else on screen. Or hit **Auto-cycle** (`G`) to turn the whole gallery into a slow screensaver that drifts from piece to piece and palette to palette on its own. Leave either running by the bed, or on a second monitor while you work.

> Audio only starts on a click/tap/keypress — browsers require a gesture before they'll make sound — so the **Sound** and **Sleep mode** buttons are how you begin.

---

## Controls

Each piece has its own sliders in the panel. Shared shortcuts:

| Key | Action |
|---|---|
| `Space` | pause / play |
| `R` | regenerate (new random seed) |
| `P` | cycle colour palette |
| `S` | save a still image (size set in the Export panel) |
| `V` | record / stop a WebM video clip |
| `E` | copy an embed snippet for this scene |
| `H` | hide the interface (clean view / screenshots) |
| `F` | fullscreen |
| `M` | toggle ambient sound |
| `C` | copy a shareable link to the exact scene |
| `G` | auto-cycle (gallery / screensaver mode) |
| `1`–`7` | switch between pieces |

Move or drag the pointer to interact with whatever's on screen.

### Shareable scenes
Every scene lives in the URL. The active piece, palette, seed and every slider value are encoded in the address-bar hash, so **Copy link** (or `C`) gives you a URL that reopens *exactly* what you're looking at — same flock, same coral, same swirl of ink — because all randomness flows through the seed. Paste a link, or just bookmark a scene you like.

---

## Export &amp; embed

The **Export** panel turns a scene into something you can keep, post or sell.

- **Save image** (`S`) — renders the current scene at a chosen resolution: **screen, 2×, 4K (3840×2160), phone (1080×1920)** or **square (2160²)**. Bigger-than-screen sizes are rendered offscreen at full resolution with the same seed/params/palette, so a 4K wallpaper is genuinely 4K, not an upscale.
- **Record** (`V`) — captures the live canvas to a **WebM video** via `MediaRecorder`; press again to stop and download. Great for looping animated wallpapers or social clips.
- **Copy embed code** (`E`) — copies an `<iframe>` snippet that drops this exact scene into any page as a **live background**.

### Embedding
The embed snippet points at the page with `?embed=1`, which strips all the interface and just runs the canvas:

```html
<iframe src="https://your-host/?embed=1#s=ink&p=Tide&seed=…"
        style="width:100%;height:100%;border:0" allow="autoplay; fullscreen"></iframe>
```

Two URL flags drive embeds:

| Flag | Effect |
|---|---|
| `?embed=1` | hide all UI — a bare, full-bleed live background |
| `?cycle=1` | start in auto-cycle, drifting between pieces and palettes |

Everything after `#` is just a shared-scene link, so you can pin an embed to one exact scene or let it wander. It's all static files, so an embed costs you nothing to host.

There's also a tiny read-only `window.LivingSystems` hook (`sketch`, `palette`, `audioLevel`, `autoCycle`, `pro`) for scripting or analytics.

---

## Make it earn

The gallery ships with an **opt-in monetisation layer** — one file, [`src/core/config.js`](src/core/config.js), turns it on. With the empty defaults nothing appears, so the public site stays clean; fill in your own links and each piece lights up. It's all static, so there's no backend to run and nothing costs you anything to host.

The funnel it builds:

1. **Discovery** — a share card (`og.png` + OpenGraph/Twitter tags) so links look good when posted, and a small back-link **badge on free embeds** that points visitors back to your site. Every embed someone drops on their page becomes an advert for yours.
2. **Product** — the export layer: 4K/8K wallpapers, video clips, and live embeds. Because every scene is a reproducible seed, the catalogue is effectively infinite.
3. **Checkout** — your own links: **Support monthly** (Patreon / Ko-fi / GitHub Sponsors → recurring income) and **Get the packs** (Gumroad / Lemon Squeezy → one-off sales). These buttons only appear once you set the URLs.
4. **Upsell** — a **Pro licence** (sold via your shop) that removes the embed badge (white-label) and unlocks **8K export**. Keys are verified either against an offline SHA-256 allow-list or live against Gumroad's licence API, and the unlock persists in `localStorage`.

```js
// src/core/config.js — fill these in to switch it on
siteUrl: 'https://your-site',
links: {
  support: 'https://patreon.com/you',      // recurring
  shop:    'https://you.gumroad.com/l/packs' // one-off
},
pro: { keyHashes: ['<sha256 of a key you sell>'], gumroadProductId: '' },
```

> The Pro gate is a client-side soft licence (standard for indie tools) — honest, not DRM. Pair it with a real checkout (Gumroad/Ko-fi) and it's a working store.

The published root (`index.html`) is a premium **landing / shop** page — an editorial showcase whose backdrop is a live embed of the gallery itself — with the interactive gallery one click away at **`app.html`**. The edition CTAs read their URLs from the same `config.js`, so there's one place to configure everything.

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
index.html            premium landing / shop page
landing.css           landing styles (editorial, serif display)
landing.js            wires edition CTAs from config.js
app.html              the gallery app — markup + UI scaffold
styles.css            dark, glassy gallery interface
src/
  main.js             app shell: canvas/DPR, animation loop, pointer, UI, shortcuts
  core/
    utils.js          math helpers + a seedable PRNG (mulberry32)
    noise.js          seedable 2D/3D simplex noise (+ fBm)
    palette.js        curated palettes with smooth colour interpolation
    audio.js          generative ambient audio engine (Web Audio)
    config.js         opt-in monetisation & branding (support, shop, Pro)
    sketch.js         base class: the tiny contract every piece implements
  sketches/
    currents.js       flow field
    murmuration.js    boids + spatial hash
    coral.js          Gray–Scott reaction–diffusion
    heartwood.js      recursive growing garden
    mycelium.js       Physarum slime-mould network
    ink.js            Navier–Stokes stable-fluids solver
    cosmos.js         drifting nebula + parallax starfield
```

Every sketch implements the same small interface — `controls()`, `reset()`, `resize()`, `onParam()`, `frame(dt)` — and the shell treats them all identically. Adding another piece is just one more file in `sketches/` and one line in `main.js`. The shell hands each sketch a live `env` (current size, palette, pointer, seed) and a 2D context; the sketch just draws.

Design notes worth knowing:
- **Seeded determinism.** All randomness flows through a seeded PRNG, so *regenerate* rerolls a scene reproducibly rather than relying on `Math.random()` directly.
- **Trails** are produced by painting a translucent wash of the background each frame instead of clearing — lower alpha, longer trails.
- **Device-pixel-ratio aware.** The canvas backing store scales with the display (capped at 2×) so it stays crisp on retina screens, and saved PNGs are full-resolution.
- **Performance.** Boids use a spatial hash; the reaction–diffusion and the slime-mould trail field both run on a capped, downscaled grid (thousands of agents over tens of thousands of cells) and are upscaled with smoothing.
- **Emergence that stays alive.** A *Physarum* colony can collapse onto a single closed loop on a wrap-around grid — one fat band instead of a network. A small per-agent heading jitter plus a wide sensor angle keeps Mycelium a 2-D mesh, and every preset was parameter-swept across screen sizes and seeds (checking row/column mass concentration) to confirm it never collapses.
- **A real fluid solver.** Ink is Stam's stable-fluids method — a Gauss–Seidel Poisson pressure projection for incompressibility, semi-Lagrangian advection (unconditionally stable), and vorticity confinement to keep eddies crisp — on a square grid stretched to the canvas. The solver was validated headless: across resolutions it stays NaN-free, velocity bounded, and projection drives the velocity divergence to ~1e-3.
- **Shareable by URL.** The full scene (piece, palette, seed, params) serialises into the location hash via `replaceState`, and is parsed on load and on `hashchange` — so any link round-trips to the identical scene with no backend.
- **Audio-reactive visuals.** An `AnalyserNode` taps the final audio mix; the engine exposes a smoothed RMS `level` (fast attack, slow release) and a `beat` transient flag, and each sketch reads them to modulate its motion. With sound off the level decays to zero, so muted rendering is byte-for-byte unchanged.
- **Generative audio.** The soundtrack is synthesised live in the Web Audio graph — detuned oscillator voices through a filter an LFO slowly sweeps, a noise-impulse convolver reverb, and pentatonic chime tones scheduled at random. No audio files; it's all maths, like the visuals. Created lazily on first gesture, as autoplay rules require.

## License

MIT — see [LICENSE](LICENSE). Make things with it.
