import { existsSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { getFixture } from "../fixtures";
import { getPack, listPackFixtures, USE_CASE_PACKS } from "./index";
import { validatePack } from "./validate";

describe("use-case pack registry", () => {
  it("every registered pack is valid and lives in its own folder", () => {
    for (const registered of USE_CASE_PACKS) {
      expect(validatePack(registered)).toEqual([]);
      expect(basename(registered.dir)).toBe(registered.pack.id);
      expect(existsSync(registered.dir)).toBe(true);
    }
  });

  it("pack ids and notebook titles are unique", () => {
    const ids = USE_CASE_PACKS.map((p) => p.pack.id);
    const titles = USE_CASE_PACKS.map((p) => p.pack.notebookTitle);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("pack fixtures are resolvable through getFixture", () => {
    for (const fixture of listPackFixtures()) {
      expect(getFixture(fixture.id)).toBe(fixture);
    }
  });

  it("getPack names the registered packs when the id is unknown", () => {
    expect(() => getPack("no-such-pack")).toThrow(/Unknown use-case pack "no-such-pack"/);
  });
});
