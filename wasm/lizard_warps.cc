// Warps (meta-modulator) bridge. Warps is designed for 96 kHz, so the signal is
// oversampled 2x around it and processed in the hardware's 60-frame blocks.
// Input 1 (carrier) = synths or Warps' internal oscillator, input 2 (modulator)
// = the microphone.

#include <cmath>
#include <cstring>

#include "warps/dsp/modulator.h"

extern "C" {
extern float lz_in[];   // mic (shared with lizard_mi.cc)
extern float lz_out[];  // stereo out, L then R at +256
}

namespace {

const int kOut = 256;
const int kBlock = 60;
const int kRing = 1024;

warps::Modulator modulator;

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

// 4th-order Butterworth lowpass as two biquads
struct Lp4 {
  Biquad a, b;
  void init(float fc, float sr) { a.lowpass(fc, 0.5412f, sr); b.lowpass(fc, 1.3066f, sr); }
  float tick(float x) { return b.tick(a.tick(x)); }
};

Lp4 up_c, up_m, down;
short in_c[kRing], in_m[kRing];
float out96[kRing];
uint32_t in_w, in_r, out_w, out_r;
bool primed;
warps::ShortFrame block_in[kBlock], block_out[kBlock];

inline short to16(float x) {
  int v = int(x * 32767.0f);
  return short(v < -32768 ? -32768 : (v > 32767 ? 32767 : v));
}

}  // namespace

extern "C" {

float lz_warps_carrier[kOut];

float* lz_warps_carrier_ptr() { return lz_warps_carrier; }

void lz_warps_init(float sample_rate) {
  modulator.Init(96000.0f);
  warps::Parameters* p = modulator.mutable_parameters();
  memset(p, 0, sizeof(*p));
  p->channel_drive[0] = 0.6f;
  p->channel_drive[1] = 0.6f;
  p->modulation_algorithm = 0.25f;
  p->modulation_parameter = 0.5f;
  p->note = 48.0f;
  float sr2 = sample_rate * 2.0f;
  up_c.init(sample_rate * 0.45f, sr2);
  up_m.init(sample_rate * 0.45f, sr2);
  down.init(sample_rate * 0.42f, sr2);
  in_w = in_r = out_w = out_r = 0;
  primed = false;
}

void lz_warps_set(float algorithm, float timbre, float drive_carrier,
                  float drive_mod, int carrier_shape, float note) {
  warps::Parameters* p = modulator.mutable_parameters();
  p->modulation_algorithm = algorithm;
  p->modulation_parameter = timbre;
  p->channel_drive[0] = drive_carrier;
  p->channel_drive[1] = drive_mod;
  p->carrier_shape = carrier_shape;
  p->note = note;
}

void lz_warps_render(int n) {
  float* L = lz_out;
  float* R = lz_out + kOut;
  // 1. upsample 2x (zero-stuffing + lowpass)
  for (int s = 0; s < n; ++s) {
    for (int k = 0; k < 2; ++k) {
      float c = up_c.tick(k ? 0.0f : lz_warps_carrier[s] * 2.0f);
      float m = up_m.tick(k ? 0.0f : lz_in[s] * 2.0f);
      in_c[in_w & (kRing - 1)] = to16(c);
      in_m[in_w & (kRing - 1)] = to16(m);
      ++in_w;
    }
  }
  // 2. Warps on every complete 60-frame block
  while (in_w - in_r >= uint32_t(kBlock)) {
    for (int k = 0; k < kBlock; ++k) {
      block_in[k].l = in_c[in_r & (kRing - 1)];
      block_in[k].r = in_m[in_r & (kRing - 1)];
      ++in_r;
    }
    modulator.Process(block_in, block_out, kBlock);
    for (int k = 0; k < kBlock; ++k) {
      out96[out_w & (kRing - 1)] = block_out[k].l / 32768.0f;
      ++out_w;
    }
  }
  // 3. lowpass + decimate back to the host rate
  if (!primed && out_w - out_r >= uint32_t(2 * kBlock)) primed = true;
  for (int s = 0; s < n; ++s) {
    float y = 0.0f;
    if (primed && out_w - out_r >= 2) {
      down.tick(out96[out_r & (kRing - 1)]);
      y = down.tick(out96[(out_r + 1) & (kRing - 1)]);
      out_r += 2;
    }
    L[s] = y;
    R[s] = y;
  }
}

}  // extern "C"
