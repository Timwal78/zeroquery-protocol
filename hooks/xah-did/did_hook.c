/**
 * xah-did — Proof-of-Intent DID resolution + soulbound reputation Hook.
 * (spec §4.4 Identity & Reputation, §3.2 No Token Issuance)
 *
 * Xahau Hook installed on an identity account. It governs the WRITE side of
 * reputation: an Invoke transaction carries parameters describing a reputation
 * event, and the hook updates a 32-byte soulbound record stored in this
 * account's hook-state namespace, keyed by SHA-512Half(DID).
 *
 * Resolution (the READ side) is done off-ledger by @zeroquery/sdk's
 * XahauJsonRpcReader, which reads this exact state entry. The key derivation
 * and 32-byte record layout here MUST match packages/sdk/src/resolver.ts.
 *
 * Soulbound guarantees (no token / no security):
 *   - Reputation lives ONLY in the account's own hook-state namespace.
 *   - There is no transfer / delegate / mint operation. It cannot move.
 *   - It is an experience counter, not a balance; it decays off-ledger.
 *
 * Transaction parameters (otxn_param):
 *   "OP"  : 1 byte  -> 'F' fulfilled(+), 'X' failed/slash(-), 'R' register
 *   "DID" : N bytes -> the did:poi:xah:r... string
 *   "AMT" : 8 bytes -> big-endian u64 score delta (ignored for 'R')
 *
 * STATE RECORD (32 bytes, big-endian) — identical to the SDK:
 *   [ 0.. 8)  score       u64
 *   [ 8..16)  fulfilled   u64
 *   [16..24)  failed      u64
 *   [24..32)  lastActive  u64  (unix seconds)
 */
#include "hookapi.h"

/* Seconds between the Unix epoch (1970) and the Ripple epoch (2000). */
#define RIPPLE_EPOCH_OFFSET 946684800ULL

static void put_u64_be(uint8_t *p, uint64_t v) {
  p[0] = (uint8_t)(v >> 56); p[1] = (uint8_t)(v >> 48);
  p[2] = (uint8_t)(v >> 40); p[3] = (uint8_t)(v >> 32);
  p[4] = (uint8_t)(v >> 24); p[5] = (uint8_t)(v >> 16);
  p[6] = (uint8_t)(v >> 8);  p[7] = (uint8_t)(v);
}

static uint64_t get_u64_be(const uint8_t *p) {
  return ((uint64_t)p[0] << 56) | ((uint64_t)p[1] << 48) |
         ((uint64_t)p[2] << 40) | ((uint64_t)p[3] << 32) |
         ((uint64_t)p[4] << 24) | ((uint64_t)p[5] << 16) |
         ((uint64_t)p[6] << 8)  | ((uint64_t)p[7]);
}

int64_t hook(uint32_t reserved) {
  (void)reserved;
  /* 1. Read the DID parameter. */
  uint8_t did[128];
  int64_t did_len = otxn_param(SBUF(did), (uint32_t)"DID", 3);
  if (did_len < 1)
    return rollback(SBUF("xah-did: missing DID param"), 1);

  /* 2. Read the op code. */
  uint8_t op[1];
  if (otxn_param(SBUF(op), (uint32_t)"OP", 2) != 1)
    return rollback(SBUF("xah-did: missing OP param"), 2);

  /* 3. Derive the 32-byte state key = SHA-512Half(DID). */
  uint8_t key[32];
  if (util_sha512h(SBUF(key), (uint32_t)did, (uint32_t)did_len) != 32)
    return rollback(SBUF("xah-did: key derivation failed"), 3);

  /* 4. Load the existing record (zero-initialised if absent). */
  uint8_t rec[32];
  for (int i = 0; i < 32; i++) rec[i] = 0;
  state(SBUF(rec), SBUF(key)); /* DOESNT_EXIST -> rec stays zeroed */

  uint64_t score      = get_u64_be(rec + 0);
  uint64_t fulfilled  = get_u64_be(rec + 8);
  uint64_t failed     = get_u64_be(rec + 16);

  /* 5. Apply the operation. */
  if (op[0] == 'R') {
    /* register: leave counters as-is (zero if new), just refresh lastActive */
  } else if (op[0] == 'F') {
    uint8_t amt[8];
    if (otxn_param(SBUF(amt), (uint32_t)"AMT", 3) != 8)
      return rollback(SBUF("xah-did: F requires 8-byte AMT"), 4);
    score += get_u64_be(amt);
    fulfilled += 1;
  } else if (op[0] == 'X') {
    uint8_t amt[8];
    if (otxn_param(SBUF(amt), (uint32_t)"AMT", 3) != 8)
      return rollback(SBUF("xah-did: X requires 8-byte AMT"), 5);
    uint64_t slash = get_u64_be(amt);
    score = (score > slash) ? (score - slash) : 0; /* never below zero */
    failed += 1;
  } else {
    return rollback(SBUF("xah-did: unknown OP"), 6);
  }

  /* 6. Stamp lastActive (unix seconds) and persist. */
  uint64_t last_active = (uint64_t)ledger_last_time() + RIPPLE_EPOCH_OFFSET;
  put_u64_be(rec + 0, score);
  put_u64_be(rec + 8, fulfilled);
  put_u64_be(rec + 16, failed);
  put_u64_be(rec + 24, last_active);

  if (state_set(SBUF(rec), SBUF(key)) != 32)
    return rollback(SBUF("xah-did: state_set failed"), 7);

  return accept(SBUF("xah-did: reputation updated"), 0);
}

int64_t cbak(uint32_t reserved) { (void)reserved; return 0; }
