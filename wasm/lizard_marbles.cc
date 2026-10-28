// Marbles (random sampler) bridge. The T section is clocked externally by the
// Lizard transport (16th notes), and the X section is quantized to a scale built
// from the current chord. Each render reports the gate events that fired and
// the X voltage that came with them.

#include <cstring>

#include "marbles/random/random_generator.h"
#include "marbles/random/random_stream.h"
#include "marbles/random/t_generator.h"
#include "marbles/random/x_y_generator.h"
#include "stmlib/utils/gate_flags.h"

namespace {

using namespace marbles;

const int kSub = 8;  // samples per Marbles sub-block

RandomGenerator random_generator;
RandomStream random_stream;
TGenerator t_generator;
XYGenerator xy_generator;
GroupSettings x_settings, y_settings;

float ramp_buffer[kSub * 4];
bool gates[kSub * 2];
float voltages[kSub * 4];
stmlib::GateFlags clock_flags[kSub];
stmlib::GateFlags previous_clock;
bool previous_t[3];

}  // namespace

extern "C" {

// Events: [channel, sample offset, voltage] * count
float lz_mb_events[64 * 3];
int lz_mb_count;
float lz_mb_y;
float lz_mb_scale_v[16];
float lz_mb_scale_w[16];

float* lz_mb_events_ptr() { return lz_mb_events; }
float* lz_mb_scale_v_ptr() { return lz_mb_scale_v; }
float* lz_mb_scale_w_ptr() { return lz_mb_scale_w; }
int lz_mb_count_get() { return lz_mb_count; }
float lz_mb_y_get() { return lz_mb_y; }

void lz_marbles_init(float sample_rate, unsigned seed) {
  random_generator.Init(seed);
  random_stream.Init(&random_generator);
  t_generator.Init(&random_stream, sample_rate);
  xy_generator.Init(&random_stream, sample_rate);
  memset(&x_settings, 0, sizeof(x_settings));
  memset(&y_settings, 0, sizeof(y_settings));
  x_settings.control_mode = CONTROL_MODE_IDENTICAL;
  x_settings.voltage_range = VOLTAGE_RANGE_NARROW;
  x_settings.spread = 0.5f; x_settings.bias = 0.5f; x_settings.steps = 0.7f;
  x_settings.deja_vu = 0.0f; x_settings.length = 8;
  x_settings.ratio.p = 1; x_settings.ratio.q = 1;
  y_settings.control_mode = CONTROL_MODE_IDENTICAL;
  y_settings.voltage_range = VOLTAGE_RANGE_POSITIVE;
  y_settings.spread = 0.5f; y_settings.bias = 0.5f; y_settings.steps = 0.0f;
  y_settings.length = 1;
  y_settings.ratio.p = 1; y_settings.ratio.q = 4;
  previous_clock = stmlib::GATE_FLAG_LOW;
  lz_mb_count = 0;
}

// num degrees from lz_mb_scale_v (0..1 V within an octave), weights 0..1
void lz_marbles_scale(int num) {
  Scale scale;
  scale.base_interval = 1.0f;
  scale.num_degrees = num < 1 ? 1 : (num > kMaxDegrees ? kMaxDegrees : num);
  for (int i = 0; i < scale.num_degrees; ++i) {
    scale.degree[i].voltage = lz_mb_scale_v[i];
    float w = lz_mb_scale_w[i] * 255.0f;
    scale.degree[i].weight = uint8_t(w < 0.0f ? 0 : (w > 255.0f ? 255 : w));
  }
  xy_generator.LoadScale(0, scale);
}

void lz_marbles_set(int model, int rate_index, float bias, float jitter,
                    float deja_vu, int length, float spread, float x_bias,
                    float steps, int range) {
  t_generator.set_model(TGeneratorModel(model));
  t_generator.set_range(T_GENERATOR_RANGE_1X);
  // pick one of the 9 clock ratios (1/4 .. 4/1) of the external clock
  float target = (rate_index + 0.5f) / 9.0f;
  t_generator.set_rate((target - 0.5f) * 96.0f / 1.05f);
  t_generator.set_bias(bias);
  t_generator.set_jitter(jitter);
  t_generator.set_deja_vu(deja_vu);
  t_generator.set_length(length);
  t_generator.set_pulse_width_mean(0.5f);
  t_generator.set_pulse_width_std(0.0f);
  x_settings.spread = spread;
  x_settings.bias = x_bias;
  x_settings.steps = steps;
  x_settings.deja_vu = deja_vu;
  x_settings.length = length;
  x_settings.voltage_range = range ? VOLTAGE_RANGE_POSITIVE : VOLTAGE_RANGE_NARROW;
  x_settings.scale_index = y_settings.scale_index = 0;
}

// clock_phase: position in 16th notes at the first sample; clock_inc: per sample
void lz_marbles_render(int n, float clock_phase, float clock_inc) {
  Ramps ramps;
  ramps.master = &ramp_buffer[0];
  ramps.external = &ramp_buffer[kSub];
  ramps.slave[0] = &ramp_buffer[kSub * 2];
  ramps.slave[1] = &ramp_buffer[kSub * 3];
  lz_mb_count = 0;
  for (int base = 0; base < n; base += kSub) {
    int size = n - base < kSub ? n - base : kSub;
    for (int i = 0; i < size; ++i) {
      float ph = clock_phase + clock_inc * float(base + i);
      ph -= float(int(ph));
      previous_clock = stmlib::ExtractGateFlags(previous_clock, ph < 0.5f);
      clock_flags[i] = previous_clock;
    }
    t_generator.Process(true, clock_flags, ramps, gates, size);
    xy_generator.Process(CLOCK_SOURCE_INTERNAL_T1_T2_T3, x_settings, y_settings,
                         clock_flags, ramps, voltages, size);
    for (int i = 0; i < size; ++i) {
      bool t[3] = { gates[2 * i], ramps.master[i] < 0.5f, gates[2 * i + 1] };
      for (int c = 0; c < 3; ++c) {
        if (t[c] && !previous_t[c] && lz_mb_count < 64) {
          // X values settle right after the gate; read them at the sub-block end
          float* e = &lz_mb_events[lz_mb_count * 3];
          e[0] = float(c);
          e[1] = float(base + i);
          e[2] = voltages[4 * (size - 1) + c];
          ++lz_mb_count;
        }
        previous_t[c] = t[c];
      }
    }
    lz_mb_y = voltages[4 * (size - 1) + 3];
  }
}

}  // extern "C"
