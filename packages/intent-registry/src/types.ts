/**
 * ZeroQuery Intent Registry — type definitions.
 * Mirrors the JSON schemas in /schema/ as TypeScript interfaces.
 */

export type Rail = "usdc-sol" | "rlusd-xrp" | "xrp" | "usdc-base";
export type RegistryStatus = "active" | "fulfilled" | "breached" | "expired" | "withdrawn";
export type BreachType =
  | "capability_mismatch"
  | "param_deviation"
  | "bond_violation"
  | "rail_switch"
  | "undeclared_action"
  | "timeout";

export type EvidenceType =
  | "xrpl_tx"
  | "api_log"
  | "mcp_call"
  | "on_chain_record"
  | "signed_attestation";

export interface PoIIntent {
  "@context": "https://zeroquery.dev/ns/poi/v1";
  "@type": "PoIIntent";
  capability: string;
  params: Record<string, unknown>;
  maxBond: number;
  rail: Rail;
  id?: string;
  ttlSeconds?: number;
  nonce?: string;
}

export interface XrplAnchor {
  txHash: string;
  ledgerIndex: number;
  closeTime: number;
  account: string;
}

export interface PoIRegistryEntry {
  "@context": "https://zeroquery.dev/ns/poi/v1";
  "@type": "PoIRegistryEntry";
  registryEntryId: string;
  intentId: string;
  filerAddress: string;
  receivedAt: number;
  intentHash: string;
  xrplAnchor?: XrplAnchor;
  status: RegistryStatus;
  resolvedAt?: number;
  breachId?: string;
  intent: PoIIntent;
}

export interface EvidenceItem {
  type: EvidenceType;
  ref: string;
  description?: string;
}

export interface DeviationRecord {
  type: BreachType;
  declared: unknown;
  actual: unknown;
  deviationMagnitude?: number;
}

export interface Remedy {
  type: "bond_slash" | "rlusd_penalty" | "service_suspension" | "arbitration";
  amountRLUSD?: number;
  narrative?: string;
}

export interface PoIBreach {
  "@context": "https://zeroquery.dev/ns/poi/v1";
  "@type": "PoIBreach";
  intentId: string;
  registryEntryId: string;
  filedBy: string;
  filedAt: number;
  deviation: DeviationRecord;
  evidence: EvidenceItem[];
  remedy?: Remedy;
  signature?: string;
}

export interface RegistryQueryOptions {
  filerAddress?: string;
  capability?: string;
  status?: RegistryStatus;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

export interface AuditTrailEntry {
  timestamp: number;
  event: "registered" | "status_changed" | "breach_filed" | "anchor_set";
  detail: Record<string, unknown>;
}
