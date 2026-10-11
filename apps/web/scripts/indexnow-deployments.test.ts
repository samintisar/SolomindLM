import { describe, expect, it, vi } from "vitest";
import { canReceiveBypassSecret, findPreviousDeploymentUrl } from "./indexnow-deployments";

const deployment = (id: number) => ({ id, statuses_url: `https://api.github.com/s/${id}` });
const status = (state: string, id: number) => ({
  state,
  environment_url: `https://solomindlm-d${id}-samintisars-projects.vercel.app`,
});

describe("findPreviousDeploymentUrl", () => {
  it("returns the newest older deployment that succeeded", async () => {
    const statuses: Record<number, ReturnType<typeof status>> = {
      12: status("success", 12),
      11: status("failure", 11),
      10: status("success", 10),
      9: status("success", 9),
    };
    const fetchLatestStatus = vi.fn(async (d: { id: number }) => statuses[d.id] ?? null);

    const url = await findPreviousDeploymentUrl({
      deployments: [deployment(12), deployment(9), deployment(11), deployment(10)],
      currentId: 12,
      fetchLatestStatus,
    });

    expect(url).toBe("https://solomindlm-d10-samintisars-projects.vercel.app");
    expect(fetchLatestStatus).not.toHaveBeenCalledWith(deployment(12));
    expect(fetchLatestStatus).not.toHaveBeenCalledWith(deployment(9));
  });

  it("counts a superseded (inactive) deployment as previously live", async () => {
    const url = await findPreviousDeploymentUrl({
      deployments: [deployment(5)],
      currentId: 6,
      fetchLatestStatus: async () => status("inactive", 5),
    });
    expect(url).toBe("https://solomindlm-d5-samintisars-projects.vercel.app");
  });

  it("returns null when no older deployment succeeded", async () => {
    const url = await findPreviousDeploymentUrl({
      deployments: [deployment(7), deployment(8)],
      currentId: 8,
      fetchLatestStatus: async () => status("error", 7),
    });
    expect(url).toBeNull();
  });
});

describe("canReceiveBypassSecret", () => {
  it("allows production and this project's Vercel deployment URLs over https", () => {
    expect(canReceiveBypassSecret("https://www.solomindlm.com")).toBe(true);
    expect(
      canReceiveBypassSecret("https://solomindlm-g4ueabmeb-samintisars-projects.vercel.app")
    ).toBe(true);
  });

  it("rejects other hosts, plain http, and malformed URLs", () => {
    expect(canReceiveBypassSecret("https://evil.example")).toBe(false);
    expect(canReceiveBypassSecret("https://solomindlm-x-other-projects.vercel.app")).toBe(false);
    expect(canReceiveBypassSecret("http://www.solomindlm.com")).toBe(false);
    expect(canReceiveBypassSecret("not a url")).toBe(false);
  });
});
