/**
 * Self-check for the relay's signed OAuth state (sign/verify round-trip, tamper and
 * expiry rejection). Run with: npx tsx scripts/check-exact-state.ts
 */
process.env.STATE_SIGNING_SECRET = "test-secret-do-not-use-in-prod";

import { signState, verifyState } from "../src/server/lib/exact";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`ok: ${msg}`);
}

const state = signState("leffers");
const verified = verifyState(state);
assert(verified?.tenant === "leffers", "valid state round-trips to the correct tenant");

assert(verifyState(state + "x") === null, "tampered state is rejected");
assert(verifyState("not.avalidstate") === null, "garbage state is rejected");

const [payload] = state.split(".");
const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
const expiredPayload = Buffer.from(JSON.stringify({ ...decoded, iat: Date.now() - 11 * 60 * 1000 })).toString("base64url");
const crypto = require("crypto");
const expiredSig = crypto.createHmac("sha256", process.env.STATE_SIGNING_SECRET).update(expiredPayload).digest("base64url");
assert(verifyState(`${expiredPayload}.${expiredSig}`) === null, "expired (>10min) state is rejected");

console.log("All checks passed.");
