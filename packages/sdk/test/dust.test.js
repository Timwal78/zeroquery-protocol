import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeHttpHeader,
  parseHttpHeader,
  encodeDnsTxt,
  parseDnsTxt,
  dnsName,
  encodeEmailHeader,
  parseEmailHeader,
  encodeGitHubTrailer,
  parseGitHubTrailer,
  scanCommitMessage,
} from "../dist/index.js";

const SIG = {
  did: "did:poi:xah:rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
  intents: ["travel", "booking"],
};

test("HTTP header round-trips", () => {
  const { name, value } = encodeHttpHeader(SIG);
  assert.equal(name, "X-PoI-Available");
  const back = parseHttpHeader(value);
  assert.equal(back.did, SIG.did);
  assert.deepEqual(back.intents, SIG.intents);
});

test("HTTP header carries an optional endpoint", () => {
  const { value } = encodeHttpHeader({ ...SIG, endpoint: "https://r.example/poi" });
  assert.equal(parseHttpHeader(value).endpoint, "https://r.example/poi");
});

test("DNS TXT round-trips under _poi.<host>", () => {
  assert.equal(dnsName("example.com"), "_poi.example.com");
  const txt = encodeDnsTxt(SIG);
  const back = parseDnsTxt(txt);
  assert.equal(back.did, SIG.did);
  assert.deepEqual(back.intents, SIG.intents);
});

test("email header requires the poi-resolver flag", () => {
  const { value } = encodeEmailHeader(SIG);
  assert.ok(value.startsWith("poi-resolver;"));
  assert.equal(parseEmailHeader(value).did, SIG.did);
  assert.equal(parseEmailHeader("did=" + SIG.did), null); // missing flag
});

test("GitHub trailer round-trips and is found in a commit message", () => {
  const trailer = encodeGitHubTrailer(SIG);
  assert.deepEqual(parseGitHubTrailer(trailer).intents, SIG.intents);
  const msg = `feat: add resolver\n\nBody text here.\n\n${trailer}\n`;
  assert.equal(scanCommitMessage(msg).did, SIG.did);
});

test("invalid DIDs are rejected on encode and decode", () => {
  assert.throws(() => encodeHttpHeader({ did: "did:poi:eth:x", intents: ["a"] }));
  assert.equal(parseHttpHeader("true;did=did:poi:eth:x;intents=a"), null);
  assert.equal(parseGitHubTrailer("PoI-Agent: not-a-did (intents: a)"), null);
});

test("intents with separators are rejected", () => {
  assert.throws(() => encodeDnsTxt({ did: SIG.did, intents: ["a,b"] }));
});
