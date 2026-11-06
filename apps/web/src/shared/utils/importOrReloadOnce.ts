/**
 * A deploy since this page loaded removes its lazy chunks (old hash → 404). Reload once to pick up
 * the new build instead of showing an error; a second failure (per `reloadKey`) is a real error.
 */
export function importOrReloadOnce<T>(load: () => Promise<T>, reloadKey: string): Promise<T> {
  return load().then(
    (module) => {
      try {
        sessionStorage.removeItem(reloadKey);
      } catch {
        // Storage blocked: nothing to clear.
      }
      return module;
    },
    (error: unknown) => {
      let alreadyReloaded = true;
      try {
        alreadyReloaded = sessionStorage.getItem(reloadKey) === "1";
        if (!alreadyReloaded) sessionStorage.setItem(reloadKey, "1");
      } catch {
        // Storage blocked: can't guard against a reload loop, so don't reload.
      }
      if (alreadyReloaded) throw error;
      window.location.reload();
      return new Promise<never>(() => undefined);
    }
  );
}
