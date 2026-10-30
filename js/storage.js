// Presets (localStorage), sessions (IndexedDB) and file export.

const PRESET_KEY = 'lizard.presets';
const CURRENT_KEY = 'lizard.current.v2'; // v2: quieter defaults, English UI

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked */ }
}

export const userPresets = () => lsGet(PRESET_KEY, {});
export function saveUserPreset(name, params) { const all = userPresets(); all[name] = params; lsSet(PRESET_KEY, all); }
export function deleteUserPreset(name) { const all = userPresets(); delete all[name]; lsSet(PRESET_KEY, all); }
export const loadCurrent = () => lsGet(CURRENT_KEY, null);
export const saveCurrent = (params) => lsSet(CURRENT_KEY, params);

// ── sessions in IndexedDB (params + chords + loop audio) ──
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('lizard', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('sessions', { keyPath: 'name' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction('sessions', mode);
    const r = fn(t.objectStore('sessions'));
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = () => reject(t.error);
  }));
}
export const saveSession = (s) => tx('readwrite', (st) => st.put(s));
export const loadSession = (name) => tx('readonly', (st) => st.get(name));
export const deleteSession = (name) => tx('readwrite', (st) => st.delete(name));
export const listSessions = () => tx('readonly', (st) => st.getAllKeys());

// ── files ──
export function encodeWav(chunksL, chunksR, sr) {
  const n = chunksL.reduce((a, c) => a + c.length, 0);
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 4, true);
  let o = 44;
  for (let c = 0; c < chunksL.length; c++) {
    const L = chunksL[c], R = chunksR[c];
    for (let i = 0; i < L.length; i++) {
      v.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true);
      v.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true);
      o += 4;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

// iOS: the share sheet lets you save to Files / send to AirDrop etc.
export async function deliverFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function stamp() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
