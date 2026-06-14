/**
 * DID resolution against Xahau hook state.  (spec §4.4, §4.2)
 *
 * The `xah-did` Hook (hooks/xah-did/did_hook.c) stores a 32-byte reputation
 * record in the namespace of the identity account, keyed by the DID. Resolving
 * a `did:poi:xah:r...` therefore means: read that hook state entry and decode
 * the soulbound reputation record into a W3C-style DID Document + score.
 *
 * Transport is injected (`LedgerStateReader`) so the decode/decay logic is
 * unit-testable offline; `XahauJsonRpcReader` is the production transport that
 * calls a rippled/xahau node's JSON-RPC `account_namespace` / `ledger_entry`.
 *
 * STATE LAYOUT (must match did_hook.c exactly) — 32 bytes, big-endian:
 *   [ 0.. 8)  score        u64   raw experience points
 *   [ 8..16)  fulfilled    u64   successful intent fulfillments
 *   [16..24)  failed       u64   failed/slashed intents
 *   [24..32)  lastActive   u64   unix seconds of last reputation write
 */
import { createHash } from "node:crypto";
import { parseDid, type ParsedDid } from "./did.js";

export const REP_RECORD_BYTES = 32;
export const DEFAULT_HALF_LIFE_DAYS = 30;

export interface ReputationState {
  score: number; // raw stored score
  fulfilled: number;
  failed: number;
  lastActive: number; // unix seconds
  /** Time-decayed score (spec §3.2: reputation decays to zero if inactive). */
  decayedScore: number;
}

export interface DidDocument {
  "@context": string[];
  id: string;
  verificationMethod: Array<{
    id: string;
    type: string;
    controller: string;
    publicKeyMultibase?: string;
    blockchainAccountId: string;
  }>;
  service: Array<{ id: string; type: string; serviceEndpoint: string }>;
}

export interface DidResolution {
  didDocument: DidDocument;
  reputation: ReputationState | null; // null = no on-ledger record yet
  metadata: { resolvedAt: number; source: string };
}

/** Abstraction over "read one hook-state entry for an account". */
export interface LedgerStateReader {
  /** Returns the raw state value bytes, or null if the entry is absent. */
  getHookState(account: string, key: Uint8Array): Promise<Uint8Array | null>;
  readonly source: string;
}

/**
 * Deterministic 32-byte hook-state key for a DID.
 *
 * Uses SHA-512Half (the first 32 bytes of SHA-512) — the same primitive the
 * `xah-did` hook computes on-ledger via `util_sha512h` — so the key produced
 * here for reads matches the key the hook writes under. (A raw DID string is
 * >32 bytes, so it can't be a hook-state key directly.)
 */
export function repStateKey(did: string): Uint8Array {
  return new Uint8Array(createHash("sha512").update(did).digest().subarray(0, 32));
}

function readU64BE(bytes: Uint8Array, offset: number): number {
  // Reputation magnitudes fit comfortably in a JS safe integer.
  let value = 0;
  for (let i = 0; i < 8; i++) value = value * 256 + bytes[offset + i];
  return value;
}

export function decodeReputation(
  bytes: Uint8Array,
  now = Math.floor(Date.now() / 1000),
  halfLifeDays = DEFAULT_HALF_LIFE_DAYS,
): ReputationState {
  if (bytes.length !== REP_RECORD_BYTES) {
    throw new Error(`reputation record must be ${REP_RECORD_BYTES} bytes`);
  }
  const score = readU64BE(bytes, 0);
  const fulfilled = readU64BE(bytes, 8);
  const failed = readU64BE(bytes, 16);
  const lastActive = readU64BE(bytes, 24);
  const elapsedDays = Math.max(0, (now - lastActive) / 86400);
  const decayedScore = score * Math.pow(0.5, elapsedDays / halfLifeDays);
  return { score, fulfilled, failed, lastActive, decayedScore };
}

function buildDidDocument(parsed: ParsedDid, did: string): DidDocument {
  const chainNamespace =
    parsed.chain === "sol" ? "solana" : parsed.chain === "base" ? "eip155" : "xahau";
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://zeroquery.dev/ns/poi/v1",
    ],
    id: did,
    verificationMethod: [
      {
        id: `${did}#controller`,
        type: "BlockchainVerificationMethod2021",
        controller: did,
        blockchainAccountId: `${chainNamespace}:${parsed.address}`,
      },
    ],
    service: [
      {
        id: `${did}#reputation`,
        type: "PoIReputation",
        serviceEndpoint: `hookstate://${parsed.address}/${Buffer.from(
          repStateKey(did),
        ).toString("hex")}`,
      },
    ],
  };
}

/**
 * Resolve a DID to its document + soulbound reputation.
 * Reputation is only fetched for `xah` DIDs (the canonical identity chain);
 * other chains resolve to a document with `reputation: null`.
 */
export async function resolveDid(
  did: string,
  reader?: LedgerStateReader,
  now = Math.floor(Date.now() / 1000),
): Promise<DidResolution> {
  const parsed = parseDid(did);
  const didDocument = buildDidDocument(parsed, did);

  let reputation: ReputationState | null = null;
  let source = "did-only";
  if (parsed.chain === "xah" && reader) {
    const raw = await reader.getHookState(parsed.address, repStateKey(did));
    reputation = raw ? decodeReputation(raw, now) : null;
    source = reader.source;
  }
  return { didDocument, reputation, metadata: { resolvedAt: now, source } };
}

/**
 * Production transport: reads hook state from a Xahau node over JSON-RPC.
 * Uses the built-in fetch (Node 18+); no runtime dependency.
 */
export class XahauJsonRpcReader implements LedgerStateReader {
  readonly source: string;
  constructor(private readonly endpoint: string) {
    this.source = `xahau-jsonrpc:${endpoint}`;
  }
  async getHookState(account: string, key: Uint8Array): Promise<Uint8Array | null> {
    const keyHex = Buffer.from(key).toString("hex").toUpperCase();
    const body = {
      method: "ledger_entry",
      params: [{ hook_state: { account, key: keyHex }, ledger_index: "validated" }],
    };
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`xahau node ${res.status}`);
    const json: any = await res.json();
    const node = json?.result?.node;
    if (!node || json?.result?.error) return null;
    const dataHex: string | undefined = node.HookStateData;
    if (!dataHex) return null;
    return new Uint8Array(Buffer.from(dataHex, "hex"));
  }
}
