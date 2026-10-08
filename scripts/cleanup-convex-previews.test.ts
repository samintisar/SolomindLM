import { describe, expect, it } from "vitest";
import { type Deployment, previewsForBranch, stalePreviews } from "./cleanup-convex-previews";

const preview = (name: string, branch: string): Deployment => ({
  name,
  deploymentType: "preview",
  previewIdentifier: branch,
});

const deployments: Deployment[] = [
  { name: "tame-gecko-736", deploymentType: "prod", previewIdentifier: null },
  { name: "prestigious-canary-33", deploymentType: "dev", previewIdentifier: null },
  preview("wry-antelope-674", "chore/convex-dev-guard"),
  preview("robust-peacock-452", "refactor/public-route-shell"),
];

describe("previewsForBranch", () => {
  it("returns the preview whose identifier is the branch name", () => {
    expect(previewsForBranch(deployments, "chore/convex-dev-guard")).toEqual(["wry-antelope-674"]);
  });

  it("returns nothing when the branch never got a preview", () => {
    expect(previewsForBranch(deployments, "docs/readme")).toEqual([]);
  });

  it("never returns a prod or dev deployment, even if its identifier matches", () => {
    const odd: Deployment[] = [
      { name: "tame-gecko-736", deploymentType: "prod", previewIdentifier: "main" },
    ];
    expect(previewsForBranch(odd, "main")).toEqual([]);
  });
});

describe("stalePreviews", () => {
  it("returns previews whose branch is no longer live", () => {
    expect(stalePreviews(deployments, ["main", "refactor/public-route-shell"])).toEqual([
      "wry-antelope-674",
    ]);
  });

  it("keeps every preview whose branch is live", () => {
    expect(
      stalePreviews(deployments, ["main", "chore/convex-dev-guard", "refactor/public-route-shell"])
    ).toEqual([]);
  });

  it("treats a preview with no identifier as stale", () => {
    const orphan: Deployment = {
      name: "lost-cat-1",
      deploymentType: "preview",
      previewIdentifier: null,
    };
    expect(stalePreviews([orphan], ["main"])).toEqual(["lost-cat-1"]);
  });

  it("refuses an empty live-branch list instead of deleting every preview", () => {
    expect(() => stalePreviews(deployments, [])).toThrow(/live branch/);
  });
});
