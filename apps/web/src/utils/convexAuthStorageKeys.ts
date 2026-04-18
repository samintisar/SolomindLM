/** Must match @convex-dev/auth namespaced storage keys (see mobile `convexAuthStorageKeys.ts`). */
export function convexAuthStorageKeys(deploymentUrl: string): { jwt: string; refresh: string } {
  const ns = deploymentUrl.replace(/[^a-zA-Z0-9]/g, "");
  return {
    jwt: `__convexAuthJWT_${ns}`,
    refresh: `__convexAuthRefreshToken_${ns}`,
  };
}
