// Bridge between the Lizard AudioWorklet and Mutable Instruments' DSP code
// (Plaits, Rings, Clouds — MIT licensed, by Emilie Gillet).
//
// The worklet renders 128-frame quanta; the MI engines work in their own
// fixed block sizes (Plaits 12, Rings 24, Clouds 32 @ 32 kHz), so every engine
// sits behind a small FIFO. All buffers are static and exported to JS.

#include <algorithm>
#include <cmath>
#include <cstring>

#include "plaits/dsp/voice.h"
#include "rings/dsp/part.h"
#include "clouds/dsp/granular_processor.h"

namespace {

const int kMaxFrames = 256;
const int kPlaitsVoices = 4;
const int kRingsParts = 4;

// ───────────────────────── Plaits ─────────────────────────
struct PlaitsVoice {
  plaits::Voice voice;
  plaits::Patch patch;
  plaits::Modulations mod;
  char shared_buffer[16384];
  plaits::Voice::Frame block[plaits::kBlockSize];
  float fifo_out[plaits::kBlockSize];
  float fifo_aux[plaits::kBlockSize];
  int fifo_pos;  // next unread sample in the fifo
  int gate_blocks;
  float pan_l, pan_r;
};

PlaitsVoice plaits_voices[kPlaitsVoices];
bool plaits_drone = false;
int plaits_active = 4;
float plaits_aux_mix = 0.0f;

// ───────────────────────── Rings ─────────────────────────
struct RingsVoice {
  rings::Part part;
  rings::PerformanceState state;
  uint16_t reverb_buffer[32768];
  float in[rings::kMaxBlockSize];
  float out[rings::kMaxBlockSize];
  float aux[rings::kMaxBlockSize];
  bool strum_pending;
};

RingsVoice rings_voices[kRingsParts];
rings::Patch rings_patch;
int rings_active = 4;
int rings_in_count = 0;
int rings_out_pos = rings::kMaxBlockSize;
float rings_fifo_l[rings::kMaxBlockSize];
float rings_fifo_r[rings::kMaxBlockSize];
float rings_in_fifo[rings::kMaxBlockSize];

// ───────────────────────── Clouds ─────────────────────────
clouds::GranularProcessor clouds_processor;
uint8_t clouds_block_mem[118784];
uint8_t clouds_block_ccm[65536 - 128];

const int kRing = 2048;  // power of two
struct Ring {
  float l[kRing], r[kRing];
  uint32_t w, rd;
  int size() const { return int(w - rd); }
  void push(float a, float b) { l[w & (kRing - 1)] = a; r[w & (kRing - 1)] = b; ++w; }
};

// Biquad lowpass used around the 32 kHz resampler (anti-alias / anti-image).
struct Biquad {
  float b0, b1, b2, a1, a2, z1, z2;
  void lowpass(float fc, float q, float sr) {
    float w = 2.0f * float(M_PI) * fc / sr;
    float c = cosf(w), s = sinf(w), alpha = s / (2.0f * q);
    float a0 = 1.0f + alpha;
    b0 = (1.0f - c) * 0.5f / a0; b1 = (1.0f - c) / a0; b2 = b0;
    a1 = -2.0f * c / a0; a2 = (1.0f - alpha) / a0;
    z1 = z2 = 0.0f;
  }
  float tick(float x) {
    float y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    return y;
  }
};

struct CloudsIO {
  float sr;
  float in_step;   // host samples per 32k sample
  float out_step;  // 32k samples per host sample
  float in_t;      // time of next 32k sample, in host samples, relative to prev
  float prev_l, prev_r;
  Ring in32, out32;
  float out_t;
  bool primed;
  Biquad aa_l[2], aa_r[2], ai_l[2], ai_r[2];
};
CloudsIO cio;
clouds::ShortFrame clouds_in_block[32];
clouds::ShortFrame clouds_out_block[32];

inline short to16(float x) {
  int v = int(x * 32767.0f);
  return short(v < -32768 ? -32768 : (v > 32767 ? 32767 : v));
}

}  // namespace

extern "C" {

// Shared IO buffers (JS views them through the exported memory).
float lz_in[kMaxFrames];            // mono mic
float lz_clouds_in[2 * kMaxFrames];  // stereo send into clouds (L then R)
float lz_out[2 * kMaxFrames];        // generic stereo output (L then R)

float* lz_in_ptr() { return lz_in; }
float* lz_clouds_in_ptr() { return lz_clouds_in; }
float* lz_out_ptr() { return lz_out; }

void lz_init(float sample_rate) {
  for (int i = 0; i < kPlaitsVoices; ++i) {
    PlaitsVoice& v = plaits_voices[i];
    stmlib::BufferAllocator allocator(v.shared_buffer, sizeof(v.shared_buffer));
    v.voice.Init(&allocator);
    memset(&v.patch, 0, sizeof(v.patch));
    memset(&v.mod, 0, sizeof(v.mod));
    v.patch.note = 48.0f;
    v.patch.harmonics = 0.5f;
    v.patch.timbre = 0.5f;
    v.patch.morph = 0.5f;
    v.patch.decay = 0.5f;
    v.patch.lpg_colour = 0.5f;
    v.patch.engine = 8;
    v.mod.trigger_patched = true;
    v.fifo_pos = plaits::kBlockSize;
    v.gate_blocks = 0;
    float pan = (i - 1.5f) / 1.5f * 0.6f;
    float a = (pan + 1.0f) * float(M_PI) * 0.25f;
    v.pan_l = cosf(a); v.pan_r = sinf(a);
  }

  for (int i = 0; i < kRingsParts; ++i) {
    RingsVoice& v = rings_voices[i];
    v.part.Init(v.reverb_buffer);
    v.part.set_polyphony(1);
    v.part.set_model(rings::RESONATOR_MODEL_MODAL);
    memset(&v.state, 0, sizeof(v.state));
    v.state.note = 48.0f;
    v.strum_pending = false;
  }
  rings_patch.structure = 0.4f;
  rings_patch.brightness = 0.5f;
  rings_patch.damping = 0.6f;
  rings_patch.position = 0.3f;

  clouds_processor.Init(clouds_block_mem, sizeof(clouds_block_mem),
                        clouds_block_ccm, sizeof(clouds_block_ccm));
  clouds_processor.set_num_channels(2);
  clouds_processor.set_low_fidelity(false);
  clouds_processor.set_playback_mode(clouds::PLAYBACK_MODE_GRANULAR);
  clouds::Parameters* p = clouds_processor.mutable_parameters();
  memset(p, 0, sizeof(*p));
  p->position = 0.5f; p->size = 0.5f; p->density = 0.6f; p->texture = 0.5f;
  p->dry_wet = 1.0f; p->stereo_spread = 0.5f; p->reverb = 0.0f; p->feedback = 0.0f;
  clouds_processor.Prepare();

  memset(&cio, 0, sizeof(cio));
  cio.sr = sample_rate;
  cio.in_step = sample_rate / 32000.0f;
  cio.out_step = 32000.0f / sample_rate;
  cio.in_t = 1.0f;
  for (int k = 0; k < 2; ++k) {
    cio.aa_l[k].lowpass(13500.0f, k ? 1.31f : 0.54f, sample_rate);
    cio.aa_r[k].lowpass(13500.0f, k ? 1.31f : 0.54f, sample_rate);
    cio.ai_l[k].lowpass(13500.0f, k ? 1.31f : 0.54f, sample_rate);
    cio.ai_r[k].lowpass(13500.0f, k ? 1.31f : 0.54f, sample_rate);
  }
}

// ───────────────────────── Plaits API ─────────────────────────
void lz_plaits_set(int engine, float harmonics, float timbre, float morph,
                   float decay, float lpg_colour, int drone, int voices,
                   float aux_mix) {
  plaits_drone = drone != 0;
  plaits_active = std::max(1, std::min(kPlaitsVoices, voices));
  plaits_aux_mix = aux_mix;
  for (int i = 0; i < kPlaitsVoices; ++i) {
    plaits::Patch& p = plaits_voices[i].patch;
    p.engine = engine;
    p.harmonics = harmonics;
    p.timbre = timbre;
    p.morph = morph;
    p.decay = decay;
    p.lpg_colour = lpg_colour;
    plaits_voices[i].mod.trigger_patched = !plaits_drone;
  }
}

void lz_plaits_note(int voice, float note, int trigger) {
  if (voice < 0 || voice >= kPlaitsVoices) return;
  PlaitsVoice& v = plaits_voices[voice];
  v.patch.note = note;
  if (trigger) v.gate_blocks = 24;  // ~6 ms gate
}

void lz_plaits_render(int n) {
  float* L = lz_out;
  float* R = lz_out + kMaxFrames;
  std::fill(L, L + n, 0.0f);
  std::fill(R, R + n, 0.0f);
  const float scale = 1.0f / 32768.0f;
  for (int i = 0; i < plaits_active; ++i) {
    PlaitsVoice& v = plaits_voices[i];
    for (int s = 0; s < n; ++s) {
      if (v.fifo_pos >= int(plaits::kBlockSize)) {
        v.mod.trigger = v.gate_blocks > 0 ? 1.0f : 0.0f;
        if (v.gate_blocks > 0) --v.gate_blocks;
        v.voice.Render(v.patch, v.mod, v.block, plaits::kBlockSize);
        for (size_t k = 0; k < plaits::kBlockSize; ++k) {
          v.fifo_out[k] = v.block[k].out * scale;
          v.fifo_aux[k] = v.block[k].aux * scale;
        }
        v.fifo_pos = 0;
      }
      // Plaits outputs are inverted on the hardware.
      float x = -(v.fifo_out[v.fifo_pos] * (1.0f - plaits_aux_mix) +
                  v.fifo_aux[v.fifo_pos] * plaits_aux_mix);
      ++v.fifo_pos;
      L[s] += x * v.pan_l;
      R[s] += x * v.pan_r;
    }
  }
}

// ───────────────────────── Rings API ─────────────────────────
void lz_rings_set(int model, float structure, float brightness, float damping,
                  float position, int pluck, int parts) {
  rings_active = std::max(1, std::min(kRingsParts, parts));
  rings_patch.structure = structure;
  rings_patch.brightness = brightness;
  rings_patch.damping = damping;
  rings_patch.position = position;
  for (int i = 0; i < kRingsParts; ++i) {
    rings_voices[i].part.set_model(static_cast<rings::ResonatorModel>(model));
    rings_voices[i].state.internal_exciter = pluck != 0;
  }
}

void lz_rings_note(int part, float note, int strum) {
  if (part < 0 || part >= kRingsParts) return;
  rings_voices[part].state.note = note;
  if (strum) rings_voices[part].strum_pending = true;
}

void lz_rings_render(int n) {
  float* L = lz_out;
  float* R = lz_out + kMaxFrames;
  const int B = rings::kMaxBlockSize;
  for (int s = 0; s < n; ++s) {
    rings_in_fifo[rings_in_count++] = lz_in[s];
    if (rings_in_count == B) {
      // A full input block is ready: render one block of output.
      std::fill(rings_fifo_l, rings_fifo_l + B, 0.0f);
      std::fill(rings_fifo_r, rings_fifo_r + B, 0.0f);
      for (int i = 0; i < rings_active; ++i) {
        RingsVoice& v = rings_voices[i];
        v.state.strum = v.strum_pending;
        v.strum_pending = false;
        std::copy(rings_in_fifo, rings_in_fifo + B, v.in);
        v.part.Process(v.state, rings_patch, v.in, v.out, v.aux, B);
        // alternate odd/even pickups across the stereo field
        float* a = (i & 1) ? rings_fifo_r : rings_fifo_l;
        float* b = (i & 1) ? rings_fifo_l : rings_fifo_r;
        for (int k = 0; k < B; ++k) { a[k] += v.out[k]; b[k] += v.aux[k]; }
      }
      rings_in_count = 0;
      rings_out_pos = 0;
    }
    // One block of latency: read what was rendered on the previous fill.
    if (rings_out_pos < B) {
      L[s] = rings_fifo_l[rings_out_pos];
      R[s] = rings_fifo_r[rings_out_pos];
      ++rings_out_pos;
    } else {
      L[s] = R[s] = 0.0f;
    }
  }
}

// ───────────────────────── Clouds API ─────────────────────────
void lz_clouds_set(float position, float size, float pitch, float density,
                   float texture, float spread, float feedback, float reverb,
                   int freeze, int mode, int trigger) {
  clouds::Parameters* p = clouds_processor.mutable_parameters();
  p->position = position;
  p->size = size;
  p->pitch = pitch;
  p->density = density;
  p->texture = texture;
  p->dry_wet = 1.0f;
  p->stereo_spread = spread;
  p->feedback = feedback;
  p->reverb = reverb;
  p->freeze = freeze != 0;
  p->trigger = trigger != 0;
  p->gate = trigger != 0;
  clouds_processor.set_freeze(freeze != 0);
  clouds_processor.set_playback_mode(static_cast<clouds::PlaybackMode>(mode));
}

void lz_clouds_render(int n) {
  float* inL = lz_clouds_in;
  float* inR = lz_clouds_in + kMaxFrames;
  float* L = lz_out;
  float* R = lz_out + kMaxFrames;

  // 1. host rate -> 32 kHz (band-limit, then linear interpolation)
  for (int s = 0; s < n; ++s) {
    float l = cio.aa_l[1].tick(cio.aa_l[0].tick(inL[s]));
    float r = cio.aa_r[1].tick(cio.aa_r[0].tick(inR[s]));
    while (cio.in_t <= 1.0f) {
      float t = cio.in_t;
      cio.in32.push(cio.prev_l + (l - cio.prev_l) * t, cio.prev_r + (r - cio.prev_r) * t);
      cio.in_t += cio.in_step;
    }
    cio.in_t -= 1.0f;
    cio.prev_l = l; cio.prev_r = r;
  }

  // 2. run Clouds on every complete 32-frame block
  while (cio.in32.size() >= 32) {
    for (int k = 0; k < 32; ++k) {
      uint32_t idx = (cio.in32.rd++) & (kRing - 1);
      clouds_in_block[k].l = to16(cio.in32.l[idx]);
      clouds_in_block[k].r = to16(cio.in32.r[idx]);
    }
    clouds_processor.Prepare();
    clouds_processor.Process(clouds_in_block, clouds_out_block, 32);
    for (int k = 0; k < 32; ++k) {
      cio.out32.push(clouds_out_block[k].l / 32768.0f, clouds_out_block[k].r / 32768.0f);
    }
    // Clear the trigger once consumed.
    clouds_processor.mutable_parameters()->trigger = false;
  }

  // 3. 32 kHz -> host rate, keeping ~2 blocks of slack
  if (!cio.primed && cio.out32.size() >= 64) cio.primed = true;
  for (int s = 0; s < n; ++s) {
    float l = 0.0f, r = 0.0f;
    if (cio.primed && cio.out32.size() >= 2) {
      uint32_t i0 = cio.out32.rd & (kRing - 1);
      uint32_t i1 = (cio.out32.rd + 1) & (kRing - 1);
      float t = cio.out_t;
      l = cio.out32.l[i0] + (cio.out32.l[i1] - cio.out32.l[i0]) * t;
      r = cio.out32.r[i0] + (cio.out32.r[i1] - cio.out32.r[i0]) * t;
      cio.out_t += cio.out_step;
      while (cio.out_t >= 1.0f) { cio.out_t -= 1.0f; cio.out32.rd++; }
    }
    L[s] = cio.ai_l[1].tick(cio.ai_l[0].tick(l));
    R[s] = cio.ai_r[1].tick(cio.ai_r[0].tick(r));
  }
}

}  // extern "C"
