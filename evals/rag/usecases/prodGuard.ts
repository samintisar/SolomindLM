/**
 * Refuse to seed when RAG_EVAL_CONVEX_URL points at the prod deployment named in
 * CONVEX_DEPLOYMENT ("prod:<name>", as written by `convex:env:pull:prod`).
 * Second line of defence; the server gate (RAG_EVALS_ENABLED) is the first.
 * Best-effort only: it is a no-op without a `prod:` CONVEX_DEPLOYMENT or for custom
 * domains, so the server gate is the real protection.
 */
export function assertNotProdConvexUrl(
  evalUrl: string,
  convexDeployment: string | undefined
): void {
  if (!convexDeployment?.startsWith("prod:")) return;
  const name = convexDeployment.slice("prod:".length).split("#")[0]?.trim();
  if (!name) return;
  let host: string;
  try {
    host = new URL(evalUrl).hostname;
  } catch {
    throw new Error(`RAG_EVAL_CONVEX_URL is not a valid URL: ${evalUrl}`);
  }
  if (host === name || host.startsWith(`${name}.`)) {
    throw new Error(
      `Refusing to run: RAG_EVAL_CONVEX_URL points at the prod deployment "${name}". Use your dev deployment.`
    );
  }
}

/**
 * Read RAG_EVAL_CONVEX_URL + RAG_EVAL_SECRET for a live eval or seed run and refuse a prod URL.
 * Throws an Error whose message (one or more lines) is ready to print after "FATAL: ".
 */
export function requireEvalConvexEnv(env: Record<string, string | undefined> = process.env): {
  convexUrl: string;
  evalSecret: string;
} {
  const convexUrl = env.RAG_EVAL_CONVEX_URL?.trim();
  const evalSecret = env.RAG_EVAL_SECRET?.trim();
  if (!convexUrl) {
    throw new Error(
      "Set RAG_EVAL_CONVEX_URL to your dev Convex URL (https://….convex.cloud).\n" +
        "  Do not point this at prod (see evals/rag/env.eval.example)."
    );
  }
  if (!evalSecret) {
    throw new Error(
      "Set RAG_EVAL_SECRET to match the RAG_EVAL_SECRET env var on that deployment.\n" +
        "  Convex must also set RAG_EVALS_ENABLED=true on that deployment for eval actions."
    );
  }
  assertNotProdConvexUrl(convexUrl, env.CONVEX_DEPLOYMENT);
  return { convexUrl, evalSecret };
}
