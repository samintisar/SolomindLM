/** Finding the production deployment that was live before this one, from the GitHub Deployments API. */

export type Deployment = { id: number; statuses_url: string };
export type DeploymentStatus = { state: string; environment_url?: string };

/** Hosts that may receive the Vercel bypass secret (same list as e2e/csp/check-deployed-headers.ts). */
const DEPLOYMENT_HOSTS = [
  /^www\.solomindlm\.com$/,
  /^solomindlm-(?:web-)?[a-z0-9-]+-samintisars-projects\.vercel\.app$/,
];

export function canReceiveBypassSecret(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" && DEPLOYMENT_HOSTS.some((host) => host.test(parsed.hostname))
    );
  } catch {
    return false;
  }
}

/** Upper bound on pages read, so a broken API can't loop forever. */
const MAX_DEPLOYMENT_PAGES = 20;

/**
 * URL of the newest deployment older than `currentId` that went live. Pages are newest first, so
 * the scan reads pages until it finds one or runs out. Vercel leaves superseded production
 * deployments at `success`; GitHub's own auto-inactivation would mark them `inactive`.
 */
export async function findPreviousDeploymentUrl(options: {
  listDeployments: (page: number) => Promise<Deployment[]>;
  currentId: number;
  fetchLatestStatus: (deployment: Deployment) => Promise<DeploymentStatus | null>;
}): Promise<string | null> {
  for (let page = 1; page <= MAX_DEPLOYMENT_PAGES; page += 1) {
    const deployments = await options.listDeployments(page);
    if (deployments.length === 0) {
      return null;
    }
    const older = deployments
      .filter((deployment) => deployment.id < options.currentId)
      .sort((a, b) => b.id - a.id);
    for (const deployment of older) {
      const status = await options.fetchLatestStatus(deployment);
      if ((status?.state === "success" || status?.state === "inactive") && status.environment_url) {
        return status.environment_url;
      }
    }
  }
  return null;
}
