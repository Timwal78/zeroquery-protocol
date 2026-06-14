/**
 * Minimal, dependency-free Base58 + Base58Check.
 *
 * Two alphabets are supported because the protocol spans two chains:
 *   - Bitcoin/Solana alphabet  -> Solana public keys (base58, no checksum)
 *   - XRPL/Xahau "dictionary"  -> classic r-addresses (base58check, ripple alphabet)
 *
 * Implemented from first principles so the SDK has no supply-chain surface
 * (per spec §8: "Open-source relayer code with reproducible builds").
 */
import { createHash } from "node:crypto";

export const BTC_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const XRPL_ALPHABET =
  "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";

function encodeWithAlphabet(bytes: Uint8Array, alphabet: string): string {
  if (bytes.length === 0) return "";
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  // Preserve leading-zero bytes as leading "1" (alphabet[0]).
  let out = "";
  for (const byte of bytes) {
    if (byte === 0) out += alphabet[0];
    else break;
  }
  for (let i = digits.length - 1; i >= 0; i--) out += alphabet[digits[i]];
  return out;
}

function decodeWithAlphabet(str: string, alphabet: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);
  const map = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i++) map.set(alphabet[i], i);

  const bytes: number[] = [];
  for (const ch of str) {
    const value = map.get(ch);
    if (value === undefined) throw new Error(`invalid base58 character: ${ch}`);
    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of str) {
    if (ch === alphabet[0]) bytes.push(0);
    else break;
  }
  return new Uint8Array(bytes.reverse());
}

export const base58 = {
  encode: (bytes: Uint8Array) => encodeWithAlphabet(bytes, BTC_ALPHABET),
  decode: (str: string) => decodeWithAlphabet(str, BTC_ALPHABET),
};

function doubleSha256(bytes: Uint8Array): Uint8Array {
  const a = createHash("sha256").update(bytes).digest();
  const b = createHash("sha256").update(a).digest();
  return new Uint8Array(b);
}

/** Base58Check with a selectable alphabet (default: XRPL/Xahau). */
export const base58check = {
  encode: (payload: Uint8Array, alphabet: string = XRPL_ALPHABET): string => {
    const checksum = doubleSha256(payload).slice(0, 4);
    const full = new Uint8Array(payload.length + 4);
    full.set(payload, 0);
    full.set(checksum, payload.length);
    return encodeWithAlphabet(full, alphabet);
  },
  decode: (str: string, alphabet: string = XRPL_ALPHABET): Uint8Array => {
    const full = decodeWithAlphabet(str, alphabet);
    if (full.length < 5) throw new Error("base58check: input too short");
    const payload = full.slice(0, -4);
    const checksum = full.slice(-4);
    const expected = doubleSha256(payload).slice(0, 4);
    for (let i = 0; i < 4; i++) {
      if (checksum[i] !== expected[i]) throw new Error("base58check: bad checksum");
    }
    return payload;
  },
};
