import { ConvexHttpClient } from "convex/browser";

const convexUrl = process.env.RAG_EVAL_CONVEX_URL;
if (!convexUrl) {
  console.error("Missing RAG_EVAL_CONVEX_URL");
  process.exit(1);
}

// Not yet implemented: querying reports requires auth that isn't wired here yet.
// Until then, this script prints instructions for manual inspection.
console.warn("fetch-reports: not yet implemented — printing dashboard instructions instead.\n");

const _client = new ConvexHttpClient(convexUrl);

console.log("Report eval completed. To view the actual report content:");
console.log("1. Go to https://dashboard.convex.dev/");
console.log("2. Navigate to your deployment:", convexUrl);
console.log("3. Go to Data -> reports table");
console.log("4. Look for recent reports with title 'Report (eval)'");
console.log("\nOr run this query in the Convex dashboard:");
console.log(`db.query("reports").order("desc").take(2)`);
