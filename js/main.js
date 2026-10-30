import {
  PARAMS, PARAM_BY_ID, SECTIONS, GYRO_TARGETS, PRESETS, SCENES, MINOR_SCALES, RES_MODES, WARPS_ALGOS,
  defaults, toNorm, fromNorm, formatValue,
} from './params.js';
import { Listener, ChordBrain, NOTE_NAMES } from './chords.js';
import { makeSong, seedFromSignal } from './song.js';
import * as store from './storage.js';

const $ = (sel, el = document) => el.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of kids) el.append(c);
  return el;
};

// ───────────────────────── state ─────────────────────────
const saved = store.loadCurrent();
const state = {
  params: Object.assign(defaults(), saved || {}),
  firstRun: !saved,
  micStream: null, micSrc: null,
  ctx: null, node: null, analyser: null, listener: null,
  brain: new ChordBrain(),
  chordIdx: 0,
  loopState: 'empty', canUndo: false,
  manualFreeze: false, faceDown: false,
  recording: false, recL: [], recR: [], recSr: 48000, recStart: 0,
  gyro: { a: 0, b: 0, beta0: null, gamma0: null, beta: 0, gamma: 0, lastShake: 0 },
  sent: {}, dirty: new Set(),
  pendingLoop: null,
  xy: { x: 0, y: 0 },
  mbY: 0.5, echoHolding: false,
  song: null, // { song, part, bar, saved }
  sampling: false, sampleLen: 0,
};

const ENGINE_IDS = PARAMS.filter((p) => !p.local).map((p) => p.id);
const CHORD_IDS = new Set(['keyMode', 'scale', 'color', 'progLen', 'octave']);
const PROG_LEN = [2, 3, 4, 6, 8];

// ───────────────────────── param binding ─────────────────────────
const bindings = {};
function bind(id, fn) { (bindings[id] ||= []).push(fn); fn(state.params[id]); }

let saveTimer = 0;
function setParam(id, v, opts = {}) {
  state.params[id] = v;
  for (const fn of bindings[id] || []) if (fn !== opts.src) fn(v);
  if (!PARAM_BY_ID[id].local) state.dirty.add(id);
  if (CHORD_IDS.has(id) && !opts.noRegen) regenerate();
  if (id === 'gyroOn' && v) enableGyro();
  if (id === 'headphones' && state.ctx) openMic();
  if (['gyroA', 'gyroB', 'gyroOn', 'xyX', 'xyY', 'mbYTarget', 'arpSource'].includes(id)) markAllTargetsDirty();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.saveCurrent(state.params), 400);
}

function applyParams(obj) {
  for (const [k, v] of Object.entries(obj)) if (k in PARAM_BY_ID) setParam(k, v, { noRegen: true });
  regenerate();
}

function markAllTargetsDirty() { for (const t of GYRO_TARGETS) if (t !== 'none') state.dirty.add(t); }

// Effective value = base value pushed around by gyro tilt and the sensor pad
// (in normalised space)
function effective(id) {
  const p = PARAM_BY_ID[id];
  let v = state.params[id];
  const P = state.params;
  if (p.kind !== 'range') return v;
  let n = toNorm(p, v), mod = false;
  if (P.gyroOn && GYRO_TARGETS[P.gyroA] === id) { n += P.gyroAAmt * state.gyro.a * 0.5; mod = true; }
  if (P.gyroOn && GYRO_TARGETS[P.gyroB] === id) { n += P.gyroBAmt * state.gyro.b * 0.5; mod = true; }
  if (GYRO_TARGETS[P.xyX] === id) { n += P.xyXAmt * state.xy.x * 0.5; mod = true; }
  if (GYRO_TARGETS[P.xyY] === id) { n += P.xyYAmt * state.xy.y * 0.5; mod = true; }
  if (P.arpSource === 1 && GYRO_TARGETS[P.mbYTarget] === id) { n += P.mbYAmt * (state.mbY - 0.5); mod = true; }
  return mod ? fromNorm(p, n) : v;
}

function flushParams() {
  if (!state.node) return;
  const values = {};
  let any = false;
  for (const id of state.dirty) {
    if (PARAM_BY_ID[id].local) continue;
    const v = effective(id);
    if (state.sent[id] !== v) { values[id] = v; state.sent[id] = v; any = true; }
  }
  state.dirty.clear();
  if (any) state.node.port.postMessage({ type: 'params', values });
}

// ───────────────────────── chords ─────────────────────────
function sendChords(reset = false) {
  if (!state.node || !state.brain.prog.length) return;
  state.node.port.postMessage({
    type: 'chords', chords: state.brain.prog.map((c) => c.midis), keyRoot: state.brain.ctx.root,
    rootPcs: state.brain.prog.map((c) => c.rootPc), reset,
  });
  if (reset) state.chordIdx = 0;
  renderChords();
}

function regenerate() {
  if (state.song) return; // the magic song owns the chords while it plays
  state.brain.generate(state.params, state.listener, PROG_LEN[state.params.progLen] || 4);
  sendChords();
}

function onChord(index) {
  state.chordIdx = index;
  const n = state.brain.prog.length;
  // rewrite the chord that just finished (it plays again next cycle)
  if (!state.song && state.brain.mutate((index - 1 + n) % n, state.params, state.listener)) sendChords();
  else renderChords();
}

function renderChords() {
  const strip = $('#chords');
  strip.replaceChildren(...state.brain.prog.map((c, i) => h('div', { class: 'chord' + (i === state.chordIdx ? ' on' : '') }, c.name)));
  const ctx = state.brain.ctx;
  if (ctx) {
    const minorish = MINOR_SCALES.includes(ctx.scaleName);
    $('#key').textContent = `${NOTE_NAMES[ctx.root]} ${ctx.scaleName.toLowerCase()}${ctx.auto ? ' · listening' : ''}`;
    $('#key').classList.toggle('minor', minorish);
  }
}

// ───────────────────────── audio start ─────────────────────────
async function start(headphones) {
  const overlay = $('#start');
  overlay.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  $('#startMsg').textContent = 'Starting…';
  setParam('headphones', headphones);
  // iOS only grants motion access and starts audio from inside the tap itself
  if (state.params.gyroOn) enableGyro();
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    state.ctx = ctx;
    ctx.resume();
    await ctx.audioWorklet.addModule('js/engine-worklet.js?v=7');
    const node = new AudioWorkletNode(ctx, 'lizard-engine', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    state.node = node;
    node.port.onmessage = (e) => onEngine(e.data);
    node.connect(ctx.destination);
    loadMI(node);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0;
    state.analyser = analyser;
    state.listener = new Listener(analyser);

    const micOk = await openMic();
    await ctx.resume();

    if (state.firstRun) applyScene(0, true);
    for (const id of ENGINE_IDS) state.dirty.add(id);
    flushParams();
    regenerate();
    requestWakeLock();
    overlay.hidden = true;
    if (!micOk) toast('No microphone. Allow it in Safari settings.');
    tick();
    setInterval(listen, 100);
  } catch (err) {
    console.error(err);
    $('#startMsg').textContent = 'Could not start audio: ' + err.message;
    overlay.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  }
}

// On the phone speaker the mic hears the app itself, so echo cancellation is
// what keeps it from howling; with headphones it can stay off for full sound.
async function openMic() {
  const hp = !!state.params.headphones;
  try {
    state.micSrc?.disconnect();
    state.micStream?.getTracks().forEach((t) => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: !hp, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    const src = state.ctx.createMediaStreamSource(stream);
    src.connect(state.node);
    src.connect(state.analyser);
    state.micStream = stream; state.micSrc = src;
    return true;
  } catch (err) {
    console.warn('mic', err);
    return false;
  }
}

// The Mutable Instruments engines are compiled to WebAssembly; the worklet
// instantiates them itself. Until (or unless) they load, the Lizard engines play.
async function loadMI(node) {
  try {
    const bytes = await (await fetch('js/mi.wasm?v=5')).arrayBuffer();
    node.port.postMessage({ type: 'wasm', bytes }, [bytes]);
  } catch (err) {
    toast('Could not load the Mutable Instruments engines');
  }
}

let wakeLock = null;
async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not supported */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.ctx) return;
  requestWakeLock();
  if (state.ctx.state !== 'running') $('#resume').hidden = false;
});
$('#resume').addEventListener('click', async () => { await state.ctx.resume(); $('#resume').hidden = true; });

// ───────────────────────── engine messages ─────────────────────────
function onEngine(m) {
  switch (m.type) {
    case 'beat': {
      const b = m.beat % 4;
      document.querySelectorAll('.beat').forEach((el, i) => el.classList.toggle('on', i === b));
      if (b === 0) songBar();
      break;
    }
    case 'echoState':
      state.echoHolding = m.holding;
      $('#btnEcho').classList.toggle('active', m.holding);
      $('#btnEcho').querySelector('small').textContent = m.holding ? 'looping it · tap = release' : 'into the echo chamber';
      break;
    case 'samplerState':
      state.sampling = m.rec; state.sampleLen = m.len;
      renderSampler();
      break;
    case 'chord': onChord(m.index); break;
    case 'mi':
      if (!m.ok) { console.warn(m.error); toast('Mutable Instruments engines failed: ' + m.error); }
      break;
    case 'meter':
      $('#inMeter').style.transform = `scaleX(${Math.min(1, Math.sqrt(m.inRms) * 2.2)})`;
      $('#outMeter').style.transform = `scaleX(${Math.min(1, m.outPeak)})`;
      $('#loopBar').style.transform = `scaleX(${m.loopPos})`;
      if (m.loopState !== state.loopState) { state.loopState = m.loopState; renderLoop(); }
      if (m.mbY != null) state.mbY = m.mbY;
      break;
    case 'loopState': state.loopState = m.state; state.canUndo = m.canUndo; renderLoop(); break;
    case 'rec':
      state.recL.push(m.L); state.recR.push(m.R); state.recSr = m.sr;
      if (m.final) finishRecording();
      break;
    case 'loopData': if (state.pendingLoop) { state.pendingLoop(m); state.pendingLoop = null; } break;
  }
}

// ───────────────────────── listening + gyro loop ─────────────────────────
let lastListen = performance.now();
function listen() {
  const now = performance.now();
  const dt = (now - lastListen) / 1000;
  lastListen = now;
  if (!state.listener) return;
  const before = state.listener.key;
  state.listener.update(dt, state.params.listenMem);
  if (state.listener.key !== before && state.params.keyMode === 0) renderChords();
}

function tick() {
  drawChroma();
  const P = state.params;
  for (const sel of [P.xyX, P.xyY, P.mbYTarget]) if (GYRO_TARGETS[sel] !== 'none') state.dirty.add(GYRO_TARGETS[sel]);
  if (state.params.gyroOn) {
    for (const sel of [P.gyroA, P.gyroB]) if (GYRO_TARGETS[sel] !== 'none') state.dirty.add(GYRO_TARGETS[sel]);
    const dot = $('#gyroDot');
    dot.style.transform = `translate(${state.gyro.b * 22}px, ${state.gyro.a * 22}px)`;
  }
  flushParams();
  requestAnimationFrame(tick);
}

let colors = null;
function drawChroma() {
  if ($('#settings').hidden) return;
  const cv = $('#chroma');
  const g = cv.getContext('2d');
  const w = cv.width, ht = cv.height;
  g.clearRect(0, 0, w, ht);
  if (!state.listener) return;
  const ch = state.listener.chroma;
  const mx = Math.max(0.0001, ...ch);
  const bw = w / 12;
  const root = state.brain.ctx ? state.brain.ctx.root : -1;
  const css = colors ||= getComputedStyle(document.documentElement);
  for (let i = 0; i < 12; i++) {
    const v = ch[i] / mx;
    g.fillStyle = (i === root ? css.getPropertyValue('--accent') : css.getPropertyValue('--bar')).trim();
    g.fillRect(i * bw + 2, ht - 14 - v * (ht - 18), bw - 4, v * (ht - 18));
    g.fillStyle = css.getPropertyValue('--muted').trim();
    g.font = `${10 * devicePixelRatio}px system-ui`;
    g.textAlign = 'center';
    g.fillText(NOTE_NAMES[i], i * bw + bw / 2, ht - 2);
  }
}

// ───────────────────────── gyro ─────────────────────────
let gyroListening = false;
async function enableGyro() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') throw new Error('denied');
    }
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
      await DeviceMotionEvent.requestPermission().catch(() => {});
    }
  } catch {
    toast('The gyro needs permission. Tap Gyro again.');
    setParam('gyroOn', false);
    return;
  }
  if (gyroListening) return;
  gyroListening = true;
  window.addEventListener('deviceorientation', onOrientation);
  window.addEventListener('devicemotion', onMotion);
}

function onOrientation(e) {
  if (e.beta == null) return;
  const G = state.gyro, P = state.params;
  if (G.beta0 == null) { G.beta0 = e.beta; G.gamma0 = e.gamma; }
  G.beta = e.beta; G.gamma = e.gamma;
  const r = P.gyroRange;
  const ta = Math.max(-1, Math.min(1, -(e.beta - G.beta0) / r));
  const tb = Math.max(-1, Math.min(1, (e.gamma - G.gamma0) / r));
  G.a += (ta - G.a) * 0.3;
  G.b += (tb - G.b) * 0.3;
  const down = P.gyroOn && P.faceFreeze && Math.abs(e.beta) > 155;
  if (down !== state.faceDown) { state.faceDown = down; sendFreeze(); }
}

function onMotion(e) {
  const P = state.params;
  if (!P.gyroOn || !P.shakeNew) return;
  const a = e.acceleration;
  if (!a || a.x == null) return;
  const mag = Math.hypot(a.x, a.y, a.z);
  const now = performance.now();
  if (mag > 17 && now - state.gyro.lastShake > 1500) {
    state.gyro.lastShake = now;
    regenerate();
    flash('#btnNew');
  }
}

function calibrate() { state.gyro.beta0 = state.gyro.beta; state.gyro.gamma0 = state.gyro.gamma; toast('Gyro recentered'); }

// ───────────────────────── transport-ish actions ─────────────────────────
function sendFreeze() {
  const on = state.manualFreeze || state.faceDown;
  state.node?.port.postMessage({ type: 'freeze', on });
  $('#btnFreeze').classList.toggle('active', on);
}

function renderLoop() {
  const b = $('#btnLoop');
  const label = { empty: 'LOOP', armed: 'WAITING…', dub: 'RECORDING', play: 'PLAYING' }[state.loopState];
  b.querySelector('b').textContent = label;
  b.dataset.state = state.loopState;
  b.querySelector('small').textContent = { empty: 'starts on the next bar', armed: 'tap to cancel', dub: 'tap = stop layering', play: 'tap = add a layer' }[state.loopState];
  $('#btnUndo').disabled = !state.canUndo;
}

function toggleRecording() {
  if (!state.node) return;
  if (!state.recording) {
    state.recording = true; state.recL = []; state.recR = []; state.recStart = performance.now();
    state.node.port.postMessage({ type: 'record', on: true });
    $('#btnRec').classList.add('active');
    $('#btnRec').querySelector('b').textContent = 'STOP';
    recTimer();
  } else {
    state.node.port.postMessage({ type: 'record', on: false });
  }
}
function recTimer() {
  if (!state.recording) return;
  const s = Math.floor((performance.now() - state.recStart) / 1000);
  $('#btnRec').querySelector('small').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  setTimeout(recTimer, 500);
}
async function finishRecording() {
  state.recording = false;
  $('#btnRec').classList.remove('active');
  $('#btnRec').querySelector('b').textContent = 'RECORD';
  $('#btnRec').querySelector('small').textContent = 'to a wav file';
  const blob = store.encodeWav(state.recL, state.recR, state.recSr);
  state.recL = []; state.recR = [];
  offerFile(blob, `lizard-${store.stamp()}.wav`);
}

// Sharing needs a fresh tap on iOS, so files made asynchronously are offered
// through a small bar with its own button.
function offerFile(blob, name) {
  const bar = $('#fileOffer');
  $('#fileName').textContent = `${name} (${(blob.size / 1e6).toFixed(1)} MB)`;
  bar.hidden = false;
  $('#fileSave').onclick = () => store.deliverFile(blob, name);
  $('#fileClose').onclick = () => { bar.hidden = true; };
}

function requestLoop() {
  return new Promise((resolve) => {
    state.pendingLoop = resolve;
    state.node.port.postMessage({ type: 'getLoop' });
  });
}

// ───────────────────────── Gecho: magic songs ─────────────────────────
function startSong(seed) {
  if (!state.node) return;
  if (state.song) stopSong(false);
  const song = makeSong(seed, state.brain);
  state.song = { song, part: -1, bar: 0, saved: { ...state.params } };
  for (const [k, v] of Object.entries(song.global)) setParam(k, v, { noRegen: true });
  renderSong(); // the first part starts on the next downbeat (songBar)
  toast(song.title);
}

function stopSong(restore = true) {
  if (!state.song) return;
  const saved = state.song.saved;
  state.song = null;
  if (restore) applyParams(saved);
  renderSong();
}

function enterPart(i) {
  const S = state.song;
  S.part = i % S.song.parts.length;
  S.bar = 0;
  const part = S.song.parts[S.part];
  for (const [k, v] of Object.entries(part.params)) setParam(k, v, { noRegen: true });
  state.brain.prog = part.prog.map((c) => ({ ...c, midis: [...c.midis] }));
  state.brain.ctx = S.song.ctx;
  sendChords(true);
  renderSong();
}

// called on every downbeat
function songBar() {
  const S = state.song;
  if (!S) return;
  if (S.part < 0) { enterPart(0); return; }
  S.bar++;
  if (S.bar >= S.song.parts[S.part].bars) enterPart(S.part + 1);
  else renderSong();
}

function renderSong() {
  const el = $('#songInfo');
  const btn = $('#btnSong');
  const S = state.song;
  el.hidden = !S;
  btn.classList.toggle('active', !!S);
  btn.querySelector('small').textContent = S ? 'tap = stop' : 'from randomness';
  if (!S) return;
  if (S.part < 0) { el.replaceChildren(h('b', {}, S.song.title), h('span', {}, 'starts on the next bar…')); return; }
  const part = S.song.parts[S.part];
  el.replaceChildren(
    h('b', {}, S.song.title),
    h('span', {}, `${part.name} · bar ${Math.min(S.bar + 1, part.bars)}/${part.bars} · section ${S.part + 1}/${S.song.parts.length}`),
  );
}

// ───────────────────────── Gecho: chord sampler ─────────────────────────
function toggleSampling() {
  if (!state.node) return;
  if (!state.sampling) {
    state.node.port.postMessage({ type: 'sampler', action: 'rec' });
    state.sampling = true;
  } else {
    // the sample's pitch = strongest pitch class the listener hears
    const ch = state.listener ? state.listener.chroma : [1];
    const root = ch.indexOf(Math.max(...ch));
    state.node.port.postMessage({ type: 'sampler', action: 'stop', root });
    if (state.params.smpLevel < 0.05) setParam('smpLevel', 0.7);
  }
  renderSampler();
}

function renderSampler() {
  const b = $('#btnSample');
  b.classList.toggle('rec', state.sampling);
  b.classList.toggle('active', state.sampling);
  b.querySelector('b').textContent = state.sampling ? 'STOP' : 'SAMPLE';
  b.querySelector('small').textContent = state.sampling ? 'recording (max 6 s)'
    : state.sampleLen ? `${state.sampleLen.toFixed(1)} s in the chord` : 'sound → chord';
}

// ───────────────────────── sensor pad ─────────────────────────
function buildXY() {
  const pad = $('#xyPad'), dot = $('#xyDot');
  const show = () => {
    dot.style.left = `${(state.xy.x + 1) * 50}%`;
    dot.style.top = `${(1 - state.xy.y) * 50}%`;
  };
  const move = (e) => {
    const r = pad.getBoundingClientRect();
    state.xy.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    state.xy.y = Math.max(-1, Math.min(1, 1 - ((e.clientY - r.top) / r.height) * 2));
    show();
  };
  pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); pad.classList.add('touch'); move(e); });
  pad.addEventListener('pointermove', (e) => { if (pad.hasPointerCapture(e.pointerId)) move(e); });
  const up = () => {
    pad.classList.remove('touch');
    if (!state.params.xyHold) { state.xy.x = 0; state.xy.y = 0; show(); }
  };
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);
  const label = () => {
    const name = (sel) => (GYRO_TARGETS[sel] === 'none' ? '–' : PARAM_BY_ID.xyX.options[sel]);
    $('#xyLabel').textContent = `↔ ${name(state.params.xyX)}   ↕ ${name(state.params.xyY)}`;
  };
  bind('xyX', label); bind('xyY', label);
  show();
}

// ───────────────────────── UI building ─────────────────────────
function rangeControl(id, opts = {}) {
  const p = PARAM_BY_ID[id];
  const val = h('span', { class: 'val' });
  const input = h('input', { type: 'range', min: 0, max: 1, step: 0.001 });
  const row = h('label', { class: 'ctl range' + (opts.big ? ' big' : '') }, h('span', { class: 'lbl' }, opts.label || p.label), val, input);
  const update = (v) => { input.value = toNorm(p, v); val.textContent = formatValue(p, v); };
  input.addEventListener('input', () => {
    const v = fromNorm(p, parseFloat(input.value));
    val.textContent = formatValue(p, v);
    setParam(id, v, { src: update });
  });
  bind(id, update);
  return row;
}

function selectControl(id, label) {
  const p = PARAM_BY_ID[id];
  const sel = h('select', {}, ...p.options.map((o, i) => h('option', { value: i }, o)));
  const update = (v) => { sel.value = v; };
  sel.addEventListener('change', () => setParam(id, parseInt(sel.value, 10), { src: update }));
  bind(id, update);
  return h('label', { class: 'ctl select' }, h('span', { class: 'lbl' }, label || p.label), sel);
}

function boolControl(id) {
  const p = PARAM_BY_ID[id];
  const btn = h('button', { class: 'toggle', type: 'button' });
  const update = (v) => { btn.classList.toggle('active', !!v); btn.textContent = v ? 'On' : 'Off'; };
  btn.addEventListener('click', () => setParam(id, !state.params[id]));
  bind(id, update);
  return h('div', { class: 'ctl bool' }, h('span', { class: 'lbl' }, p.label), btn);
}

function control(id) {
  const p = PARAM_BY_ID[id];
  if (p.kind === 'select') return selectControl(id);
  if (p.kind === 'bool') return boolControl(id);
  return rangeControl(id);
}

// ───────────────────────── main screen ─────────────────────────
// A scene resets everything to the quiet defaults and then applies its own
// few settings, keeping what belongs to the player (mic, volume, gyro…).
const KEEP_ON_SCENE = ['inGain', 'master', 'agc', 'fbGuard', 'inTone'];
function applyScene(i, silent = false) {
  const scene = SCENES[i];
  if (!scene) return;
  if (state.song) stopSong(false);
  const keep = Object.fromEntries(PARAMS.filter((p) => p.local || KEEP_ON_SCENE.includes(p.id)).map((p) => [p.id, state.params[p.id]]));
  applyParams(Object.assign(defaults(), keep, scene.params, { scene: i }));
  if (!silent) toast(scene.name);
}

function buildMain() {
  const grid = $('#scenes');
  const cards = SCENES.map((sc, i) => h('button', { class: 'scene', type: 'button', onclick: () => applyScene(i) },
    h('b', {}, sc.name), h('small', {}, sc.blurb)));
  grid.replaceChildren(...cards);
  bind('scene', (v) => cards.forEach((c, i) => c.classList.toggle('on', i === v)));

  const simple = $('#simpleControls');
  simple.append(
    rangeControl('inGain', { label: 'Mic', big: true }),
    rangeControl('fltCutoff', { label: 'Tone (dark ◀▶ bright)', big: true }),
    rangeControl('rvbMix', { label: 'Space', big: true }),
    rangeControl('master', { label: 'Volume', big: true }),
  );

  $('#btnLoop').addEventListener('click', () => state.node?.port.postMessage({ type: 'loop', action: 'rec' }));
  $('#btnUndo').addEventListener('click', () => state.node?.port.postMessage({ type: 'loop', action: 'undo' }));
  $('#btnClear').addEventListener('click', () => state.node?.port.postMessage({ type: 'loop', action: 'clear' }));
  $('#btnFreeze').addEventListener('click', () => { state.manualFreeze = !state.manualFreeze; sendFreeze(); });
  $('#btnNew').addEventListener('click', () => { regenerate(); flash('#btnNew'); });
  $('#btnRec').addEventListener('click', toggleRecording);
  bind('bpm', (v) => { $('#bpm').textContent = Math.round(v) + ' bpm'; });
  renderLoop();
}

function buildAdvanced() {
  const macros = $('#macros');
  macros.append(selectControl('rgModel', 'Rings model'), selectControl('clMode', 'Clouds mode'), selectControl('plEngine', 'Plaits engine'),
    selectControl('wpAlgo', 'Warps algorithm'), selectControl('ecMode', 'Echo mode'), selectControl('mbModel', 'Marbles T mode'));
  for (const [id, label] of [['rgLevel', 'Rings'], ['clLevel', 'Clouds'], ['plLevel', 'Plaits'], ['wpLevel', 'Warps'],
    ['ecLevel', 'Echo chamber'], ['elLevel', 'Elements'], ['bdLevel', 'Beads'], ['resLevel', 'Gecho resonator'],
    ['grLevel', 'Chord grains'], ['synLevel', 'Lizard synth'], ['smpLevel', 'Sampler'], ['loopLevel', 'Loop'], ['dlyMix', 'Delay'],
    ['ambient', 'Random ◀▶ Room'], ['clPos', 'Clouds position'], ['plTimbre', 'Plaits timbre'],
    ['elGeometry', 'Elements geometry'], ['bdTime', 'Beads time'], ['wpTimbre', 'Warps timbre'], ['mbDejaVu', 'Marbles déjà vu'], ['ecFb', 'Echo feedback']]) {
    macros.append(rangeControl(id, { label, big: true }));
  }
  $('#btnSample').addEventListener('click', toggleSampling);
  $('#btnSong').addEventListener('click', () => (state.song ? stopSong() : startSong(seedFromSignal(state.analyser))));
  $('#btnEcho').addEventListener('click', () => {
    if (!state.node) return;
    if (!state.echoHolding && state.params.ecLevel < 0.05) setParam('ecLevel', 0.75);
    state.node.port.postMessage({ type: 'echo', action: state.echoHolding ? 'release' : 'capture' });
  });
  $('#btnMarbles').addEventListener('click', () => setParam('arpSource', state.params.arpSource ? 0 : 1));
  bind('arpSource', (v) => {
    $('#btnMarbles').classList.toggle('active', !!v);
    $('#btnMarbles').querySelector('small').textContent = v ? 'playing · tap = off' : 'random in time';
  });
  // Warps: tap = on/off, hold = next algorithm
  const warps = $('#btnWarps');
  let holdTimer = 0, held = false;
  warps.addEventListener('pointerdown', () => {
    held = false;
    holdTimer = setTimeout(() => {
      held = true;
      setParam('wpAlgo', (state.params.wpAlgo + 1) % WARPS_ALGOS.length);
      if (state.params.wpLevel < 0.05) setParam('wpLevel', 0.75);
      flash('#btnWarps');
    }, 450);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) warps.addEventListener(ev, () => clearTimeout(holdTimer));
  warps.addEventListener('contextmenu', (e) => e.preventDefault());
  warps.addEventListener('click', () => {
    if (held) return;
    setParam('wpLevel', state.params.wpLevel > 0.04 ? 0 : 0.75);
  });
  const warpsLabel = () => {
    const on = state.params.wpLevel > 0.04;
    warps.classList.toggle('active', on);
    warps.querySelector('small').textContent = `${on ? WARPS_ALGOS[state.params.wpAlgo] : 'off'} · hold = next`;
  };
  bind('wpAlgo', warpsLabel);
  bind('wpLevel', warpsLabel);
  const toggleLevel = (id, on = 0.75) => setParam(id, state.params[id] > 0.04 ? 0 : on);
  $('#btnElements').addEventListener('click', () => toggleLevel('elLevel'));
  $('#btnBeads').addEventListener('click', () => toggleLevel('bdLevel', 0.8));
  $('#btnSeed').addEventListener('click', () => {
    if (state.params.bdLevel < 0.04) setParam('bdLevel', 0.8);
    state.node?.port.postMessage({ type: 'beadsSeed' });
    flash('#btnSeed');
  });
  bind('elLevel', (v) => $('#btnElements').classList.toggle('active', v > 0.04));
  bind('bdLevel', (v) => $('#btnBeads').classList.toggle('active', v > 0.04));
  $('#btnMode').addEventListener('click', () => setParam('resMode', (state.params.resMode + 1) % RES_MODES.length));
  bind('resMode', (v) => { $('#btnMode').querySelector('small').textContent = RES_MODES[v]; });
  buildXY();
  renderSampler();
  $('#btnGyro').addEventListener('click', () => setParam('gyroOn', !state.params.gyroOn));
  $('#btnCal').addEventListener('click', calibrate);
  bind('gyroOn', (v) => {
    $('#btnGyro').classList.toggle('active', !!v);
    $('#btnGyro').textContent = v ? 'Gyro: ON' : 'Gyro: OFF';
    $('#gyroPad').classList.toggle('off', !v);
  });
}

function buildEdit() {
  const root = $('#sections');
  root.append(buildLibrary());
  for (const s of SECTIONS) {
    const ids = PARAMS.filter((p) => p.section === s.id).map((p) => p.id);
    const body = h('div', { class: 'body' }, ...ids.map(control));
    if (s.id === 'gyro') body.append(h('button', { class: 'wide', type: 'button', onclick: calibrate }, 'Recenter the gyro (current position = middle)'));
    if (s.id === 'tempo') body.append(tapTempo());
    if (s.id === 'sampler') {
      body.prepend(h('p', { class: 'note' }, 'Sample a sound (the SAMPLE pad under Performance). It then plays in the notes of the chord, and Pitch can be bent in real time with the gyro or the touch pad.'));
      body.append(h('div', { class: 'btnrow' },
        h('button', { type: 'button', onclick: toggleSampling }, 'Sample / stop'),
        h('button', { type: 'button', onclick: () => state.node?.port.postMessage({ type: 'sampler', action: 'clear' }) }, 'Clear the sample')));
    }
    if (s.id === 'input') body.prepend(h('p', { class: 'note' }, 'Howling or ringing? Use headphones, or keep Headphones off so the phone cancels its own sound, and keep the Feedback guard on.'));
    if (s.id === 'marbles') body.prepend(h('p', { class: 'note' }, 'When Marbles plays it replaces the arp: T1 plays Plaits and the Lizard synth, T2 strikes the Gecho filters and Rings (Pluck with the arp), T3 plays the sampler. X notes are quantized to the chord; X steps sets how strictly.'));
    if (s.id === 'elements') body.prepend(h('p', { class: 'note' }, 'A modal instrument: bow, blow and strike excite a resonator. The mic feeds the exciter, so the room can make it sound. Elements needs a lot of CPU; turn it off if the sound crackles.'));
    if (s.id === 'beads') body.prepend(h('p', { class: 'note' }, 'The successor to Clouds. The mic is recorded continuously and turned into grains. Size at maximum gives delay mode. FREEZE also freezes Beads, and the SEED pad fires a grain by hand.'));
    if (s.id === 'warps') body.prepend(h('p', { class: 'note' }, 'The mic modulates the carrier. Try Vocoder with Plaits as a chord drone, then talk or sing.'));
    if (s.id === 'echo') body.prepend(h('p', { class: 'note' }, 'Takes in the sound and plays it back as several echoes, each with its own time, pitch, tone and space. CAPTURE ECHO grabs the last bar and keeps it circling in the chamber.'));
    if (s.id === 'song') {
      body.append(
        h('p', { class: 'note' }, 'A whole song grows from one random number taken from the mic noise: tempo, key, sounds, chord sections and arrangement. The same number always gives the same song.'),
        h('div', { class: 'btnrow' },
          h('button', { type: 'button', onclick: () => startSong(seedFromSignal(state.analyser)) }, 'New magic song'),
          h('button', {
            type: 'button', onclick: () => {
              const v = prompt('Song number (0–999999):', state.song ? state.song.song.seed : '');
              if (v != null && /^\d{1,6}$/.test(v.trim())) startSong(parseInt(v, 10));
            },
          }, 'Play number…'),
          h('button', { type: 'button', onclick: () => stopSong() }, 'Stop')),
      );
    }
    root.append(h('details', { class: 'section' }, h('summary', {}, s.label), body));
  }
}

function tapTempo() {
  let taps = [];
  return h('button', {
    class: 'wide', type: 'button', onclick: () => {
      const now = performance.now();
      taps = taps.filter((t) => now - t < 2500);
      taps.push(now);
      if (taps.length >= 3) {
        const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
        setParam('bpm', Math.max(40, Math.min(200, Math.round(60000 / iv))));
      }
    },
  }, 'Tap tempo');
}

function buildLibrary() {
  const presetSel = h('select', {});
  const sessionSel = h('select', {});
  const refresh = async () => {
    const user = store.userPresets();
    presetSel.replaceChildren(
      h('optgroup', { label: 'Built-in' }, ...Object.keys(PRESETS).map((n) => h('option', { value: 'b:' + n }, n))),
      h('optgroup', { label: 'Mine' }, ...Object.keys(user).map((n) => h('option', { value: 'u:' + n }, n))),
    );
    let names = [];
    try { names = await store.listSessions(); } catch { /* IndexedDB blocked */ }
    sessionSel.replaceChildren(...(names.length ? names.map((n) => h('option', { value: n }, n)) : [h('option', { value: '' }, '(none saved)')]));
  };
  const loadPreset = () => {
    const [kind, name] = [presetSel.value.slice(0, 1), presetSel.value.slice(2)];
    const src = kind === 'b' ? PRESETS[name] : store.userPresets()[name];
    if (!src) return;
    // built-ins are partial: start from defaults so presets sound the same every time
    const keepGyro = Object.fromEntries(PARAMS.filter((p) => p.local).map((p) => [p.id, state.params[p.id]]));
    applyParams(Object.assign(defaults(), src, kind === 'b' ? keepGyro : {}));
    toast(`Loaded “${name}”`);
  };
  const savePreset = () => {
    const name = prompt('Preset name:');
    if (!name) return;
    store.saveUserPreset(name, { ...state.params });
    refresh(); toast('Preset saved');
  };
  const deletePreset = () => {
    if (!presetSel.value.startsWith('u:')) return toast('Built-in presets cannot be deleted');
    const name = presetSel.value.slice(2);
    if (!confirm(`Delete “${name}”?`)) return;
    store.deleteUserPreset(name); refresh();
  };
  const exportPreset = () => {
    const blob = new Blob([JSON.stringify({ lizard: 1, params: state.params }, null, 2)], { type: 'application/json' });
    store.deliverFile(blob, `lizard-preset-${store.stamp()}.json`);
  };
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: '' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      applyParams(Object.assign(defaults(), j.params || j));
      toast('Preset imported');
    } catch { toast('Could not read the file'); }
    fileIn.value = '';
  });

  const saveSess = async () => {
    if (!state.node) return;
    const name = prompt('Session name:', `Session ${store.stamp()}`);
    if (!name) return;
    const loop = await requestLoop();
    await store.saveSession({ name, date: Date.now(), params: { ...state.params }, prog: state.brain.prog, ctx: state.brain.ctx, loop });
    refresh(); toast('Session saved (settings + loop)');
  };
  const loadSess = async () => {
    const name = sessionSel.value;
    if (!name || !state.node) return;
    const s = await store.loadSession(name);
    if (!s) return;
    for (const [k, v] of Object.entries(s.params)) if (k in PARAM_BY_ID) setParam(k, v, { noRegen: true });
    if (s.prog?.length) { state.brain.prog = s.prog; state.brain.ctx = s.ctx; sendChords(); } else regenerate();
    if (s.loop?.L?.length) state.node.port.postMessage({ type: 'setLoop', L: s.loop.L, R: s.loop.R });
    toast(`Loaded “${name}”`);
  };
  const delSess = async () => {
    const name = sessionSel.value;
    if (!name || !confirm(`Delete the session “${name}”?`)) return;
    await store.deleteSession(name); refresh();
  };
  const exportLoop = async () => {
    if (!state.node) return;
    const l = await requestLoop();
    if (!l.L.length) return toast('The loop is empty');
    offerFile(store.encodeWav([l.L], [l.R], l.sr), `lizard-loop-${store.stamp()}.wav`);
  };

  refresh();
  const btn = (label, fn) => h('button', { type: 'button', onclick: fn }, label);
  return h('details', { class: 'section' }, h('summary', {}, 'Presets & sessions'), h('div', { class: 'body' },
    h('label', { class: 'ctl select' }, h('span', { class: 'lbl' }, 'Preset'), presetSel),
    h('div', { class: 'btnrow' }, btn('Load', loadPreset), btn('Save as…', savePreset), btn('Delete', deletePreset)),
    h('div', { class: 'btnrow' }, btn('Export', exportPreset), btn('Import', () => fileIn.click()), fileIn),
    h('label', { class: 'ctl select' }, h('span', { class: 'lbl' }, 'Session'), sessionSel),
    h('div', { class: 'btnrow' }, btn('Load', loadSess), btn('Save…', saveSess), btn('Delete', delSess)),
    h('div', { class: 'btnrow' }, btn('Export the loop as wav', exportLoop)),
    h('div', { class: 'btnrow' }, btn('Reset everything', () => { if (confirm('Reset all settings?')) applyScene(0); })),
  ));
}

function showView(id) {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== id; });
  $('#btnSettings').classList.toggle('active', id === 'settings');
  window.scrollTo(0, 0);
  if (id === 'settings') sizeCanvas();
}
function buildNav() {
  $('#btnSettings').addEventListener('click', () => showView($('#settings').hidden ? 'settings' : 'play'));
  $('#btnBack').addEventListener('click', () => showView('play'));
}

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function flash(sel) {
  const el = $(sel);
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 300);
}

function sizeCanvas() {
  const cv = $('#chroma');
  cv.width = cv.clientWidth * devicePixelRatio;
  cv.height = cv.clientHeight * devicePixelRatio;
}

buildNav();
buildMain();
buildAdvanced();
buildEdit();
addEventListener('resize', sizeCanvas);
document.querySelectorAll('#start button').forEach((b) => b.addEventListener('click', () => start(b.dataset.headphones === '1')));
