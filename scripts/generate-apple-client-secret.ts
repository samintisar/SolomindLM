/**
 * Generates the Sign in with Apple client secret (AUTH_APPLE_SECRET) from a .p8 key.
 * Apple caps its lifetime at 6 months, so re-run this and update the Convex env before
 * it expires.
 *
 *   bun scripts/generate-apple-client-secret.ts <path/to/AuthKey_XXXX.p8> <KEY_ID> <SERVICES_ID>
 */
import { readFileSync } from "node:fs";
import { importPKCS8, SignJWT } from "jose";

const TEAM_ID = "5TNBJBPR85";
const LIFETIME_DAYS = 180; // Apple's maximum is 15,777,000 s (~182.6 days).

const [keyPath, keyId, servicesId] = process.argv.slice(2);
if (!keyPath || !keyId || !servicesId) {
  console.error(
    "Usage: bun scripts/generate-apple-client-secret.ts <AuthKey.p8> <KEY_ID> <SERVICES_ID>"
  );
  process.exit(1);
}

const privateKey = await importPKCS8(readFileSync(keyPath, "utf8"), "ES256");
const secret = await new SignJWT({})
  .setProtectedHeader({ alg: "ES256", kid: keyId })
  .setIssuer(TEAM_ID)
  .setIssuedAt()
  .setExpirationTime(`${LIFETIME_DAYS}d`)
  .setAudience("https://appleid.apple.com")
  .setSubject(servicesId)
  .sign(privateKey);

const expires = new Date(Date.now() + LIFETIME_DAYS * 24 * 60 * 60 * 1000);
console.log(secret);
console.error(`\nExpires ${expires.toDateString()}. Rotate before then.`);
