import { test } from "node:test";
import assert from "node:assert/strict";
import { getVerifierPda, POI_VERIFIER_PROGRAM_ID } from "../dist/index.js";

test("Verifier PDA derivation", () => {
  const { pda, bump } = getVerifierPda();
  assert.ok(pda, "Should return a valid PDA string");
  assert.ok(bump <= 255 && bump >= 0, "Bump must be between 0 and 255");
});

test("Verifier Program ID is correct", () => {
  assert.equal(POI_VERIFIER_PROGRAM_ID, "Verif1er11111111111111111111111111111111111");
});
