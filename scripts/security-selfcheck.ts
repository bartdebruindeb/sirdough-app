/**
 * Self-check for the two non-trivial security helpers added in the hardening pass:
 * the spoof-resistant client-IP parser and the magic-byte image validator.
 * Run: npx tsx scripts/security-selfcheck.ts
 */
import assert from "node:assert";
import { getClientIp, isLockedOut, recordFailure, clearFailures } from "../src/server/lib/ratelimit";
import { readImageUpload } from "../src/server/lib/imageUpload";
import { resolveSelectedCustomerId } from "../src/server/lib/mijnCustomer";

function reqWith(headers: Record<string, string>): Request {
  return new Request("http://localhost/x", { headers });
}

async function main() {
  // --- getClientIp: must NOT trust the attacker-controlled first XFF entry ---
  assert.equal(
    getClientIp(reqWith({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 9.9.9.9" })),
    "9.9.9.9",
    "must take the LAST XFF entry (the proxy-appended hop), not the spoofable first",
  );
  assert.equal(
    getClientIp(reqWith({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" })),
    "9.9.9.9",
    "x-real-ip wins over x-forwarded-for",
  );
  assert.equal(getClientIp(reqWith({})), "unknown", "no headers -> unknown");

  // --- per-account lockout: locks after N failures, and a success clears it ---
  const k = "login:victim@example.com";
  const LIMIT = 5, WIN = 15 * 60 * 1000;
  for (let i = 0; i < 4; i++) recordFailure(k, WIN);
  assert.equal(isLockedOut(k, LIMIT, WIN), false, "4 failures: not locked yet");
  recordFailure(k, WIN); // 5th
  assert.equal(isLockedOut(k, LIMIT, WIN), true, "5 failures: locked");
  clearFailures(k); // successful login resets
  assert.equal(isLockedOut(k, LIMIT, WIN), false, "success clears the lockout");

  // --- multi-location portal: selected location must belong to the login (no IDOR) ---
  const own = ["cust_A", "cust_B"];
  assert.equal(resolveSelectedCustomerId(own, "cust_B"), "cust_B", "a location the login owns is honoured");
  assert.equal(resolveSelectedCustomerId(own, "cust_EVIL"), "cust_A", "a foreign/forged location falls back to the first, never leaks");
  assert.equal(resolveSelectedCustomerId(own, null), "cust_A", "no selection -> first location");
  assert.equal(resolveSelectedCustomerId([], "cust_A"), null, "no locations -> null");

  // --- readImageUpload: sniff real content, not the client MIME type ---
  const jpeg = new File([Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0])], "a.jpg", { type: "image/jpeg" });
  const buf = await readImageUpload(jpeg);
  assert.equal(buf.length, 12, "valid JPEG passes and bytes are returned");

  // A file that CLAIMS image/jpeg but is really text must be rejected.
  const fakeImage = new File([Buffer.from("<script>alert(1)</script>\n\n\n\n")], "x.jpg", { type: "image/jpeg" });
  await assert.rejects(readImageUpload(fakeImage), /geldige afbeelding/i, "content that isn't an image is rejected despite image MIME");

  // Oversized (>5MB) is rejected before allocating the buffer path.
  const big = new File([Buffer.alloc(6 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
  await assert.rejects(readImageUpload(big), /te groot/i, "files over the size cap are rejected");

  console.log("security-selfcheck: all assertions passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
