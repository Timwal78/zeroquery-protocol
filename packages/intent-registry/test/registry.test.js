/**
 * Basic smoke tests for the ZeroQuery IntentRegistry.
 * Run with: node --test test/registry.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import from src directly since we may not have built dist yet
import { IntentRegistry } from "../src/registry.js";

const FILER = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";

const baseIntent = () => ({
  "@context": "https://zeroquery.dev/ns/poi/v1",
  "@type": "PoIIntent",
  capability: "travel.hotel.search",
  params: { city: "NYC", maxPrice: 200 },
  maxBond: 1000,
  rail: "rlusd-xrp",
});

describe("IntentRegistry", () => {
  it("registers an intent and returns a registry entry", () => {
    const reg = new IntentRegistry();
    const entry = reg.register(baseIntent(), FILER);
    assert.equal(entry["@type"], "PoIRegistryEntry");
    assert.equal(entry.status, "active");
    assert.equal(entry.filerAddress, FILER);
    assert.ok(entry.intentHash.length === 64, "SHA-256 hex hash is 64 chars");
    assert.ok(entry.registryEntryId, "has registryEntryId");
  });

  it("retrieves entry by id", () => {
    const reg = new IntentRegistry();
    const entry = reg.register(baseIntent(), FILER);
    const fetched = reg.getEntry(entry.registryEntryId);
    assert.equal(fetched.intentHash, entry.intentHash);
  });

  it("detects capability mismatch breach", () => {
    const reg = new IntentRegistry();
    const entry = reg.register(baseIntent(), FILER);
    const dev = reg.detectBreach(entry.registryEntryId, {
      capability: "finance.stock.buy",
    });
    assert.ok(dev, "breach detected");
    assert.equal(dev.type, "capability_mismatch");
    assert.equal(dev.declared, "travel.hotel.search");
    assert.equal(dev.actual, "finance.stock.buy");
  });

  it("detects bond violation", () => {
    const reg = new IntentRegistry();
    const entry = reg.register(baseIntent(), FILER);
    const dev = reg.detectBreach(entry.registryEntryId, { bondUsed: 1500 });
    assert.ok(dev);
    assert.equal(dev.type, "bond_violation");
  });

  it("returns null when compliant", () => {
    const reg = new IntentRegistry();
    const entry = reg.register(baseIntent(), FILER);
    const dev = reg.detectBreach(entry.registryEntryId, {
      capability: "travel.hotel.search",
      bondUsed: 999,
      railUsed: "rlusd-xrp",
      params: { city: "NYC", maxPrice: 205 },  // within 10%
    });
    assert.equal(dev, null);
  });

  it("files a formal breach and transitions status", () => {
    const reg = new IntentRegistry();
    const entry = reg.register(baseIntent(), FILER);
    const breach = reg.fileBreach({
      intentId: entry.intentId,
      registryEntryId: entry.registryEntryId,
      filedBy: "rPVMhWBsfF9iMXYj3aAzJVkPDTFNSyWdKy",
      filedAt: Math.floor(Date.now() / 1000),
      deviation: { type: "capability_mismatch", declared: "travel.hotel.search", actual: "finance.stock.buy" },
      evidence: [{ type: "api_log", ref: "https://example.com/log/abc123" }],
    });
    assert.equal(breach["@type"], "PoIBreach");
    const updated = reg.getEntry(entry.registryEntryId);
    assert.equal(updated.status, "breached");
  });

  it("emits an audit trail with trailHash", () => {
    const reg = new IntentRegistry();
    const entry = reg.register(baseIntent(), FILER);
    reg.markFulfilled(entry.registryEntryId);
    const trail = reg.getAuditTrail(entry.registryEntryId);
    assert.ok(trail.events.length >= 2);   // registered + status_changed
    assert.ok(trail.trailHash.length === 64);
    assert.equal(trail.entry.status, "fulfilled");
  });

  it("queries by filer address", () => {
    const reg = new IntentRegistry();
    reg.register(baseIntent(), FILER);
    reg.register({ ...baseIntent(), capability: "finance.market.scan" }, FILER);
    const results = reg.query({ filerAddress: FILER });
    assert.equal(results.length, 2);
  });

  it("filters query by status", () => {
    const reg = new IntentRegistry();
    const e1 = reg.register(baseIntent(), FILER);
    reg.register(baseIntent(), FILER);
    reg.markFulfilled(e1.registryEntryId);
    const active = reg.query({ status: "active" });
    const fulfilled = reg.query({ status: "fulfilled" });
    assert.equal(fulfilled.length, 1);
    assert.ok(active.length >= 1);
  });
});
