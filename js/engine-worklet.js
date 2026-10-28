// Lizard audio engine. Runs entirely inside an AudioWorklet.
//
// Signal flow:
//   mic ─┬─> listen buffer ──> granular cloud ───────┐
//        ├─> resonator bank (tuned to chord) ────────┤
//        └─> dry monitor ────────────────────────────┤
//   chord-driven synth (strings / pad / FM) ─────────┤
//                                                     v
//                                     filter -> drive -> looper -> delay -> reverb -> limiter -> out
//
// The Lizard engines (resonator bank, grains, synth) are written from scratch
// after Gechologic's Gecho. Next to them run the real Mutable Instruments
// Plaits, Rings and Clouds, compiled to WebAssembly (js/mi.wasm, see wasm/).

const TAU = Math.PI * 2;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// Zero-delay-feedback state variable filter (Simper/Cytomic topology).
class SVF {
  constructor() {
    this.ic1 = 0; this.ic2 = 0;
    this.a1 = 0; this.a2 = 0; this.a3 = 0; this.k = 1;
    this.lp = 0; this.bp = 0; this.hp = 0;
  }
  set(freq, q, sr) {
    const g = Math.tan(Math.PI * Math.min(freq, sr * 0.45) / sr);
    const k = 1 / q;
    this.k = k;
    this.a1 = 1 / (1 + g * (g + k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  tick(x) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1; this.hp = x - this.k * v1 - v2;
    return v1;
  }
}

class DelayLine {
  constructor(n) { this.n = Math.max(4, Math.ceil(n)); this.buf = new Float32Array(this.n); this.w = 0; }
  write(x) { this.buf[this.w] = x; if (++this.w >= this.n) this.w = 0; }
  // d = 1 returns the most recently written sample
  read(d) { let i = this.w - d; if (i < 0) i += this.n; return this.buf[i]; }
  readFrac(d) {
    const di = Math.floor(d), f = d - di;
    return this.read(di) * (1 - f) + this.read(di + 1) * f;
  }
}

function allpass(dl, len, g, x) {
  const d = dl.read(len);
  const w = x + g * d;
  dl.write(w);
  return d - g * w;
}

// ───────────────────────── Resonator bank ─────────────────────────
const RES_N = 16;
class ResonatorBank {
  constructor(sr) {
    this.sr = sr;
    this.f = Array.from({ length: RES_N }, () => new SVF());
    this.freq = new Float64Array(RES_N).fill(220);
    this.target = new Float64Array(RES_N).fill(220);
    this.gain = new Float64Array(RES_N);
    this.gainT = new Float64Array(RES_N);
    this.pl = new Float64Array(RES_N);
    this.pr = new Float64Array(RES_N);
    this.noteIdx = new Int32Array(RES_N);
    this.exc = new Float64Array(RES_N).fill(1); // input gate per filter (pulsed modes)
    this.excDecay = 1;
    this.norm = 0.1;
  }
  // open the input of every filter that belongs to chord note j
  hit(j) { for (let k = 0; k < RES_N; k++) if (this.noteIdx[k] === j) this.exc[k] = 1; }
  update(notes, octaves, bright, spread, q, glideC) {
    let i = 0;
    const n = notes.length;
    for (let o = 0; o < octaves; o++) {
      for (let j = 0; j < n && i < RES_N; j++, i++) {
        this.target[i] = mtof(notes[j] + 12 * o);
        this.noteIdx[i] = j;
        this.gainT[i] = o === 0 ? 1 : Math.pow(bright, o) * 1.2;
        const pos = n > 1 ? j / (n - 1) : 0.5;
        const pan = ((i & 1) ? 1 : -1) * spread * (0.4 + 0.6 * pos);
        const a = (pan + 1) * Math.PI / 4;
        this.pl[i] = Math.cos(a); this.pr[i] = Math.sin(a);
      }
    }
    for (; i < RES_N; i++) this.gainT[i] = 0;
    // sqrt(k) keeps loudness roughly constant over Q on broadband input
    this.norm = Math.sqrt(1 / q) * 1.8;
    for (let k = 0; k < RES_N; k++) {
      this.freq[k] *= Math.pow(this.target[k] / this.freq[k], glideC);
      this.gain[k] += (this.gainT[k] - this.gain[k]) * 0.08;
      this.f[k].set(this.freq[k], q, this.sr);
    }
  }
  tick(x, out) {
    let l = 0, r = 0;
    const dec = this.excDecay;
    for (let k = 0; k < RES_N; k++) {
      const g = this.gain[k];
      if (g < 1e-4) continue;
      const e = this.exc[k];
      this.exc[k] = e * dec;
      const y = this.f[k].tick(x * e) * g;
      l += y * this.pl[k]; r += y * this.pr[k];
    }
    out[0] = l * this.norm; out[1] = r * this.norm;
  }
}

// ───────────────────────── Granular cloud ─────────────────────────
const MAX_GRAINS = 40;
const WIN_N = 1024;
const WIN = new Float32Array(WIN_N + 1);
for (let i = 0; i <= WIN_N; i++) WIN[i] = Math.sin(Math.PI * i / WIN_N) ** 2;

class Granular {
  constructor(sr, seconds) {
    this.sr = sr;
    this.len = Math.floor(sr * seconds);
    this.buf = new Float32Array(this.len);
    this.w = 0;
    this.frozen = false;
    this.timer = 0;
    this.grains = Array.from({ length: MAX_GRAINS }, () => ({
      on: false, pos: 0, inc: 1, age: 0, size: 1, amp: 0, pl: 0, pr: 0,
    }));
  }
  write(x) {
    if (this.frozen) return;
    this.buf[this.w] = x;
    if (++this.w >= this.len) this.w = 0;
  }
  spawn(p, intervals) {
    let g = null;
    for (const gr of this.grains) if (!gr.on) { g = gr; break; }
    if (!g) return;
    const sr = this.sr;
    const size = Math.max(64, Math.floor(p.grSize * sr / 1000));
    let semis = p.grPitch;
    if (intervals.length && Math.random() < p.grChord) semis += intervals[(Math.random() * intervals.length) | 0];
    if (Math.random() < p.grOctave) semis += Math.random() < 0.5 ? 12 : -12;
    semis += (Math.random() - 0.5) * p.grJitter * 0.3; // a touch of detune
    const ratio = Math.pow(2, semis / 12);
    const rev = Math.random() < p.grReverse;
    const span = size * ratio;
    // keep the read head clear of the write head for the grain's whole life
    let minD, maxD;
    if (rev) { minD = 2; maxD = this.len - size - span - 2; } else { minD = Math.max(2, span - size + 2); maxD = this.len - size - 2; }
    if (maxD <= minD) return;
    let d = minD + p.grPos * (maxD - minD) + (Math.random() - 0.5) * p.grJitter * sr * 1.5;
    d = clamp(d, minD, maxD);
    let start = this.w - d;
    if (start < 0) start += this.len;
    g.on = true; g.pos = start; g.inc = rev ? -ratio : ratio; g.age = 0; g.size = size;
    g.amp = 0.6 + Math.random() * 0.4;
    const pan = (Math.random() - 0.5) * (0.4 + p.grJitter);
    const a = (clamp(pan, -1, 1) + 1) * Math.PI / 4;
    g.pl = Math.cos(a); g.pr = Math.sin(a);
  }
  tick(p, intervals, out) {
    if (--this.timer <= 0) {
      this.spawn(p, intervals);
      const base = this.sr / p.grDensity;
      this.timer = base * (1 + (Math.random() - 0.5) * p.grJitter * 1.6);
    }
    let l = 0, r = 0;
    const len = this.len, buf = this.buf;
    for (let i = 0; i < MAX_GRAINS; i++) {
      const g = this.grains[i];
      if (!g.on) continue;
      let pos = g.pos;
      if (pos >= len) pos -= len; else if (pos < 0) pos += len;
      const i0 = pos | 0;
      const fr = pos - i0;
      const i1 = i0 + 1 >= len ? 0 : i0 + 1;
      const s = buf[i0] + (buf[i1] - buf[i0]) * fr;
      const env = WIN[((g.age / g.size) * WIN_N) | 0] * g.amp;
      const y = s * env;
      l += y * g.pl; r += y * g.pr;
      g.pos = pos + g.inc;
      if (++g.age >= g.size) g.on = false;
    }
    const overlap = p.grDensity * p.grSize / 1000;
    const norm = 1 / Math.sqrt(Math.max(1, overlap));
    out[0] = l * norm; out[1] = r * norm;
  }
}

// ───────────────────────── Synth voices ─────────────────────────
const KS_SIZE = 4096;
class KSVoice {
  constructor() { this.buf = new Float32Array(KS_SIZE); this.w = 0; this.on = false; this.age = 0; this.lp = 0; }
  trigger(freq, vel, p, sr) {
    this.D = clamp(sr / freq - 0.5, 4, KS_SIZE - 4);
    const t60 = 0.3 + p.synDecay * p.synDecay * 9;
    this.fb = Math.exp(Math.log(0.001) / (t60 * freq));
    this.damp = 0.15 + p.synMorph * 0.85;
    this.life = Math.floor(t60 * sr * 1.1);
    const bright = 0.05 + p.synTimbre * 0.95;
    let s = 0;
    const n = Math.ceil(this.D) + 2;
    for (let k = 0; k < n; k++) {
      s += bright * ((Math.random() * 2 - 1) - s);
      let i = this.w - 1 - k; if (i < 0) i += KS_SIZE;
      this.buf[i] = s * vel;
    }
    this.on = true; this.age = 0;
  }
  tick() {
    let r = this.w - this.D; if (r < 0) r += KS_SIZE;
    const i0 = r | 0, fr = r - i0;
    const i1 = (i0 + 1) & (KS_SIZE - 1);
    const y = this.buf[i0] + (this.buf[i1] - this.buf[i0]) * fr;
    this.lp += this.damp * (y - this.lp);
    this.buf[this.w] = this.lp * this.fb;
    this.w = (this.w + 1) & (KS_SIZE - 1);
    if (++this.age > this.life) this.on = false;
    return y;
  }
}

const FM_RATIOS = [0.5, 1, 1.41, 2, 2.76, 3, 3.5, 4, 5.4, 7];
class FMVoice {
  constructor() { this.on = false; this.age = 0; }
  trigger(freq, vel, p, sr) {
    this.inc = TAU * freq / sr;
    this.incM = this.inc * FM_RATIOS[Math.min(FM_RATIOS.length - 1, (p.synMorph * FM_RATIOS.length) | 0)];
    this.pc = 0; this.pm = 0;
    this.index = p.synTimbre * 7;
    const t = 0.08 + p.synDecay * p.synDecay * 5;
    this.dec = Math.exp(-6.9 / (t * sr));
    this.decM = Math.exp(-6.9 / (t * 0.35 * sr));
    this.env = vel; this.envM = 1; this.att = 0; this.attInc = 1 / (0.002 * sr);
    this.on = true; this.age = 0;
  }
  tick() {
    if (this.att < 1) this.att += this.attInc;
    const m = Math.sin(this.pm) * this.index * this.envM;
    const y = Math.sin(this.pc + m) * this.env * Math.min(1, this.att);
    this.pc += this.inc; if (this.pc > TAU) this.pc -= TAU;
    this.pm += this.incM; if (this.pm > TAU) this.pm -= TAU;
    this.env *= this.dec; this.envM *= this.decM;
    if (this.env < 1e-4) this.on = false;
    this.age++;
    return y;
  }
}

function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

const PAD_N = 6;
class Pad {
  constructor(sr) {
    this.sr = sr;
    this.freq = new Float64Array(PAD_N).fill(110);
    this.target = new Float64Array(PAD_N).fill(110);
    this.amp = new Float64Array(PAD_N);
    this.ampT = new Float64Array(PAD_N);
    this.ph = new Float64Array(PAD_N * 3).map(() => Math.random());
    this.lp1 = [0, 0]; this.lp2 = [0, 0];
  }
  update(notes, glideC) {
    for (let i = 0; i < PAD_N; i++) {
      if (i < notes.length) { this.target[i] = mtof(notes[i]); this.ampT[i] = 1; } else this.ampT[i] = 0;
      this.freq[i] *= Math.pow(this.target[i] / this.freq[i], glideC);
      this.amp[i] += (this.ampT[i] - this.amp[i]) * 0.02;
    }
  }
  tick(p, out) {
    const sr = this.sr;
    const det = 1 + p.synTimbre * 0.012;
    let l = 0, r = 0;
    for (let i = 0; i < PAD_N; i++) {
      const a = this.amp[i];
      if (a < 1e-4) continue;
      const f = this.freq[i];
      const dt1 = f * det / sr, dt2 = f / det / sr, dt3 = f * 0.5 / sr;
      let p1 = this.ph[i * 3], p2 = this.ph[i * 3 + 1], p3 = this.ph[i * 3 + 2];
      const s1 = 2 * p1 - 1 - polyblep(p1, dt1);
      const s2 = 2 * p2 - 1 - polyblep(p2, dt2);
      const sub = Math.sin(TAU * p3) * (1 - p.synMorph) * 0.8;
      p1 += dt1; if (p1 >= 1) p1 -= 1;
      p2 += dt2; if (p2 >= 1) p2 -= 1;
      p3 += dt3; if (p3 >= 1) p3 -= 1;
      this.ph[i * 3] = p1; this.ph[i * 3 + 1] = p2; this.ph[i * 3 + 2] = p3;
      l += (s1 * 0.8 + sub) * a; r += (s2 * 0.8 + sub) * a;
    }
    // gentle 2-pole lowpass, morph opens it
    const c = 1 - Math.exp(-TAU * (200 + p.synMorph * p.synMorph * 6000) / sr);
    this.lp1[0] += c * (l - this.lp1[0]); this.lp2[0] += c * (this.lp1[0] - this.lp2[0]);
    this.lp1[1] += c * (r - this.lp1[1]); this.lp2[1] += c * (this.lp1[1] - this.lp2[1]);
    out[0] = this.lp2[0] * 0.1; out[1] = this.lp2[1] * 0.1;
  }
}

// ───────────────────────── Dattorro plate reverb ─────────────────────────
class Plate {
  constructor(sr) {
    const s = sr / 29761;
    this.s = s;
    const L = (n) => Math.round(n * s);
    this.pre = new DelayLine(sr * 0.05);
    this.preLen = Math.round(sr * 0.012);
    this.inLen = [L(142), L(107), L(379), L(277)];
    this.inAp = this.inLen.map((n) => new DelayLine(n + 2));
    this.len = { apm1: L(672), d1: L(4453), ap2: L(1800), d2: L(3720), apm2: L(908), d3: L(4217), ap4: L(2656), d4: L(3163) };
    this.exc = 16 * s;
    this.apm1 = new DelayLine(this.len.apm1 + this.exc + 4);
    this.apm2 = new DelayLine(this.len.apm2 + this.exc + 4);
    this.d1 = new DelayLine(this.len.d1 + 2); this.d2 = new DelayLine(this.len.d2 + 2);
    this.d3 = new DelayLine(this.len.d3 + 2); this.d4 = new DelayLine(this.len.d4 + 2);
    this.ap2 = new DelayLine(this.len.ap2 + 2); this.ap4 = new DelayLine(this.len.ap4 + 2);
    this.bw = 0; this.dmp1 = 0; this.dmp2 = 0;
    this.lfo = 0; this.lfoInc = TAU * 0.9 / sr;
    this.t = [266, 2974, 1913, 1996, 1990, 187, 1066, 353, 3627, 1228, 2673, 2111, 335, 121].map(L);
  }
  tick(x, decay, damping, out) {
    const len = this.len, t = this.t;
    this.pre.write(x);
    x = this.pre.read(this.preLen);
    this.bw += 0.9995 * (x - this.bw);
    x = this.bw;
    x = allpass(this.inAp[0], this.inLen[0], 0.75, x);
    x = allpass(this.inAp[1], this.inLen[1], 0.75, x);
    x = allpass(this.inAp[2], this.inLen[2], 0.625, x);
    x = allpass(this.inAp[3], this.inLen[3], 0.625, x);

    this.lfo += this.lfoInc; if (this.lfo > TAU) this.lfo -= TAU;
    const m1 = len.apm1 + this.exc * Math.sin(this.lfo);
    const m2 = len.apm2 + this.exc * Math.cos(this.lfo);
    const fbL = this.d4.read(len.d4);
    const fbR = this.d2.read(len.d2);
    const g2 = clamp(decay + 0.15, 0.25, 0.5);

    // left half of the tank
    let a = x + decay * fbL;
    let d = this.apm1.readFrac(m1);
    let w = a - 0.7 * d; this.apm1.write(w); a = d + 0.7 * w;
    this.d1.write(a);
    let b = this.d1.read(len.d1);
    this.dmp1 = b * (1 - damping) + this.dmp1 * damping;
    b = allpass(this.ap2, len.ap2, g2, this.dmp1 * decay);
    this.d2.write(b);

    // right half
    let c = x + decay * fbR;
    d = this.apm2.readFrac(m2);
    w = c - 0.7 * d; this.apm2.write(w); c = d + 0.7 * w;
    this.d3.write(c);
    let e = this.d3.read(len.d3);
    this.dmp2 = e * (1 - damping) + this.dmp2 * damping;
    e = allpass(this.ap4, len.ap4, g2, this.dmp2 * decay);
    this.d4.write(e);

    out[0] = 0.6 * (this.d3.read(t[0]) + this.d3.read(t[1]) - this.ap4.read(t[2]) + this.d4.read(t[3])
      - this.d1.read(t[4]) - this.ap2.read(t[5]) - this.d2.read(t[6]));
    out[1] = 0.6 * (this.d1.read(t[7]) + this.d1.read(t[8]) - this.ap2.read(t[9]) + this.d2.read(t[10])
      - this.d3.read(t[11]) - this.ap4.read(t[12]) - this.d4.read(t[13]));
  }
}

// ───────────────────────── Bytebeat ─────────────────────────
// Classic one-liners; t ticks at the bytebeat rate, output is 8-bit.
const BYTEBEATS = [
  (t) => t * (42 & (t >> 10)),
  (t) => t * (((t >> 12) | (t >> 8)) & 63 & (t >> 4)),
  (t) => ((t * 5) & (t >> 7)) | ((t * 3) & (t >> 10)),
  (t) => (t * ((t >> 5) | (t >> 8))) >> (t >> 16),
  (t) => ((t >> 6) | t | (t >> (t >> 16))) * 10 + ((t >> 11) & 7),
  (t) => t * (((t >> 9) | (t >> 13)) & 25 & (t >> 6)),
];

// ───────────────────────── Echo chamber ─────────────────────────
// Takes in the sound (live, or a captured phrase on repeat) and plays it back
// through up to six delay taps, each with its own time, pitch/direction, tone,
// pan and amount of a separate large reverb.
const EC_BEATS = [0.25, 0.5, 0.75, 1, 1.5, 2, 4];
const EC_CAP_BEATS = [1, 2, 4, 8];
const EC_TAPS = 6;
class EchoChamber {
  constructor(sr) {
    this.sr = sr;
    this.buf = new DelayLine(sr * 14);
    this.hist = new Float32Array(sr * 8); this.histW = 0; // recent input, for capturing
    this.cap = new Float32Array(sr * 8); this.capLen = 0; this.capPos = 0; this.holding = false;
    this.plate = new Plate(sr);
    this.out = [0, 0];
    this.taps = Array.from({ length: EC_TAPS }, (_, k) => ({
      d: sr * 0.25 * (k + 1), dcur: sr * 0.25 * (k + 1), r: 1, g: 0, pl: 0.7, pr: 0.7, send: 0, lp: 0, lpc: 0.5,
      ph: Math.random(), W: sr * 0.08,
    }));
    this.reroll = true; this.mode = -1;
  }
  capture(beats, spb) {
    const n = Math.min(this.hist.length, Math.round(beats * spb));
    for (let i = 0; i < n; i++) {
      let j = this.histW - n + i; if (j < 0) j += this.hist.length;
      this.cap[i] = this.hist[j];
    }
    const f = Math.min(512, n >> 3);
    for (let i = 0; i < f; i++) { this.cap[i] *= i / f; this.cap[n - 1 - i] *= i / f; }
    this.capLen = n; this.capPos = 0; this.holding = true;
  }
  configure(p, spb) {
    const sr = this.sr, n = clamp(Math.round(p.ecTaps), 1, EC_TAPS);
    const base = spb * (EC_BEATS[p.ecTime] ?? 1);
    const maxD = this.buf.n - sr * 0.6;
    const newMode = p.ecMode !== this.mode;
    this.mode = p.ecMode;
    for (let k = 0; k < EC_TAPS; k++) {
      const t = this.taps[k];
      if (k >= n) { t.g = 0; continue; }
      const side = (k & 1 ? 1 : -1) * p.ecSpread * (0.4 + 0.6 * (k + 1) / n);
      let d = base * (k + 1), r = 1, g = Math.pow(0.82, k), send = p.ecSpace * 0.4;
      let dark = p.ecTone * k / Math.max(1, n - 1);
      switch (p.ecMode) {
        case 1: // room -> cathedral: each echo further away
          send = p.ecSpace * (n > 1 ? k / (n - 1) : 1) * 1.2;
          g = Math.pow(0.88, k);
          break;
        case 2: // shimmer: echoes climb in octaves and fifths
          r = [2, 1.5, 2, 4, 1.5, 2][k];
          send = p.ecSpace * 0.7;
          break;
        case 3: // backwards
          r = -1;
          break;
        case 4: // random taps, re-rolled every couple of bars
          if (this.reroll || newMode || t.rd == null) {
            t.rd = base * (1 + ((Math.random() * 8) | 0)) / 2;
            t.rr = [1, 1, 1, 2, 0.5, -1, 1.5][(Math.random() * 7) | 0];
            t.rpan = Math.random() * 2 - 1;
          }
          d = t.rd; r = t.rr; send = p.ecSpace * 0.6;
          break;
      }
      const pan = p.ecMode === 4 ? (t.rpan ?? 0) * p.ecSpread : side;
      const a = (clamp(pan, -1, 1) + 1) * Math.PI / 4;
      t.pl = Math.cos(a); t.pr = Math.sin(a);
      t.r = r; t.g = g; t.send = send;
      t.W = r < 0 ? Math.min(sr * 0.45, Math.max(sr * 0.1, d * 0.5)) : sr * 0.07;
      t.d = clamp(d, 64, maxD - t.W);
      t.lpc = 1 - Math.exp(-TAU * (16000 * Math.pow(0.08, dark)) / sr);
    }
    this.reroll = false;
  }
  tick(inp, p, out) {
    this.hist[this.histW] = inp;
    if (++this.histW >= this.hist.length) this.histW = 0;
    let x = inp;
    if (this.holding && this.capLen > 0) {
      x = this.cap[this.capPos];
      if (++this.capPos >= this.capLen) this.capPos = 0;
    }
    let L = 0, R = 0, send = 0, mono = 0;
    const buf = this.buf;
    for (let k = 0; k < EC_TAPS; k++) {
      const t = this.taps[k];
      if (t.g < 1e-4) continue;
      t.dcur += (t.d - t.dcur) * 0.0004;
      let y;
      if (t.r === 1) y = buf.readFrac(t.dcur);
      else {
        // two crossfaded heads sweeping a window: pitch shift / reverse
        let ph = t.ph + (1 - t.r) / t.W;
        ph -= Math.floor(ph);
        t.ph = ph;
        const ph2 = ph < 0.5 ? ph + 0.5 : ph - 0.5;
        const w = Math.sin(Math.PI * ph) ** 2;
        y = buf.readFrac(t.dcur + ph * t.W) * w + buf.readFrac(t.dcur + ph2 * t.W) * (1 - w);
      }
      t.lp += t.lpc * (y - t.lp);
      y = t.lp * t.g;
      L += y * t.pl; R += y * t.pr; send += y * t.send; mono += y;
    }
    buf.write(x + Math.tanh(mono * p.ecFb * 0.7));
    this.plate.tick(send, 0.5 + p.ecSpace * 0.47, 0.25 + p.ecTone * 0.5, this.out);
    out[0] = L + this.out[0];
    out[1] = R + this.out[1];
  }
}

// ───────────────────────── Engine ─────────────────────────
const SMP_MAX_S = 6;
const WARPS_ALGOS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.8, 0.97];
const ARP_STEPS = [1, 2, 3, 4];
const DLY_BEATS = [0.25, 0.5, 0.75, 1, 1.5, 2];
const LOOP_BARS = [1, 2, 4, 8];
const LOOP_SPEED = [1, 0.5, -1, -0.5];
const PROG_LEN = [2, 3, 4, 6, 8];
const CHORD_BARS = [1, 2, 4];
const MAX_LOOP_S = 40;

class LizardEngine extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = sampleRate;
    this.sr = sr;
    this.p = {
      inGain: 1, agc: true, monitor: 0, noise: 0, keyMode: 0, octave: 3, glide: 300, bpm: 84, click: false,
      resLevel: 0.7, resQ: 0.65, resBright: 0.5, resOct: 2, resSpread: 0.7,
      grLevel: 0.5, grPos: 0.15, grSize: 220, grDensity: 10, grPitch: 0, grChord: 0.7, grJitter: 0.3, grReverse: 0.15, grOctave: 0.2,
      synLevel: 0.25, synModel: 0, synTimbre: 0.5, synMorph: 0.5, synDecay: 0.5, arpRate: 1, arpPattern: 2, arpChance: 0.6, synOct: 1,
      fltType: 0, fltCutoff: 6000, fltRes: 0.2, drive: 0.1,
      dlyMix: 0.25, dlyDiv: 2, dlyFb: 0.45, dlyTone: 0.5, dlyWow: 0.15,
      rvbMix: 0.4, rvbSize: 0.75, rvbDamp: 0.35,
      loopBars: 2, loopFb: 0.93, loopLevel: 0.9, loopFadeAlways: false, loopSpeed: 0,
      master: 0.8, progLen: 2, chordBars: 1,
      plLevel: 0, plEngine: 8, plHarm: 0.5, plTimbre: 0.5, plMorph: 0.5, plDecay: 0.5, plColour: 0.5, plMode: 0, plVoices: 4, plOct: 0, plAux: 0,
      rgLevel: 0, rgModel: 0, rgStructure: 0.4, rgBright: 0.5, rgDamp: 0.6, rgPos: 0.3, rgPluck: 0, rgVoices: 4, rgOct: 0,
      resMode: 0, resPulses: 0.5, resPulseLen: 120, bbLevel: 0, bbFormula: 0, bbRate: 8000,
      smpLevel: 0, smpMode: 0, smpPitch: 0, smpOct: 0,
      wpLevel: 0, wpAlgo: 6, wpTimbre: 0.5, wpCarrier: 0, wpCarLvl: 0.7, wpModLvl: 0.7, wpOct: 0,
      arpSource: 0, mbModel: 0, mbRate: 2, mbBias: 0.5, mbJitter: 0, mbDejaVu: 0.25, mbLength: 8, mbSpread: 0.5,
      mbXBias: 0.5, mbSteps: 0.8, mbRange: 0,
      elLevel: 0, elModel: 0, elPlay: 0, elContour: 0.5, elBow: 0, elBlow: 0, elStrike: 0.8, elBowTimbre: 0.5,
      elBlowMeta: 0.5, elBlowTimbre: 0.5, elStrikeMeta: 0.5, elStrikeTimbre: 0.5, elGeometry: 0.2, elBright: 0.5,
      elDamp: 0.3, elPos: 0.3, elSpace: 0.5, elMic: 0.5, elOct: 0,
      bdLevel: 0, bdMedia: 0, bdTime: 0.4, bdSize: 0.5, bdShape: 0.5, bdPitch: 0, bdFollow: true, bdDensity: 0.8,
      bdRandom: 0.2, bdFeedback: 0.2, bdReverb: 0.3, bdSeeds: 0, bdSend: 0,
      ecLevel: 0, ecMode: 0, ecTime: 3, ecTaps: 4, ecFb: 0.35, ecSpace: 0.6, ecTone: 0.5, ecSpread: 0.7, ecSend: 0, ecCapLen: 2,
      clLevel: 0, clMode: 0, clPos: 0.4, clSize: 0.5, clPitch: 0, clDensity: 0.65, clTexture: 0.5, clSpread: 0.6, clFeedback: 0.2, clReverb: 0.3, clFollow: true, clSend: 0,
    };

    // Mutable Instruments engines (WebAssembly, loaded after start)
    this.mi = null;
    this.micBuf = new Float32Array(128); this.resInBuf = new Float32Array(128);
    this.prevL = new Float32Array(128); this.prevR = new Float32Array(128);
    this.rgNote = [48, 52, 55, 59]; this.plNote = [48, 52, 55, 59];
    this.rgStrum = [false, false, false, false];
    this.plTrig = []; this.plVoice = 0;
    this.miOff = { plaits: 12 * Math.log2(47872.34 / sr), rings: 12 * Math.log2(48000 / sr), warps: 12 * Math.log2(48000 / sr), elements: 0 };
    this.rootPcs = [0]; this.rootShift = 0;

    // Gecho modes
    this.step16 = -1; this.resArp = 0; this.barBase = 0;
    this.bbT = 0; this.bbPh = 0; this.bbVal = 0;
    this.smpBuf = new Float32Array(Math.floor(sr * SMP_MAX_S));
    this.smpLen = 0; this.smpW = 0; this.smpRec = false; this.smpRoot = 0;
    this.smpPh = new Float64Array(4).map((_, i) => i * 0.13);
    this.smpShots = Array.from({ length: 6 }, () => ({ on: false, pos: 0, rate: 1, pan: 0 }));

    // Warps carrier (synths, one block behind), Marbles, echo chamber
    this.carBuf = new Float32Array(128);
    this.mbScaleDirty = true; this.mbY = 0.5;
    this.echo = new EchoChamber(sr);
    this.elNote = 48; this.elGateUntil = 0; this.bdSeed = false;
    this.res = new ResonatorBank(sr);
    this.gran = new Granular(sr, 20);
    this.ks = Array.from({ length: 8 }, () => new KSVoice());
    this.fm = Array.from({ length: 8 }, () => new FMVoice());
    this.pad = new Pad(sr);
    this.fl = new SVF(); this.fr = new SVF();
    this.cut = 6000;
    this.plate = new Plate(sr);
    this.dl = new DelayLine(sr * 4.2); this.dr = new DelayLine(sr * 4.2);
    this.dTime = sr * 0.5; this.dlpL = 0; this.dlpR = 0; this.wow = 0;

    // looper
    this.loopMax = Math.floor(sr * MAX_LOOP_S);
    this.loopL = new Float32Array(this.loopMax); this.loopR = new Float32Array(this.loopMax);
    this.undoL = null; this.undoR = null;
    this.loopLen = 0; this.loopHead = 0; this.loopIdx = -1;
    this.loopState = 'empty'; // empty | armed | dub | play

    // transport
    this.beatPhase = 0; this.beat = 0; this.arpStep = -1;
    this.clickEnv = 0; this.clickPh = 0; this.clickInc = 0;

    // chords
    this.chords = [[48, 55, 59, 64]];
    this.chordIdx = 0;
    this.chord = this.chords[0];
    this.intervals = [0, 7, 11, 16];
    this.keyRoot = 0;
    this.arpIdx = 0;
    this.pending = [];
    this.t = 0;

    // smoothed gains
    this.sm = { elLevel: 0, bdLevel: 0, wpLevel: 0, ecLevel: 0, smpLevel: 0, resLevel: 0, grLevel: 0, synLevel: 0, rgLevel: 0, plLevel: 0, clLevel: 0, monitor: 0, loopLevel: 0.9, dlyMix: 0, rvbMix: 0, master: 0, drive: 0 };
    this.smK = 1 - Math.exp(-1 / (0.02 * sr));

    this.dcX = 0; this.dcY = 0;
    this.agcEnv = 1e-4; this.agcGain = 1; this.agcK = 1 - Math.exp(-1 / (1.0 * sr));
    this.resEnv = 0; this.resRel = Math.exp(-1 / (0.25 * sr));
    this.limEnv = 0;
    this.frozen = false;
    this.meterN = 0; this.inSq = 0; this.outPk = 0;
    this.recording = false; this.recPos = 0;
    this.recL = new Float32Array(16384); this.recR = new Float32Array(16384);
    this.tmp = [0, 0]; this.tmp2 = [0, 0];

    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    switch (m.type) {
      case 'params': Object.assign(this.p, m.values); break;
      case 'wasm': this.loadWasm(m.bytes); break;
      case 'chords':
        this.chords = m.chords;
        this.keyRoot = m.keyRoot;
        this.rootPcs = m.rootPcs || [m.keyRoot];
        this.chordIdx = m.reset ? 0 : this.chordIdx % this.chords.length;
        if (m.reset) this.barBase = Math.floor(this.beat / 4);
        this.setChord(this.chordIdx, false);
        break;
      case 'freeze': this.frozen = m.on; this.gran.frozen = m.on; break;
      case 'beadsSeed': this.bdSeed = true; break;
      case 'echo':
        if (m.action === 'capture') {
          this.echo.capture(EC_CAP_BEATS[this.p.ecCapLen] ?? 4, 60 / this.p.bpm * this.sr);
        } else this.echo.holding = false;
        this.port.postMessage({ type: 'echoState', holding: this.echo.holding });
        break;
      case 'sampler':
        if (m.action === 'rec') { this.smpRec = true; this.smpW = 0; }
        else if (m.action === 'stop') this.stopSampling(m.root);
        else if (m.action === 'clear') { this.smpRec = false; this.smpLen = 0; this.postSampler(); }
        break;
      case 'loop': this.loopAction(m.action); break;
      case 'record':
        if (m.on) { this.recording = true; this.recPos = 0; } else { this.flushRec(true); this.recording = false; }
        break;
      case 'getLoop': {
        const n = this.loopLen;
        this.port.postMessage({ type: 'loopData', id: m.id, L: this.loopL.slice(0, n), R: this.loopR.slice(0, n), sr: this.sr });
        break;
      }
      case 'setLoop': {
        const n = Math.min(m.L.length, this.loopMax);
        this.loopL.fill(0); this.loopR.fill(0);
        this.loopL.set(m.L.subarray(0, n)); this.loopR.set(m.R.subarray(0, n));
        this.loopLen = n; this.loopHead = 0; this.loopIdx = -1;
        this.loopState = n > 0 ? 'play' : 'empty';
        this.undoL = null;
        break;
      }
    }
  }

  async loadWasm(bytes) {
    try {
      const { instance } = await WebAssembly.instantiate(bytes, {});
      const x = instance.exports;
      x._initialize();
      x.lz_init(this.sr);
      x.lz_warps_init(this.sr);
      x.lz_marbles_init(this.sr, (Math.random() * 4294967295) >>> 0);
      x.lz_elements_init(this.sr);
      x.lz_beads_init();
      const buf = x.memory.buffer;
      const mk = () => new Float32Array(128);
      this.mi = {
        x,
        in: new Float32Array(buf, x.lz_in_ptr(), 256),
        cin: new Float32Array(buf, x.lz_clouds_in_ptr(), 512),
        out: new Float32Array(buf, x.lz_out_ptr(), 512),
        car: new Float32Array(buf, x.lz_warps_carrier_ptr(), 256),
        mbEv: new Float32Array(buf, x.lz_mb_events_ptr(), 192),
        mbSv: new Float32Array(buf, x.lz_mb_scale_v_ptr(), 16),
        mbSw: new Float32Array(buf, x.lz_mb_scale_w_ptr(), 16),
        elP: new Float32Array(buf, x.lz_el_params_ptr(), 16),
        bdP: new Float32Array(buf, x.lz_bd_params_ptr(), 12),
        bdIn: new Float32Array(buf, x.lz_beads_in_ptr(), 512),
        rL: mk(), rR: mk(), pL: mk(), pR: mk(), cL: mk(), cR: mk(), wL: mk(), wR: mk(),
        eL: mk(), eR: mk(), bL: mk(), bR: mk(),
      };
      this.port.postMessage({ type: 'mi', ok: true });
    } catch (err) {
      this.port.postMessage({ type: 'mi', ok: false, error: String(err) });
    }
  }

  setChord(idx, notify) {
    this.chordIdx = idx;
    const c = this.chords[idx] || this.chords[0];
    this.chord = c;
    const rootPc = this.rootPcs[idx] ?? this.keyRoot;
    this.rootShift = ((rootPc - this.keyRoot + 18) % 12) - 6;
    this.rootPc = rootPc;
    this.mbScaleDirty = true;
    if (notify) {
      const p = this.p;
      if (p.rgPluck > 0) this.rgStrum.fill(true);
      if (p.smpMode === 2) c.forEach((nn) => this.sampleShot(nn));
      if (p.elPlay === 2) this.elementsNote(this.rootNote());
      if (p.plMode === 2) {
        const gap = Math.round(this.sr * 0.03);
        c.forEach((nn, i) => this.pushPending({ t: this.t + i * gap, n: nn + 12 * p.plOct, vel: 1, pl: true }));
      }
    }
    // intervals for grains, relative to the key root, folded into -5..+16
    const ref = Math.floor((c[0] - this.keyRoot) / 12) * 12 + this.keyRoot;
    this.intervals = c.map((n) => {
      let iv = n - ref;
      while (iv > 16) iv -= 12;
      return iv;
    });
    if (notify) this.port.postMessage({ type: 'chord', index: idx });
  }

  loopAction(a) {
    if (a === 'rec') {
      if (this.loopState === 'empty') this.loopState = 'armed';
      else if (this.loopState === 'armed') this.loopState = 'empty';
      else if (this.loopState === 'dub') this.loopState = 'play';
      else if (this.loopState === 'play') { this.snapshot(); this.loopState = 'dub'; }
    } else if (a === 'clear') {
      this.loopL.fill(0); this.loopR.fill(0);
      this.loopLen = 0; this.loopState = 'empty'; this.undoL = null;
    } else if (a === 'undo') {
      if (this.undoL) {
        this.loopL.set(this.undoL); this.loopR.set(this.undoR);
        if (this.loopState === 'dub') this.loopState = 'play';
        this.undoL = null; this.undoR = null;
      }
    }
    this.postLoopState();
  }

  snapshot() {
    const n = this.loopLen;
    this.undoL = this.loopL.slice(0, n);
    this.undoR = this.loopR.slice(0, n);
  }

  postLoopState() {
    this.port.postMessage({ type: 'loopState', state: this.loopState, canUndo: !!this.undoL, len: this.loopLen / this.sr });
  }

  flushRec(final) {
    if (this.recPos > 0 || final) {
      this.port.postMessage({ type: 'rec', L: this.recL.slice(0, this.recPos), R: this.recR.slice(0, this.recPos), final, sr: this.sr });
    }
    this.recPos = 0;
  }

  onBeat() {
    const p = this.p;
    const beatInBar = this.beat % 4;
    if (p.click) {
      this.clickEnv = 1; this.clickPh = 0;
      this.clickInc = TAU * (beatInBar === 0 ? 1600 : 1000) / this.sr;
    }
    if (beatInBar === 0) {
      const bar = this.beat / 4;
      if (bar % 2 === 0) this.echo.reroll = true;
      const per = CHORD_BARS[p.chordBars] || 1;
      if ((bar - this.barBase) % per === 0 && bar > this.barBase) {
        this.setChord((this.chordIdx + 1) % this.chords.length, true);
      }
      if (this.loopState === 'armed') {
        const spb = 60 / p.bpm * this.sr;
        this.loopLen = Math.min(this.loopMax, Math.round(spb * 4 * (LOOP_BARS[p.loopBars] || 2)));
        this.loopL.fill(0, 0, this.loopLen); this.loopR.fill(0, 0, this.loopLen);
        this.loopHead = 0; this.loopIdx = -1;
        this.undoL = null;
        this.loopState = 'dub';
        this.postLoopState();
      }
    }
    this.port.postMessage({ type: 'beat', beat: this.beat });
  }

  rootNote() {
    return 12 * (Math.round(this.p.octave) + 1) + (this.rootPc ?? this.keyRoot);
  }

  // a melodic event from the arp or Marbles: Elements plays it, Beads seeds a grain
  elementsNote(note) {
    this.elNote = note;
    this.elGateUntil = this.t + this.sr * (0.04 + this.p.elContour * 0.3);
  }

  pushPending(e) {
    const q = this.pending;
    let i = q.length;
    while (i > 0 && q[i - 1].t > e.t) i--;
    q.splice(i, 0, e);
  }

  plActive() {
    const p = this.p;
    return p.plLevel > 0.001 || (p.wpLevel > 0.001 && p.wpCarrier === 0);
  }

  // Marbles gate: channel 0 = T1, 1 = T2 (clock), 2 = T3; v = X voltage
  onMarbles(ch, v) {
    const p = this.p;
    const note = 12 * (Math.round(p.octave) + 1) + (this.rootPc ?? this.keyRoot) + Math.round(v * 12);
    if (ch === 0) {
      if (this.mi && p.plMode === 0 && this.plActive()) this.plTrig.push(note + 12 * p.plOct);
      if (p.elPlay === 1) this.elementsNote(note);
      if (p.synModel !== 1 && p.synLevel > 0.001) this.triggerNote(note + 12 * p.synOct, 0.6 + Math.random() * 0.4);
    } else if (ch === 1) {
      if (p.resMode !== 0) this.res.hit((Math.random() * this.chord.length) | 0);
      if (p.bdSeeds === 1) this.bdSeed = true;
      if (p.rgPluck === 2) this.rgStrum[(Math.random() * 4) | 0] = true;
    } else {
      if (p.smpMode === 1 && this.smpLen > 0) this.sampleShot(note);
      if (p.arpPattern === 3 && this.mi && p.plMode === 0 && this.plActive()) this.plTrig.push(note + 12 * (p.plOct + 1));
    }
  }

  triggerNote(midi, vel) {
    const p = this.p;
    const pool = p.synModel === 2 ? this.fm : this.ks;
    let v = pool.find((x) => !x.on);
    if (!v) v = pool.reduce((a, b) => (a.age > b.age ? a : b));
    v.trigger(mtof(midi), vel, p, this.sr);
  }

  onArpStep() {
    const p = this.p;
    if (p.arpSource === 1 && this.mi) return; // Marbles plays instead
    const js = p.synModel !== 1 && p.synLevel > 0.001;
    const pl = this.mi && p.plMode === 0 && this.plActive();
    const rg = this.mi && p.rgPluck === 2 && p.rgLevel > 0.001;
    const sp = p.smpMode === 1 && p.smpLevel > 0.001 && this.smpLen > 0;
    const el = this.mi && p.elPlay === 1 && p.elLevel > 0.001;
    const bd = this.mi && p.bdSeeds === 1 && p.bdLevel > 0.001;
    if (!js && !pl && !rg && !sp && !el && !bd) return;
    if (Math.random() > p.arpChance) return;
    const base = this.chord;
    const notes = base.concat(base.map((n) => n + 12));
    const vel = 0.6 + Math.random() * 0.4;
    let note;
    switch (p.arpPattern) {
      case 0: note = notes[this.arpIdx++ % notes.length]; break;
      case 1: note = notes[notes.length - 1 - (this.arpIdx++ % notes.length)]; break;
      case 2: note = notes[(Math.random() * notes.length) | 0]; break;
      case 3: {
        const gap = Math.round(this.sr * 0.018);
        base.forEach((n, i) => {
          if (js) this.pushPending({ t: this.t + i * gap, n: n + 12 * p.synOct, vel: vel * 0.8 });
          if (pl) this.pushPending({ t: this.t + i * gap, n: n + 12 * p.plOct, vel, pl: true });
        });
        if (rg) this.rgStrum.fill(true);
        return;
      }
    }
    if (js) this.triggerNote(note + 12 * p.synOct, vel);
    if (pl) this.plTrig.push(note + 12 * p.plOct);
    if (rg) this.rgStrum[(Math.random() * 4) | 0] = true;
    if (sp) this.sampleShot(note);
    if (el) this.elementsNote(note + 12 * p.elOct);
    if (bd) this.bdSeed = true;
  }

  // ── Gecho: pulsed filter modes, driven by a 16th-note clock ──
  onStep16(step) {
    const p = this.p, n = this.chord.length;
    if (p.resMode === 1) {
      // euclidean rhythm per chord tone, each with its own density and rotation
      const w = [1, 0.75, 0.5, 0.62, 0.4];
      for (let j = 0; j < n; j++) {
        const hits = Math.max(1, Math.round(p.resPulses * 16 * w[j % 5]));
        if ((((step + j * 3) * hits) % 16) < hits) this.res.hit(j);
      }
    } else if (p.resMode === 2) {
      const every = p.resPulses > 0.66 ? 1 : p.resPulses > 0.33 ? 2 : 4;
      if (step % every === 0) this.res.hit(this.resArp++ % n);
    } else if (p.resMode === 3) {
      const hits = Math.max(1, Math.round(p.resPulses * 8));
      if ((step * hits) % 16 < hits) for (let j = 0; j < n; j++) this.res.hit(j);
    }
  }

  // ── Gecho: chord sampler (a mic sample re-pitched in real time) ──
  stopSampling(root) {
    if (!this.smpRec) return;
    this.smpRec = false;
    const n = this.smpW, f = Math.min(256, n >> 2), b = this.smpBuf;
    for (let i = 0; i < f; i++) { b[i] *= i / f; b[n - 1 - i] *= i / f; }
    this.smpLen = n > this.sr * 0.05 ? n : 0;
    if (root != null) this.smpRoot = root;
    this.postSampler();
  }
  postSampler() {
    this.port.postMessage({ type: 'samplerState', rec: this.smpRec, len: this.smpLen / this.sr });
  }
  // semitones from the sample's own pitch to `note`, keeping the chord's shape
  sampleSemis(note) {
    const c0 = this.chord[0];
    const shift = ((((c0 - this.smpRoot) % 12) + 18) % 12) - 6;
    return note - c0 + shift + this.p.smpPitch + 12 * this.p.smpOct;
  }
  sampleShot(note) {
    let v = this.smpShots.find((x) => !x.on) || this.smpShots[0];
    v.on = true; v.pos = 0; v.rate = Math.pow(2, this.sampleSemis(note) / 12); v.pan = Math.random() * 1.2 - 0.6;
  }
  tickSampler(out) {
    const b = this.smpBuf, len = this.smpLen;
    let l = 0, r = 0;
    if (this.p.smpMode === 0) {
      // seamless drone: two crossfaded read heads per chord tone
      const c = this.chord, nv = Math.min(4, c.length);
      for (let v = 0; v < nv; v++) {
        let ph = this.smpPh[v] + Math.pow(2, this.sampleSemis(c[v]) / 12) / len;
        if (ph >= 1) ph -= 1;
        this.smpPh[v] = ph;
        const ph2 = ph < 0.5 ? ph + 0.5 : ph - 0.5;
        const w1 = Math.sin(Math.PI * ph) ** 2;
        const y = b[(ph * len) | 0] * w1 + b[(ph2 * len) | 0] * (1 - w1);
        if (v & 1) { r += y; l += y * 0.4; } else { l += y; r += y * 0.4; }
      }
    }
    for (const s of this.smpShots) {
      if (!s.on) continue;
      const i0 = s.pos | 0;
      if (i0 >= len - 1) { s.on = false; continue; }
      const y = b[i0] + (b[i0 + 1] - b[i0]) * (s.pos - i0);
      l += y * (0.7 - s.pan * 0.5); r += y * (0.7 + s.pan * 0.5);
      s.pos += s.rate;
    }
    out[0] = l * 0.5; out[1] = r * 0.5;
  }

  // Render Plaits, Rings and Clouds for this block from the prepared mic input.
  renderMI(n, glideC) {
    const mi = this.mi, x = mi.x, p = this.p, c = this.chord, out = mi.out;
    const copy = (L, R) => { L.set(out.subarray(0, n)); R.set(out.subarray(256, 256 + n)); };
    const target = (v, oct) => c[v % c.length] + 12 * oct + (v >= c.length ? 12 : 0);

    if (p.rgLevel > 0.001 || this.sm.rgLevel > 1e-4) {
      const parts = clamp(Math.round(p.rgVoices), 1, 4);
      x.lz_rings_set(p.rgModel, p.rgStructure, p.rgBright, p.rgDamp, p.rgPos, p.rgPluck > 0 ? 1 : 0, parts);
      for (let v = 0; v < parts; v++) {
        this.rgNote[v] += (target(v, p.rgOct) - this.rgNote[v]) * glideC;
        x.lz_rings_note(v, this.rgNote[v] + this.miOff.rings, this.rgStrum[v] ? 1 : 0);
        this.rgStrum[v] = false;
      }
      mi.in.set(this.resInBuf.subarray(0, n));
      x.lz_rings_render(n);
      copy(mi.rL, mi.rR);
    }

    if (this.plActive() || this.sm.plLevel > 1e-4) {
      let voices = clamp(Math.round(p.plVoices), 1, 4);
      if (p.plEngine === 18 || p.plEngine === 20) voices = Math.min(voices, 2); // heavy engines
      const drone = p.plMode === 1;
      x.lz_plaits_set(p.plEngine, p.plHarm, p.plTimbre, p.plMorph, p.plDecay, p.plColour, drone ? 1 : 0, voices, p.plAux);
      if (drone) {
        for (let v = 0; v < voices; v++) {
          this.plNote[v] += (target(v, p.plOct) - this.plNote[v]) * glideC;
          x.lz_plaits_note(v, this.plNote[v] + this.miOff.plaits, 0);
        }
      }
      for (const note of this.plTrig) {
        this.plVoice = (this.plVoice + 1) % voices;
        x.lz_plaits_note(this.plVoice, note + this.miOff.plaits, 1);
      }
      this.plTrig.length = 0;
      x.lz_plaits_render(n);
      copy(mi.pL, mi.pR);
    } else this.plTrig.length = 0;

    if (p.clLevel > 0.001 || this.sm.clLevel > 1e-4) {
      const cin = mi.cin, mic = this.micBuf, s = p.clSend;
      for (let i = 0; i < n; i++) {
        cin[i] = mic[i] + s * this.prevL[i];
        cin[256 + i] = mic[i] + s * this.prevR[i];
      }
      const pitch = p.clPitch + (p.clFollow ? this.rootShift : 0);
      x.lz_clouds_set(p.clPos, p.clSize, pitch, p.clDensity, p.clTexture, p.clSpread, p.clFeedback, p.clReverb,
        this.frozen ? 1 : 0, p.clMode, 0);
      x.lz_clouds_render(n);
      copy(mi.cL, mi.cR);
    }

    if (p.wpLevel > 0.001 || this.sm.wpLevel > 1e-4) {
      mi.car.set(this.carBuf.subarray(0, n));
      mi.in.set(this.micBuf.subarray(0, n));
      const shape = clamp(Math.round(p.wpCarrier), 0, 3);
      const note = 12 * (Math.round(p.octave) + 1) + (this.rootPc ?? this.keyRoot) + 12 * p.wpOct + this.miOff.warps;
      x.lz_warps_set(WARPS_ALGOS[p.wpAlgo] ?? 0.8, p.wpTimbre, p.wpCarLvl, p.wpModLvl, shape, note);
      x.lz_warps_render(n);
      copy(mi.wL, mi.wR);
      // the vocoder runs quieter than the cross-modulation algorithms
      const g = p.wpAlgo >= 6 ? 2 : 0.6;
      for (let i = 0; i < n; i++) { mi.wL[i] *= g; mi.wR[i] *= g; }
    }

    if (p.elLevel > 0.001 || this.sm.elLevel > 1e-4) {
      const e = mi.elP;
      e[0] = p.elContour; e[1] = p.elBow; e[2] = p.elBlow; e[3] = p.elStrike; e[4] = p.elBowTimbre;
      e[5] = p.elBlowMeta; e[6] = p.elBlowTimbre; e[7] = p.elStrikeMeta; e[8] = p.elStrikeTimbre;
      e[9] = p.elGeometry; e[10] = p.elBright; e[11] = p.elDamp; e[12] = p.elPos; e[13] = p.elSpace;
      e[14] = p.elMic; e[15] = p.elModel;
      x.lz_elements_apply();
      const drone = p.elPlay === 0;
      const note = drone ? this.rootNote() + 12 * p.elOct : this.elNote;
      x.lz_elements_note(note + this.miOff.elements, drone || this.elGateUntil > this.t ? 1 : 0);
      mi.in.set(this.micBuf.subarray(0, n));
      x.lz_elements_render(n);
      copy(mi.eL, mi.eR);
    }

    if (p.bdLevel > 0.001 || this.sm.bdLevel > 1e-4) {
      const bi = mi.bdIn, mic = this.micBuf, snd = p.bdSend;
      for (let i = 0; i < n; i++) {
        bi[i] = mic[i] + snd * this.prevL[i];
        bi[256 + i] = mic[i] + snd * this.prevR[i];
      }
      const b = mi.bdP;
      b[0] = p.bdTime; b[1] = p.bdSize; b[2] = p.bdShape; b[3] = p.bdPitch + (p.bdFollow ? this.rootShift : 0);
      b[4] = p.bdDensity; b[5] = p.bdRandom; b[6] = p.bdFeedback; b[7] = p.bdReverb; b[8] = p.bdMedia;
      b[9] = this.frozen ? 1 : 0; b[10] = p.bdSeeds;
      if (this.bdSeed) { x.lz_beads_seed(); this.bdSeed = false; }
      x.lz_beads_render(n);
      copy(mi.bL, mi.bR);
    }

    if (p.arpSource === 1) {
      if (this.mbScaleDirty) {
        // a Marbles scale made of the chord: root strongest, then 5th, 3rd, colours
        const root = this.rootPc ?? this.keyRoot;
        const pcs = [...new Set(c.map((nn) => (((nn - root) % 12) + 12) % 12))].sort((a, b) => a - b);
        pcs.forEach((pc, k) => {
          mi.mbSv[k] = pc / 12;
          mi.mbSw[k] = pc === 0 ? 1 : pc === 7 ? 0.8 : pc === 3 || pc === 4 ? 0.7 : 0.5;
        });
        x.lz_marbles_scale(pcs.length);
        this.mbScaleDirty = false;
      }
      x.lz_marbles_set(p.mbModel, p.mbRate, p.mbBias, p.mbJitter, p.mbDejaVu, Math.round(p.mbLength), p.mbSpread,
        p.mbXBias, p.mbSteps, p.mbRange);
      const spb = 60 / p.bpm * this.sr;
      x.lz_marbles_render(n, (this.beatPhase * 4) % 1, 4 / spb);
      const cnt = x.lz_mb_count_get();
      for (let k = 0; k < cnt; k++) {
        this.pushPending({ t: this.t + mi.mbEv[k * 3 + 1], mb: mi.mbEv[k * 3], v: mi.mbEv[k * 3 + 2] });
      }
      this.mbY = x.lz_mb_y_get() / 5;
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const oL = out[0], oR = out[1] || out[0];
    const n = oL.length;
    const inp = inputs[0] && inputs[0][0];
    const p = this.p, sr = this.sr, sm = this.sm, smK = this.smK;

    // ── per-block control ──
    const glideC = p.glide <= 1 ? 1 : 1 - Math.exp(-n / (p.glide * sr / 1000));
    const q = 5 * Math.pow(100, p.resQ);
    this.res.update(this.chord, Math.round(p.resOct), p.resBright, p.resSpread, q, glideC);
    if (p.synModel === 1) this.pad.update(this.chord.map((x) => x + 12 * (p.synOct - 1)), glideC);
    else this.pad.update([], glideC);

    this.cut *= Math.pow(p.fltCutoff / this.cut, 0.15);
    const fq = 0.6 + p.fltRes * p.fltRes * 14;
    this.fl.set(this.cut, fq, sr); this.fr.set(this.cut, fq, sr);
    const ft = p.fltType;

    const spb = 60 / p.bpm * sr;
    const beatInc = 1 / spb;
    const steps = ARP_STEPS[p.arpRate] || 2;
    const dTarget = Math.min(sr * 4, spb * (DLY_BEATS[p.dlyDiv] || 0.5));
    const dTone = 1 - Math.exp(-TAU * (600 + p.dlyTone * p.dlyTone * 12000) / sr);
    const decay = 0.3 + p.rvbSize * 0.67;
    const damping = 0.05 + p.rvbDamp * 0.8;
    const loopSpeed = LOOP_SPEED[p.loopSpeed] || 1;
    const loopFb = p.loopFb;
    const wowDepth = p.dlyWow * sr * 0.004;
    const tmp = this.tmp, tmp2 = this.tmp2;
    const ks = this.ks, fm = this.fm;

    // input: DC block, then optional slow auto-level so quiet rooms still sing
    const micBuf = this.micBuf, resInBuf = this.resInBuf;
    for (let i = 0; i < n; i++) {
      const x0 = inp ? inp[i] : 0;
      this.dcY = x0 - this.dcX + 0.995 * this.dcY; this.dcX = x0;
      if (p.agc) {
        this.agcEnv += (this.dcY * this.dcY - this.agcEnv) * this.agcK;
        const want = clamp(0.08 / Math.sqrt(this.agcEnv + 1e-9), 0.5, 40);
        this.agcGain += (want - this.agcGain) * (want < this.agcGain ? this.agcK * 4 : this.agcK * 0.5);
      } else this.agcGain += (1 - this.agcGain) * this.agcK;
      const mic = this.dcY * this.agcGain * p.inGain;
      micBuf[i] = mic;
      let ri = mic * (1 - p.noise) + (Math.random() * 2 - 1) * p.noise * 0.35;
      if (p.bbLevel > 0.001) {
        this.bbPh += p.bbRate / sr;
        while (this.bbPh >= 1) {
          this.bbPh -= 1;
          this.bbVal = ((BYTEBEATS[p.bbFormula] || BYTEBEATS[0])(this.bbT++ | 0) & 255) / 128 - 1;
        }
        ri += this.bbVal * p.bbLevel * 0.3;
      }
      resInBuf[i] = ri;
      if (this.smpRec) {
        this.smpBuf[this.smpW++] = mic;
        if (this.smpW >= this.smpBuf.length) this.stopSampling(null);
      }
    }
    this.res.excDecay = p.resMode === 0 ? 1 : Math.exp(-1 / (p.resPulseLen * sr / 1000));
    if (p.resMode === 0) this.res.exc.fill(1);
    const mi = this.mi;
    if (mi) this.renderMI(n, glideC);
    if (p.ecLevel > 0.001 || sm.ecLevel > 1e-4) this.echo.configure(p, spb);

    for (let i = 0; i < n; i++) {
      // smoothing
      sm.resLevel += (p.resLevel - sm.resLevel) * smK;
      sm.grLevel += (p.grLevel - sm.grLevel) * smK;
      sm.synLevel += (p.synLevel - sm.synLevel) * smK;
      sm.rgLevel += (p.rgLevel - sm.rgLevel) * smK;
      sm.plLevel += (p.plLevel - sm.plLevel) * smK;
      sm.clLevel += (p.clLevel - sm.clLevel) * smK;
      sm.monitor += (p.monitor - sm.monitor) * smK;
      sm.loopLevel += (p.loopLevel - sm.loopLevel) * smK;
      sm.dlyMix += (p.dlyMix - sm.dlyMix) * smK;
      sm.rvbMix += (p.rvbMix - sm.rvbMix) * smK;
      sm.master += (p.master - sm.master) * smK;
      sm.drive += (p.drive - sm.drive) * smK;

      // transport
      this.beatPhase += beatInc;
      if (this.beatPhase >= 1) { this.beatPhase -= 1; this.beat++; this.arpStep = -1; this.step16 = -1; this.onBeat(); }
      const s16 = (this.beatPhase * 4) | 0;
      if (s16 !== this.step16) { this.step16 = s16; if (p.resMode) this.onStep16((this.beat % 4) * 4 + s16); }
      const st = (this.beatPhase * steps) | 0;
      if (st !== this.arpStep) { this.arpStep = st; this.onArpStep(); }
      while (this.pending.length && this.pending[0].t <= this.t) {
        const e = this.pending.shift();
        if (e.mb != null) this.onMarbles(e.mb, e.v);
        else if (e.pl) this.plTrig.push(e.n); else this.triggerNote(e.n, e.vel);
      }

      const mic = micBuf[i];
      this.inSq += mic * mic;
      this.gran.write(mic);

      // resonator
      const resIn = resInBuf[i];
      let L = 0, R = 0;
      if (sm.resLevel > 1e-4) {
        this.res.tick(resIn, tmp);
        // tame a whistle sitting right on a chord tone
        const pk = Math.max(Math.abs(tmp[0]), Math.abs(tmp[1]));
        this.resEnv = pk > this.resEnv ? pk : this.resEnv * this.resRel;
        const rg = this.resEnv > 0.35 ? 0.35 / this.resEnv : 1;
        L += Math.tanh(tmp[0] * rg) * sm.resLevel; R += Math.tanh(tmp[1] * rg) * sm.resLevel;
      }
      // grains
      if (sm.grLevel > 1e-4) {
        this.gran.tick(p, this.intervals, tmp);
        L += tmp[0] * sm.grLevel * 1.5; R += tmp[1] * sm.grLevel * 1.5;
      }
      // synth
      let sy = 0;
      for (let k = 0; k < 8; k++) {
        if (ks[k].on) sy += ks[k].tick();
        if (fm[k].on) sy += fm[k].tick();
      }
      L += sy * 0.5 * sm.synLevel; R += sy * 0.5 * sm.synLevel;
      if (p.synModel === 1) {
        this.pad.tick(p, tmp);
        L += tmp[0] * sm.synLevel; R += tmp[1] * sm.synLevel;
      }
      L += mic * sm.monitor; R += mic * sm.monitor;
      let car = sy * 0.5;
      if (p.synModel === 1) car += (tmp[0] + tmp[1]) * 0.5;
      sm.smpLevel += (p.smpLevel - sm.smpLevel) * smK;
      if (this.smpLen > 0 && sm.smpLevel > 1e-4) {
        this.tickSampler(tmp);
        L += tmp[0] * sm.smpLevel; R += tmp[1] * sm.smpLevel;
        car += (tmp[0] + tmp[1]) * 0.5;
      }
      if (mi) car += (mi.pL[i] + mi.pR[i]) * 0.3;
      this.carBuf[i] = car;

      // Mutable Instruments
      if (mi) {
        L += mi.rL[i] * sm.rgLevel * 0.8 + mi.pL[i] * sm.plLevel * 0.6;
        R += mi.rR[i] * sm.rgLevel * 0.8 + mi.pR[i] * sm.plLevel * 0.6;
        sm.wpLevel += (p.wpLevel - sm.wpLevel) * smK;
        sm.elLevel += (p.elLevel - sm.elLevel) * smK;
        sm.bdLevel += (p.bdLevel - sm.bdLevel) * smK;
        L += mi.wL[i] * sm.wpLevel + mi.eL[i] * sm.elLevel * 0.8 + mi.bL[i] * sm.bdLevel * 4;
        R += mi.wR[i] * sm.wpLevel + mi.eR[i] * sm.elLevel * 0.8 + mi.bR[i] * sm.bdLevel * 4;
      }
      this.prevL[i] = L; this.prevR[i] = R; // send into Clouds / echoes next block
      if (mi) { L += mi.cL[i] * sm.clLevel * 3; R += mi.cR[i] * sm.clLevel * 3; }
      sm.ecLevel += (p.ecLevel - sm.ecLevel) * smK;
      if (sm.ecLevel > 1e-4) {
        const ein = mic + p.ecSend * (this.prevL[i] + this.prevR[i]) * 0.5;
        this.echo.tick(ein, p, tmp);
        L += tmp[0] * sm.ecLevel; R += tmp[1] * sm.ecLevel;
      }

      // filter
      this.fl.tick(L); this.fr.tick(R);
      if (ft === 0) { L = this.fl.lp; R = this.fr.lp; } else if (ft === 1) { L = this.fl.bp * this.fl.k * 1.5; R = this.fr.bp * this.fr.k * 1.5; } else { L = this.fl.hp; R = this.fr.hp; }
      // drive
      if (sm.drive > 0.002) {
        const g = 1 + sm.drive * 12;
        const mk = 1 / Math.sqrt(g);
        L = Math.tanh(L * g) * mk; R = Math.tanh(R * g) * mk;
      }

      // looper (records the filtered mix, plays back into the effects)
      if (this.loopLen > 0 && this.loopState !== 'empty' && this.loopState !== 'armed') {
        const len = this.loopLen;
        let h = this.loopHead;
        const h0 = h | 0, fr = h - h0, h1 = h0 + 1 >= len ? 0 : h0 + 1;
        const lL = this.loopL[h0] + (this.loopL[h1] - this.loopL[h0]) * fr;
        const lR = this.loopR[h0] + (this.loopR[h1] - this.loopR[h0]) * fr;
        if (h0 !== this.loopIdx) {
          this.loopIdx = h0;
          if (this.loopState === 'dub') {
            this.loopL[h0] = this.loopL[h0] * loopFb + L;
            this.loopR[h0] = this.loopR[h0] * loopFb + R;
          } else if (p.loopFadeAlways) {
            this.loopL[h0] *= loopFb; this.loopR[h0] *= loopFb;
          }
        }
        L += lL * sm.loopLevel; R += lR * sm.loopLevel;
        h += loopSpeed;
        if (h >= len) h -= len; else if (h < 0) h += len;
        this.loopHead = h;
      }

      // ping-pong delay
      this.dTime += (dTarget - this.dTime) * 0.0002;
      this.wow += TAU * 0.6 / sr; if (this.wow > TAU) this.wow -= TAU;
      const dt = clamp(this.dTime + Math.sin(this.wow) * wowDepth, 2, sr * 4.1);
      const rl = this.dl.readFrac(dt), rr = this.dr.readFrac(dt);
      this.dlpL += dTone * (rr - this.dlpL);
      this.dlpR += dTone * (rl - this.dlpR);
      this.dl.write((L + R) * 0.5 * sm.dlyMix + Math.tanh(this.dlpL * p.dlyFb));
      this.dr.write(Math.tanh(this.dlpR * p.dlyFb));
      L += rl; R += rr;

      // reverb
      if (sm.rvbMix > 1e-4) {
        this.plate.tick((L + R) * 0.5, decay, damping, tmp2);
        L = L * (1 - sm.rvbMix * 0.4) + tmp2[0] * sm.rvbMix;
        R = R * (1 - sm.rvbMix * 0.4) + tmp2[1] * sm.rvbMix;
      }

      // click (not recorded into the loop)
      if (this.clickEnv > 1e-3) {
        const c = Math.sin(this.clickPh) * this.clickEnv * 0.3;
        this.clickPh += this.clickInc; this.clickEnv *= 0.9985;
        L += c; R += c;
      }

      // master + limiter
      L *= sm.master; R *= sm.master;
      const pk = Math.max(Math.abs(L), Math.abs(R));
      this.limEnv = pk > this.limEnv ? pk : this.limEnv * 0.99995;
      const lg = this.limEnv > 0.9 ? 0.9 / this.limEnv : 1;
      L = Math.tanh(L * lg); R = Math.tanh(R * lg);

      oL[i] = L; if (oR !== oL) oR[i] = R;
      if (pk > this.outPk) this.outPk = pk;

      if (this.recording) {
        this.recL[this.recPos] = L; this.recR[this.recPos] = R;
        if (++this.recPos >= this.recL.length) this.flushRec(false);
      }
      this.t++;
    }

    this.meterN += n;
    if (this.meterN >= 2048) {
      let active = 0;
      for (const g of this.gran.grains) if (g.on) active++;
      this.port.postMessage({
        type: 'meter', inRms: Math.sqrt(this.inSq / this.meterN), outPeak: this.outPk,
        loopPos: this.loopLen ? this.loopHead / this.loopLen : 0, loopState: this.loopState, grains: active,
        mbY: this.mbY,
      });
      this.meterN = 0; this.inSq = 0; this.outPk = 0;
    }
    return true;
  }
}

registerProcessor('lizard-engine', LizardEngine);
