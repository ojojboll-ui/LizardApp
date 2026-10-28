// "Magic songs", after Gecho's idea of growing whole arrangements from a
// random signal: one number (taken from the mic noise floor) seeds every
// choice — tempo, key, sound palette, chord sections and the arrangement —
// so the same number always gives the same song.

import { NOTE_NAMES } from './chords.js';
import { SCALES } from './params.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A 6-digit seed from whatever the mic hears right now (or crypto noise).
export function seedFromSignal(analyser) {
  let h = 2166136261 >>> 0;
  if (analyser) {
    const d = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(d);
    for (let i = 0; i < d.length; i++) {
      h ^= Math.floor(Math.abs(d[i]) * 1e9) & 0xffff;
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  const r = new Uint32Array(1);
  crypto.getRandomValues(r);
  return ((h ^ r[0]) >>> 0) % 1000000;
}

const SCALE_NAMES = Object.keys(SCALES);
const MELODIC_ENGINES = [0, 1, 2, 3, 5, 6, 8, 9, 10, 11, 12, 13, 19, 20];

// Song templates: part names reference chord sections A/B/C.
const FORMS = [
  ['Intro:A', 'A', 'B', 'A', 'B', 'Outro:A'],
  ['Intro:A', 'A', 'A', 'B', 'C', 'B', 'Outro:A'],
  ['Intro:B', 'A', 'B', 'C', 'A', 'Outro:C'],
  ['A', 'B', 'A', 'C', 'C', 'B', 'Outro:A'],
];

const LAYERS = ['rgLevel', 'clLevel', 'plLevel', 'resLevel', 'grLevel'];

export function makeSong(seed, brain) {
  const rng = mulberry32(seed * 2654435761);
  const pick = (a) => a[(rng() * a.length) | 0];
  const between = (a, b) => a + rng() * (b - a);

  const key = (rng() * 12) | 0;
  const scaleName = pick(['Dur', 'Dur', 'Moll', 'Moll', 'Dorisk', 'Mixolydisk', 'Lydisk', 'Frygisk', 'Harm. moll']);
  const bpm = Math.round(between(60, 126));

  // Sound palette for the whole song
  const global = {
    bpm,
    keyMode: key + 1,
    scale: SCALE_NAMES.indexOf(scaleName) + 1,
    color: pick([0, 1, 1, 2, 2, 3, 4]),
    octave: pick([2, 3, 3, 4]),
    plEngine: pick(MELODIC_ENGINES),
    plHarm: between(0.2, 0.8), plTimbre: between(0.2, 0.8), plMorph: between(0.2, 0.8),
    plDecay: between(0.3, 0.8), plOct: pick([0, 1, 1]),
    rgModel: pick([0, 0, 1, 2, 3, 4]),
    rgStructure: between(0.2, 0.7), rgBright: between(0.3, 0.7), rgDamp: between(0.5, 0.85),
    clMode: pick([0, 0, 0, 2, 3]), clSize: between(0.3, 0.8), clTexture: between(0.3, 0.8),
    resQ: between(0.5, 0.85),
    arpRate: pick([1, 1, 2, 3]), arpPattern: pick([0, 1, 2, 2, 3]),
    dlyDiv: pick([1, 2, 3, 4]), dlyFb: between(0.3, 0.6), rvbSize: between(0.6, 0.92),
    bbFormula: (rng() * 6) | 0,
    dejavu: 1,
  };

  // Chord sections, generated deterministically from the same stream
  const p = { keyMode: global.keyMode, scale: global.scale, color: global.color, octave: global.octave, ambient: 0, dejavu: 1 };
  const sections = {};
  const old = brain.rand;
  brain.rand = rng;
  for (const name of ['A', 'B', 'C']) {
    const len = pick([2, 4, 4, 4, 3]);
    const prog = brain.generate(p, null, len).map((c) => ({ ...c, midis: [...c.midis] }));
    sections[name] = { prog, chordBars: pick([1, 1, 2]) };
  }
  brain.rand = old;
  const ctx = brain.context(p, null);

  // Arrangement
  const form = pick(FORMS);
  const parts = form.map((tag, i) => {
    const [label, secName] = tag.includes(':') ? tag.split(':') : [tag, tag];
    const sec = sections[secName];
    const cycleBars = sec.prog.length * sec.chordBars;
    const sparse = label === 'Intro' || label === 'Outro';
    const bars = cycleBars * (sparse ? 1 : pick([1, 2, 2]));
    // choose which layers play in this part
    const levels = {};
    const count = sparse ? 1 + (rng() < 0.4 ? 1 : 0) : 2 + ((rng() * 3) | 0);
    const order = [...LAYERS];
    for (let k = order.length - 1; k > 0; k--) { // Fisher-Yates: same result in every browser
      const j = (rng() * (k + 1)) | 0;
      [order[k], order[j]] = [order[j], order[k]];
    }
    LAYERS.forEach((l) => { levels[l] = 0; });
    order.slice(0, count).forEach((l) => { levels[l] = between(0.35, 0.8); });
    return {
      name: label === secName ? `Del ${secName}` : label,
      section: secName,
      bars,
      chordBars: sec.chordBars,
      prog: sec.prog,
      params: {
        ...levels,
        chordBars: [1, 2, 4].indexOf(sec.chordBars),
        resMode: sparse ? 0 : pick([0, 1, 2, 3]),
        resPulses: between(0.3, 0.8),
        plMode: pick([0, 0, 1, 2]),
        arpChance: between(0.3, 0.8),
        fltCutoff: sparse ? between(1200, 4000) : between(3000, 14000),
        rvbMix: between(0.3, 0.6),
        dlyMix: between(0.1, 0.4),
        bbLevel: rng() < 0.25 ? between(0.2, 0.6) : 0,
      },
      index: i,
    };
  });

  return {
    seed, bpm, global, parts, ctx,
    title: `Låt #${String(seed).padStart(6, '0')} · ${NOTE_NAMES[key]} ${scaleName.toLowerCase()} · ${bpm} bpm`,
  };
}
