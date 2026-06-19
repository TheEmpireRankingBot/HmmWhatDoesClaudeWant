// A small generative ambient audio engine, built on the Web Audio API.
//
// The point of this is the "use" for the gallery: a slow, never-repeating drone
// pad plus soft, randomly-timed bell tones (think distant wind-chimes / stars),
// all bathed in a long reverb. It's tuned to be calming — low, warm, unhurried —
// so the gallery doubles as an ambient companion for sleep, focus or just
// drifting. Sketches can also trigger an accent chime via `ping()`.
//
// Everything is created lazily on enable(), because browsers only allow an
// AudioContext to start from a user gesture (a click/tap/keypress).

import { clamp } from './utils.js';

// A minor pentatonic across a few octaves — there are no "wrong" notes in a
// pentatonic scale, so randomly-timed pings always sound consonant.
const BELL_SCALE = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];
// The drone chord: A minor spread low and wide (sub, root, fifth, octave, third).
const PAD_CHORD = [55.0, 110.0, 164.81, 220.0, 261.63];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this._volume = 0.55;
    this.twinkle = 0.5;        // 0..1 → density of automatic ambient bells
    this._nextTwinkle = 0;     // scheduled (ctx) time of next auto bell
    this.voices = [];
    // Audio-reactive signal, read by sketches via env.audio. `level` is a
    // smoothed 0..1 amplitude; `beat` pulses true on a transient (a chime).
    this.level = 0;
    this.beat = false;
    this._levelAvg = 0;
    this._lastBeat = 0;
    this.available =
      typeof window !== 'undefined' &&
      !!(window.AudioContext || window.webkitAudioContext);
  }

  get isOn() {
    return this.enabled;
  }

  /** Build the audio graph once. */
  _build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;

    // Master chain: bus → master gain (fades) → soft limiter → speakers.
    this.master = ctx.createGain();
    this.master.gain.value = 0;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 12;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.25;

    this.master.connect(limiter);
    limiter.connect(ctx.destination);

    // An analyser taps the final mix so the visuals can react to the sound.
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.75;
    limiter.connect(this.analyser);
    this._wave = new Uint8Array(this.analyser.fftSize);

    // A long, soft reverb gives the whole thing a sense of space.
    const reverb = ctx.createConvolver();
    reverb.buffer = this._impulse(3.6, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    const dry = ctx.createGain();
    dry.gain.value = 0.8;

    // Shared effects bus: pad and pings both flow through here.
    this.fxIn = ctx.createGain();
    this.fxIn.connect(dry);
    dry.connect(this.master);
    this.fxIn.connect(reverb);
    reverb.connect(wet);
    wet.connect(this.master);

    // The pad runs through a gentle low-pass that an LFO slowly opens and
    // closes, so the drone "breathes" rather than sitting still.
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 600;
    this.padFilter.Q.value = 0.7;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.22;
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.fxIn);

    // Slow filter LFO (~0.03 Hz → a full sweep every ~33s).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.03;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 320;
    lfo.connect(lfoDepth);
    lfoDepth.connect(this.padFilter.frequency);
    lfo.start();

    // Build the drone voices.
    for (const freq of PAD_CHORD) {
      this._addVoice(freq);
    }
  }

  /** One pad voice = two slightly detuned oscillators for warmth. */
  _addVoice(freq) {
    const ctx = this.ctx;
    const vGain = ctx.createGain();
    vGain.gain.value = freq < 80 ? 0.5 : 0.32; // sub a touch louder
    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 0.6;
    vGain.connect(pan);
    pan.connect(this.padFilter);

    const oscs = [];
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = freq;
      o.detune.value = (i === 0 ? -1 : 1) * (3 + Math.random() * 4);
      o.connect(vGain);
      o.start();
      oscs.push(o);
    }
    this.voices.push({ oscs, pan });
  }

  /** Generate a decaying-noise impulse response for the convolver reverb. */
  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /** Start (or resume) audio. MUST be called from a user gesture. */
  async enable() {
    if (!this.available) return false;
    if (!this.ctx) this._build();
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (e) { /* ignore */ }
    }
    this.enabled = true;
    this._ramp(this.master.gain, this._volume, 2.5); // slow fade-in
    this._nextTwinkle = this.ctx.currentTime + 1.5;
    return true;
  }

  /** Fade out and stop driving the engine (context stays alive for re-enable). */
  disable() {
    if (!this.ctx) return;
    this.enabled = false;
    this._ramp(this.master.gain, 0, 1.2);
  }

  async toggle() {
    if (this.enabled) { this.disable(); return false; }
    return this.enable();
  }

  setVolume(v) {
    this._volume = clamp(v, 0, 1);
    if (this.enabled && this.ctx) this._ramp(this.master.gain, this._volume, 0.3);
  }

  setTwinkle(v) {
    this.twinkle = clamp(v, 0, 1);
  }

  _ramp(param, target, seconds) {
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(target, t + seconds);
  }

  /**
   * A soft bell tone. Sketches call this on events (a shooting star, etc.).
   * @param {object} opts  { pitch: 0..1 (low→high within the scale), gain, pan, decay }
   */
  ping(opts = {}) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const idx = clamp(Math.floor((opts.pitch ?? Math.random()) * BELL_SCALE.length), 0, BELL_SCALE.length - 1);
    const freq = BELL_SCALE[idx];
    const peak = (opts.gain ?? 0.12) * 0.9;
    const decay = opts.decay ?? (2 + Math.random() * 2.5);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // A faint second partial gives the bell a little shimmer.
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2.01;

    const g = ctx.createGain();
    const g2 = ctx.createGain();
    g.gain.value = 0;
    g2.gain.value = 0;

    const pan = ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? (Math.random() - 0.5) * 1.2;

    osc.connect(g);
    osc2.connect(g2);
    g.connect(pan);
    g2.connect(pan);
    pan.connect(this.fxIn);

    // Quick attack, long exponential decay.
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    g2.gain.setValueAtTime(0, now);
    g2.gain.linearRampToValueAtTime(peak * 0.35, now + 0.012);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + decay * 0.7);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + decay + 0.1);
    osc2.stop(now + decay + 0.1);
    const cleanup = () => { try { pan.disconnect(); } catch (e) {} };
    osc.onended = cleanup;
  }

  /**
   * Called every frame by the shell. Updates the reactive level/beat signal
   * and schedules the automatic ambient bells.
   */
  update(dt) {
    // --- Reactive level: smoothed RMS amplitude from the analyser ----------
    if (this.enabled && this.ctx && this.analyser) {
      this.analyser.getByteTimeDomainData(this._wave);
      let sum = 0;
      const w = this._wave;
      for (let i = 0; i < w.length; i++) {
        const x = (w[i] - 128) / 128;
        sum += x * x;
      }
      const raw = clamp(Math.sqrt(sum / w.length) * 3.2, 0, 1);
      // Fast attack, slow release, so the signal feels musical.
      this.level += (raw - this.level) * (raw > this.level ? 0.6 : 0.08);
      this._levelAvg += (this.level - this._levelAvg) * 0.04;
      const t = this.ctx.currentTime;
      this.beat = false;
      if (this.level > this._levelAvg * 1.3 + 0.015 && t - this._lastBeat > 0.16) {
        this.beat = true;
        this._lastBeat = t;
      }
    } else {
      // Decay to silence when disabled so visuals settle back.
      this.level += (0 - this.level) * Math.min(1, (dt || 0.016) * 5);
      if (this.level < 0.001) this.level = 0;
      this.beat = false;
    }

    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (now >= this._nextTwinkle) {
      if (this.twinkle > 0.001) {
        this.ping({ gain: 0.06 + this.twinkle * 0.06 });
      }
      // Higher density → shorter, more variable gaps between bells.
      const base = 7.5 - this.twinkle * 6;        // ~7.5s down to ~1.5s
      this._nextTwinkle = now + base * (0.5 + Math.random());
    }
  }
}
