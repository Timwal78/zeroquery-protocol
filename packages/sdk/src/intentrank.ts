/**
 * IntentRank — reputation-weighted matching.  (spec §4.2)
 *
 * The ranking function that decides which responder wins an intent:
 *
 *   IntentRank(S) =  Σ (fulfillment_value · proof_quality · recency_decay)
 *                   ----------------------------------------------------------
 *                    1 + Σ (failure_severity · recency_decay)
 *
 * Numerator rewards recent, well-proven, high-value fulfillments. Denominator
 * penalizes recent failures weighted by severity; the `1 +` is Laplace
 * smoothing so a brand-new service (no history) scores 0 rather than dividing
 * by zero, and a single failure can't send the score to infinity.
 *
 * Pure + deterministic (injectable `now`), so matching is reproducible and
 * auditable. No network, no dependency.
 */

export interface Fulfillment {
  /** Economic value delivered (rail smallest units). */
  value: number;
  /** Provenance proof quality in [0,1] — e.g. ZK-verified = 1, unproven = 0. */
  proofQuality: number;
  /** Unix seconds when the fulfillment settled. */
  timestamp: number;
}

export interface Failure {
  /** Severity multiplier (>0); a slash is heavier than a timeout. */
  severity: number;
  /** Unix seconds when the failure occurred. */
  timestamp: number;
}

export interface ServiceHistory {
  /** DID of the responder service. */
  did: string;
  fulfillments: Fulfillment[];
  failures: Failure[];
}

export interface IntentRankOptions {
  /** Half-life of the recency decay, in days. Default 30. */
  halfLifeDays?: number;
  now?: number;
}

const DAY = 86_400;

function recencyDecay(ageSeconds: number, halfLifeDays: number): number {
  const ageDays = Math.max(0, ageSeconds) / DAY;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/** Compute the IntentRank score for one service's history. */
export function intentRank(history: ServiceHistory, opts: IntentRankOptions = {}): number {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const halfLife = opts.halfLifeDays ?? 30;

  let numerator = 0;
  for (const f of history.fulfillments) {
    if (f.value < 0 || f.proofQuality < 0 || f.proofQuality > 1) {
      throw new Error("fulfillment value must be >=0 and proofQuality in [0,1]");
    }
    numerator += f.value * f.proofQuality * recencyDecay(now - f.timestamp, halfLife);
  }

  let penalty = 0;
  for (const x of history.failures) {
    if (x.severity <= 0) throw new Error("failure severity must be > 0");
    penalty += x.severity * recencyDecay(now - x.timestamp, halfLife);
  }

  return numerator / (1 + penalty);
}

export interface RankedService {
  did: string;
  score: number;
}

/**
 * Rank candidate services by IntentRank, descending. Ties break by DID for a
 * deterministic, reproducible ordering (important for auditability and for
 * agents independently arriving at the same winner).
 */
export function rankServices(
  candidates: ServiceHistory[],
  opts: IntentRankOptions = {},
): RankedService[] {
  return candidates
    .map((c) => ({ did: c.did, score: intentRank(c, opts) }))
    .sort((a, b) => b.score - a.score || a.did.localeCompare(b.did));
}
