import { buildNativeShellInject } from "./constants";

it("declares the shell and its capabilities", () => {
  const win: Record<string, unknown> = {};
  new Function("window", buildNativeShellInject({ iap: true }))(win);
  expect(win).toEqual({ __IS_NATIVE_SHELL__: true, __SHELL_CAPABILITIES__: { iap: true } });
});
