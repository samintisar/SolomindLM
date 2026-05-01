import { ConvexHttpClient } from "convex/browser";

const convexUrl = process.env.RAG_EVAL_CONVEX_URL;
if (!convexUrl) {
  console.error("Missing RAG_EVAL_CONVEX_URL");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);

// We need to query reports - but list requires auth
// Let's just output the report IDs that were generated
// The user can view them in the Convex dashboard

console.log("Report eval completed. To view the actual report content:");
console.log("1. Go to https://dashboard.convex.dev/");
console.log("2. Navigate to your deployment:", convexUrl);
console.log("3. Go to Data -> reports table");
console.log("4. Look for recent reports with title 'Report (eval)'");
console.log("\nOr run this query in the Convex dashboard:");
console.log(`db.query("reports").order("desc").take(2)`);
