/**
 * Runtime mock for Vitest: `import { api } from "@convex/_generated/api"`.
 * The real TypeScript declarations live in convex-generated-api.d.ts; tests need
 * actual module exports with `api` / `internal` / `components` keys.
 */
function createDeepMock(name: string): unknown {
  return new Proxy(
    {},
    {
      get(_t, prop: string | symbol) {
        if (prop === Symbol.toStringTag) return name;
        return createDeepMock(`${name}.${String(prop)}`);
      },
    }
  );
}

export const api = createDeepMock("api") as Record<string, unknown>;
export const internal = createDeepMock("internal") as Record<string, unknown>;
export const components = createDeepMock("components") as Record<string, unknown>;
