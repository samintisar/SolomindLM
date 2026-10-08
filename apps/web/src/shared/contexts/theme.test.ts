// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import {
  applyTheme,
  parseTheme,
  readStoredTheme,
  storeTheme,
  THEME_STORAGE_KEY,
} from "@/shared/contexts/theme";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const themeInitSource = readFileSync(path.join(webRoot, "public/theme-init.js"), "utf-8");
const indexHtml = readFileSync(path.join(webRoot, "index.html"), "utf-8");

function storageWith(value: string | null): Pick<Storage, "getItem"> {
  return { getItem: (key) => (key === THEME_STORAGE_KEY ? value : null) };
}

const throwingStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

/** Runs public/theme-init.js the way the browser does, against the given storage. */
function runThemeInit(storage: Pick<Storage, "getItem">, root: HTMLElement) {
  new Function("localStorage", "document", themeInitSource)(storage, { documentElement: root });
}

/** Makes the `localStorage` getter itself throw, as it does when storage is disabled. */
function makeLocalStorageGetterThrow() {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
  });
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
  warn.mockRestore();
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

describe("parseTheme", () => {
  it("accepts light and dark only", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("Dark")).toBeNull();
    expect(parseTheme("system")).toBeNull();
    expect(parseTheme(null)).toBeNull();
  });
});

describe("readStoredTheme", () => {
  it("returns the saved theme", () => {
    expect(readStoredTheme(storageWith("dark"))).toBe("dark");
    expect(readStoredTheme(storageWith("light"))).toBe("light");
  });

  it("defaults to light when nothing valid is saved", () => {
    expect(readStoredTheme(storageWith(null))).toBe("light");
    expect(readStoredTheme(storageWith("invalid"))).toBe("light");
  });

  it("defaults to light and warns when storage throws", () => {
    expect(readStoredTheme(throwingStorage)).toBe("light");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[theme]"), expect.any(Error));
  });

  it("reads the global localStorage by default", () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    try {
      expect(readStoredTheme()).toBe("dark");
    } finally {
      globalThis.localStorage.removeItem(THEME_STORAGE_KEY);
    }
  });

  it("defaults to light and warns when the localStorage getter throws", () => {
    makeLocalStorageGetterThrow();
    expect(readStoredTheme()).toBe("light");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[theme]"),
      expect.objectContaining({ name: "SecurityError" })
    );
  });
});

describe("storeTheme", () => {
  it("writes the theme under the storage key", () => {
    const writes: [string, string][] = [];
    storeTheme("dark", { setItem: (key, value) => writes.push([key, value]) });
    expect(writes).toEqual([[THEME_STORAGE_KEY, "dark"]]);
  });

  it("warns instead of throwing when storage fails", () => {
    expect(() => storeTheme("dark", throwingStorage)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[theme]"), expect.any(Error));
  });

  it("warns instead of throwing when the localStorage getter throws", () => {
    makeLocalStorageGetterThrow();
    expect(() => storeTheme("dark")).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[theme]"),
      expect.objectContaining({ name: "SecurityError" })
    );
  });
});

describe("applyTheme", () => {
  it("adds and removes the dark class", () => {
    const root = document.createElement("html");
    applyTheme("dark", root);
    expect(root.classList.contains("dark")).toBe(true);
    applyTheme("light", root);
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("targets <html> by default", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("public/theme-init.js", () => {
  it.each([["dark"], ["light"], ["invalid"], [null]])(
    "applies the same theme as readStoredTheme for %s",
    (saved) => {
      const root = document.createElement("html");
      runThemeInit(storageWith(saved), root);
      const expected = readStoredTheme(storageWith(saved));
      expect(root.classList.contains("dark")).toBe(expected === "dark");
    }
  );

  it("stays light and warns when storage throws", () => {
    const root = document.createElement("html");
    expect(() => runThemeInit(throwingStorage, root)).not.toThrow();
    expect(root.classList.contains("dark")).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[theme-init]"), expect.any(Error));
  });

  it("stays light and warns when the localStorage getter throws", () => {
    makeLocalStorageGetterThrow();
    const root = document.createElement("html");
    // Run against the real global, so the getter is hit inside the script's try.
    expect(() =>
      new Function("document", themeInitSource)({ documentElement: root })
    ).not.toThrow();
    expect(root.classList.contains("dark")).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[theme-init]"),
      expect.objectContaining({ name: "SecurityError" })
    );
  });

  it("uses the storage key ThemeProvider reads", () => {
    expect(themeInitSource).toContain(`"${THEME_STORAGE_KEY}"`);
  });

  it("is loaded as a blocking script in <head>, before any stylesheet", () => {
    const head = indexHtml.slice(0, indexHtml.indexOf("</head>"));
    const tag = head.match(/<script\b[^>]*\bsrc="\/theme-init\.js"[^>]*>/)?.[0];
    expect(tag, "index.html must load /theme-init.js in <head>").toBeDefined();
    // async, defer or type="module" would let the page paint before the class is set.
    expect(tag).not.toMatch(/\b(async|defer)\b|type="module"/);
    expect(head.indexOf(tag!)).toBeLessThan(head.indexOf('rel="stylesheet"'));
  });
});
