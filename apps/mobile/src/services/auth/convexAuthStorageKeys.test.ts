import { convexAuthStorageKeys } from "./convexAuthStorageKeys";

describe("convexAuthStorageKeys", () => {
  it("strips non-alphanumeric characters from the deployment URL to build the namespace", () => {
    expect(convexAuthStorageKeys("https://foo-bar-123.convex.cloud")).toEqual({
      jwt: "__convexAuthJWT_httpsfoobar123convexcloud",
      refresh: "__convexAuthRefreshToken_httpsfoobar123convexcloud",
    });
  });

  it("derives the same namespace the WebView inject script computes at runtime", () => {
    const deploymentUrl = "https://another-deployment.convex.cloud";
    const expectedNs = deploymentUrl.replace(/[^a-zA-Z0-9]/g, "");

    const keys = convexAuthStorageKeys(deploymentUrl);

    expect(keys.jwt).toBe(`__convexAuthJWT_${expectedNs}`);
    expect(keys.refresh).toBe(`__convexAuthRefreshToken_${expectedNs}`);
  });

  it("returns distinct keys for different deployment URLs", () => {
    const a = convexAuthStorageKeys("https://deployment-a.convex.cloud");
    const b = convexAuthStorageKeys("https://deployment-b.convex.cloud");

    expect(a.jwt).not.toBe(b.jwt);
  });
});
