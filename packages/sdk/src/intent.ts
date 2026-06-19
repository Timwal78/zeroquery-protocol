/**
 * Intent construction, canonical hashing, and validation.  (spec §4.1, §5)
 *
 * An Intent is what an agent BROADCASTS instead of "searching" (the ZeroQuery
 * inversion). The gossip wire message is intentionally tiny — it carries a hash
 * plus routing/economic metadata; the full JSON-LD payload travels encrypted to
 * responders (spec §8: "Intent data encrypted to responder public keys").
 */
import { createHash } from "node:crypto";
import { isValidDid } from "./did.js";

/** Settlement rails permitted for the escrow bond (spec §3.6). */
export const PAYMENT_RAILS = [
  "usdc-sol", // primary bond + settlement (SPL)
  "rlusd-xrp", // XRPL-native stable settlement
  "xrp", // cross-chain settlement rail
  "usdc-base", // EVM settlement
] as const;
export type PaymentRail = (typeof PAYMENT_RAILS)[number];

/** Full, human-authored intent (the JSON-LD body). */
export interface IntentPayload {
  /** JSON-LD context; pinned to the protocol schema. */
  "@context": string;
  "@type": "PoIIntent";
  /** Free-form capability/vertical, e.g. "travel.hotel.search". */
  capability: string;
  /** Structured parameters specific to the capability. */
  params: Record<string, unknown>;
  /** Max the broadcaster will bond, in the rail's smallest unit (e.g. USDC micro). */
  maxBond: number;
  /** Settlement rail the broadcaster will honor. */
  rail: PaymentRail;
}

/** Compact gossip wire message (spec §4.1). */
export interface GossipMessage {
  intentHash: string; // hex sha256 of the canonical payload
  agentDid: string; // did:poi:<chain>:<address>
  bondAmount: number; // staked micro-units
  paymentRail: PaymentRail;
  timestamp: number; // unix seconds
  ttl: number; // seconds the intent stays live
}

export const INTENT_CONTEXT =
  "https://zeroquery.dev/ns/poi/v1";

/**
 * Maximum serialized byte size of an intent payload (spec §4.1 — the gossip
 * wire message must stay compact to bound relay memory and network cost).
 * Payloads exceeding this limit are rejected by `validateIntentPayload`.
 */
export const MAX_INTENT_PAYLOAD_BYTES = 65_536; // 64 KiB

/**
 * Deterministic JSON canonicalization (sorted keys, no insignificant
 * whitespace). Good enough for a stable hash without pulling in a full
 * RFC-8785 JCS dependency; kept here so the hash is reproducible across SDKs.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
    .join(",");
  return `{${body}}`;
}

/** sha256 hex of the canonicalized payload — the `intent_hash`. */
export function hashIntent(payload: IntentPayload): string {
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}

export interface BuildGossipArgs {
  payload: IntentPayload;
  agentDid: string;
  bondAmount: number;
  ttl: number;
  /** Defaults to current unix seconds; injectable for deterministic tests. */
  now?: number;
}

/** Validate a payload and assemble the compact gossip message. */
export function buildGossipMessage(args: BuildGossipArgs): GossipMessage {
  const { payload, agentDid, bondAmount, ttl } = args;
  const errors = validateIntentPayload(payload);
  if (errors.length) {
    throw new Error(`invalid intent payload: ${errors.join("; ")}`);
  }
  if (!isValidDid(agentDid)) throw new Error(`invalid agent DID: ${agentDid}`);
  if (!Number.isInteger(bondAmount) || bondAmount <= 0) {
    throw new Error("bondAmount must be a positive integer (smallest units)");
  }
  if (bondAmount > payload.maxBond) {
    throw new Error("bondAmount exceeds payload.maxBond");
  }
  if (!Number.isInteger(ttl) || ttl <= 0) {
    throw new Error("ttl must be a positive integer (seconds)");
  }
  return {
    intentHash: hashIntent(payload),
    agentDid,
    bondAmount,
    paymentRail: payload.rail,
    timestamp: args.now ?? Math.floor(Date.now() / 1000),
    ttl,
  };
}

/** Returns a list of human-readable validation errors ([] === valid). */
export function validateIntentPayload(payload: IntentPayload): string[] {
  const errors: string[] = [];

  // Guard against DoS via oversized payloads before any field inspection.
  // The limit (MAX_INTENT_PAYLOAD_BYTES) is chosen to keep relay memory
  // bounded while accommodating realistic intent parameter objects.
  const serialized = JSON.stringify(payload);
  if (typeof serialized === "string" && Buffer.byteLength(serialized, "utf8") > MAX_INTENT_PAYLOAD_BYTES) {
    errors.push(`payload exceeds maximum size of ${MAX_INTENT_PAYLOAD_BYTES} bytes`);
    // Return early — further validation is meaningless for an oversize payload.
    return errors;
  }

  if (payload?.["@context"] !== INTENT_CONTEXT) {
    errors.push(`@context must be "${INTENT_CONTEXT}"`);
  }
  if (payload?.["@type"] !== "PoIIntent") errors.push('@type must be "PoIIntent"');
  if (!payload?.capability || typeof payload.capability !== "string") {
    errors.push("capability is required");
  }
  if (typeof payload?.params !== "object" || payload.params === null) {
    errors.push("params must be an object");
  }
  if (!Number.isInteger(payload?.maxBond) || payload.maxBond <= 0) {
    errors.push("maxBond must be a positive integer");
  }
  if (!PAYMENT_RAILS.includes(payload?.rail)) {
    errors.push(`rail must be one of ${PAYMENT_RAILS.join(", ")}`);
  }
  return errors;
}

/** True once an intent has aged past its ttl. */
export function isExpired(msg: GossipMessage, now = Math.floor(Date.now() / 1000)): boolean {
  return now >= msg.timestamp + msg.ttl;
}
