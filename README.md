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
| **Resonatorbank** | Gecho, Rings | Mikrofonen (eller brus) går genom 16 resonanta filter som är stämda till ackordet. |
| **Grains** | Clouds | Korn ur de senaste 20 sekunderna. Varje korn tonhöjdsförskjuts till ackordtoner, kan gå baklänges och hoppa oktaver. Det finns också frysläge. |
| **Synth** | Plaits | Tre modeller: Karplus-Strong-strängar, detunad pad och FM-klockor. Arpeggiatorn är synkad till tempot. |
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
js/main.js            UI, gyro, kopplingar
```

## Plan framåt

- Kompilera Mutable Instruments riktiga C++-kod (MIT-licens) till WebAssembly: Plaits-motorerna, Rings-resonatorn och Clouds. Då ersätts eller kompletteras de egenskrivna versionerna.
- Fler Gecho-lägen: rytmiska filter och "magic songs".
- XY-pad, MIDI-ut och Ableton Link.
- Om latensen behöver bli lägre: bygg en native iOS-app (AUv3) med samma DSP-kärna.
