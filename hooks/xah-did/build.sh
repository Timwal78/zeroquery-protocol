#!/usr/bin/env bash
# Compile the xah-did Hook to wasm32.
#
# Production builds should use the upstream xrpl-hooks toolchain
# (hook-cleaner + guard injection). This script is for CI / reproducible
# compile checks using stock clang.
set -euo pipefail
cd "$(dirname "$0")"

OUT="${1:-did_hook.wasm}"
CFLAGS="--target=wasm32-unknown-unknown -nostdlib -O2 -Wall -Wextra"

echo "[xah-did] compiling did_hook.c -> object"
clang $CFLAGS -c did_hook.c -o did_hook.o

if command -v wasm-ld >/dev/null 2>&1; then
  echo "[xah-did] linking -> $OUT"
  wasm-ld --no-entry --allow-undefined \
    --export=hook --export=cbak \
    did_hook.o -o "$OUT"
  echo "[xah-did] built $OUT ($(wc -c < "$OUT") bytes)"
else
  echo "[xah-did] wasm-ld not found; object compiled OK (did_hook.o)."
  echo "[xah-did] install lld to emit a linked .wasm module."
fi
