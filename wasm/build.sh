#!/usr/bin/env bash
# Builds js/mi.wasm from the vendored Mutable Instruments sources.
# Needs clang/lld 18 with the wasm32-wasi sysroot:
#   apt-get install clang lld wasi-libc libc++-18-dev-wasm32 libc++abi-18-dev-wasm32 libclang-rt-18-dev-wasm32
set -euo pipefail
cd "$(dirname "$0")"
E=eurorack
SRCS=(lizard_mi.cc lizard_warps.cc lizard_marbles.cc
  $(find $E/plaits $E/rings $E/clouds $E/warps $E/marbles -name '*.cc' | sort)
  $E/stmlib/dsp/units.cc $E/stmlib/dsp/atan.cc $E/stmlib/utils/random.cc)
OUT=../js/mi.wasm
OBJ=build; mkdir -p $OBJ
FLAGS=(--target=wasm32-wasi -O3 -ffast-math -fno-exceptions -fno-rtti -DTEST
  -I$E -include cstdio -Wno-everything -fno-threadsafe-statics)
objs=()
for s in "${SRCS[@]}"; do
  o=$OBJ/$(echo "$s" | tr '/' '_').o
  if [ ! -f "$o" ] || [ "$s" -nt "$o" ]; then clang++ "${FLAGS[@]}" -c "$s" -o "$o"; fi
  objs+=("$o")
done
clang++ --target=wasm32-wasi -O2 -mexec-model=reactor -nostartfiles /usr/lib/wasm32-wasi/crt1-reactor.o \
  "${objs[@]}" -o $OUT \
  -Wl,--export=_initialize $(cat lizard_*.cc | grep -oE '^[a-z].* (lz_[a-z0-9_]+)\(' | grep -oE 'lz_[a-z0-9_]+' | sed 's/^/-Wl,--export=/' | tr '\n' ' ') \
  -Wl,--strip-all \
  -Wl,-z,stack-size=262144 -Wl,--initial-memory=8388608 -Wl,--max-memory=8388608 \
  -lc++ -lc++abi
ls -la $OUT
