/**
 * ZeroQuery Intent Registry
 *
 * In-memory implementation with audit trail. For production, swap the Map
 * store for any KV/DB backend — the interface is identical.
 *
 * Key guarantees:
 *   - Entries are immutable after registration (except status transitions).
 *   - Every status change is recorded in the audit trail.
 *   - Breach detection is deterministic and stateless (given the entry + actual params).
 *   - Audit trail output is court-admissible: SHA-256 content hash + Unix timestamps.
 */

import { createHash, randomUUID } from "node:crypto";
import type {
  PoIIntent,
  PoIRegistryEntry,
  PoIBreach,
  RegistryQueryOptions,
  AuditTrailEntry,
  XrplAnchor,
  RegistryStatus,
  DeviationRecord,
  BreachType,
} from "./types.js";

const MAX_ENTRIES = 500_000;

export class IntentRegistry {
  private readonly _entries = new Map<string, PoIRegistryEntry>();
  private readonly _byFiler = new Map<string, Set<string>>();   // filerAddress → entryIds
  private readonly _breaches = new Map<string, PoIBreach>();    // breachId → PoIBreach
  private readonly _auditTrail = new Map<string, AuditTrailEntry[]>(); // entryId → events

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a new PoIIntent.
   * Validates structure, computes content hash, assigns registryEntryId.
   */
  register(intent: PoIIntent, filerAddress: string): PoIRegistryEntry {
    if (!intent || intent["@type"] !== "PoIIntent") {
      throw new Error("Invalid PoIIntent: missing or incorrect @type");
    }
    if (!intent.capability || typeof intent.capability !== "string") {
      throw new Error("PoIIntent.capability is required");
    }
    if (!filerAddress || !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(filerAddress)) {
      throw new Error("filerAddress must be a valid XRPL r-address");
    }
    if (this._entries.size >= MAX_ENTRIES) {
      throw new Error("Registry at maximum capacity");
    }

    const intentId = intent.id ?? `https://zeroquery.dev/intent/${randomUUID()}`;
    const canonical = JSON.stringify({ ...intent, id: intentId });
    const intentHash = createHash("sha256").update(canonical).digest("hex");
    const registryEntryId = randomUUID();
    const receivedAt = unixNow();

    const entry: PoIRegistryEntry = {
      "@context": "https://zeroquery.dev/ns/poi/v1",
      "@type": "PoIRegistryEntry",
      registryEntryId,
      intentId,
      filerAddress,
      receivedAt,
      intentHash,
      status: "active",
      intent: { ...intent, id: intentId },
    };

    this._entries.set(registryEntryId, entry);

    if (!this._byFiler.has(filerAddress)) {
      this._byFiler.set(filerAddress, new Set());
    }
    this._byFiler.get(filerAddress)!.add(registryEntryId);
    this._audit(registryEntryId, "registered", { intentId, intentHash, filerAddress });

    return entry;
  }

  // ---------------------------------------------------------------------------
  // XRPL Anchoring
  // ---------------------------------------------------------------------------

  /**
   * Attach an XRPL transaction anchor to an entry (called after on-chain confirmation).
   * The txHash binds the intent hash to an immutable ledger record.
   */
  setAnchor(registryEntryId: string, anchor: XrplAnchor): void {
    const entry = this._get(registryEntryId);
    if (entry.xrplAnchor) {
      throw new Error("Anchor already set — entries are immutable after anchoring");
    }
    (entry as Record<string, unknown>)["xrplAnchor"] = anchor;
    this._audit(registryEntryId, "anchor_set", { txHash: anchor.txHash, closeTime: anchor.closeTime });
  }

  // ---------------------------------------------------------------------------
  // Status Transitions
  // ---------------------------------------------------------------------------

  markFulfilled(registryEntryId: string): void {
    this._transition(registryEntryId, "fulfilled");
  }

  markExpired(registryEntryId: string): void {
    this._transition(registryEntryId, "expired");
  }

  withdraw(registryEntryId: string, filerAddress: string): void {
    const entry = this._get(registryEntryId);
    if (entry.filerAddress !== filerAddress) {
      throw new Error("Only the filer may withdraw an intent");
    }
    if (entry.status !== "active") {
      throw new Error(`Cannot withdraw intent with status '${entry.status}'`);
    }
    this._transition(registryEntryId, "withdrawn");
  }

  // ---------------------------------------------------------------------------
  // Breach Detection
  // ---------------------------------------------------------------------------

  /**
   * Compare declared intent params against actual observed params.
   * Returns a deviation record if a breach is detected, null if compliant.
   */
  detectBreach(
    registryEntryId: string,
    actual: {
      capability?: string;
      params?: Record<string, unknown>;
      bondUsed?: number;
      railUsed?: string;
    }
  ): DeviationRecord | null {
    const entry = this._get(registryEntryId);
    const intent = entry.intent;

    // Capability mismatch
    if (actual.capability && actual.capability !== intent.capability) {
      return {
        type: "capability_mismatch" as BreachType,
        declared: intent.capability,
        actual: actual.capability,
      };
    }

    // Bond violation (agent used more than declared maxBond)
    if (actual.bondUsed !== undefined && actual.bondUsed > intent.maxBond) {
      return {
        type: "bond_violation" as BreachType,
        declared: intent.maxBond,
        actual: actual.bondUsed,
        deviationMagnitude: (actual.bondUsed - intent.maxBond) / intent.maxBond,
      };
    }

    // Rail switch
    if (actual.railUsed && actual.railUsed !== intent.rail) {
      return {
        type: "rail_switch" as BreachType,
        declared: intent.rail,
        actual: actual.railUsed,
      };
    }

    // Param deviation — check each declared param against actual
    if (actual.params && intent.params) {
      for (const [key, declaredVal] of Object.entries(intent.params)) {
        const actualVal = actual.params[key];
        if (actualVal === undefined) continue;
        if (typeof declaredVal === "number" && typeof actualVal === "number") {
          const magnitude = Math.abs(actualVal - declaredVal) / (Math.abs(declaredVal) || 1);
          if (magnitude > 0.10) {   // >10% deviation triggers breach
            return {
              type: "param_deviation" as BreachType,
              declared: { [key]: declaredVal },
              actual: { [key]: actualVal },
              deviationMagnitude: magnitude,
            };
          }
        } else if (String(actualVal) !== String(declaredVal)) {
          return {
            type: "param_deviation" as BreachType,
            declared: { [key]: declaredVal },
            actual: { [key]: actualVal },
          };
        }
      }
    }

    return null;  // no breach detected
  }

  /**
   * File a formal breach against an active entry.
   */
  fileBreach(breach: Omit<PoIBreach, "@context" | "@type">): PoIBreach {
    const entry = this._get(breach.registryEntryId);
    if (entry.status !== "active" && entry.status !== "fulfilled") {
      throw new Error(`Cannot file breach against entry with status '${entry.status}'`);
    }
    if (!breach.evidence || breach.evidence.length === 0) {
      throw new Error("At least one evidence item is required to file a breach");
    }

    const breachId = randomUUID();
    const fullBreach: PoIBreach = {
      "@context": "https://zeroquery.dev/ns/poi/v1",
      "@type": "PoIBreach",
      ...breach,
    };

    this._breaches.set(breachId, fullBreach);
    this._transition(breach.registryEntryId, "breached");
    entry.breachId = breachId;
    this._audit(breach.registryEntryId, "breach_filed", {
      breachId,
      filedBy: breach.filedBy,
      deviationType: breach.deviation.type,
    });

    return fullBreach;
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  getEntry(registryEntryId: string): PoIRegistryEntry {
    return this._get(registryEntryId);
  }

  getBreach(breachId: string): PoIBreach {
    const b = this._breaches.get(breachId);
    if (!b) throw new Error(`Breach ${breachId} not found`);
    return b;
  }

  query(opts: RegistryQueryOptions = {}): PoIRegistryEntry[] {
    const {
      filerAddress, capability, status, since, until,
      limit = 100, offset = 0,
    } = opts;

    let candidates: PoIRegistryEntry[];

    if (filerAddress) {
      const ids = this._byFiler.get(filerAddress) ?? new Set<string>();
      candidates = [...ids].map(id => this._entries.get(id)!).filter(Boolean);
    } else {
      candidates = [...this._entries.values()];
    }

    if (capability) candidates = candidates.filter(e => e.intent.capability === capability);
    if (status)     candidates = candidates.filter(e => e.status === status);
    if (since)      candidates = candidates.filter(e => e.receivedAt >= since);
    if (until)      candidates = candidates.filter(e => e.receivedAt <= until);

    candidates.sort((a, b) => b.receivedAt - a.receivedAt);
    return candidates.slice(offset, offset + limit);
  }

  // ---------------------------------------------------------------------------
  // Audit Trail (court-admissible output)
  // ---------------------------------------------------------------------------

  /**
   * Return the full audit trail for an entry, including a SHA-256 hash
   * of the entire trail for court-admissible verification.
   */
  getAuditTrail(registryEntryId: string): {
    registryEntryId: string;
    entry: PoIRegistryEntry;
    events: AuditTrailEntry[];
    trailHash: string;
    exportedAt: number;
  } {
    const entry = this._get(registryEntryId);
    const events = this._auditTrail.get(registryEntryId) ?? [];
    const trailPayload = JSON.stringify({ registryEntryId, entry, events });
    const trailHash = createHash("sha256").update(trailPayload).digest("hex");

    return {
      registryEntryId,
      entry,
      events,
      trailHash,
      exportedAt: unixNow(),
    };
  }

  stats(): { totalEntries: number; totalBreaches: number; byStatus: Record<string, number> } {
    const byStatus: Record<string, number> = {};
    for (const entry of this._entries.values()) {
      byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
    }
    return { totalEntries: this._entries.size, totalBreaches: this._breaches.size, byStatus };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _get(id: string): PoIRegistryEntry {
    const entry = this._entries.get(id);
    if (!entry) throw new Error(`Registry entry ${id} not found`);
    return entry;
  }

  private _transition(id: string, status: RegistryStatus): void {
    const entry = this._get(id);
    const prev = entry.status;
    entry.status = status;
    entry.resolvedAt = unixNow();
    this._audit(id, "status_changed", { from: prev, to: status });
  }

  private _audit(id: string, event: AuditTrailEntry["event"], detail: Record<string, unknown>): void {
    if (!this._auditTrail.has(id)) this._auditTrail.set(id, []);
    this._auditTrail.get(id)!.push({ timestamp: unixNow(), event, detail });
  }
}

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}
