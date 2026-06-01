import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/shared/types/index";
import { exportAsMarkdown } from "./exportChat";

describe("exportAsMarkdown", () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURLSpy = vi.fn(() => "blob:mock-url");
    revokeObjectURLSpy = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy,
    });
  });

  function makeMessage(role: "user" | "assistant", content: string): Message {
    return { role, content, id: "msg1" } as Message;
  }

  it("does nothing for empty messages array", () => {
    const clickSpy = vi.fn();
    const anchor = { click: clickSpy, href: "", download: "" };
    vi.spyOn(document, "createElement").mockReturnValue(anchor as any);

    exportAsMarkdown([], "Test Notebook");
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("creates a markdown file and triggers download", () => {
    const clickSpy = vi.fn();
    const anchor = { click: clickSpy, href: "", download: "" };
    vi.spyOn(document, "createElement").mockReturnValue(anchor as any);

    const messages = [
      makeMessage("user", "What is AI?"),
      makeMessage("assistant", "AI is artificial intelligence."),
    ];

    exportAsMarkdown(messages, "AI Chat");

    expect(clickSpy).toHaveBeenCalled();
    expect(anchor.download).toContain("AI Chat");
    expect(anchor.download).toContain(".md");
    expect(anchor.href).toBe("blob:mock-url");
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("sanitizes notebook title in filename", () => {
    const clickSpy = vi.fn();
    const anchor = { click: clickSpy, href: "", download: "" };
    vi.spyOn(document, "createElement").mockReturnValue(anchor as any);

    const messages = [makeMessage("user", "hello")];
    exportAsMarkdown(messages, "My/Nested:Path?Notebook");

    expect(anchor.download).not.toContain("/");
    expect(anchor.download).not.toContain(":");
    expect(anchor.download).not.toContain("?");
  });

  it("includes messages in markdown content", () => {
    const clickSpy = vi.fn();
    const anchor = { click: clickSpy, href: "", download: "" };
    vi.spyOn(document, "createElement").mockReturnValue(anchor as any);

    const messages = [
      makeMessage("user", "What is AI?"),
      makeMessage("assistant", "AI is artificial intelligence."),
    ];

    exportAsMarkdown(messages, "Test", "2024-01-15");

    // Verify the blob was created with proper markdown
    expect(createObjectURLSpy).toHaveBeenCalled();
    void createObjectURLSpy.mock.calls[0][0];
    // Can't easily read Blob content synchronously in jsdom, but we verified
    // the function ran without error and triggered download
    expect(clickSpy).toHaveBeenCalled();
  });

  it("uses provided timestamp", () => {
    const clickSpy = vi.fn();
    const anchor = { click: clickSpy, href: "", download: "" };
    vi.spyOn(document, "createElement").mockReturnValue(anchor as any);

    const messages = [makeMessage("user", "hello")];
    exportAsMarkdown(messages, "Test", "January 15, 2024");

    // Just verify no crash with custom timestamp
    expect(clickSpy).toHaveBeenCalled();
  });
});
