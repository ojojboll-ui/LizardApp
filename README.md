# 🦎 Lizard Loopsynth

En Gecho-inspirerad loopsynth för mobilen. Lizard lyssnar på omgivningen genom mikrofonen och gör om ljudet till ackord, granulära moln och oändliga loopar.

## Testa på iPhone

1. På GitHub: **Settings → Pages → Build and deployment**. Välj *Source: Deploy from a branch*, sedan *Branch: `main`* och mappen */ (root)*. Klicka på **Save**.
2. Efter ungefär en minut ligger appen på **https://ojojboll-ui.github.io/LizardApp/**.
3. Öppna länken i Safari. Tryck sedan på **Dela → Lägg till på hemskärmen** så startar den i helskärm som en vanlig app.
4. Använd **hörlurar**. Annars hör mikrofonen högtalaren och det blir rundgång.

Appen är en statisk webbsida och behöver inget byggsteg. För att köra lokalt: `python3 -m http.server`, öppna sedan `http://localhost:8000`.

## Vad finns med

| Del | Inspiration | Vad den gör |
|---|---|---|
| **Lyssnaren** | Gecho | Analyserar vilka toner som hörs (kromagram) och gissar tonart. |
| **Ackordhjärnan** | Marbles | Gör ackordföljder. *Slump ◀▶ Omgivning* blandar musikteori-slump med ackord som passar det som hörs. *Déjà vu* låser följden eller låter den mutera. |
| **Rings** ✦ | Mutable Instruments | Riktiga Rings. Fyra resonatorer, en per ackordton, som mikrofonen (eller brus) får ringa i. Alla 6 modeller finns: modal, sympatiska strängar, sträng, FM-röst, kvantiserade strängar och sträng + reverb. Den kan också plocka själv vid ackordbyte eller i takt med arpen. |
| **Clouds** ✦ | Mutable Instruments | Riktiga Clouds med alla 4 lägen: granulär, stretch, looping delay och spektral. Pitch kan följa ackordets grundton. Synthar och resonatorer kan skickas in i Clouds. |
| **Plaits** ✦ | Mutable Instruments | Riktiga Plaits med alla 24 motorer, upp till 4 röster. Spelsätt: arp, ackord-drone eller strum vid ackordbyte. |
| **Warps** ✦ | Mutable Instruments | Riktiga Warps där mikrofonen modulerar en bärvåg: synthar (Plaits, Lizard, sampler) eller Warps egen oscillator på ackordets grundton. Algoritmer: crossfade, wavefolder, analog och digital ringmodulering, XOR, komparator och vocoder. Körs i 96 kHz med 2× översampling, som på hårdvaran. |
| **Marbles** ✦ | Mutable Instruments | Riktiga Marbles som kan ersätta arpen. T-grindarna klockas av appens tempo i alla 7 lägen (bland annat Bernoulli, kluster, trummor och Markov). X-tonerna kvantiseras till en skala som byggs av ackordet. Déjà vu låser eller muterar slingan, och Y (långsam slump) kan styra valfri parameter. |
| **Ekorum** | Gecho | Plockar in ljudet och spelar upp det i upp till 6 ekon, vart och ett med egen tid, tonhöjd/riktning, klang och mängd eget reverb. Lägen: rytmiska ekon, rum → katedral, shimmer, baklänges och slump. *FÅNGA EKO* tar den senaste takten och låter den gå runt. |
| **Gecho-resonator** | Gecho | Egenskriven: mikrofonen (eller brus, eller bytebeat) går genom 16 resonanta filter som är stämda till ackordet. Fyra filterlägen: *Klassisk*, *Rytmisk* (en euklidisk rytm per ackordton), *Arpeggio* och *Puls*. |
| **Magisk låt** | Gecho | En hel låt växer fram ur ett slumptal från mikrofonens brus. Talet bestämmer tempo, tonart, ljudpalett, tre ackorddelar och ett arrangemang (intro, delar, outro) där olika lager tonas in och ut. Samma nummer ger alltid samma låt. |
| **Ackord-sampler** | Gecho | Sampla upp till 6 s. Samplet spelas i ackordets toner: som drone, med arpen eller vid ackordbyte. Tonhöjden kan böjas i realtid med gyro eller sensorplattan. |
| **Bytebeat** | | Sex klassiska bytebeat-formler som excitation för Gecho-filtren och Rings. |
| **Sensorplatta** | Gechos IR-sensorer | En XY-platta där fingret styr två valfria parametrar. Den kan fjädra tillbaka eller stanna kvar. |
| **Ackord-grains** | Clouds | Egenskriven: korn ur de senaste 20 sekunderna, där varje korn tonhöjdsförskjuts till en ackordton. |
| **Lizard-synth** | Plaits | Egenskriven: Karplus-Strong-strängar, pad och FM-klockor. |
| **Effekter** | | SVF-filter (LP/BP/HP), drive, ping-pong-delay med tape-wow, Dattorro-plattreverb och limiter. |
| **Infinite looper** | Frippertronics | Tempo-synkad. Startar på nästa takt. Overdub med *Minne* (1 = inget försvinner), ångra, halv fart och baklänges. |
| **Gyro** | Gecho | Lutning framåt/bakåt och åt sidan styr valfria parametrar. Skaka för nya ackord. Skärmen nedåt fryser ljudet. Gyrot kan stängas av. |
| **Spara** | | Presets (även export/import som JSON) och sessioner med loop-ljud. Inspelning till WAV, och loopen kan exporteras. |

## Struktur

```
index.html            gränssnitt (Spela / Redigera)
style.css
js/params.js          alla parametrar och inbyggda presets
js/engine-worklet.js  ljudmotorn (AudioWorklet)
js/chords.js          lyssnare och ackordhjärna
js/storage.js         presets, sessioner (IndexedDB), wav-export
js/main.js            UI, gyro, sensorplatta, kopplingar
js/song.js            magiska låtar (seedad generator)
js/mi.wasm            Plaits, Rings, Clouds, Warps, Marbles kompilerade till WebAssembly
wasm/lizard_*.cc      C++-bryggor mellan ljudmotorn och MI-koden
wasm/build.sh         bygger js/mi.wasm (clang + wasi-libc)
wasm/eurorack/        MI:s källkod (MIT-licens, oförändrad)
```

## Mutable Instruments-koden

Plaits, Rings, Clouds, Warps och Marbles är Emilie Gillets originalkod från [pichenettes/eurorack](https://github.com/pichenettes/eurorack) och [stmlib](https://github.com/pichenettes/stmlib). Den är MIT-licensierad. Endast DSP-delarna är medtagna, och de är oförändrade; licensen finns i `wasm/eurorack/stmlib/LICENSE`. Bryggan `wasm/lizard_mi.cc` anpassar modulernas blockstorlekar (Plaits 12, Rings 24, Clouds 32) till webbläsarens 128 samples. Clouds körs i 32 kHz med omsampling, precis som på hårdvaran.

För att bygga om `js/mi.wasm` (Ubuntu 24.04):

```
sudo apt-get install clang lld wasi-libc libc++-18-dev-wasm32 libc++abi-18-dev-wasm32 libclang-rt-18-dev-wasm32
./wasm/build.sh
```

Om det knastrar på en äldre telefon kan du sänka *Röster* i Plaits eller *Resonatorer* i Rings. Plaits motorer *Modal* och *Partiklar* är begränsade till 2 röster eftersom de kräver mest av processorn.

## Plan framåt

- Fler MI-moduler: Elements (modal synth) och Beads.
- XY-pad, MIDI-ut och Ableton Link.
- Om latensen behöver bli lägre: bygg en native iOS-app (AUv3) med samma DSP-kärna.
