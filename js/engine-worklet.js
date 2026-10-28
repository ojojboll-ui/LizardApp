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
// The DSP is written from scratch but borrows ideas from Gechologic's Gecho
// (filter bank on mic/noise), Mutable Instruments Rings (resonator),
// Clouds (granular + Dattorro-style reverb) and Plaits (macro synth voices).

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
    this.norm = 0.1;
  }
  update(notes, octaves, bright, spread, q, glideC) {
    let i = 0;
    const n = notes.length;
    for (let o = 0; o < octaves; o++) {
      for (let j = 0; j < n && i < RES_N; j++, i++) {
        this.target[i] = mtof(notes[j] + 12 * o);
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
    for (let k = 0; k < RES_N; k++) {
      const g = this.gain[k];
      if (g < 1e-4) continue;
      const y = this.f[k].tick(x) * g;
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

// ───────────────────────── Engine ─────────────────────────
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
    };
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
    this.sm = { resLevel: 0, grLevel: 0, synLevel: 0, monitor: 0, loopLevel: 0.9, dlyMix: 0, rvbMix: 0, master: 0, drive: 0 };
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
      case 'chords':
        this.chords = m.chords;
        this.keyRoot = m.keyRoot;
        this.chordIdx %= this.chords.length;
        this.setChord(this.chordIdx, false);
        break;
      case 'freeze': this.frozen = m.on; this.gran.frozen = m.on; break;
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

  setChord(idx, notify) {
    this.chordIdx = idx;
    const c = this.chords[idx] || this.chords[0];
    this.chord = c;
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
      const per = CHORD_BARS[p.chordBars] || 1;
      if (bar % per === 0 && bar > 0) {
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

  triggerNote(midi, vel) {
    const p = this.p;
    const pool = p.synModel === 2 ? this.fm : this.ks;
    let v = pool.find((x) => !x.on);
    if (!v) v = pool.reduce((a, b) => (a.age > b.age ? a : b));
    v.trigger(mtof(midi), vel, p, this.sr);
  }

  onArpStep() {
    const p = this.p;
    if (p.synModel === 1 || p.synLevel < 0.001) return;
    if (Math.random() > p.arpChance) return;
    const base = this.chord.map((n) => n + 12 * p.synOct);
    const notes = base.concat(base.map((n) => n + 12));
    const vel = 0.6 + Math.random() * 0.4;
    switch (p.arpPattern) {
      case 0: this.triggerNote(notes[this.arpIdx++ % notes.length], vel); break;
      case 1: this.triggerNote(notes[notes.length - 1 - (this.arpIdx++ % notes.length)], vel); break;
      case 2: this.triggerNote(notes[(Math.random() * notes.length) | 0], vel); break;
      case 3: {
        const gap = Math.round(this.sr * 0.018);
        base.forEach((n, i) => this.pending.push({ t: this.t + i * gap, n, vel: vel * 0.8 }));
        break;
      }
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

    for (let i = 0; i < n; i++) {
      // smoothing
      sm.resLevel += (p.resLevel - sm.resLevel) * smK;
      sm.grLevel += (p.grLevel - sm.grLevel) * smK;
      sm.synLevel += (p.synLevel - sm.synLevel) * smK;
      sm.monitor += (p.monitor - sm.monitor) * smK;
      sm.loopLevel += (p.loopLevel - sm.loopLevel) * smK;
      sm.dlyMix += (p.dlyMix - sm.dlyMix) * smK;
      sm.rvbMix += (p.rvbMix - sm.rvbMix) * smK;
      sm.master += (p.master - sm.master) * smK;
      sm.drive += (p.drive - sm.drive) * smK;

      // transport
      this.beatPhase += beatInc;
      if (this.beatPhase >= 1) { this.beatPhase -= 1; this.beat++; this.arpStep = -1; this.onBeat(); }
      const st = (this.beatPhase * steps) | 0;
      if (st !== this.arpStep) { this.arpStep = st; this.onArpStep(); }
      while (this.pending.length && this.pending[0].t <= this.t) {
        const e = this.pending.shift();
        this.triggerNote(e.n, e.vel);
      }

      // input: DC block, then optional slow auto-level so quiet rooms still sing
      const x0 = inp ? inp[i] : 0;
      this.dcY = x0 - this.dcX + 0.995 * this.dcY; this.dcX = x0;
      if (p.agc) {
        this.agcEnv += (this.dcY * this.dcY - this.agcEnv) * this.agcK;
        const want = clamp(0.08 / Math.sqrt(this.agcEnv + 1e-9), 0.5, 40);
        this.agcGain += (want - this.agcGain) * (want < this.agcGain ? this.agcK * 4 : this.agcK * 0.5);
      } else this.agcGain += (1 - this.agcGain) * this.agcK;
      const mic = this.dcY * this.agcGain * p.inGain;
      this.inSq += mic * mic;
      this.gran.write(mic);

      // resonator
      const resIn = mic * (1 - p.noise) + (Math.random() * 2 - 1) * p.noise * 0.35;
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
      });
      this.meterN = 0; this.inSq = 0; this.outPk = 0;
    }
    return true;
  }
}

registerProcessor('lizard-engine', LizardEngine);
