import { describe, it, expect, beforeEach } from "vitest";
import { DoiResolverService } from "./DoiResolverService";
import { InputValidationError } from "../../_lib/errors";

describe("DoiResolverService", () => {
  let service: DoiResolverService;

  beforeEach(() => {
    service = new DoiResolverService();
  });

  describe("resolve", () => {
    it("resolves a valid DOI to a PaperRecord", async () => {
      const result = await service.resolve("10.1234/test");

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Stub Title");
      expect(result?.doi).toBe("10.1234/test");
      expect(result?.isOa).toBe(false);
      expect(result?.sourceType).toBe("doi");
    });

    it("throws InputValidationError for invalid DOI format", async () => {
      await expect(service.resolve("invalid-doi")).rejects.toThrow(InputValidationError);
      await expect(service.resolve("invalid-doi")).rejects.toThrow("Invalid DOI format: invalid-doi");
    });

    it("returns isOa: false and no pdfUrl when PDF is unavailable", async () => {
      const result = await service.resolve("10.1234/closed");

      expect(result).not.toBeNull();
      expect(result?.pdfUrl).toBeUndefined();
      expect(result?.isOa).toBe(false);
    });
  });

  describe("resolveBatch", () => {
    it("resolves multiple DOIs in batch", async () => {
      const results = await service.resolveBatch(["10.1234/one", "10.1234/two"]);

      expect(results).toHaveLength(2);
      expect(results[0]).not.toBeNull();
      expect(results[0]?.title).toBe("Stub Title");
      expect(results[0]?.doi).toBe("10.1234/one");
      expect(results[1]).not.toBeNull();
      expect(results[1]?.title).toBe("Stub Title");
      expect(results[1]?.doi).toBe("10.1234/two");
    });

    it("throws InputValidationError if any DOI in batch is invalid", async () => {
      await expect(service.resolveBatch(["10.1234/valid", "invalid-doi"])).rejects.toThrow(
        InputValidationError
      );
    });

    it("handles empty batch", async () => {
      const results = await service.resolveBatch([]);
      expect(results).toEqual([]);
    });
  });
});
