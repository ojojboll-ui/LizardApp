// Beads (texture synthesizer) bridge. Beads' digital and clean-tape media run
// at 48 kHz, the same rate as the worklet, so it is fed directly in small
// chunks. Grains are seeded by Beads' own density clock or by Lizard's
// arp / Marbles triggers.

#include <cstring>

#include "beads/dsp/processor.h"

extern "C" {
extern float lz_out[];
}

namespace {

using namespace beads;

const int kOut = 256;
const int kChunk = 16;

Processor processor;
uint8_t delay_buffer_1[512 * 1024];
uint8_t delay_buffer_2[256 * 1024];
uint16_t reverb_buffer[32768];
int media = -1;

FloatFrame in_frames[kChunk], out_frames[kChunk];
bool freeze_flags[kChunk];
stmlib::GateFlags seed_flags[kChunk];
stmlib::GateFlags previous_seed = stmlib::GATE_FLAG_LOW;
int seed_pending = 0;
int seed_low = 0;

}  // namespace

extern "C" {

float lz_beads_in[2 * kOut];
// 0 time, 1 size, 2 shape, 3 pitch (semitones), 4 density, 5 randomness,
// 6 feedback, 7 reverb, 8 media (0 digital, 1 clean tape), 9 freeze,
// 10 external seeds (1 = grains only when lz_beads_seed is called)
float lz_bd_params[12];

float* lz_beads_in_ptr() { return lz_beads_in; }
float* lz_bd_params_ptr() { return lz_bd_params; }

void lz_beads_init() {
  uint8_t* buffers[3] = { delay_buffer_1, delay_buffer_1 + 256 * 1024, delay_buffer_2 };
  processor.Init(buffers, reverb_buffer);
  processor.Configure(Processor::MEDIA_DIGITAL, false);
  media = 0;
}

// A short gate on the seed input, preceded by a moment of "button up" so that
// Beads sees a fresh rising edge even while its clock is latched.
void lz_beads_seed() { seed_low = kChunk; seed_pending = 24; }

void lz_beads_render(int n) {
  const float* p = lz_bd_params;
  int m = int(p[8]);
  if (m != media) {
    processor.Configure(m ? Processor::MEDIA_CLEAN_TAPE : Processor::MEDIA_DIGITAL, false);
    media = m;
  }
  Parameters params;
  memset(&params, 0, sizeof(params));
  const float rnd = p[5];
  params.time.base = p[0];   params.time.attenuverter = rnd;
  params.size.base = p[1];   params.size.attenuverter = rnd;
  params.shape.base = p[2];  params.shape.attenuverter = rnd * 0.5f;
  params.pitch.base = p[3];  params.pitch.attenuverter = rnd * 0.25f;
  params.monophonic_mode = false;
  ModulatedParameter density;
  density.base = p[4];
  density.cv = 0.0f;
  Processor::MixParameters mix;
  mix.feedback = p[6];
  mix.dry_wet = 1.0f;
  mix.reverb_amount = p[7];
  mix.output_gate = false;
  const bool external_seeds = p[10] > 0.5f;
  const bool freeze = p[9] > 0.5f;

  float* L = lz_out;
  float* R = lz_out + kOut;
  for (int base = 0; base < n; base += kChunk) {
    int size = n - base < kChunk ? n - base : kChunk;
    // A manual seed (SEED pad) also gets through while the clock runs freely.
    const bool use_seeds = external_seeds || seed_low > 0 || seed_pending > 0 ||
        (previous_seed & stmlib::GATE_FLAG_HIGH);
    for (int i = 0; i < size; ++i) {
      in_frames[i].l = lz_beads_in[base + i];
      in_frames[i].r = lz_beads_in[kOut + base + i];
      freeze_flags[i] = freeze;
      bool high = false;
      if (seed_low > 0) --seed_low;
      else if (seed_pending > 0) { high = true; --seed_pending; }
      previous_seed = stmlib::ExtractGateFlags(previous_seed, high);
      seed_flags[i] = previous_seed;
    }
    // Like the module: a latched SEED button lets the density clock run freely;
    // otherwise grains only come from the seed gates.
    processor.Process(use_seeds ? SEED_BUTTON_STATE_OFF : SEED_BUTTON_STATE_LOCKED,
                      use_seeds ? seed_flags : NULL,
                      freeze_flags, density, params, mix, in_frames, out_frames, size);
    for (int i = 0; i < size; ++i) {
      L[base + i] = out_frames[i].l;
      R[base + i] = out_frames[i].r;
    }
  }
}

}  // extern "C"
