/**
 * Refuse to seed when RAG_EVAL_CONVEX_URL points at the prod deployment named in
 * CONVEX_DEPLOYMENT ("prod:<name>", as written by `convex:env:pull:prod`).
 * Second line of defence; the server gate (RAG_EVALS_ENABLED) is the first.
 */
export function assertNotProdConvexUrl(
  evalUrl: string,
  convexDeployment: string | undefined
): void {
  if (!convexDeployment?.startsWith("prod:")) return;
  const name = convexDeployment.slice("prod:".length).split("#")[0]?.trim();
  if (!name) return;
  const host = new URL(evalUrl).hostname;
  if (host === name || host.startsWith(`${name}.`)) {
    throw new Error(
      `Refusing to run: RAG_EVAL_CONVEX_URL points at the prod deployment "${name}". Use your dev deployment.`
    );
  }
}
