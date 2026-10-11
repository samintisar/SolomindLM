#!/usr/bin/env bun

/**
 * Runs from .github/workflows/indexnow.yml once Vercel reports a successful production deploy.
 * Diffs the previous production deployment's sitemap.xml against this deployment's and submits
 * the changed URLs to IndexNow. Both deployments are immutable, so a failed run can be re-run.
 *
 * Env: INDEXNOW_KEY, DEPLOYMENT_ID, DEPLOYMENT_URL, DEPLOYMENT_ENVIRONMENT, GITHUB_REPOSITORY,
 * GITHUB_TOKEN, VERCEL_AUTOMATION_BYPASS_SECRET (deployment URLs sit behind Deployment Protection).
 */
import {
  describeIndexNowStatus,
  fetchSitemapState,
  isValidIndexNowKey,
  submitIndexNowBatches,
} from "../src/shared/seo/indexNow.ts";
import { changedSitemapUrls } from "../src/shared/seo/indexNowState.ts";
import {
  canReceiveBypassSecret,
  type Deployment,
  type DeploymentStatus,
  findPreviousDeploymentUrl,
} from "./indexnow-deployments.ts";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function github<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

async function main(): Promise<void> {
  const key = requireEnv("INDEXNOW_KEY");
  if (!isValidIndexNowKey(key)) {
    throw new Error("INDEXNOW_KEY must be 8–128 characters of letters, numbers, and dashes");
  }
  const deploymentId = Number(requireEnv("DEPLOYMENT_ID"));
  const deploymentUrl = requireEnv("DEPLOYMENT_URL");
  const environment = requireEnv("DEPLOYMENT_ENVIRONMENT");
  const repo = requireEnv("GITHUB_REPOSITORY");
  const token = requireEnv("GITHUB_TOKEN");
  const bypass = requireEnv("VERCEL_AUTOMATION_BYPASS_SECRET");

  const deployments = await github<Deployment[]>(
    `https://api.github.com/repos/${repo}/deployments?environment=${encodeURIComponent(environment)}&per_page=30`,
    token
  );
  const previousUrl = await findPreviousDeploymentUrl({
    deployments,
    currentId: deploymentId,
    fetchLatestStatus: async (deployment) =>
      (await github<DeploymentStatus[]>(`${deployment.statuses_url}?per_page=1`, token))[0] ?? null,
  });
  if (!previousUrl) {
    console.log("[indexnow] No earlier production deployment to diff against; submitting nothing");
    return;
  }

  for (const url of [previousUrl, deploymentUrl]) {
    if (!canReceiveBypassSecret(url)) {
      throw new Error(`Refusing to send the bypass secret to ${url}`);
    }
  }
  const headers = { "x-vercel-protection-bypass": bypass };
  const [previous, current] = await Promise.all([
    fetchSitemapState(previousUrl, { headers }),
    fetchSitemapState(deploymentUrl, { headers }),
  ]);
  if (!previous || !current) {
    throw new Error(
      `Could not read sitemap.xml from ${previous ? deploymentUrl : previousUrl}; re-run this job to retry`
    );
  }

  const changedUrls = changedSitemapUrls(previous, current);
  console.log(`[indexnow] Diffed ${previousUrl} → ${deploymentUrl}`);
  if (changedUrls.length === 0) {
    console.log("[indexnow] No sitemap changes; nothing to submit");
    return;
  }
  console.log(`[indexnow] Submitting ${changedUrls.length} URL(s): ${changedUrls.join(", ")}`);

  const results = await submitIndexNowBatches(changedUrls, { key });
  let failed = false;
  for (const result of results) {
    if (result.urlCount === 0) {
      continue;
    }
    const ok = result.status === 200 || result.status === 202;
    failed ||= !ok;
    (ok ? console.log : console.error)(
      `[indexnow] IndexNow ${result.status} ${result.statusText} (${result.urlCount} URLs) — ${describeIndexNowStatus(result.status)}`
    );
  }
  if (failed) {
    throw new Error("IndexNow rejected the submission; re-run this job to retry");
  }
}

main().catch((error: unknown) => {
  console.error("[indexnow] Failed:", error);
  process.exit(1);
});
