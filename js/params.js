// Parameter definitions. One list drives the edit view, the play-view macros,
// presets, gyro targets and what gets sent to the audio engine.
//
// kind: 'range' (continuous), 'select' (index into options), 'bool'
// curve: 'lin' | 'exp' (exp needs min > 0)

export const SECTIONS = [
  { id: 'input', label: 'Ingång' },
  { id: 'chords', label: 'Ackord' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'rings', label: 'Rings (Mutable Instruments)' },
  { id: 'clouds', label: 'Clouds (Mutable Instruments)' },
  { id: 'plaits', label: 'Plaits (Mutable Instruments)' },
  { id: 'warps', label: 'Warps (Mutable Instruments)' },
  { id: 'marbles', label: 'Marbles (Mutable Instruments)' },
  { id: 'echo', label: 'Ekorum (ekon & rum)' },
  { id: 'song', label: 'Magisk låt (Gecho)' },
  { id: 'res', label: 'Gecho-resonator & filterlägen' },
  { id: 'sampler', label: 'Ackord-sampler (Gecho)' },
  { id: 'grain', label: 'Ackord-grains (Lizard)' },
  { id: 'synth', label: 'Synth (Lizard)' },
  { id: 'filter', label: 'Filter & drive' },
  { id: 'delay', label: 'Delay' },
  { id: 'reverb', label: 'Reverb' },
  { id: 'looper', label: 'Looper' },
  { id: 'master', label: 'Master' },
  { id: 'gyro', label: 'Gyro' },
  { id: 'xy', label: 'Sensorplatta' },
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

export const PLAITS_ENGINES = [
  'VA + filter', 'Phase distortion', '6-op FM I', '6-op FM II', '6-op FM III', 'Wave terrain', 'String machine',
  'Chiptune', 'Virtuell analog', 'Waveshaping', 'FM', 'Granulär formant', 'Additiv', 'Wavetable', 'Ackord',
  'Tal (speech)', 'Swarm', 'Filtrerat brus', 'Partiklar', 'Sträng', 'Modal', 'Bastrumma', 'Virvel', 'Hi-hat',
];

export const WARPS_ALGOS = ['Crossfade', 'Wavefolder', 'Analog ringmod', 'Digital ringmod', 'XOR', 'Komparator',
  'Vocoder', 'Vocoder (lång release)'];
export const ECHO_MODES = ['Rytmiska ekon', 'Rum → katedral', 'Shimmer (tonhöjd)', 'Baklänges', 'Slump'];

export const RES_MODES = ['Klassisk', 'Rytmisk (euklidisk)', 'Arpeggio', 'Puls'];

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

  // Rings
  { id: 'rgLevel', section: 'rings', label: 'Nivå', kind: 'range', min: 0, max: 1, def: 0.6 },
  { id: 'rgModel', section: 'rings', label: 'Modell', kind: 'select', options: ['Modal', 'Sympatiska strängar', 'Sträng (oharmonisk)', 'FM-röst', 'Sympatiska, kvantiserade', 'Sträng + reverb'], def: 0 },
  { id: 'rgStructure', section: 'rings', label: 'Structure', kind: 'range', min: 0, max: 1, def: 0.4 },
  { id: 'rgBright', section: 'rings', label: 'Brightness', kind: 'range', min: 0, max: 1, def: 0.55 },
  { id: 'rgDamp', section: 'rings', label: 'Damping', kind: 'range', min: 0, max: 1, def: 0.65 },
  { id: 'rgPos', section: 'rings', label: 'Position', kind: 'range', min: 0, max: 1, def: 0.3 },
  { id: 'rgPluck', section: 'rings', label: 'Excitation', kind: 'select', options: ['Bara mic', 'Plock vid ackordbyte', 'Plock med arpen'], def: 0 },
  { id: 'rgVoices', section: 'rings', label: 'Resonatorer (ackordtoner)', kind: 'range', min: 1, max: 4, def: 4, step: 1 },
  { id: 'rgOct', section: 'rings', label: 'Oktav', kind: 'range', min: -2, max: 2, def: 0, step: 1 },

  // Clouds
  { id: 'clLevel', section: 'clouds', label: 'Nivå', kind: 'range', min: 0, max: 1, def: 0.45 },
  { id: 'clMode', section: 'clouds', label: 'Läge', kind: 'select', options: ['Granulär', 'Stretch (WSOLA)', 'Looping delay', 'Spektral'], def: 0 },
  { id: 'clPos', section: 'clouds', label: 'Position', kind: 'range', min: 0, max: 1, def: 0.4 },
  { id: 'clSize', section: 'clouds', label: 'Size', kind: 'range', min: 0, max: 1, def: 0.55 },
  { id: 'clPitch', section: 'clouds', label: 'Pitch', kind: 'range', min: -24, max: 24, def: 0, step: 1, unit: 'st' },
  { id: 'clFollow', section: 'clouds', label: 'Pitch följer ackordets grundton', kind: 'bool', def: true },
  { id: 'clDensity', section: 'clouds', label: 'Density', kind: 'range', min: 0, max: 1, def: 0.68 },
  { id: 'clTexture', section: 'clouds', label: 'Texture', kind: 'range', min: 0, max: 1, def: 0.55 },
  { id: 'clSpread', section: 'clouds', label: 'Stereo spread', kind: 'range', min: 0, max: 1, def: 0.6 },
  { id: 'clFeedback', section: 'clouds', label: 'Feedback', kind: 'range', min: 0, max: 1, def: 0.25 },
  { id: 'clReverb', section: 'clouds', label: 'Reverb', kind: 'range', min: 0, max: 1, def: 0.35 },
  { id: 'clSend', section: 'clouds', label: 'Skicka synthar/resonatorer in', kind: 'range', min: 0, max: 1, def: 0.2 },

  // Plaits
  { id: 'plLevel', section: 'plaits', label: 'Nivå', kind: 'range', min: 0, max: 1, def: 0.3 },
  { id: 'plEngine', section: 'plaits', label: 'Motor', kind: 'select', options: PLAITS_ENGINES, def: 19 },
  { id: 'plMode', section: 'plaits', label: 'Spelsätt', kind: 'select', options: ['Arp (följer arpen)', 'Ackord-drone', 'Strum vid ackordbyte'], def: 0 },
  { id: 'plHarm', section: 'plaits', label: 'Harmonics', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'plTimbre', section: 'plaits', label: 'Timbre', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'plMorph', section: 'plaits', label: 'Morph', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'plDecay', section: 'plaits', label: 'Decay (LPG)', kind: 'range', min: 0, max: 1, def: 0.55 },
  { id: 'plColour', section: 'plaits', label: 'LPG-färg', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'plAux', section: 'plaits', label: 'Main ◀▶ Aux-utgång', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'plVoices', section: 'plaits', label: 'Röster', kind: 'range', min: 1, max: 4, def: 4, step: 1 },
  { id: 'plOct', section: 'plaits', label: 'Oktav', kind: 'range', min: -2, max: 2, def: 1, step: 1 },

  // Warps
  { id: 'wpLevel', section: 'warps', label: 'Nivå', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'wpAlgo', section: 'warps', label: 'Algoritm', kind: 'select', options: WARPS_ALGOS, def: 6 },
  { id: 'wpTimbre', section: 'warps', label: 'Timbre', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'wpCarrier', section: 'warps', label: 'Bärvåg (mic är modulator)', kind: 'select', options: ['Synthar (Plaits, Lizard, sampler)', 'Osc: sinus', 'Osc: triangel', 'Osc: såg'], def: 0 },
  { id: 'wpCarLvl', section: 'warps', label: 'Bärvåg-nivå', kind: 'range', min: 0, max: 1, def: 0.7 },
  { id: 'wpModLvl', section: 'warps', label: 'Mic-nivå', kind: 'range', min: 0, max: 1, def: 0.7 },
  { id: 'wpOct', section: 'warps', label: 'Osc-oktav', kind: 'range', min: -2, max: 2, def: 0, step: 1 },

  // Marbles
  { id: 'arpSource', section: 'marbles', label: 'Rytm & melodi från', kind: 'select', options: ['Lizard-arpen', 'Marbles'], def: 0 },
  { id: 'mbModel', section: 'marbles', label: 'T-läge', kind: 'select', options: ['Bernoulli (växlande)', 'Kluster', 'Trummor', 'Bernoulli (oberoende)', 'Delare', 'Tre lägen', 'Markov'], def: 0 },
  { id: 'mbRate', section: 'marbles', label: 'T-takt', kind: 'select', options: ['1/4-noter', 'Punkt. 1/8', '1/8-noter', '1/8-trioler', '1/16-noter', '1/16-trioler', '1/32-noter', '1/32-trioler', '1/64-noter'], def: 2 },
  { id: 'mbBias', section: 'marbles', label: 'T-bias', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'mbJitter', section: 'marbles', label: 'Jitter', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'mbDejaVu', section: 'marbles', label: 'Déjà vu (0.5 = låst slinga)', kind: 'range', min: 0, max: 1, def: 0.25 },
  { id: 'mbLength', section: 'marbles', label: 'Slinglängd', kind: 'range', min: 1, max: 16, def: 8, step: 1 },
  { id: 'mbSpread', section: 'marbles', label: 'X-spread', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'mbXBias', section: 'marbles', label: 'X-bias', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'mbSteps', section: 'marbles', label: 'X-steps (mot ackordtoner)', kind: 'range', min: 0, max: 1, def: 0.8 },
  { id: 'mbRange', section: 'marbles', label: 'X-omfång', kind: 'select', options: ['2 oktaver', '5 oktaver'], def: 0 },
  { id: 'mbYTarget', section: 'marbles', label: 'Y (långsam slump) styr', kind: 'select', options: [], def: 0, local: true, targets: true },
  { id: 'mbYAmt', section: 'marbles', label: 'Y-mängd', kind: 'range', min: -1, max: 1, def: 0.5, local: true },

  // Echo chamber
  { id: 'ecLevel', section: 'echo', label: 'Nivå', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'ecMode', section: 'echo', label: 'Läge', kind: 'select', options: ECHO_MODES, def: 0 },
  { id: 'ecTime', section: 'echo', label: 'Grundtid', kind: 'select', options: ['1/16', '1/8', '1/8 punkt.', '1/4', '1/4 punkt.', '1/2', '1 takt'], def: 3 },
  { id: 'ecTaps', section: 'echo', label: 'Antal ekon', kind: 'range', min: 1, max: 6, def: 4, step: 1 },
  { id: 'ecFb', section: 'echo', label: 'Återkoppling', kind: 'range', min: 0, max: 0.95, def: 0.35 },
  { id: 'ecSpace', section: 'echo', label: 'Rymd (eget reverb)', kind: 'range', min: 0, max: 1, def: 0.6 },
  { id: 'ecTone', section: 'echo', label: 'Mörkare för varje eko', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'ecSpread', section: 'echo', label: 'Stereobredd', kind: 'range', min: 0, max: 1, def: 0.7 },
  { id: 'ecSend', section: 'echo', label: 'Skicka synthar in (utöver mic)', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'ecCapLen', section: 'echo', label: 'Fånga-längd', kind: 'select', options: ['1 slag', '2 slag', '1 takt', '2 takter'], def: 2 },

  // Resonator
  { id: 'resLevel', section: 'res', label: 'Nivå', kind: 'range', min: 0, max: 1, def: 0.35 },
  { id: 'resQ', section: 'res', label: 'Resonans', kind: 'range', min: 0, max: 1, def: 0.65 },
  { id: 'resBright', section: 'res', label: 'Ljushet (övertoner)', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'resOct', section: 'res', label: 'Oktaver', kind: 'range', min: 1, max: 3, def: 2, step: 1 },
  { id: 'resSpread', section: 'res', label: 'Stereobredd', kind: 'range', min: 0, max: 1, def: 0.7 },
  { id: 'resMode', section: 'res', label: 'Filterläge', kind: 'select', options: RES_MODES, def: 0 },
  { id: 'resPulses', section: 'res', label: 'Puls-täthet', kind: 'range', min: 0, max: 1, def: 0.5 },
  { id: 'resPulseLen', section: 'res', label: 'Puls-längd', kind: 'range', min: 5, max: 600, def: 120, curve: 'exp', unit: 'ms' },
  { id: 'bbLevel', section: 'res', label: 'Bytebeat in i filtren', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'bbFormula', section: 'res', label: 'Bytebeat-formel', kind: 'select', options: ['t*(42&t>>10)', 't*((t>>12|t>>8)&63&t>>4)', '(t*5&t>>7)|(t*3&t>>10)', 't*(t>>5|t>>8)>>(t>>16)', '(t>>6|t|t>>(t>>16))*10', 't*((t>>9|t>>13)&25&t>>6)'], def: 0 },
  { id: 'bbRate', section: 'res', label: 'Bytebeat-hastighet', kind: 'range', min: 2000, max: 22000, def: 8000, curve: 'exp', unit: 'Hz' },

  // Sampler
  { id: 'smpLevel', section: 'sampler', label: 'Nivå', kind: 'range', min: 0, max: 1, def: 0 },
  { id: 'smpMode', section: 'sampler', label: 'Spelsätt', kind: 'select', options: ['Drone i ackordet', 'Följ arpen', 'Vid ackordbyte'], def: 0 },
  { id: 'smpPitch', section: 'sampler', label: 'Tonhöjd', kind: 'range', min: -12, max: 12, def: 0, unit: 'st' },
  { id: 'smpOct', section: 'sampler', label: 'Oktav', kind: 'range', min: -2, max: 2, def: 0, step: 1 },

  // Grains
  { id: 'grLevel', section: 'grain', label: 'Nivå', kind: 'range', min: 0, max: 1, def: 0.3 },
  { id: 'grPos', section: 'grain', label: 'Position (nu ◀▶ bakåt)', kind: 'range', min: 0, max: 1, def: 0.15 },
  { id: 'grSize', section: 'grain', label: 'Kornstorlek', kind: 'range', min: 20, max: 1500, def: 220, curve: 'exp', unit: 'ms' },
  { id: 'grDensity', section: 'grain', label: 'Täthet', kind: 'range', min: 0.5, max: 60, def: 10, curve: 'exp', unit: '/s' },
  { id: 'grPitch', section: 'grain', label: 'Tonhöjd', kind: 'range', min: -24, max: 24, def: 0, step: 1, unit: 'st' },
  { id: 'grChord', section: 'grain', label: 'Följ ackordet', kind: 'range', min: 0, max: 1, def: 0.7 },
  { id: 'grJitter', section: 'grain', label: 'Spridning', kind: 'range', min: 0, max: 1, def: 0.3 },
  { id: 'grReverse', section: 'grain', label: 'Baklänges-chans', kind: 'range', min: 0, max: 1, def: 0.15 },
  { id: 'grOctave', section: 'grain', label: 'Oktavhopp-chans', kind: 'range', min: 0, max: 1, def: 0.2 },

  // Synth
  { id: 'synLevel', section: 'synth', label: 'Nivå', kind: 'range', min: 0, max: 1, def: 0 },
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

  // XY sensor pad (like Gecho's IR sensors, but with a finger)
  { id: 'xyX', section: 'xy', label: 'Sidled styr', kind: 'select', options: [], def: 0, local: true, targets: true },
  { id: 'xyXAmt', section: 'xy', label: 'Mängd sidled', kind: 'range', min: -1, max: 1, def: 0.8, local: true },
  { id: 'xyY', section: 'xy', label: 'Höjdled styr', kind: 'select', options: [], def: 0, local: true, targets: true },
  { id: 'xyYAmt', section: 'xy', label: 'Mängd höjdled', kind: 'range', min: -1, max: 1, def: 0.8, local: true },
  { id: 'xyHold', section: 'xy', label: 'Stanna kvar när du släpper', kind: 'bool', def: false, local: true },
];

export const PARAM_BY_ID = Object.fromEntries(PARAMS.map((p) => [p.id, p]));

// Continuous parameters that the gyro can push around.
export const GYRO_TARGETS = ['none', 'fltCutoff', 'clPos', 'clSize', 'clDensity', 'clTexture', 'clPitch', 'rgStructure',
  'rgBright', 'rgDamp', 'rgPos', 'plHarm', 'plTimbre', 'plMorph', 'grPos', 'grPitch', 'grSize', 'grDensity', 'rvbMix',
  'rvbSize', 'dlyMix', 'dlyFb', 'wpTimbre', 'wpCarLvl', 'mbBias', 'mbSpread', 'mbSteps', 'mbDejaVu', 'mbXBias',
  'ecFb', 'ecSpace', 'ecTone', 'resQ', 'resBright', 'resPulses', 'resPulseLen', 'bbRate', 'smpPitch', 'drive',
  'synTimbre', 'synMorph', 'noise', 'ambient'];
const targetLabel = (id) => {
  if (id === 'none') return 'Inget';
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
  if (p.kind === 'bool') return v ? 'På' : 'Av';
  if (p.kind === 'select') return p.options[v] ?? '';
  const unit = p.unit ? ' ' + p.unit : '';
  if (p.step >= 1) return Math.round(v) + unit;
  if (Math.abs(v) >= 100) return Math.round(v) + unit;
  if (Math.abs(v) >= 10) return v.toFixed(1) + unit;
  return v.toFixed(2) + unit;
}

// Built-in presets are partial: anything not listed falls back to its default.
export const PRESETS = {
  'Ringande rum': {
    rgLevel: 0.75, rgModel: 0, rgStructure: 0.35, rgBright: 0.6, rgDamp: 0.7, clLevel: 0.35, plLevel: 0.2,
    plEngine: 19, resLevel: 0.2, grLevel: 0.2, rvbMix: 0.45, ambient: 0.7,
  },
  'Gecho-kör': {
    resLevel: 0.85, resQ: 0.75, resBright: 0.55, resOct: 3, rgLevel: 0.3, rgModel: 1, clLevel: 0.25, grLevel: 0.25,
    plLevel: 0.15, plMode: 1, plEngine: 6, rvbMix: 0.5, rvbSize: 0.85, dlyMix: 0.2, color: 1, ambient: 0.7,
  },
  'Brusackord': {
    noise: 1, rgLevel: 0.7, rgModel: 4, rgDamp: 0.8, resLevel: 0.6, resQ: 0.85, clLevel: 0.3, grLevel: 0, plLevel: 0,
    rvbMix: 0.45, dlyMix: 0.3, ambient: 0.2, dejavu: 0.5, color: 2,
  },
  'Molnkorn': {
    clLevel: 0.9, clMode: 0, clPos: 0.6, clSize: 0.7, clDensity: 0.8, clTexture: 0.7, clReverb: 0.6, clSend: 0.4,
    grLevel: 0.5, grChord: 0.9, grJitter: 0.6, rgLevel: 0.3, plLevel: 0, resLevel: 0.1, rvbMix: 0.4,
  },
  'Spektralt': {
    clLevel: 0.8, clMode: 3, clPos: 0.5, clSize: 0.6, clTexture: 0.6, clSend: 0.5, rgLevel: 0.4, rgModel: 1,
    plLevel: 0.2, plMode: 1, plEngine: 12, rvbMix: 0.55, rvbSize: 0.9,
  },
  'Plaits-arp': {
    plLevel: 0.6, plEngine: 10, plMode: 0, plHarm: 0.4, plTimbre: 0.55, plMorph: 0.4, plDecay: 0.5, arpRate: 3,
    arpPattern: 2, arpChance: 0.55, rgLevel: 0.35, clLevel: 0.3, resLevel: 0.15, dlyMix: 0.35, rvbMix: 0.4,
  },
  'Klockskog': {
    plLevel: 0.5, plEngine: 20, plMode: 0, plHarm: 0.6, plTimbre: 0.5, plMorph: 0.6, plDecay: 0.7, arpRate: 1,
    arpChance: 0.45, rgLevel: 0.4, rgModel: 3, clLevel: 0.35, rvbMix: 0.6, rvbSize: 0.9, color: 2,
  },
  'Gecho-puls': {
    noise: 0.6, resLevel: 0.85, resMode: 1, resPulses: 0.55, resPulseLen: 90, resQ: 0.8, resOct: 3, rgLevel: 0.35,
    rgModel: 0, clLevel: 0.25, plLevel: 0, grLevel: 0, dlyMix: 0.35, dlyDiv: 2, rvbMix: 0.45, bpm: 96,
  },
  'Bytebeat-kör': {
    noise: 0, bbLevel: 0.7, bbFormula: 2, resLevel: 0.8, resMode: 2, resPulses: 0.8, resPulseLen: 200, resQ: 0.85,
    rgLevel: 0.5, rgModel: 1, clLevel: 0.3, plLevel: 0, grLevel: 0, rvbMix: 0.5,
  },
  'Ackord-sampler': {
    smpLevel: 0.7, smpMode: 0, rgLevel: 0.3, clLevel: 0.35, plLevel: 0, resLevel: 0.15, grLevel: 0.2, rvbMix: 0.45,
  },
  'Vocoder-kör': {
    wpLevel: 0.85, wpAlgo: 6, wpTimbre: 0.5, wpCarrier: 0, plLevel: 0, plMode: 1, plEngine: 6, plVoices: 4,
    rgLevel: 0.2, clLevel: 0.25, resLevel: 0, grLevel: 0, rvbMix: 0.45, color: 1,
  },
  'Ringmod-rum': {
    wpLevel: 0.7, wpAlgo: 2, wpTimbre: 0.6, wpCarrier: 1, wpOct: 1, rgLevel: 0.35, clLevel: 0.35, plLevel: 0,
    resLevel: 0.1, grLevel: 0, ecLevel: 0.4, ecMode: 0, rvbMix: 0.4,
  },
  'Marbles-melodier': {
    arpSource: 1, mbModel: 0, mbRate: 2, mbDejaVu: 0.35, mbSteps: 0.85, plLevel: 0.55, plEngine: 10, plMode: 0,
    plDecay: 0.5, rgLevel: 0.45, rgPluck: 2, clLevel: 0.3, resLevel: 0.15, resMode: 1, dlyMix: 0.3, rvbMix: 0.4,
  },
  'Marbles-trummor': {
    arpSource: 1, mbModel: 2, mbRate: 4, mbDejaVu: 0.5, plLevel: 0.5, plEngine: 21, plMode: 0, rgLevel: 0.3,
    rgPluck: 2, resLevel: 0.5, resMode: 1, noise: 0.4, clLevel: 0.2, dlyMix: 0.2, rvbMix: 0.3,
  },
  'Ekorum': {
    ecLevel: 0.8, ecMode: 1, ecTime: 3, ecTaps: 5, ecFb: 0.3, ecSpace: 0.8, rgLevel: 0.3, clLevel: 0.2, plLevel: 0,
    resLevel: 0.1, grLevel: 0, rvbMix: 0.2,
  },
  'Shimmer-ekon': {
    ecLevel: 0.75, ecMode: 2, ecTime: 4, ecTaps: 4, ecFb: 0.45, ecSpace: 0.85, rgLevel: 0.35, clLevel: 0.25,
    plLevel: 0, resLevel: 0.1, rvbMix: 0.3,
  },
  'Baklänges-ekon': {
    ecLevel: 0.8, ecMode: 3, ecTime: 5, ecTaps: 3, ecFb: 0.3, ecSpace: 0.6, rgLevel: 0.3, clLevel: 0.2, plLevel: 0,
    resLevel: 0.1, rvbMix: 0.3,
  },
  'Lizard klassisk': {
    rgLevel: 0, clLevel: 0, plLevel: 0, resLevel: 0.7, grLevel: 0.5, synLevel: 0.25,
  },
};
