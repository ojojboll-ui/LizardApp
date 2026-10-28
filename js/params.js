// Parameter definitions. One list drives the edit view, the play-view macros,
// presets, gyro targets and what gets sent to the audio engine.
//
// kind: 'range' (continuous), 'select' (index into options), 'bool'
// curve: 'lin' | 'exp' (exp needs min > 0)

export const SECTIONS = [
  { id: 'input', label: 'Ingång' },
  { id: 'chords', label: 'Ackord' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'res', label: 'Resonator (Gecho / Rings)' },
  { id: 'grain', label: 'Grains (Clouds)' },
  { id: 'synth', label: 'Synth (Plaits)' },
  { id: 'filter', label: 'Filter & drive' },
  { id: 'delay', label: 'Delay' },
  { id: 'reverb', label: 'Reverb' },
  { id: 'looper', label: 'Looper' },
  { id: 'master', label: 'Master' },
  { id: 'gyro', label: 'Gyro' },
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SCALES = {
  Dur: [0, 2, 4, 5, 7, 9, 11],
  Moll: [0, 2, 3, 5, 7, 8, 10],
  Dorisk: [0, 2, 3, 5, 7, 9, 10],
  Mixolydisk: [0, 2, 4, 5, 7, 9, 10],
  Lydisk: [0, 2, 4, 6, 7, 9, 11],
  Frygisk: [0, 1, 3, 5, 7, 8, 10],
  'Harm. moll': [0, 2, 3, 5, 7, 8, 11],
};

export const PARAMS = [
  // Input
  { id: 'agc', section: 'input', label: 'Auto-nivå (förstärk tysta rum)', kind: 'bool', def: true },
  { id: 'inGain', section: 'input', label: 'Mic-förstärkning', kind: 'range', min: 0.1, max: 8, def: 1, curve: 'exp', unit: '×' },
  { id: 'monitor', section: 'input', label: 'Torr mic (medhörning)', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'noise', section: 'input', label: 'Mic ◀▶ Brus (till resonatorn)', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'listenMem', section: 'input', label: 'Lyssnar-minne', kind: 'range', min: 2, max: 30, def: 10, unit: 's' },

  // Chords
  { id: 'keyMode', section: 'chords', label: 'Tonart', kind: 'select', options: ['Auto (lyssna)', ...NOTE_NAMES], def: 0 },
  { id: 'scale', section: 'chords', label: 'Skala', kind: 'select', options: ['Auto', ...Object.keys(SCALES)], def: 0 },
  { id: 'ambient', section: 'chords', label: 'Slump ◀▶ Omgivning', kind: 'range', min: 0, max: 1, def: 0.6 },
  { id: 'dejavu', section: 'chords', label: 'Déjà vu (lås följden)', kind: 'range', min: 0, max: 1, def: 0.7 },
  { id: 'color', section: 'chords', label: 'Ackordfärg', kind: 'select', options: ['Treklang', 'Sjuackord', 'Nior', 'Sus', 'Kvartar'], def: 1 },
  { id: 'progLen', section: 'chords', label: 'Antal ackord', kind: 'select', options: ['2', '3', '4', '6', '8'], def: 2 },
  { id: 'chordBars', section: 'chords', label: 'Takter per ackord', kind: 'select', options: ['1', '2', '4'], def: 1 },
  { id: 'octave', section: 'chords', label: 'Läge (oktav)', kind: 'range', min: 2, max: 5, def: 3, step: 1 },
  { id: 'glide', section: 'chords', label: 'Glid mellan ackord', kind: 'range', min: 0, max: 3000, def: 300, unit: 'ms' },

  // Tempo
  { id: 'bpm', section: 'tempo', label: 'BPM', kind: 'range', min: 40, max: 200, def: 84, step: 1 },
  { id: 'click', section: 'tempo', label: 'Klick', kind: 'bool', def: false },

  // Resonator
  { id: 'resLevel', section: 'res', label: 'Nivå', kind: 'range', min: 0, max: 1, def: 0.7 },
  { id: 'resQ', section: 'res', label: 'Resonans', kind: 'range', min: 0, max: 1, def: 0.65 },
  { id: 'resBright', section: 'res', label: 'Ljushet (övertoner)', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'resOct', section: 'res', label: 'Oktaver', kind: 'range', min: 1, max: 3, def: 2, step: 1 },
  { id: 'resSpread', section: 'res', label: 'Stereobredd', kind: 'range', min: 0, max: 1, def: 0.7 },

  // Grains
  { id: 'grLevel', section: 'grain', label: 'Nivå', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'grPos', section: 'grain', label: 'Position (nu ◀▶ bakåt)', kind: 'range', min: 0, max: 1, def: 0.15 },
  { id: 'grSize', section: 'grain', label: 'Kornstorlek', kind: 'range', min: 20, max: 1500, def: 220, curve: 'exp', unit: 'ms' },
  { id: 'grDensity', section: 'grain', label: 'Täthet', kind: 'range', min: 0.5, max: 60, def: 10, curve: 'exp', unit: '/s' },
  { id: 'grPitch', section: 'grain', label: 'Tonhöjd', kind: 'range', min: -24, max: 24, def: 0, step: 1, unit: 'st' },
  { id: 'grChord', section: 'grain', label: 'Följ ackordet', kind: 'range', min: 0, max: 1, def: 0.7 },
  { id: 'grJitter', section: 'grain', label: 'Spridning', kind: 'range', min: 0, max: 1, def: 0.3 },
  { id: 'grReverse', section: 'grain', label: 'Baklänges-chans', kind: 'range', min: 0, max: 1, def: 0.15 },
  { id: 'grOctave', section: 'grain', label: 'Oktavhopp-chans', kind: 'range', min: 0, max: 1, def: 0.2 },

  // Synth
  { id: 'synLevel', section: 'synth', label: 'Nivå', kind: 'range', min: 0, max: 1, def: 0.25 },
  { id: 'synModel', section: 'synth', label: 'Modell', kind: 'select', options: ['Strängar', 'Pad', 'FM-klockor'], def: 0 },
  { id: 'synTimbre', section: 'synth', label: 'Timbre', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'synMorph', section: 'synth', label: 'Morph', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'synDecay', section: 'synth', label: 'Decay', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'arpRate', section: 'synth', label: 'Arp-takt', kind: 'select', options: ['1/4', '1/8', '1/8 triol', '1/16'], def: 1 },
  { id: 'arpPattern', section: 'synth', label: 'Arp-mönster', kind: 'select', options: ['Upp', 'Ner', 'Slump', 'Strum'], def: 2 },
  { id: 'arpChance', section: 'synth', label: 'Arp-täthet', kind: 'range', min: 0, max: 1, def: 0.6 },
  { id: 'synOct', section: 'synth', label: 'Oktav', kind: 'range', min: -2, max: 2, def: 1, step: 1 },

  // Filter / drive
  { id: 'fltType', section: 'filter', label: 'Typ', kind: 'select', options: ['Lågpass', 'Bandpass', 'Högpass'], def: 0 },
  { id: 'fltCutoff', section: 'filter', label: 'Cutoff', kind: 'range', min: 40, max: 18000, def: 6000, curve: 'exp', unit: 'Hz' },
  { id: 'fltRes', section: 'filter', label: 'Resonans', kind: 'range', min: 0, max: 1, def: 0.2 },
  { id: 'drive', section: 'filter', label: 'Drive', kind: 'range', min: 0, max: 1, def: 0.1 },

  // Delay
  { id: 'dlyMix', section: 'delay', label: 'Mix', kind: 'range', min: 0, max: 1, def: 0.25 },
  { id: 'dlyDiv', section: 'delay', label: 'Tid', kind: 'select', options: ['1/16', '1/8', '3/16', '1/4', '3/8', '1/2'], def: 2 },
  { id: 'dlyFb', section: 'delay', label: 'Återkoppling', kind: 'range', min: 0, max: 0.95, def: 0.45 },
  { id: 'dlyTone', section: 'delay', label: 'Ton', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'dlyWow', section: 'delay', label: 'Wow (tape)', kind: 'range', min: 0, max: 1, def: 0.15 },

  // Reverb
  { id: 'rvbMix', section: 'reverb', label: 'Mix', kind: 'range', min: 0, max: 1, def: 0.4 },
  { id: 'rvbSize', section: 'reverb', label: 'Storlek', kind: 'range', min: 0, max: 1, def: 0.75 },
  { id: 'rvbDamp', section: 'reverb', label: 'Dämpning', kind: 'range', min: 0, max: 1, def: 0.35 },

  // Looper
  { id: 'loopBars', section: 'looper', label: 'Längd (takter)', kind: 'select', options: ['1', '2', '4', '8'], def: 2 },
  { id: 'loopFb', section: 'looper', label: 'Minne (1 = oändligt)', kind: 'range', min: 0.5, max: 1, def: 0.93 },
  { id: 'loopLevel', section: 'looper', label: 'Nivå', kind: 'range', min: 0, max: 1, def: 0.9 },
  { id: 'loopFadeAlways', section: 'looper', label: 'Blekna även vid uppspelning', kind: 'bool', def: false },
  { id: 'loopSpeed', section: 'looper', label: 'Fart', kind: 'select', options: ['Normal', 'Halv', 'Baklänges', 'Halv baklänges'], def: 0 },

  // Master
  { id: 'master', section: 'master', label: 'Volym', kind: 'range', min: 0, max: 1, def: 0.8 },

  // Gyro (handled on the main thread, never sent to the engine)
  { id: 'gyroOn', section: 'gyro', label: 'Gyro på', kind: 'bool', def: false, local: true },
  { id: 'gyroA', section: 'gyro', label: 'Framåt/bakåt styr', kind: 'select', options: [], def: 0, local: true, targets: true },
  { id: 'gyroAAmt', section: 'gyro', label: 'Mängd fram/bak', kind: 'range', min: -1, max: 1, def: 0.6, local: true },
  { id: 'gyroB', section: 'gyro', label: 'Sida till sida styr', kind: 'select', options: [], def: 0, local: true, targets: true },
  { id: 'gyroBAmt', section: 'gyro', label: 'Mängd sida', kind: 'range', min: -1, max: 1, def: 0.6, local: true },
  { id: 'gyroRange', section: 'gyro', label: 'Lutningsomfång', kind: 'range', min: 10, max: 90, def: 40, unit: '°', local: true },
  { id: 'shakeNew', section: 'gyro', label: 'Skaka = ny ackordföljd', kind: 'bool', def: true, local: true },
  { id: 'faceFreeze', section: 'gyro', label: 'Skärmen nedåt = frys', kind: 'bool', def: true, local: true },
];

export const PARAM_BY_ID = Object.fromEntries(PARAMS.map((p) => [p.id, p]));

// Continuous parameters that the gyro can push around.
export const GYRO_TARGETS = ['none', 'fltCutoff', 'grPos', 'grPitch', 'grSize', 'grDensity', 'rvbMix', 'rvbSize',
  'dlyMix', 'dlyFb', 'resQ', 'resBright', 'drive', 'synTimbre', 'synMorph', 'noise', 'ambient'];
const targetLabel = (id) => {
  if (id === 'none') return 'Inget';
  const p = PARAM_BY_ID[id];
  const sec = SECTIONS.find((s) => s.id === p.section).label.split(' ')[0];
  return `${sec}: ${p.label}`;
};
for (const p of PARAMS) if (p.targets) p.options = GYRO_TARGETS.map(targetLabel);
PARAM_BY_ID.gyroA.def = GYRO_TARGETS.indexOf('fltCutoff');
PARAM_BY_ID.gyroB.def = GYRO_TARGETS.indexOf('rvbMix');

export function defaults() {
  return Object.fromEntries(PARAMS.map((p) => [p.id, p.def]));
}

// Normalised 0..1 <-> native value
export function toNorm(p, v) {
  if (p.kind !== 'range') return v;
  if (p.curve === 'exp') return Math.log(v / p.min) / Math.log(p.max / p.min);
  return (v - p.min) / (p.max - p.min);
}
export function fromNorm(p, n) {
  n = Math.min(1, Math.max(0, n));
  let v = p.curve === 'exp' ? p.min * Math.pow(p.max / p.min, n) : p.min + n * (p.max - p.min);
  if (p.step) v = Math.round(v / p.step) * p.step;
  return v;
}

export function formatValue(p, v) {
  if (p.kind === 'bool') return v ? 'På' : 'Av';
  if (p.kind === 'select') return p.options[v] ?? '';
  const unit = p.unit ? ' ' + p.unit : '';
  if (p.step >= 1) return Math.round(v) + unit;
  if (Math.abs(v) >= 100) return Math.round(v) + unit;
  if (Math.abs(v) >= 10) return v.toFixed(1) + unit;
  return v.toFixed(2) + unit;
}

export const PRESETS = {
  'Gecho-kör': {
    resLevel: 0.85, resQ: 0.75, resBright: 0.55, resOct: 3, grLevel: 0.25, synLevel: 0.1, synModel: 1,
    rvbMix: 0.5, rvbSize: 0.85, dlyMix: 0.2, color: 1, ambient: 0.7, noise: 0,
  },
  'Brusackord': {
    resLevel: 0.9, resQ: 0.85, noise: 1, grLevel: 0, synLevel: 0.15, synModel: 0, rvbMix: 0.45, dlyMix: 0.3,
    ambient: 0.2, dejavu: 0.5, color: 2,
  },
  'Molnkorn': {
    resLevel: 0.2, grLevel: 0.9, grSize: 400, grDensity: 18, grChord: 0.9, grJitter: 0.6, grReverse: 0.3,
    grOctave: 0.35, synLevel: 0, rvbMix: 0.55, rvbSize: 0.9, dlyMix: 0.25,
  },
  'Spöksträngar': {
    resLevel: 0.5, resQ: 0.6, grLevel: 0.3, synLevel: 0.45, synModel: 0, synDecay: 0.7, arpPattern: 2,
    arpRate: 3, arpChance: 0.5, dlyMix: 0.35, dlyDiv: 2, rvbMix: 0.45,
  },
  'Klockskog': {
    resLevel: 0.35, grLevel: 0.35, synLevel: 0.4, synModel: 2, synTimbre: 0.4, synMorph: 0.6, synDecay: 0.6,
    arpRate: 1, arpPattern: 2, arpChance: 0.45, rvbMix: 0.6, rvbSize: 0.9, color: 2,
  },
};
