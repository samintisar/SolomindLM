/**
 * Patches @convex-dev/better-auth cross-domain plugin so verify-email redirects
 * include the one-time token (ott), allowing users to be logged in after
 * clicking the verification link when auth runs on a different domain (e.g. Convex).
 */
import fs from "fs";
import path from "path";

const filePath = path.join(
  process.cwd(),
  "node_modules/@convex-dev/better-auth/dist/plugins/cross-domain/index.js"
);

const ORIGINAL =
  'ctx.path?.startsWith("/magic-link/verify")) &&';
const PATCHED =
  'ctx.path?.startsWith("/magic-link/verify") ||\n                            ctx.path?.startsWith("/verify-email")) &&';

try {
  if (!fs.existsSync(filePath)) {
    console.warn("patch-better-auth: package not found, skipping");
    process.exit(0);
  }

  let content = fs.readFileSync(filePath, "utf8");

  if (content.includes('"/verify-email")')) {
    console.log("✓ Better Auth cross-domain plugin already patched");
    process.exit(0);
  }

  if (!content.includes(ORIGINAL)) {
    console.warn(
      "patch-better-auth: expected pattern not found in file, skipping (package version may have changed)"
    );
    process.exit(0);
  }

  content = content.replace(ORIGINAL, PATCHED);
  fs.writeFileSync(filePath, content, "utf8");
  console.log("✓ Better Auth cross-domain plugin patched successfully");
} catch (error) {
  console.error("✗ Failed to patch Better Auth:", error.message);
  process.exit(1);
}
