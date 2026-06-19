import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateIntentRank } from "../dist/index.js";

test("calculateIntentRank handles null reputation", () => {
  assert.equal(calculateIntentRank(null), 0);
});

test("calculateIntentRank scores new untested accounts low", () => {
  const rep = { score: 50, fulfilled: 0, failed: 0, lastActive: Math.floor(Date.now() / 1000), decayedScore: 50 };
  // Should cap at 10 for untested accounts
  assert.equal(calculateIntentRank(rep), 10);
});

test("calculateIntentRank penalizes failures heavily", () => {
  const now = Math.floor(Date.now() / 1000);
  const badActor = { score: 1000, fulfilled: 10, failed: 5, lastActive: now, decayedScore: 1000 };
  const goodActor = { score: 1000, fulfilled: 15, failed: 0, lastActive: now, decayedScore: 1000 };
  
  const badRank = calculateIntentRank(badActor, now);
  const goodRank = calculateIntentRank(goodActor, now);
  
  assert.ok(goodRank > badRank, "Good actor should outrank bad actor with same volume and score");
});

test("calculateIntentRank applies time decay", () => {
  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysAgo = now - (86400 * 30);
  
  const activeActor = { score: 5000, fulfilled: 100, failed: 1, lastActive: now, decayedScore: 5000 };
  const staleActor = { score: 5000, fulfilled: 100, failed: 1, lastActive: thirtyDaysAgo, decayedScore: 2500 };
  
  const activeRank = calculateIntentRank(activeActor, now);
  const staleRank = calculateIntentRank(staleActor, now);
  
  assert.ok(activeRank > staleRank, "Active actor should outrank stale actor");
});
