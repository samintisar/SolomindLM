// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBlob } from "./downloadFile";

describe("downloadBlob", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clicks a temporary link and revokes the URL only after the click has returned", () => {
    vi.useFakeTimers();
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    const createObjectURL = vi.fn((_blob: Blob) => "blob:file");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    let clicked: { href: string; download: string; inDom: boolean } | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicked = { href: this.href, download: this.download, inDom: this.isConnected };
    });
    try {
      const blob = new Blob(["hi"], { type: "text/plain" });
      downloadBlob(blob, "notes.txt");

      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(clicked).toEqual({ href: "blob:file", download: "notes.txt", inDom: true });
      expect(document.querySelector("a")).toBeNull();
      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:file");
    } finally {
      Object.assign(URL, { createObjectURL: original.create, revokeObjectURL: original.revoke });
    }
  });
});
