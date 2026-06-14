/**
 * Intent Dust — parasitic discovery.  (spec §5)
 *
 * No central registry. Agents announce capability by embedding tiny signals in
 * traffic they already produce. This module encodes/decodes those signals for
 * each channel so a responder can advertise and a crawler can detect them.
 *
 *   HTTP    response header   X-PoI-Available: true;did=...;intents=...
 *   DNS     TXT at _poi.<host>  "did=...;intents=..."
 *   Email   header            X-Agent-Capability: poi-resolver;did=...;intents=...
 *   GitHub  commit trailer    PoI-Agent: <did> (intents: a,b)
 *
 * All four carry the same payload: a DID + a list of capability tags.
 */
import { isValidDid } from "./did.js";

export interface DustSignal {
  did: string;
  /** Capability/vertical tags, e.g. ["travel", "booking"]. */
  intents: string[];
  /** Optional explicit endpoint (defaults to the DID itself). */
  endpoint?: string;
}

function assertSignal(sig: DustSignal): void {
  if (!isValidDid(sig.did)) throw new Error(`invalid DID in dust signal: ${sig.did}`);
  if (!Array.isArray(sig.intents) || sig.intents.some((i) => !i || /[;,\s]/.test(i))) {
    throw new Error("intents must be non-empty tags without ';', ',' or whitespace");
  }
}

const HTTP_HEADER = "X-PoI-Available";
const EMAIL_HEADER = "X-Agent-Capability";
const GITHUB_TRAILER = "PoI-Agent";

/* ----------------------------- HTTP ----------------------------- */

export function encodeHttpHeader(sig: DustSignal): { name: string; value: string } {
  assertSignal(sig);
  const parts = [`true`, `did=${sig.did}`, `intents=${sig.intents.join(",")}`];
  if (sig.endpoint) parts.push(`endpoint=${sig.endpoint}`);
  return { name: HTTP_HEADER, value: parts.join(";") };
}

export function parseHttpHeader(value: string): DustSignal | null {
  const fields = parseFields(value);
  if (fields.flag !== "true" || !fields.did) return null;
  return toSignal(fields);
}

/* ----------------------------- DNS ------------------------------ */

export function dnsName(host: string): string {
  return `_poi.${host}`;
}

export function encodeDnsTxt(sig: DustSignal): string {
  assertSignal(sig);
  const parts = [`did=${sig.did}`, `intents=${sig.intents.join(",")}`];
  if (sig.endpoint) parts.push(`endpoint=${sig.endpoint}`);
  return parts.join(";");
}

export function parseDnsTxt(txt: string): DustSignal | null {
  const fields = parseFields(txt);
  if (!fields.did) return null;
  return toSignal(fields);
}

/* ----------------------------- Email ---------------------------- */

export function encodeEmailHeader(sig: DustSignal): { name: string; value: string } {
  assertSignal(sig);
  const parts = ["poi-resolver", `did=${sig.did}`, `intents=${sig.intents.join(",")}`];
  if (sig.endpoint) parts.push(`endpoint=${sig.endpoint}`);
  return { name: EMAIL_HEADER, value: parts.join(";") };
}

export function parseEmailHeader(value: string): DustSignal | null {
  const fields = parseFields(value);
  if (fields.flag !== "poi-resolver" || !fields.did) return null;
  return toSignal(fields);
}

/* ----------------------------- GitHub --------------------------- */

export function encodeGitHubTrailer(sig: DustSignal): string {
  assertSignal(sig);
  return `${GITHUB_TRAILER}: ${sig.did} (intents: ${sig.intents.join(",")})`;
}

const GITHUB_RE = new RegExp(
  `^${GITHUB_TRAILER}:\\s*(\\S+)\\s*\\(intents:\\s*([^)]*)\\)\\s*$`,
);

export function parseGitHubTrailer(line: string): DustSignal | null {
  const m = line.trim().match(GITHUB_RE);
  if (!m) return null;
  const did = m[1];
  if (!isValidDid(did)) return null;
  const intents = m[2].split(",").map((s) => s.trim()).filter(Boolean);
  return { did, intents };
}

/** Scan a multi-line commit message for a PoI-Agent trailer. */
export function scanCommitMessage(message: string): DustSignal | null {
  for (const line of message.split(/\r?\n/)) {
    const sig = parseGitHubTrailer(line);
    if (sig) return sig;
  }
  return null;
}

/* ----------------------------- shared --------------------------- */

interface Fields {
  flag?: string;
  did?: string;
  intents: string[];
  endpoint?: string;
}

function parseFields(raw: string): Fields {
  const out: Fields = { intents: [] };
  const segments = raw.split(";").map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const eq = seg.indexOf("=");
    if (eq === -1) {
      if (i === 0) out.flag = seg; // leading bare token (true / poi-resolver)
      continue;
    }
    const key = seg.slice(0, eq);
    const val = seg.slice(eq + 1);
    if (key === "did") out.did = val;
    else if (key === "intents") out.intents = val.split(",").map((s) => s.trim()).filter(Boolean);
    else if (key === "endpoint") out.endpoint = val;
  }
  return out;
}

function toSignal(f: Fields): DustSignal | null {
  if (!f.did || !isValidDid(f.did)) return null;
  const sig: DustSignal = { did: f.did, intents: f.intents };
  if (f.endpoint) sig.endpoint = f.endpoint;
  return sig;
}
