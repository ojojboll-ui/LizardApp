// The chord brain: listens to the room (chroma + key detection) and grows
// chord progressions from a blend of music-theory randomness and what it hears.

import { SCALES } from './params.js';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Krumhansl-Schmuckler key profiles
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function corr(a, b, rot) {
  let ma = 0, mb = 0;
  for (let i = 0; i < 12; i++) { ma += a[i]; mb += b[i]; }
  ma /= 12; mb /= 12;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) {
    const x = a[(i + rot) % 12] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export class Listener {
  constructor(analyser) {
    this.an = analyser;
    this.data = new Float32Array(analyser.frequencyBinCount);
    this.chroma = new Float64Array(12);
    this.frame = new Float64Array(12);
    this.key = { root: 0, minor: false, conf: 0 };
    this.cand = null; this.candTime = 0;
    this.heard = 0; // how much material we have, 0..1
  }

  update(dt, memSec) {
    const d = this.data, fr = this.frame;
    this.an.getFloatFrequencyData(d);
    const binHz = this.an.context.sampleRate / this.an.fftSize;
    fr.fill(0);
    let energy = 0;
    const lo = Math.max(2, Math.floor(60 / binHz));
    const hi = Math.min(d.length - 2, Math.ceil(2200 / binHz));
    for (let k = lo; k <= hi; k++) {
      const b = d[k];
      if (b < -90 || b < d[k - 1] || b < d[k + 1]) continue;
      const a = d[k - 1], c = d[k + 1];
      const den = a - 2 * b + c;
      const off = den ? 0.5 * (a - c) / den : 0;
      const f = (k + off) * binHz;
      const midi = 69 + 12 * Math.log2(f / 440);
      const near = Math.round(midi);
      const w = Math.pow(10, b / 20) * (1 - Math.abs(midi - near));
      fr[((near % 12) + 12) % 12] += w;
      energy += w;
    }
    if (energy > 0) {
      // quiet frames barely move the memory
      const loud = Math.min(1, energy / 0.02);
      const coef = (1 - Math.exp(-dt / memSec)) * loud;
      for (let i = 0; i < 12; i++) this.chroma[i] += (fr[i] / energy - this.chroma[i]) * coef;
      this.heard = Math.min(1, this.heard + coef * 0.5);
    }
    this.estimateKey(dt);
  }

  estimateKey(dt) {
    const ch = this.chroma;
    let best = null;
    for (let r = 0; r < 12; r++) {
      const cM = corr(ch, MAJOR, r), cm = corr(ch, MINOR, r);
      if (!best || cM > best.c) best = { root: r, minor: false, c: cM };
      if (cm > best.c) best = { root: r, minor: true, c: cm };
    }
    if (!best || this.heard < 0.05) return;
    const k = this.key;
    if (best.root === k.root && best.minor === k.minor) { k.conf = best.c; this.cand = null; return; }
    if (!this.cand || this.cand.root !== best.root || this.cand.minor !== best.minor) { this.cand = best; this.candTime = 0; }
    this.candTime += dt;
    if (this.candTime > 2.5 || k.conf < 0.1) { this.key = { root: best.root, minor: best.minor, conf: best.c }; this.cand = null; }
  }
}

// Transition weights between scale degrees I..vii (rows: from, cols: to)
const MARKOV = [
  [0.0, 0.15, 0.08, 0.25, 0.25, 0.22, 0.05],
  [0.1, 0.0, 0.05, 0.15, 0.5, 0.1, 0.1],
  [0.1, 0.1, 0.0, 0.25, 0.1, 0.4, 0.05],
  [0.3, 0.15, 0.05, 0.0, 0.3, 0.12, 0.08],
  [0.5, 0.05, 0.08, 0.15, 0.0, 0.2, 0.02],
  [0.1, 0.25, 0.08, 0.3, 0.2, 0.0, 0.07],
  [0.6, 0.05, 0.15, 0.05, 0.05, 0.1, 0.0],
];
const START = [0.45, 0.08, 0.05, 0.15, 0.1, 0.15, 0.02];

const STACKS = [
  [0, 2, 4], // triad
  [0, 2, 4, 6], // seventh
  [0, 2, 4, 6, 8], // ninth
  null, // sus: chosen per chord
  [0, 3, 6, 9], // quartal
];

function degreeOffset(scale, d) {
  return scale[d % 7] + 12 * Math.floor(d / 7);
}

export function chordName(rootPc, offsets) {
  const s = new Set(offsets.map((o) => ((o - offsets[0]) % 12 + 12) % 12));
  const h = (x) => s.has(x);
  let q;
  if (h(4) && h(7)) q = '';
  else if (h(3) && h(7)) q = 'm';
  else if (h(3) && h(6)) q = 'dim';
  else if (h(4) && h(8)) q = 'aug';
  else if (h(5) && h(7)) q = 'sus4';
  else if (h(2) && h(7)) q = 'sus2';
  else if (h(5) && h(10)) q = 'sus4';
  else q = h(3) ? 'm' : '';
  let name = NOTE_NAMES[rootPc] + q;
  const nine = h(2) && q !== 'sus2';
  if (h(10)) {
    if (q === 'dim') name = NOTE_NAMES[rootPc] + 'm7♭5';
    else if (q === 'sus4') name = NOTE_NAMES[rootPc] + (nine ? '9sus4' : '7sus4');
    else name += nine ? '9' : '7';
  } else if (h(11)) {
    name = NOTE_NAMES[rootPc] + (q === 'm' ? 'm' : '') + (nine ? 'maj9' : 'maj7');
  } else if (nine) name += 'add9';
  return name;
}

export class ChordBrain {
  constructor() { this.prog = []; this.ctx = null; this.rand = Math.random; }

  context(p, listener) {
    const det = listener ? listener.key : { root: 0, minor: false };
    const root = p.keyMode === 0 ? det.root : p.keyMode - 1;
    const names = Object.keys(SCALES);
    let scaleName;
    if (p.scale === 0) scaleName = (p.keyMode === 0 ? det.minor : false) ? 'Moll' : 'Dur';
    else scaleName = names[p.scale - 1];
    return { root, scaleName, scale: SCALES[scaleName], auto: p.keyMode === 0 };
  }

  offsets(deg, ctx, color) {
    let stack = STACKS[color];
    if (!stack) stack = this.rand() < 0.6 ? [0, 3, 4] : [0, 1, 4];
    const base = degreeOffset(ctx.scale, deg);
    return stack.map((s) => degreeOffset(ctx.scale, deg + s) - base);
  }

  fit(deg, ctx, color, chroma) {
    const base = ctx.root + degreeOffset(ctx.scale, deg);
    const offs = this.offsets(deg, ctx, color === 3 ? 0 : color);
    let s = 0;
    for (const o of offs) s += chroma[(base + o) % 12];
    // the root counts double: it's what the ear locks on to
    s += chroma[base % 12];
    return s / (offs.length + 1);
  }

  pickDegree(prev, p, ctx, listener, next = null) {
    const a = p.ambient * (listener ? listener.heard : 0);
    const row = prev == null ? START : MARKOV[prev];
    const fits = [];
    for (let d = 0; d < 7; d++) fits.push(listener ? this.fit(d, ctx, p.color, listener.chroma) : 0);
    const mn = Math.min(...fits), mx = Math.max(...fits);
    const w = [];
    let sum = 0;
    for (let d = 0; d < 7; d++) {
      const f = mx > mn ? (fits[d] - mn) / (mx - mn) : 1 / 7;
      let x = (1 - a) * row[d] + a * f * f * 0.5 + 0.01;
      if (d === prev || d === next) x *= 0.1;
      w.push(x); sum += x;
    }
    let r = this.rand() * sum;
    for (let d = 0; d < 7; d++) { r -= w[d]; if (r <= 0) return d; }
    return 0;
  }

  voice(offs, deg, ctx, octave, prev) {
    const base = 12 * (octave + 1) + ctx.root + degreeOffset(ctx.scale, deg) % 12;
    const root = offs.map((o) => base + o);
    if (!prev) return root;
    let best = root, bestCost = Infinity;
    const n = root.length;
    for (let inv = 0; inv < n; inv++) {
      for (const shift of [-12, 0]) {
        const cand = root.map((m, i) => m + (i < inv ? 12 : 0) + shift).sort((x, y) => x - y);
        const low = cand[0];
        const center = 12 * (octave + 1) + ctx.root;
        if (low < center - 6 || low > center + 14) continue;
        let cost = 0;
        for (const m of cand) cost += Math.min(...prev.map((q) => Math.abs(q - m)));
        if (cost < bestCost) { bestCost = cost; best = cand; }
      }
    }
    return best;
  }

  makeChord(deg, p, ctx, prevMidis) {
    const offs = this.offsets(deg, ctx, p.color);
    const midis = this.voice(offs, deg, ctx, Math.round(p.octave), prevMidis);
    const rootPc = (ctx.root + degreeOffset(ctx.scale, deg)) % 12;
    return { deg, midis, name: chordName(rootPc, offs), rootPc };
  }

  generate(p, listener, len) {
    this.ctx = this.context(p, listener);
    const prog = [];
    let prev = null;
    for (let i = 0; i < len; i++) {
      const deg = this.pickDegree(prev ? prev.deg : null, p, this.ctx, listener);
      const c = this.makeChord(deg, p, this.ctx, prev ? prev.midis : null);
      prog.push(c);
      prev = c;
    }
    this.prog = prog;
    return prog;
  }

  // Marbles-style déjà vu: the chord that just finished is rewritten with
  // probability (1 - dejavu), so the progression slowly mutates.
  mutate(index, p, listener) {
    if (!this.prog.length || this.rand() < p.dejavu) return false;
    this.ctx = this.context(p, listener);
    const n = this.prog.length;
    const prev = this.prog[(index - 1 + n) % n];
    const next = this.prog[(index + 1) % n];
    const deg = this.pickDegree(prev.deg, p, this.ctx, listener, n > 2 ? next.deg : null);
    this.prog[index] = this.makeChord(deg, p, this.ctx, prev.midis);
    return true;
  }
}
