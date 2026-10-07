// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/shared/types/index";
import { exportAsMarkdown } from "./exportChat";

const download = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock("@/shared/utils/downloadFile", () => download);

describe("exportAsMarkdown", () => {
  beforeEach(() => download.downloadBlob.mockClear());

  function makeMessage(role: "user" | "assistant", content: string): Message {
    return { role, content, id: "msg1" } as Message;
  }

  const downloaded = () => {
    const [blob, fileName] = download.downloadBlob.mock.calls[0] as [Blob, string];
    return { blob, fileName };
  };

  it("does nothing for empty messages array", () => {
    exportAsMarkdown([], "Test Notebook");
    expect(download.downloadBlob).not.toHaveBeenCalled();
  });

  it("creates a markdown file and triggers download", () => {
    const messages = [
      makeMessage("user", "What is AI?"),
      makeMessage("assistant", "AI is artificial intelligence."),
    ];

    exportAsMarkdown(messages, "AI Chat");

    expect(download.downloadBlob).toHaveBeenCalledOnce();
    const { blob, fileName } = downloaded();
    expect(fileName).toContain("AI Chat");
    expect(fileName).toContain(".md");
    expect(blob.type).toBe("text/markdown;charset=utf-8");
  });

  it("sanitizes notebook title in filename", () => {
    exportAsMarkdown([makeMessage("user", "hello")], "My/Nested:Path?Notebook");

    const { fileName } = downloaded();
    expect(fileName).not.toContain("/");
    expect(fileName).not.toContain(":");
    expect(fileName).not.toContain("?");
  });

  it("includes messages in markdown content", async () => {
    const messages = [
      makeMessage("user", "What is AI?"),
      makeMessage("assistant", "AI is artificial intelligence."),
    ];

    exportAsMarkdown(messages, "Test", "2024-01-15");

    const text = await downloaded().blob.text();
    expect(text).toContain("What is AI?");
    expect(text).toContain("AI is artificial intelligence.");
  });

  it("uses provided timestamp", async () => {
    exportAsMarkdown([makeMessage("user", "hello")], "Test", "January 15, 2024");

    expect(await downloaded().blob.text()).toContain("January 15, 2024");
  });
});
