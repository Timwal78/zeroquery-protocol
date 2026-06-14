/**
 * Proof-of-Intent DID method: `did:poi:<chain>:<address>`  (spec §4.4)
 *
 * Soulbound identity. The DID is derived deterministically from a public key,
 * so there is no registry to look up — resolution is the inverse: the address
 * embedded in the DID is the on-chain account whose state holds reputation.
 *
 * Supported chains (spec §3.6 "Coin Stack Isolation"):
 *   sol  -> Solana   (gossip / infra layer)
 *   xah  -> Xahau    (identity + reputation hooks)   <-- canonical for DID
 *   xrp  -> XRP Ledger
 *   base -> Base / EVM (settlement)
 */
import { createHash } from "node:crypto";
import { base58, base58check, XRPL_ALPHABET } from "./base58.js";

export const POI_DID_METHOD = "poi";
export const SUPPORTED_CHAINS = ["sol", "xah", "xrp", "base"] as const;
export type Chain = (typeof SUPPORTED_CHAINS)[number];

/** XRPL/Xahau classic-address version byte for an AccountID. */
const XRPL_ACCOUNT_PREFIX = 0x00;

export interface ParsedDid {
  method: typeof POI_DID_METHOD;
  chain: Chain;
  address: string;
}

function ripemd160(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("ripemd160").update(bytes).digest());
}
function sha256(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}

/** Solana address = base58(ed25519 public key). 32-byte key expected. */
export function solAddressFromPubkey(pubkey: Uint8Array): string {
  if (pubkey.length !== 32) {
    throw new Error(`sol pubkey must be 32 bytes, got ${pubkey.length}`);
  }
  return base58.encode(pubkey);
}

/**
 * XRPL/Xahau classic address = Base58Check(0x00 || RIPEMD160(SHA256(pubkey))).
 * Accepts a 33-byte secp256k1 compressed key or a 33-byte 0xED-prefixed
 * ed25519 key — i.e. exactly what xrpl/xahau wallets expose.
 */
export function xrplAddressFromPubkey(pubkey: Uint8Array): string {
  const accountId = ripemd160(sha256(pubkey));
  const payload = new Uint8Array(accountId.length + 1);
  payload[0] = XRPL_ACCOUNT_PREFIX;
  payload.set(accountId, 1);
  return base58check.encode(payload, XRPL_ALPHABET);
}

/** True if `address` is a structurally valid XRPL/Xahau classic address. */
export function isValidXrplAddress(address: string): boolean {
  if (!address.startsWith("r")) return false;
  try {
    const payload = base58check.decode(address, XRPL_ALPHABET);
    return payload.length === 21 && payload[0] === XRPL_ACCOUNT_PREFIX;
  } catch {
    return false;
  }
}

/** True if `address` decodes to a 32-byte Solana public key. */
export function isValidSolAddress(address: string): boolean {
  try {
    return base58.decode(address).length === 32;
  } catch {
    return false;
  }
}

function assertChain(chain: string): asserts chain is Chain {
  if (!SUPPORTED_CHAINS.includes(chain as Chain)) {
    throw new Error(
      `unsupported chain "${chain}"; expected one of ${SUPPORTED_CHAINS.join(", ")}`,
    );
  }
}

/** Build a DID from a chain + already-encoded address (no validation of key). */
export function didFromAddress(chain: Chain, address: string): string {
  assertChain(chain);
  return `did:${POI_DID_METHOD}:${chain}:${address}`;
}

/** Derive a DID directly from a raw public key for the given chain. */
export function deriveDid(chain: Chain, pubkey: Uint8Array): string {
  assertChain(chain);
  const address =
    chain === "sol"
      ? solAddressFromPubkey(pubkey)
      : xrplAddressFromPubkey(pubkey);
  // `base` (EVM) DIDs are produced by deriveEvmDid below; reject here.
  if (chain === "base") {
    throw new Error("use deriveEvmDid for EVM/base chains");
  }
  return didFromAddress(chain, address);
}

/** EVM address = last 20 bytes of keccak-less* fallback (see note). */
export function deriveEvmDid(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("base/EVM address must be 0x-prefixed 20-byte hex");
  }
  return didFromAddress("base", address.toLowerCase());
}

/** Parse + structurally validate a `did:poi:<chain>:<address>` string. */
export function parseDid(did: string): ParsedDid {
  const parts = did.split(":");
  if (parts.length !== 4) {
    throw new Error(`malformed DID (expected 4 segments): ${did}`);
  }
  const [scheme, method, chain, address] = parts;
  if (scheme !== "did") throw new Error(`not a DID URI: ${did}`);
  if (method !== POI_DID_METHOD) {
    throw new Error(`unsupported DID method "${method}"; expected "poi"`);
  }
  assertChain(chain);
  if (!address) throw new Error("empty address segment");

  if (chain === "sol" && !isValidSolAddress(address)) {
    throw new Error(`invalid Solana address in DID: ${address}`);
  }
  if ((chain === "xah" || chain === "xrp") && !isValidXrplAddress(address)) {
    throw new Error(`invalid XRPL/Xahau address in DID: ${address}`);
  }
  if (chain === "base" && !/^0x[0-9a-f]{40}$/.test(address)) {
    throw new Error(`invalid EVM address in DID: ${address}`);
  }
  return { method: POI_DID_METHOD, chain, address };
}

/** Non-throwing validity check. */
export function isValidDid(did: string): boolean {
  try {
    parseDid(did);
    return true;
  } catch {
    return false;
  }
}
