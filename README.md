# 🦎 Lizard Loopsynth

A Gecho-inspired loop synth for the phone. Lizard listens to the room through the microphone and turns it into chords, grains and endless loops.

## Try it on an iPhone

1. On GitHub: **Settings → Pages → Build and deployment**. Choose *Deploy from a branch*, then branch `main` and folder `/ (root)`, and **Save**.
2. After about a minute the app is at **https://ojojboll-ui.github.io/LizardApp/**.
3. Open it in Safari, then **Share → Add to Home Screen** to run it full screen.
4. On start, pick **Headphones** (best sound) or **Phone speaker** (echo cancellation on, so the app does not hear itself and howl).

It is a static site with no build step. To run it locally: `python3 -m http.server`, then open `http://localhost:8000`.

## The main screen

- **Sound:** six simple scenes – *Room Choir*, *Cloud Drift*, *Bowed Strings*, *Echo Space*, *Music Box* and *Robot Choir*. Each one uses only a couple of engines.
- **LOOP, FREEZE, NEW CHORDS, RECORD**, plus *Undo last layer* and *Clear loop*.
- **Mic, Tone, Space, Volume.**

Everything else is behind the ⚙ button.

## Under ⚙ Settings

| Part | Inspiration | What it does |
|---|---|---|
| **Listener** | Gecho | Analyses which notes it hears (chromagram) and guesses the key. |
| **Chord brain** | Marbles | Grows chord progressions. *Random ◀▶ Room* blends music-theory randomness with chords that fit what it hears. *Déjà vu* locks the progression or lets it mutate. |
| **Rings** ✦ | Mutable Instruments | The real Rings: four resonators, one per chord tone, rung by the mic (or noise). All 6 models. |
| **Clouds** ✦ | Mutable Instruments | The real Clouds in all 4 modes: granular, stretch, looping delay and spectral. |
| **Plaits** ✦ | Mutable Instruments | The real Plaits with all 24 engines and up to 4 voices: arp, chord drone or strum. |
| **Elements** ✦ | Mutable Instruments | The real Elements: bow, blow and strike exciting a resonator; the mic feeds the exciter. Runs at 32 kHz behind a resampler. |
| **Beads** ✦ | Mutable Instruments | The real Beads: the mic turned into grains (digital and clean-tape media). |
| **Warps** ✦ | Mutable Instruments | The real Warps: the mic modulates the synths or Warps' own oscillator; ring mods, folder, vocoder. Runs at 96 kHz behind 2× oversampling. |
| **Marbles** ✦ | Mutable Instruments | The real Marbles can replace the arp: gates clocked by the tempo, notes quantized to the chord. |
| **Echo chamber** | Gecho | Plays the sound back as up to 6 echoes, each with its own time, pitch/direction, tone and reverb. |
| **Gecho resonator** | Gecho | 16 resonant filters tuned to the chord, with classic, rhythmic, arpeggio and pulse modes, and bytebeat as a source. |
| **Magic song** | Gecho | A whole song – tempo, key, sounds, sections, arrangement – grown from one random number. |
| **Chord sampler** | Gecho | Sample up to 6 s and play it in the notes of the chord. |
| **Chord grains, Lizard synth** | | Lizard's own grain engine and synth voices. |
| **Effects** | | Filter, drive, ping-pong delay, plate reverb, limiter. |
| **Infinite looper** | Frippertronics | Tempo-synced, layers with a fading *Memory*, undo, half speed and reverse. |
| **Gyro and touch pad** | Gecho | Tilt or touch to steer any parameter. |
| **Save** | | Presets, sessions with loop audio, WAV recording. |

## Feedback and harsh treble

- **Phone speaker mode** turns on the phone's echo cancellation.
- **Feedback guard** (on by default) pulls the mic down hard when the output gets loud.
- **Auto level** lifts quiet rooms by at most 3× while the guard is on (6× with it off).
- **Mic clean-up:** the mic is band-limited – a high-pass at 90 Hz and a high cut at 6.5 kHz (*Mic high cut* under Input).
- **Darker defaults:** the main filter starts at 4.5 kHz.

## Structure

```
index.html            main screen + settings
style.css
js/params.js          all parameters, scenes and presets
js/engine-worklet.js  the audio engine (AudioWorklet)
js/chords.js          listener and chord brain
js/song.js            magic songs (seeded generator)
js/storage.js         presets, sessions (IndexedDB), wav export
js/main.js            UI, gyro, touch pad, wiring
js/mi.wasm            Plaits, Rings, Clouds, Elements, Beads, Warps, Marbles as WebAssembly
wasm/lizard_*.cc      C++ bridges between the engine and the MI code
wasm/build.sh         builds js/mi.wasm (clang + wasi-libc)
wasm/eurorack/        Mutable Instruments source (MIT, unmodified)
```

## The Mutable Instruments code

Plaits, Rings, Clouds, Elements, Beads, Warps and Marbles are Emilie Gillet's original code from [pichenettes/eurorack](https://github.com/pichenettes/eurorack) and [stmlib](https://github.com/pichenettes/stmlib), MIT licensed. Only the DSP parts are included, unmodified; the licence is in `wasm/eurorack/stmlib/LICENSE`. The Beads code was published with the note that it is not verified on the module.

To rebuild `js/mi.wasm` (Ubuntu 24.04):

```
sudo apt-get install clang lld wasi-libc libc++-18-dev-wasm32 libc++abi-18-dev-wasm32 libclang-rt-18-dev-wasm32
./wasm/build.sh
```

If the sound crackles on an older phone, use fewer engines at once. Elements needs the most CPU.
