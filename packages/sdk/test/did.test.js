import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base58,
  base58check,
  XRPL_ALPHABET,
  deriveDid,
  didFromAddress,
  parseDid,
  isValidDid,
  solAddressFromPubkey,
  xrplAddressFromPubkey,
  isValidXrplAddress,
  isValidSolAddress,
} from "../dist/index.js";

test("base58 round-trips arbitrary bytes", () => {
  const bytes = new Uint8Array([0, 0, 1, 2, 3, 250, 255, 42]);
  assert.deepEqual(base58.decode(base58.encode(bytes)), bytes);
});

test("base58 of 32 zero bytes is the Solana System Program id", () => {
  const zeros = new Uint8Array(32);
  assert.equal(base58.encode(zeros), "11111111111111111111111111111111");
  assert.ok(isValidSolAddress("11111111111111111111111111111111"));
});

test("base58check rejects a tampered checksum", () => {
  const payload = new Uint8Array([0, 1, 2, 3, 4]);
  const good = base58check.encode(payload, XRPL_ALPHABET);
  const tampered = good.slice(0, -1) + (good.endsWith("r") ? "p" : "r");
  assert.throws(() => base58check.decode(tampered, XRPL_ALPHABET));
});

test("XRPL pubkey -> classic address (canonical docs vector)", () => {
  // Well-known XRPL keypair test vector.
  const pubkey = Buffer.from(
    "0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020",
    "hex",
  );
  assert.equal(
    xrplAddressFromPubkey(pubkey),
    "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
  );
});

test("known-good XRPL address validates; tampered one does not", () => {
  assert.ok(isValidXrplAddress("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"));
  assert.ok(!isValidXrplAddress("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTX"));
  assert.ok(!isValidXrplAddress("notanaddress"));
});

test("deriveDid(xah, pubkey) yields a parseable did:poi:xah", () => {
  const pubkey = Buffer.from(
    "0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020",
    "hex",
  );
  const did = deriveDid("xah", pubkey);
  assert.equal(did, "did:poi:xah:rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh");
  const parsed = parseDid(did);
  assert.equal(parsed.chain, "xah");
  assert.equal(parsed.address, "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh");
});

test("deriveDid(sol, pubkey) yields a parseable did:poi:sol", () => {
  const pubkey = new Uint8Array(32).fill(7);
  const did = deriveDid("sol", pubkey);
  const parsed = parseDid(did);
  assert.equal(parsed.chain, "sol");
  assert.equal(parsed.address, solAddressFromPubkey(pubkey));
});

test("parseDid rejects malformed / wrong-method / wrong-chain DIDs", () => {
  assert.ok(!isValidDid("did:poi:xah"));
  assert.ok(!isValidDid("did:web:xah:rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"));
  assert.ok(!isValidDid("did:poi:eth:rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"));
  assert.ok(!isValidDid("did:poi:sol:notbase58!!"));
  assert.ok(!isValidDid("did:poi:xah:rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTX")); // bad checksum
});

test("didFromAddress rejects unsupported chains", () => {
  assert.throws(() => didFromAddress("eth", "x"));
});
