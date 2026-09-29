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
