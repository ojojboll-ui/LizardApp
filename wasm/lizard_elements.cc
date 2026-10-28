// Elements (modal synthesizer) bridge. Elements runs at 32 kHz with 16-frame
// blocks, so it sits behind a resampler like Clouds. The mic feeds its external
// blow and strike inputs, so the room can excite the resonator.

#include <cmath>
#include <cstring>

#include "elements/dsp/part.h"

extern "C" {
extern float lz_in[];
extern float lz_out[];
}

namespace {

const int kOut = 256;
const int kBlock = 16;
const int kRing = 2048;

elements::Part part;
uint16_t reverb_buffer[32768];
elements::PerformanceState state;

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
struct Lp4 {
  Biquad a, b;
  void init(float fc, float sr) { a.lowpass(fc, 0.5412f, sr); b.lowpass(fc, 1.3066f, sr); }
  float tick(float x) { return b.tick(a.tick(x)); }
};

// host rate <-> 32 kHz
float in_step, out_step, in_t, out_t, prev_in;
float in32[kRing], outL32[kRing], outR32[kRing];
uint32_t in_w, in_r, out_w, out_r;
bool primed;
Lp4 aa, ai_l, ai_r;
float blow[kBlock], strike[kBlock], main_out[kBlock], aux_out[kBlock];
float mic_amount = 0.5f;

}  // namespace

extern "C" {

// 0 contour, 1 bow, 2 blow, 3 strike, 4 bow timbre, 5 blow meta, 6 blow timbre,
// 7 strike meta, 8 strike timbre, 9 geometry, 10 brightness, 11 damping,
// 12 position, 13 space, 14 mic amount, 15 model (0-2, 3 = ominous voice)
float lz_el_params[16];
float* lz_el_params_ptr() { return lz_el_params; }

void lz_elements_init(float sample_rate) {
  part.Init(reverb_buffer);
  uint32_t seed[3] = { 0x4c697a61, 0x72642121, 0x12345678 };
  part.Seed(seed, 3);
  memset(&state, 0, sizeof(state));
  state.note = 48.0f;
  state.strength = 0.5f;
  in_step = sample_rate / 32000.0f;
  out_step = 32000.0f / sample_rate;
  in_t = 1.0f; out_t = 0.0f; prev_in = 0.0f;
  in_w = in_r = out_w = out_r = 0;
  primed = false;
  aa.init(13500.0f, sample_rate);
  ai_l.init(13500.0f, sample_rate);
  ai_r.init(13500.0f, sample_rate);
}

void lz_elements_apply() {
  const float* p = lz_el_params;
  elements::Patch* patch = part.mutable_patch();
  patch->exciter_envelope_shape = p[0];
  patch->exciter_bow_level = p[1];
  patch->exciter_blow_level = p[2];
  patch->exciter_strike_level = p[3];
  patch->exciter_bow_timbre = p[4];
  patch->exciter_blow_meta = p[5];
  patch->exciter_blow_timbre = p[6];
  patch->exciter_strike_meta = p[7];
  patch->exciter_strike_timbre = p[8];
  patch->resonator_geometry = p[9];
  patch->resonator_brightness = p[10];
  patch->resonator_damping = p[11];
  patch->resonator_position = p[12];
  patch->space = p[13];
  mic_amount = p[14];
  int model = int(p[15]);
  part.set_easter_egg(model == 3);
  part.set_resonator_model(elements::ResonatorModel(model > 2 ? 0 : model));
}

void lz_elements_note(float note, int gate) {
  state.note = note;
  state.gate = gate != 0;
}

void lz_elements_render(int n) {
  float* L = lz_out;
  float* R = lz_out + kOut;
  for (int s = 0; s < n; ++s) {
    float x = aa.tick(lz_in[s] * mic_amount);
    while (in_t <= 1.0f) {
      in32[in_w++ & (kRing - 1)] = prev_in + (x - prev_in) * in_t;
      in_t += in_step;
    }
    in_t -= 1.0f;
    prev_in = x;
  }
  while (in_w - in_r >= uint32_t(kBlock)) {
    for (int k = 0; k < kBlock; ++k) {
      float v = in32[in_r++ & (kRing - 1)];
      blow[k] = v;
      strike[k] = v;
    }
    part.Process(state, blow, strike, main_out, aux_out, kBlock);
    for (int k = 0; k < kBlock; ++k) {
      outL32[out_w & (kRing - 1)] = main_out[k];
      outR32[out_w & (kRing - 1)] = aux_out[k];
      ++out_w;
    }
  }
  if (!primed && out_w - out_r >= uint32_t(2 * kBlock)) primed = true;
  for (int s = 0; s < n; ++s) {
    float l = 0.0f, r = 0.0f;
    if (primed && out_w - out_r >= 2) {
      uint32_t i0 = out_r & (kRing - 1), i1 = (out_r + 1) & (kRing - 1);
      l = outL32[i0] + (outL32[i1] - outL32[i0]) * out_t;
      r = outR32[i0] + (outR32[i1] - outR32[i0]) * out_t;
      out_t += out_step;
      while (out_t >= 1.0f) { out_t -= 1.0f; ++out_r; }
    }
    L[s] = ai_l.tick(l);
    R[s] = ai_r.tick(r);
  }
}

}  // extern "C"
