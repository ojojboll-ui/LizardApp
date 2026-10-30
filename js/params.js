// Parameter definitions. One list drives the edit view, the play-view macros,
// presets, gyro targets and what gets sent to the audio engine.
//
// kind: 'range' (continuous), 'select' (index into options), 'bool'
// curve: 'lin' | 'exp' (exp needs min > 0)

export const SECTIONS = [
  { id: 'input', label: 'Input' },
  { id: 'chords', label: 'Chords' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'rings', label: 'Rings (Mutable Instruments)' },
  { id: 'clouds', label: 'Clouds (Mutable Instruments)' },
  { id: 'plaits', label: 'Plaits (Mutable Instruments)' },
  { id: 'elements', label: 'Elements (Mutable Instruments)' },
  { id: 'beads', label: 'Beads (Mutable Instruments)' },
  { id: 'warps', label: 'Warps (Mutable Instruments)' },
  { id: 'marbles', label: 'Marbles (Mutable Instruments)' },
  { id: 'echo', label: 'Echo chamber' },
  { id: 'song', label: 'Magic song (Gecho)' },
  { id: 'res', label: 'Gecho resonator & filter modes' },
  { id: 'sampler', label: 'Chord sampler (Gecho)' },
  { id: 'grain', label: 'Chord grains (Lizard)' },
  { id: 'synth', label: 'Synth (Lizard)' },
  { id: 'filter', label: 'Filter & drive' },
  { id: 'delay', label: 'Delay' },
  { id: 'reverb', label: 'Reverb' },
  { id: 'looper', label: 'Looper' },
  { id: 'master', label: 'Master' },
  { id: 'gyro', label: 'Gyro' },
  { id: 'xy', label: 'Touch pad' },
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SCALES = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  'Harmonic minor': [0, 2, 3, 5, 7, 8, 11],
};
export const MINOR_SCALES = ['Minor', 'Dorian', 'Phrygian', 'Harmonic minor'];

export const PLAITS_ENGINES = [
  'VA + filter', 'Phase distortion', '6-op FM I', '6-op FM II', '6-op FM III', 'Wave terrain', 'String machine',
  'Chiptune', 'Virtual analog', 'Waveshaping', 'FM', 'Grain formant', 'Additive', 'Wavetable', 'Chords',
  'Speech', 'Swarm', 'Filtered noise', 'Particles', 'String', 'Modal', 'Bass drum', 'Snare', 'Hi-hat',
];

export const WARPS_ALGOS = ['Crossfade', 'Wavefolder', 'Analog ring mod', 'Digital ring mod', 'XOR', 'Comparator',
  'Vocoder', 'Vocoder (long release)'];
export const ECHO_MODES = ['Rhythmic echoes', 'Room → cathedral', 'Shimmer (pitch)', 'Reverse', 'Random'];

export const RES_MODES = ['Classic', 'Rhythmic (euclidean)', 'Arpeggio', 'Pulse'];

export const PARAMS = [
  // Input
  { id: 'headphones', section: 'input', label: 'Headphones (off = phone speaker with echo cancellation)', kind: 'bool', def: false, local: true },
  { id: 'fbGuard', section: 'input', label: 'Feedback guard (ducks the mic when it gets loud)', kind: 'bool', def: true },
  { id: 'agc', section: 'input', label: 'Auto level (lifts quiet rooms)', kind: 'bool', def: true },
  { id: 'inGain', section: 'input', label: 'Mic gain', kind: 'range', min: 0.1, max: 8, def: 1, curve: 'exp', unit: '×' },
  { id: 'inTone', section: 'input', label: 'Mic high cut', kind: 'range', min: 1500, max: 16000, def: 6500, curve: 'exp', unit: 'Hz' },
  { id: 'monitor', section: 'input', label: 'Dry mic (monitor)', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'noise', section: 'input', label: 'Mic ◀▶ Noise (into the resonators)', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'listenMem', section: 'input', label: 'Listening memory', kind: 'range', min: 2, max: 30, def: 10, unit: 's' },

  // Chords
  { id: 'keyMode', section: 'chords', label: 'Key', kind: 'select', options: ['Auto (listen)', ...NOTE_NAMES], def: 0 },
  { id: 'scale', section: 'chords', label: 'Scale', kind: 'select', options: ['Auto', ...Object.keys(SCALES)], def: 0 },
  { id: 'ambient', section: 'chords', label: 'Random ◀▶ Room', kind: 'range', min: 0, max: 1, def: 0.6 },
  { id: 'dejavu', section: 'chords', label: 'Déjà vu (lock the progression)', kind: 'range', min: 0, max: 1, def: 0.7 },
  { id: 'color', section: 'chords', label: 'Chord colour', kind: 'select', options: ['Triads', 'Sevenths', 'Ninths', 'Sus', 'Fourths'], def: 1 },
  { id: 'progLen', section: 'chords', label: 'Number of chords', kind: 'select', options: ['2', '3', '4', '6', '8'], def: 2 },
  { id: 'chordBars', section: 'chords', label: 'Bars per chord', kind: 'select', options: ['1', '2', '4'], def: 1 },
  { id: 'octave', section: 'chords', label: 'Register (octave)', kind: 'range', min: 2, max: 5, def: 3, step: 1 },
  { id: 'glide', section: 'chords', label: 'Glide between chords', kind: 'range', min: 0, max: 3000, def: 300, unit: 'ms' },

  // Tempo
  { id: 'bpm', section: 'tempo', label: 'BPM', kind: 'range', min: 40, max: 200, def: 84, step: 1 },
  { id: 'click', section: 'tempo', label: 'Click', kind: 'bool', def: false },

  // Rings
  { id: 'rgLevel', section: 'rings', label: 'Level', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'rgModel', section: 'rings', label: 'Model', kind: 'select', options: ['Modal', 'Sympathetic strings', 'String (inharmonic)', 'FM voice', 'Sympathetic, quantized', 'String + reverb'], def: 0 },
  { id: 'rgStructure', section: 'rings', label: 'Structure', kind: 'range', min: 0, max: 1, def: 0.4 },
  { id: 'rgBright', section: 'rings', label: 'Brightness', kind: 'range', min: 0, max: 1, def: 0.4 },
  { id: 'rgDamp', section: 'rings', label: 'Damping', kind: 'range', min: 0, max: 1, def: 0.65 },
  { id: 'rgPos', section: 'rings', label: 'Position', kind: 'range', min: 0, max: 1, def: 0.3 },
  { id: 'rgPluck', section: 'rings', label: 'Excitation', kind: 'select', options: ['Mic only', 'Pluck on chord change', 'Pluck with the arp'], def: 0 },
  { id: 'rgVoices', section: 'rings', label: 'Resonators (chord tones)', kind: 'range', min: 1, max: 4, def: 4, step: 1 },
  { id: 'rgOct', section: 'rings', label: 'Octave', kind: 'range', min: -2, max: 2, def: 0, step: 1 },

  // Clouds
  { id: 'clLevel', section: 'clouds', label: 'Level', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'clMode', section: 'clouds', label: 'Mode', kind: 'select', options: ['Granular', 'Stretch (WSOLA)', 'Looping delay', 'Spectral'], def: 0 },
  { id: 'clPos', section: 'clouds', label: 'Position', kind: 'range', min: 0, max: 1, def: 0.4 },
  { id: 'clSize', section: 'clouds', label: 'Size', kind: 'range', min: 0, max: 1, def: 0.55 },
  { id: 'clPitch', section: 'clouds', label: 'Pitch', kind: 'range', min: -24, max: 24, def: 0, step: 1, unit: 'st' },
  { id: 'clFollow', section: 'clouds', label: 'Pitch follows the chord root', kind: 'bool', def: true },
  { id: 'clDensity', section: 'clouds', label: 'Density', kind: 'range', min: 0, max: 1, def: 0.68 },
  { id: 'clTexture', section: 'clouds', label: 'Texture', kind: 'range', min: 0, max: 1, def: 0.55 },
  { id: 'clSpread', section: 'clouds', label: 'Stereo spread', kind: 'range', min: 0, max: 1, def: 0.6 },
  { id: 'clFeedback', section: 'clouds', label: 'Feedback', kind: 'range', min: 0, max: 1, def: 0.2 },
  { id: 'clReverb', section: 'clouds', label: 'Reverb', kind: 'range', min: 0, max: 1, def: 0.35 },
  { id: 'clSend', section: 'clouds', label: 'Send synths/resonators in', kind: 'range', min: 0, max: 1, def: 0 },

  // Plaits
  { id: 'plLevel', section: 'plaits', label: 'Level', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'plEngine', section: 'plaits', label: 'Engine', kind: 'select', options: PLAITS_ENGINES, def: 19 },
  { id: 'plMode', section: 'plaits', label: 'Play mode', kind: 'select', options: ['Arp (follows the arp)', 'Chord drone', 'Strum on chord change'], def: 0 },
  { id: 'plHarm', section: 'plaits', label: 'Harmonics', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'plTimbre', section: 'plaits', label: 'Timbre', kind: 'range', min: 0, max: 1, def: 0.4 },
  { id: 'plMorph', section: 'plaits', label: 'Morph', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'plDecay', section: 'plaits', label: 'Decay (LPG)', kind: 'range', min: 0, max: 1, def: 0.55 },
  { id: 'plColour', section: 'plaits', label: 'LPG colour', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'plAux', section: 'plaits', label: 'Main ◀▶ Aux output', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'plVoices', section: 'plaits', label: 'Voices', kind: 'range', min: 1, max: 4, def: 3, step: 1 },
  { id: 'plOct', section: 'plaits', label: 'Octave', kind: 'range', min: -2, max: 2, def: 0, step: 1 },

  // Elements
  { id: 'elLevel', section: 'elements', label: 'Level', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'elModel', section: 'elements', label: 'Resonator', kind: 'select', options: ['Modal', 'String', 'Strings (chord)', 'Ominous (easter egg)'], def: 0 },
  { id: 'elPlay', section: 'elements', label: 'Play mode', kind: 'select', options: ['Drone on the root', 'Follow the arp / Marbles', 'On chord change'], def: 0 },
  { id: 'elMic', section: 'elements', label: 'Mic into the exciter', kind: 'range', min: 0, max: 1, def: 0.3 },
  { id: 'elContour', section: 'elements', label: 'Contour (envelope)', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'elBow', section: 'elements', label: 'Bow', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'elBowTimbre', section: 'elements', label: 'Bow timbre', kind: 'range', min: 0, max: 1, def: 0.4 },
  { id: 'elBlow', section: 'elements', label: 'Blow', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'elBlowMeta', section: 'elements', label: 'Blow flow', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'elBlowTimbre', section: 'elements', label: 'Blow timbre', kind: 'range', min: 0, max: 1, def: 0.4 },
  { id: 'elStrike', section: 'elements', label: 'Strike', kind: 'range', min: 0, max: 1, def: 0.8 },
  { id: 'elStrikeMeta', section: 'elements', label: 'Strike mallet', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'elStrikeTimbre', section: 'elements', label: 'Strike timbre', kind: 'range', min: 0, max: 1, def: 0.4 },
  { id: 'elGeometry', section: 'elements', label: 'Geometry', kind: 'range', min: 0, max: 1, def: 0.2 },
  { id: 'elBright', section: 'elements', label: 'Brightness', kind: 'range', min: 0, max: 1, def: 0.4 },
  { id: 'elDamp', section: 'elements', label: 'Damping', kind: 'range', min: 0, max: 1, def: 0.3 },
  { id: 'elPos', section: 'elements', label: 'Position', kind: 'range', min: 0, max: 1, def: 0.3 },
  { id: 'elSpace', section: 'elements', label: 'Space', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'elOct', section: 'elements', label: 'Octave', kind: 'range', min: -2, max: 2, def: 0, step: 1 },

  // Beads
  { id: 'bdLevel', section: 'beads', label: 'Level', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'bdMedia', section: 'beads', label: 'Media', kind: 'select', options: ['Digital', 'Clean tape'], def: 0 },
  { id: 'bdTime', section: 'beads', label: 'Time', kind: 'range', min: 0, max: 1, def: 0.4 },
  { id: 'bdSize', section: 'beads', label: 'Size (max = delay mode)', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'bdShape', section: 'beads', label: 'Shape', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'bdPitch', section: 'beads', label: 'Pitch', kind: 'range', min: -24, max: 24, def: 0, step: 1, unit: 'st' },
  { id: 'bdFollow', section: 'beads', label: 'Pitch follows the chord root', kind: 'bool', def: true },
  { id: 'bdDensity', section: 'beads', label: 'Density (← regular · random →)', kind: 'range', min: 0, max: 1, def: 0.8 },
  { id: 'bdRandom', section: 'beads', label: 'Randomness of time/size/shape/pitch', kind: 'range', min: 0, max: 1, def: 0.2 },
  { id: 'bdFeedback', section: 'beads', label: 'Feedback', kind: 'range', min: 0, max: 1, def: 0.2 },
  { id: 'bdReverb', section: 'beads', label: 'Reverb', kind: 'range', min: 0, max: 1, def: 0.3 },
  { id: 'bdSeeds', section: 'beads', label: 'Grains from', kind: 'select', options: ['Density (free)', 'The arp / Marbles'], def: 0 },
  { id: 'bdSend', section: 'beads', label: 'Send synths in (besides the mic)', kind: 'range', min: 0, max: 1, def: 0 },

  // Warps
  { id: 'wpLevel', section: 'warps', label: 'Level', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'wpAlgo', section: 'warps', label: 'Algorithm', kind: 'select', options: WARPS_ALGOS, def: 6 },
  { id: 'wpTimbre', section: 'warps', label: 'Timbre', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'wpCarrier', section: 'warps', label: 'Carrier (the mic is the modulator)', kind: 'select', options: ['Synths (Plaits, Lizard, sampler)', 'Osc: sine', 'Osc: triangle', 'Osc: saw'], def: 0 },
  { id: 'wpCarLvl', section: 'warps', label: 'Carrier level', kind: 'range', min: 0, max: 1, def: 0.7 },
  { id: 'wpModLvl', section: 'warps', label: 'Mic level', kind: 'range', min: 0, max: 1, def: 0.7 },
  { id: 'wpOct', section: 'warps', label: 'Osc octave', kind: 'range', min: -2, max: 2, def: 0, step: 1 },

  // Marbles
  { id: 'arpSource', section: 'marbles', label: 'Rhythm & melody from', kind: 'select', options: ['The Lizard arp', 'Marbles'], def: 0 },
  { id: 'mbModel', section: 'marbles', label: 'T mode', kind: 'select', options: ['Bernoulli (complementary)', 'Clusters', 'Drums', 'Bernoulli (independent)', 'Divider', 'Three states', 'Markov'], def: 0 },
  { id: 'mbRate', section: 'marbles', label: 'T rate', kind: 'select', options: ['1/4 notes', 'Dotted 1/8', '1/8 notes', '1/8 triplets', '1/16 notes', '1/16 triplets', '1/32 notes', '1/32 triplets', '1/64 notes'], def: 2 },
  { id: 'mbBias', section: 'marbles', label: 'T bias', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'mbJitter', section: 'marbles', label: 'Jitter', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'mbDejaVu', section: 'marbles', label: 'Déjà vu (0.5 = locked loop)', kind: 'range', min: 0, max: 1, def: 0.25 },
  { id: 'mbLength', section: 'marbles', label: 'Loop length', kind: 'range', min: 1, max: 16, def: 8, step: 1 },
  { id: 'mbSpread', section: 'marbles', label: 'X spread', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'mbXBias', section: 'marbles', label: 'X bias', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'mbSteps', section: 'marbles', label: 'X steps (towards chord tones)', kind: 'range', min: 0, max: 1, def: 0.8 },
  { id: 'mbRange', section: 'marbles', label: 'X range', kind: 'select', options: ['2 octaves', '5 octaves'], def: 0 },
  { id: 'mbYTarget', section: 'marbles', label: 'Y (slow random) controls', kind: 'select', options: [], def: 0, local: true, targets: true },
  { id: 'mbYAmt', section: 'marbles', label: 'Y amount', kind: 'range', min: -1, max: 1, def: 0.5, local: true },

  // Echo chamber
  { id: 'ecLevel', section: 'echo', label: 'Level', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'ecMode', section: 'echo', label: 'Mode', kind: 'select', options: ECHO_MODES, def: 0 },
  { id: 'ecTime', section: 'echo', label: 'Base time', kind: 'select', options: ['1/16', '1/8', 'Dotted 1/8', '1/4', 'Dotted 1/4', '1/2', '1 bar'], def: 3 },
  { id: 'ecTaps', section: 'echo', label: 'Number of echoes', kind: 'range', min: 1, max: 6, def: 4, step: 1 },
  { id: 'ecFb', section: 'echo', label: 'Feedback', kind: 'range', min: 0, max: 0.95, def: 0.3 },
  { id: 'ecSpace', section: 'echo', label: 'Space (own reverb)', kind: 'range', min: 0, max: 1, def: 0.6 },
  { id: 'ecTone', section: 'echo', label: 'Darker with each echo', kind: 'range', min: 0, max: 1, def: 0.6 },
  { id: 'ecSpread', section: 'echo', label: 'Stereo width', kind: 'range', min: 0, max: 1, def: 0.7 },
  { id: 'ecSend', section: 'echo', label: 'Send synths in (besides the mic)', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'ecCapLen', section: 'echo', label: 'Capture length', kind: 'select', options: ['1 beat', '2 beats', '1 bar', '2 bars'], def: 2 },

  // Resonator
  { id: 'resLevel', section: 'res', label: 'Level', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'resQ', section: 'res', label: 'Resonance', kind: 'range', min: 0, max: 1, def: 0.6 },
  { id: 'resBright', section: 'res', label: 'Brightness (overtones)', kind: 'range', min: 0, max: 1, def: 0.4 },
  { id: 'resOct', section: 'res', label: 'Octaves', kind: 'range', min: 1, max: 3, def: 2, step: 1 },
  { id: 'resSpread', section: 'res', label: 'Stereo width', kind: 'range', min: 0, max: 1, def: 0.7 },
  { id: 'resMode', section: 'res', label: 'Filter mode', kind: 'select', options: RES_MODES, def: 0 },
  { id: 'resPulses', section: 'res', label: 'Pulse density', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'resPulseLen', section: 'res', label: 'Pulse length', kind: 'range', min: 5, max: 600, def: 120, curve: 'exp', unit: 'ms' },
  { id: 'bbLevel', section: 'res', label: 'Bytebeat into the filters', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'bbFormula', section: 'res', label: 'Bytebeat formula', kind: 'select', options: ['t*(42&t>>10)', 't*((t>>12|t>>8)&63&t>>4)', '(t*5&t>>7)|(t*3&t>>10)', 't*(t>>5|t>>8)>>(t>>16)', '(t>>6|t|t>>(t>>16))*10', 't*((t>>9|t>>13)&25&t>>6)'], def: 0 },
  { id: 'bbRate', section: 'res', label: 'Bytebeat rate', kind: 'range', min: 2000, max: 22000, def: 8000, curve: 'exp', unit: 'Hz' },

  // Sampler
  { id: 'smpLevel', section: 'sampler', label: 'Level', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'smpMode', section: 'sampler', label: 'Play mode', kind: 'select', options: ['Drone in the chord', 'Follow the arp', 'On chord change'], def: 0 },
  { id: 'smpPitch', section: 'sampler', label: 'Pitch', kind: 'range', min: -12, max: 12, def: 0, unit: 'st' },
  { id: 'smpOct', section: 'sampler', label: 'Octave', kind: 'range', min: -2, max: 2, def: 0, step: 1 },

  // Grains
  { id: 'grLevel', section: 'grain', label: 'Level', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'grPos', section: 'grain', label: 'Position (now ◀▶ back)', kind: 'range', min: 0, max: 1, def: 0.15 },
  { id: 'grSize', section: 'grain', label: 'Grain size', kind: 'range', min: 20, max: 1500, def: 220, curve: 'exp', unit: 'ms' },
  { id: 'grDensity', section: 'grain', label: 'Density', kind: 'range', min: 0.5, max: 60, def: 10, curve: 'exp', unit: '/s' },
  { id: 'grPitch', section: 'grain', label: 'Pitch', kind: 'range', min: -24, max: 24, def: 0, step: 1, unit: 'st' },
  { id: 'grChord', section: 'grain', label: 'Follow the chord', kind: 'range', min: 0, max: 1, def: 0.7 },
  { id: 'grJitter', section: 'grain', label: 'Spread', kind: 'range', min: 0, max: 1, def: 0.3 },
  { id: 'grReverse', section: 'grain', label: 'Reverse chance', kind: 'range', min: 0, max: 1, def: 0.15 },
  { id: 'grOctave', section: 'grain', label: 'Octave jump chance', kind: 'range', min: 0, max: 1, def: 0.2 },

  // Synth
  { id: 'synLevel', section: 'synth', label: 'Level', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'synModel', section: 'synth', label: 'Model', kind: 'select', options: ['Strings', 'Pad', 'FM bells'], def: 0 },
  { id: 'synTimbre', section: 'synth', label: 'Timbre', kind: 'range', min: 0, max: 1, def: 0.4 },
  { id: 'synMorph', section: 'synth', label: 'Morph', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'synDecay', section: 'synth', label: 'Decay', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'arpRate', section: 'synth', label: 'Arp rate', kind: 'select', options: ['1/4', '1/8', '1/8 triplet', '1/16'], def: 1 },
  { id: 'arpPattern', section: 'synth', label: 'Arp pattern', kind: 'select', options: ['Up', 'Down', 'Random', 'Strum'], def: 2 },
  { id: 'arpChance', section: 'synth', label: 'Arp density', kind: 'range', min: 0, max: 1, def: 0.6 },
  { id: 'synOct', section: 'synth', label: 'Octave', kind: 'range', min: -2, max: 2, def: 1, step: 1 },

  // Filter / drive
  { id: 'fltType', section: 'filter', label: 'Type', kind: 'select', options: ['Low-pass', 'Band-pass', 'High-pass'], def: 0 },
  { id: 'fltCutoff', section: 'filter', label: 'Cutoff', kind: 'range', min: 40, max: 18000, def: 4500, curve: 'exp', unit: 'Hz' },
  { id: 'fltRes', section: 'filter', label: 'Resonance', kind: 'range', min: 0, max: 1, def: 0.1 },
  { id: 'drive', section: 'filter', label: 'Drive', kind: 'range', min: 0, max: 1, def: 0 },

  // Delay
  { id: 'dlyMix', section: 'delay', label: 'Mix', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'dlyDiv', section: 'delay', label: 'Time', kind: 'select', options: ['1/16', '1/8', '3/16', '1/4', '3/8', '1/2'], def: 2 },
  { id: 'dlyFb', section: 'delay', label: 'Feedback', kind: 'range', min: 0, max: 0.95, def: 0.4 },
  { id: 'dlyTone', section: 'delay', label: 'Tone', kind: 'range', min: 0, max: 1, def: 0.35 },
  { id: 'dlyWow', section: 'delay', label: 'Wow (tape)', kind: 'range', min: 0, max: 1, def: 0.15 },

  // Reverb
  { id: 'rvbMix', section: 'reverb', label: 'Mix', kind: 'range', min: 0, max: 1, def: 0.3 },
  { id: 'rvbSize', section: 'reverb', label: 'Size', kind: 'range', min: 0, max: 1, def: 0.75 },
  { id: 'rvbDamp', section: 'reverb', label: 'Damping', kind: 'range', min: 0, max: 1, def: 0.5 },

  // Looper
  { id: 'loopBars', section: 'looper', label: 'Length (bars)', kind: 'select', options: ['1', '2', '4', '8'], def: 2 },
  { id: 'loopFb', section: 'looper', label: 'Memory (1 = infinite)', kind: 'range', min: 0.5, max: 1, def: 0.93 },
  { id: 'loopLevel', section: 'looper', label: 'Level', kind: 'range', min: 0, max: 1, def: 0.9 },
  { id: 'loopFadeAlways', section: 'looper', label: 'Fade while playing too', kind: 'bool', def: false },
  { id: 'loopSpeed', section: 'looper', label: 'Speed', kind: 'select', options: ['Normal', 'Half', 'Reverse', 'Half reverse'], def: 0 },

  // Master
  { id: 'master', section: 'master', label: 'Volume', kind: 'range', min: 0, max: 1, def: 0.7 },

  // Gyro (handled on the main thread, never sent to the engine)
  { id: 'gyroOn', section: 'gyro', label: 'Gyro on', kind: 'bool', def: false, local: true },
  { id: 'gyroA', section: 'gyro', label: 'Forward/back controls', kind: 'select', options: [], def: 0, local: true, targets: true },
  { id: 'gyroAAmt', section: 'gyro', label: 'Forward/back amount', kind: 'range', min: -1, max: 1, def: 0.6, local: true },
  { id: 'gyroB', section: 'gyro', label: 'Side to side controls', kind: 'select', options: [], def: 0, local: true, targets: true },
  { id: 'gyroBAmt', section: 'gyro', label: 'Side amount', kind: 'range', min: -1, max: 1, def: 0.6, local: true },
  { id: 'gyroRange', section: 'gyro', label: 'Tilt range', kind: 'range', min: 10, max: 90, def: 40, unit: '°', local: true },
  { id: 'shakeNew', section: 'gyro', label: 'Shake = new chords', kind: 'bool', def: true, local: true },
  { id: 'faceFreeze', section: 'gyro', label: 'Face down = freeze', kind: 'bool', def: true, local: true },

  // Touch pad (like Gecho's IR sensors, but with a finger)
  { id: 'xyX', section: 'xy', label: 'Left/right controls', kind: 'select', options: [], def: 0, local: true, targets: true },
  { id: 'xyXAmt', section: 'xy', label: 'Left/right amount', kind: 'range', min: -1, max: 1, def: 0.8, local: true },
  { id: 'xyY', section: 'xy', label: 'Up/down controls', kind: 'select', options: [], def: 0, local: true, targets: true },
  { id: 'xyYAmt', section: 'xy', label: 'Up/down amount', kind: 'range', min: -1, max: 1, def: 0.8, local: true },
  { id: 'xyHold', section: 'xy', label: 'Stay put when released', kind: 'bool', def: false, local: true },
];

export const PARAM_BY_ID = Object.fromEntries(PARAMS.map((p) => [p.id, p]));

// Continuous parameters that the gyro can push around.
export const GYRO_TARGETS = ['none', 'fltCutoff', 'clPos', 'clSize', 'clDensity', 'clTexture', 'clPitch', 'rgStructure',
  'rgBright', 'rgDamp', 'rgPos', 'plHarm', 'plTimbre', 'plMorph', 'grPos', 'grPitch', 'grSize', 'grDensity', 'rvbMix',
  'rvbSize', 'dlyMix', 'dlyFb', 'wpTimbre', 'wpCarLvl', 'mbBias', 'mbSpread', 'mbSteps', 'mbDejaVu', 'mbXBias',
  'ecFb', 'ecSpace', 'ecTone', 'elGeometry', 'elBright', 'elDamp', 'elPos', 'elBow', 'elBlow', 'bdTime', 'bdSize',
  'bdShape', 'bdDensity', 'bdPitch', 'resQ', 'resBright', 'resPulses', 'resPulseLen', 'bbRate', 'smpPitch', 'drive',
  'synTimbre', 'synMorph', 'noise', 'ambient', 'inTone'];
const targetLabel = (id) => {
  if (id === 'none') return 'Nothing';
  const p = PARAM_BY_ID[id];
  const sec = SECTIONS.find((s) => s.id === p.section).label.split(' ')[0];
  return `${sec}: ${p.label}`;
};
for (const p of PARAMS) if (p.targets) p.options = GYRO_TARGETS.map(targetLabel);
PARAM_BY_ID.gyroA.def = GYRO_TARGETS.indexOf('fltCutoff');
PARAM_BY_ID.gyroB.def = GYRO_TARGETS.indexOf('rvbMix');
PARAM_BY_ID.xyX.def = GYRO_TARGETS.indexOf('clPos');
PARAM_BY_ID.xyY.def = GYRO_TARGETS.indexOf('rgStructure');

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
  if (p.kind === 'bool') return v ? 'On' : 'Off';
  if (p.kind === 'select') return p.options[v] ?? '';
  const unit = p.unit ? ' ' + p.unit : '';
  if (p.step >= 1) return Math.round(v) + unit;
  if (Math.abs(v) >= 100) return Math.round(v) + unit;
  if (Math.abs(v) >= 10) return v.toFixed(1) + unit;
  return v.toFixed(2) + unit;
}

// Simple scenes for the main screen. Like every preset they are partial:
// anything not listed falls back to its (quiet) default.
export const SCENES = [
  {
    name: 'Room Choir', blurb: 'The room sings in chords',
    params: {
      rgLevel: 0.65, rgModel: 1, rgStructure: 0.3, rgBright: 0.35, rgDamp: 0.7, rgPos: 0.3,
      clLevel: 0.2, clDensity: 0.6, clTexture: 0.6, clReverb: 0.4, rvbMix: 0.35, fltCutoff: 3800, color: 1,
    },
  },
  {
    name: 'Cloud Drift', blurb: 'Slow grains of what you hear',
    params: {
      clLevel: 0.75, clMode: 0, clPos: 0.55, clSize: 0.7, clDensity: 0.7, clTexture: 0.7, clReverb: 0.5,
      clFeedback: 0.15, rvbMix: 0.25, fltCutoff: 3500,
    },
  },
  {
    name: 'Bowed Strings', blurb: 'A soft bowed drone',
    params: {
      elLevel: 0.6, elModel: 0, elPlay: 0, elBow: 0.75, elBowTimbre: 0.3, elStrike: 0, elContour: 0.8,
      elGeometry: 0.3, elBright: 0.3, elDamp: 0.6, elSpace: 0.5, elMic: 0.2, rvbMix: 0.25, fltCutoff: 4000,
    },
  },
  {
    name: 'Echo Space', blurb: 'Your sound, far away',
    params: {
      ecLevel: 0.7, ecMode: 1, ecTime: 3, ecTaps: 4, ecFb: 0.2, ecSpace: 0.75, ecTone: 0.7, rvbMix: 0.15,
      fltCutoff: 4500,
    },
  },
  {
    name: 'Music Box', blurb: 'Gentle random melodies',
    params: {
      arpSource: 1, mbModel: 0, mbRate: 2, mbDejaVu: 0.45, mbSteps: 0.85, plLevel: 0.4, plEngine: 20, plMode: 0,
      plHarm: 0.4, plTimbre: 0.3, plMorph: 0.4, plDecay: 0.45, plVoices: 2, plOct: 1, dlyMix: 0.2, rvbMix: 0.35,
      fltCutoff: 4500,
    },
  },
  {
    name: 'Robot Choir', blurb: 'Talk or sing into a vocoder',
    params: {
      wpLevel: 0.7, wpAlgo: 6, wpCarrier: 0, wpTimbre: 0.45, plMode: 1, plEngine: 6, plTimbre: 0.35, plVoices: 3,
      rvbMix: 0.3, fltCutoff: 4200,
    },
  },
];

// Built-in presets for the settings screen.
export const PRESETS = {
  'Ringing Room': {
    rgLevel: 0.7, rgModel: 0, rgStructure: 0.35, rgBright: 0.45, rgDamp: 0.7, clLevel: 0.3, plLevel: 0.2,
    plEngine: 19, resLevel: 0.15, grLevel: 0.15, rvbMix: 0.4, ambient: 0.7,
  },
  'Gecho Choir': {
    resLevel: 0.8, resQ: 0.7, resBright: 0.4, resOct: 3, rgLevel: 0.3, rgModel: 1, clLevel: 0.2, grLevel: 0.2,
    plLevel: 0.15, plMode: 1, plEngine: 6, rvbMix: 0.45, rvbSize: 0.85, dlyMix: 0.15, color: 1, ambient: 0.7,
  },
  'Noise Chords': {
    noise: 1, rgLevel: 0.6, rgModel: 4, rgDamp: 0.8, resLevel: 0.5, resQ: 0.8, clLevel: 0.25, rvbMix: 0.4,
    dlyMix: 0.25, ambient: 0.2, dejavu: 0.5, color: 2, fltCutoff: 3500,
  },
  'Cloud Grains': {
    clLevel: 0.8, clMode: 0, clPos: 0.6, clSize: 0.7, clDensity: 0.8, clTexture: 0.7, clReverb: 0.55, clSend: 0.3,
    grLevel: 0.4, grChord: 0.9, grJitter: 0.6, rgLevel: 0.25, resLevel: 0.1, rvbMix: 0.35,
  },
  'Spectral': {
    clLevel: 0.75, clMode: 3, clPos: 0.5, clSize: 0.6, clTexture: 0.6, clSend: 0.4, rgLevel: 0.35, rgModel: 1,
    plLevel: 0.2, plMode: 1, plEngine: 12, rvbMix: 0.5, rvbSize: 0.9,
  },
  'Plaits Arp': {
    plLevel: 0.55, plEngine: 10, plMode: 0, plHarm: 0.4, plTimbre: 0.45, plMorph: 0.4, plDecay: 0.5, arpRate: 3,
    arpPattern: 2, arpChance: 0.55, rgLevel: 0.3, clLevel: 0.25, resLevel: 0.1, dlyMix: 0.3, rvbMix: 0.35,
  },
  'Bell Forest': {
    plLevel: 0.45, plEngine: 20, plMode: 0, plHarm: 0.6, plTimbre: 0.45, plMorph: 0.6, plDecay: 0.7, arpRate: 1,
    arpChance: 0.45, rgLevel: 0.35, rgModel: 3, clLevel: 0.3, rvbMix: 0.5, rvbSize: 0.9, color: 2,
  },
  'Gecho Pulse': {
    noise: 0.6, resLevel: 0.8, resMode: 1, resPulses: 0.55, resPulseLen: 90, resQ: 0.75, resOct: 3, rgLevel: 0.3,
    clLevel: 0.2, dlyMix: 0.3, dlyDiv: 2, rvbMix: 0.4, bpm: 96, fltCutoff: 3800,
  },
  'Bytebeat Choir': {
    bbLevel: 0.6, bbFormula: 2, resLevel: 0.75, resMode: 2, resPulses: 0.8, resPulseLen: 200, resQ: 0.8,
    rgLevel: 0.45, rgModel: 1, clLevel: 0.25, rvbMix: 0.45, fltCutoff: 3500,
  },
  'Chord Sampler': {
    smpLevel: 0.7, smpMode: 0, rgLevel: 0.25, clLevel: 0.3, resLevel: 0.1, grLevel: 0.15, rvbMix: 0.4,
  },
  'Vocoder Choir': {
    wpLevel: 0.8, wpAlgo: 6, wpTimbre: 0.5, wpCarrier: 0, plMode: 1, plEngine: 6, plVoices: 4, rgLevel: 0.2,
    clLevel: 0.2, rvbMix: 0.4, color: 1,
  },
  'Ring Mod Room': {
    wpLevel: 0.65, wpAlgo: 2, wpTimbre: 0.6, wpCarrier: 1, wpOct: 1, rgLevel: 0.3, clLevel: 0.3, ecLevel: 0.35,
    ecMode: 0, rvbMix: 0.35, fltCutoff: 3500,
  },
  'Marbles Melodies': {
    arpSource: 1, mbModel: 0, mbRate: 2, mbDejaVu: 0.35, mbSteps: 0.85, plLevel: 0.5, plEngine: 10, plMode: 0,
    plDecay: 0.5, rgLevel: 0.4, rgPluck: 2, clLevel: 0.25, resLevel: 0.1, resMode: 1, dlyMix: 0.25, rvbMix: 0.35,
  },
  'Marbles Drums': {
    arpSource: 1, mbModel: 2, mbRate: 4, mbDejaVu: 0.5, plLevel: 0.5, plEngine: 21, plMode: 0, rgLevel: 0.25,
    rgPluck: 2, resLevel: 0.45, resMode: 1, noise: 0.4, clLevel: 0.15, dlyMix: 0.15, rvbMix: 0.25,
  },
  'Echo Chamber': {
    ecLevel: 0.75, ecMode: 1, ecTime: 3, ecTaps: 5, ecFb: 0.3, ecSpace: 0.8, rgLevel: 0.25, clLevel: 0.15,
    rvbMix: 0.2,
  },
  'Shimmer Echoes': {
    ecLevel: 0.7, ecMode: 2, ecTime: 4, ecTaps: 4, ecFb: 0.4, ecSpace: 0.85, rgLevel: 0.3, clLevel: 0.2,
    rvbMix: 0.25, fltCutoff: 3800,
  },
  'Reverse Echoes': {
    ecLevel: 0.75, ecMode: 3, ecTime: 5, ecTaps: 3, ecFb: 0.3, ecSpace: 0.6, rgLevel: 0.25, clLevel: 0.15,
    rvbMix: 0.25,
  },
  'Elements Bow': {
    elLevel: 0.75, elModel: 0, elPlay: 0, elBow: 0.8, elBowTimbre: 0.35, elStrike: 0, elContour: 0.8,
    elGeometry: 0.35, elBright: 0.4, elDamp: 0.6, elSpace: 0.6, elMic: 0.3, rgLevel: 0.15, clLevel: 0.2,
    rvbMix: 0.25,
  },
  'Elements Marimba': {
    elLevel: 0.7, elModel: 0, elPlay: 1, elStrike: 0.9, elStrikeMeta: 0.3, elContour: 0.2, elGeometry: 0.25,
    elDamp: 0.4, elSpace: 0.45, arpSource: 1, mbModel: 0, mbRate: 2, rgLevel: 0.2, clLevel: 0.15, dlyMix: 0.2,
  },
  'Room Resonance': {
    elLevel: 0.75, elModel: 2, elPlay: 0, elStrike: 0, elBow: 0, elMic: 0.8, elGeometry: 0.4, elDamp: 0.75,
    elSpace: 0.65, rgLevel: 0.25, rvbMix: 0.25,
  },
  'Beads Cloud': {
    bdLevel: 0.8, bdTime: 0.45, bdSize: 0.55, bdShape: 0.6, bdDensity: 0.85, bdRandom: 0.35, bdReverb: 0.45,
    bdFeedback: 0.2, rgLevel: 0.2, resLevel: 0.1, rvbMix: 0.2,
  },
  'Beads Tape': {
    bdLevel: 0.8, bdMedia: 1, bdTime: 0.6, bdSize: 0.4, bdShape: 0.3, bdDensity: 0.25, bdRandom: 0.15,
    bdReverb: 0.35, bdFeedback: 0.35, bdSend: 0.35, rgLevel: 0.25, plLevel: 0.2, plMode: 1, rvbMix: 0.2,
  },
  'Lizard Classic': {
    resLevel: 0.65, grLevel: 0.45, synLevel: 0.25, dlyMix: 0.2,
  },
};

// The chosen scene on the main screen (remembered, never sent to the engine).
const sceneParam = { id: 'scene', section: 'none', label: 'Sound', kind: 'select', options: SCENES.map((s) => s.name), def: 0, local: true };
PARAMS.push(sceneParam);
PARAM_BY_ID.scene = sceneParam;
