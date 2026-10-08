/**
 * Deletes Convex preview deployments whose branch is finished, so merged and
 * closed PRs stop holding the team's deployment quota (40, shared by every
 * deployment). When the quota is full, every new Vercel preview fails with
 * `DeploymentQuotaReached` (see .github/BRANCHING.md, "PR previews").
 *
 * Each Vercel preview build runs `convex deploy` with the preview deploy key,
 * which creates a preview deployment whose `previewIdentifier` is the git
 * branch name. Convex only expires those after 5–14 days.
 *
 * Usage (run by .github/workflows/convex-preview-cleanup.yml):
 *   bun scripts/cleanup-convex-previews.ts --branch <name>   # a PR closed: delete its preview
 *   bun scripts/cleanup-convex-previews.ts --sweep           # delete previews of branches not in LIVE_BRANCHES
 *   add --dry-run to print what would be deleted
 *
 * Env: CONVEX_TEAM_ACCESS_TOKEN (team settings → Access Tokens), CONVEX_TEAM_SLUG,
 * CONVEX_PROJECT_SLUG, and for --sweep LIVE_BRANCHES (newline-separated branch names
 * that still exist on the remote).
 */

const API = "https://api.convex.dev/v1";

export type Deployment = {
  name: string;
  deploymentType: "dev" | "prod" | "preview" | "custom";
  previewIdentifier?: string | null;
};

/** Names of the preview deployments built from `branch`. */
export function previewsForBranch(deployments: Deployment[], branch: string): string[] {
  return deployments
    .filter((d) => d.deploymentType === "preview" && d.previewIdentifier === branch)
    .map((d) => d.name);
}

/** Names of the preview deployments whose branch is not in `liveBranches`. */
export function stalePreviews(deployments: Deployment[], liveBranches: string[]): string[] {
  // An empty list almost certainly means the branch lookup failed, and acting
  // on it would delete every preview, including those of open PRs.
  if (liveBranches.length === 0) throw new Error("No live branches given; refusing to sweep");
  const live = new Set(liveBranches);
  return deployments
    .filter((d) => d.deploymentType === "preview")
    .filter((d) => !d.previewIdentifier || !live.has(d.previewIdentifier))
    .map((d) => d.name);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function api<T>(token: string, method: "GET" | "POST", path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  }
  const body = await res.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const branchIndex = args.indexOf("--branch");
  const branch = branchIndex >= 0 ? args[branchIndex + 1] : undefined;
  const sweep = args.includes("--sweep");
  if (!sweep && !branch) throw new Error("Pass --branch <name> or --sweep");

  const token = requireEnv("CONVEX_TEAM_ACCESS_TOKEN");
  const team = requireEnv("CONVEX_TEAM_SLUG");
  const projectSlug = requireEnv("CONVEX_PROJECT_SLUG");

  const project = await api<{ id: number }>(token, "GET", `/teams/${team}/projects/${projectSlug}`);
  const deployments = await api<Deployment[]>(
    token,
    "GET",
    `/projects/${project.id}/list_deployments?deploymentType=preview`
  );

  const names = sweep
    ? stalePreviews(deployments, (process.env.LIVE_BRANCHES ?? "").split("\n").filter(Boolean))
    : previewsForBranch(deployments, branch as string);

  const previews = deployments.filter((d) => d.deploymentType === "preview").length;
  console.log(
    `${previews} preview deployment(s); ${names.length} to delete${dryRun ? " (dry run)" : ""}`
  );
  for (const name of names) {
    const label = deployments.find((d) => d.name === name)?.previewIdentifier ?? "(no branch)";
    if (!dryRun) await api(token, "POST", `/deployments/${name}/delete`);
    console.log(`${dryRun ? "would delete" : "deleted"} ${name} (${label})`);
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(`::error title=Convex preview cleanup failed::${String(error)}`);
    process.exit(1);
  });
}
