import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { describe, expect, test, vi } from "vitest";
import type { Message } from "@/shared/types/index";
import type { ExternalSource } from "./ExternalSourcesModal";
import { MessageBubble } from "./MessageBubble";
import { areMessageBubblePropsEqual } from "./message/bubbleProps";
import { ThinkingIndicator } from "./message/ThinkingIndicator";

vi.mock("@/shared/components/MarkdownRenderer", () => ({
  default: ({ children }: { children: string }) => (
    <div className="prose max-w-none">{children}</div>
  ),
}));

const handlers = { onRefEnter: vi.fn(), onRefLeave: vi.fn(), onRefToggle: vi.fn() };

const OLD = new Date("2024-01-01T00:00:00Z");

function msg(partial: Partial<Message> & Pick<Message, "id" | "role">): Message {
  return { content: "", timestamp: OLD, ...partial };
}

type BubbleProps = React.ComponentProps<typeof MessageBubble>;

function renderBubble(props: Partial<BubbleProps> & Pick<BubbleProps, "message">) {
  return render(
    <MessageBubble
      refHandlers={handlers}
      onCopyMessage={vi.fn()}
      copiedMessageId={null}
      {...props}
    />
  );
}

describe("MessageBubble", () => {
  test("user message keeps its data hook and text", async () => {
    renderBubble({ message: msg({ id: "u1", role: "user", content: "What is ATP?" }) });
    const text = await screen.findByText("What is ATP?", undefined, { timeout: 10_000 });
    const root = text.closest("[data-message-id='u1']");
    expect(root).not.toBeNull();
    // e2e keys assistant rows off `items-start`; the user row must not carry it.
    expect(root?.classList.contains("items-start")).toBe(false);
  });

  test("assistant actions are labelled buttons", async () => {
    const onCopyMessage = vi.fn();
    const onSetFeedback = vi.fn();
    const message = msg({ id: "a1", role: "assistant", content: "ATP is energy." });
    renderBubble({ message, onCopyMessage, onSetFeedback });
    await userEvent.click(await screen.findByRole("button", { name: "Copy" }));
    expect(onCopyMessage).toHaveBeenCalledWith(message);
    await userEvent.click(screen.getByRole("button", { name: "Helpful" }));
    expect(onSetFeedback).toHaveBeenCalledWith("a1", "up");
    await userEvent.click(screen.getByRole("button", { name: "Not helpful" }));
    expect(onSetFeedback).toHaveBeenCalledWith("a1", "down");
  });

  test("assistant root keeps items-start and the prose wrapper", async () => {
    renderBubble({ message: msg({ id: "a1", role: "assistant", content: "Body" }) });
    const text = await screen.findByText("Body");
    const root = text.closest("[data-message-id='a1']");
    expect(root?.classList.contains("items-start")).toBe(true);
    expect(root?.querySelector(".prose.max-w-none")).not.toBeNull();
  });

  test("actions sit in a labelled group; copied state relabels the button", async () => {
    const message = msg({ id: "a1", role: "assistant", content: "Body" });
    renderBubble({ message, copiedMessageId: "a1" });
    expect(screen.getByRole("group", { name: "Message actions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  });

  test("active feedback is aria-pressed and clicking it again clears it", async () => {
    const onSetFeedback = vi.fn();
    renderBubble({
      message: msg({ id: "a1", role: "assistant", content: "Body", feedback: "up" }),
      onSetFeedback,
    });
    const helpful = screen.getByRole("button", { name: "Helpful" });
    expect(helpful.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Not helpful" }).getAttribute("aria-pressed")).toBe(
      "false"
    );
    await userEvent.click(helpful);
    expect(onSetFeedback).toHaveBeenCalledWith("a1", null);
  });

  test("feedback needs a handler; user messages only get Copy", () => {
    const { unmount } = renderBubble({
      message: msg({ id: "a1", role: "assistant", content: "Body" }),
    });
    expect(screen.queryByRole("button", { name: "Helpful" })).toBeNull();
    unmount();
    renderBubble({
      message: msg({ id: "u1", role: "user", content: "Hi" }),
      onSetFeedback: vi.fn(),
      onRetry: vi.fn(),
    });
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Helpful" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  test("retry shows on persisted assistant messages, not on the streaming row", async () => {
    const onRetry = vi.fn();
    const { unmount } = renderBubble({
      message: msg({ id: "a1", role: "assistant", content: "Body" }),
      onRetry,
    });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledWith("a1");
    unmount();
    renderBubble({
      message: msg({
        id: "__streaming__",
        role: "assistant",
        content: "Partial",
        status: "writing",
      }),
      onRetry,
      isAssistantStreamActive: true,
    });
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  test("an empty pending row shows its status and no actions", () => {
    renderBubble({
      message: msg({ id: "__streaming__", role: "assistant", status: "thinking" }),
      isAssistantStreamActive: true,
    });
    expect(screen.getByText("Thinking")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Message actions" })).toBeNull();
  });

  test("follow-up chips send their text", async () => {
    const onSendFollowUp = vi.fn();
    renderBubble({
      message: msg({
        id: "a1",
        role: "assistant",
        content: "Body",
        followUps: ["Why does ATP store energy?", "What makes ADP?"],
      }),
      onSendFollowUp,
    });
    await userEvent.click(screen.getByRole("button", { name: "What makes ADP?" }));
    expect(onSendFollowUp).toHaveBeenCalledWith("What makes ADP?");
  });

  test("follow-up chips need a handler", () => {
    renderBubble({
      message: msg({ id: "a1", role: "assistant", content: "Body", followUps: ["Q?"] }),
    });
    expect(screen.queryByRole("button", { name: "Q?" })).toBeNull();
  });

  test("sources pill opens the external sources", async () => {
    const onOpenExternalSources = vi.fn();
    const sources: ExternalSource[] = [
      { title: "A", url: "https://a.example.com/x", snippet: "", sourceType: "web" },
      { title: "B", url: "https://b.example.com/y", snippet: "", sourceType: "web" },
    ];
    renderBubble({
      message: msg({ id: "a1", role: "assistant", content: "Body" }),
      externalSources: sources,
      showSourcesButton: true,
      onOpenExternalSources,
    });
    const pill = screen.getByRole("button", { name: "View 2 sources" });
    expect(pill.textContent).toContain("2 sources");
    await userEvent.click(pill);
    expect(onOpenExternalSources).toHaveBeenCalledWith(sources);
  });

  test("entrance animation plays for the pending row only, not for history", () => {
    const { container, unmount } = renderBubble({
      message: msg({ id: "__streaming__", role: "assistant", status: "thinking" }),
      isAssistantStreamActive: true,
    });
    expect(container.querySelector("[data-message-id]")?.classList.contains("animate-in")).toBe(
      true
    );
    unmount();
    const old = renderBubble({ message: msg({ id: "a1", role: "assistant", content: "Body" }) });
    expect(old.container.querySelector("[data-message-id]")?.classList.contains("animate-in")).toBe(
      false
    );
  });
});

describe("ThinkingIndicator", () => {
  test("is a labelled status with the thinking label", () => {
    render(<ThinkingIndicator />);
    expect(screen.getByRole("status", { name: "Thinking" })).toBeTruthy();
    expect(screen.getByText("Thinking…")).toBeTruthy();
  });

  test("uses the phase label when a status is given", () => {
    render(<ThinkingIndicator status="searching" />);
    expect(screen.getByRole("status", { name: "Searching sources" })).toBeTruthy();
  });
});

describe("areMessageBubblePropsEqual", () => {
  const base: BubbleProps = {
    message: msg({ id: "a1", role: "assistant", content: "Body" }),
    refHandlers: handlers,
    onCopyMessage: vi.fn(),
    copiedMessageId: null,
    onSetFeedback: vi.fn(),
    onSendFollowUp: vi.fn(),
    onRetry: vi.fn(),
    onOpenExternalSources: vi.fn(),
    onOpenNotebookSource: vi.fn(),
    notebookDocumentIds: new Set<string>(),
  };

  test("same props skip the re-render", () => {
    expect(areMessageBubblePropsEqual(base, { ...base })).toBe(true);
  });

  test.each([
    "refHandlers",
    "onCopyMessage",
    "onSetFeedback",
    "onSendFollowUp",
    "onRetry",
    "onOpenExternalSources",
    "onOpenNotebookSource",
  ] as const)("a new %s identity re-renders", (key) => {
    const next = {
      ...base,
      [key]: key === "refHandlers" ? { ...handlers } : vi.fn(),
    } as BubbleProps;
    expect(areMessageBubblePropsEqual(base, next)).toBe(false);
  });

  test("a new notebookDocumentIds set re-renders", () => {
    expect(areMessageBubblePropsEqual(base, { ...base, notebookDocumentIds: new Set() })).toBe(
      false
    );
  });

  test("content and feedback changes re-render; an equal agentTrace copy does not", () => {
    expect(
      areMessageBubblePropsEqual(base, { ...base, message: { ...base.message, content: "New" } })
    ).toBe(false);
    expect(
      areMessageBubblePropsEqual(base, { ...base, message: { ...base.message, feedback: "up" } })
    ).toBe(false);
    const traced = {
      ...base,
      message: { ...base.message, agentTrace: { phases: [], toolCalls: [], grounding: [] } },
    };
    expect(
      areMessageBubblePropsEqual(traced, {
        ...traced,
        message: { ...traced.message, agentTrace: { phases: [], toolCalls: [], grounding: [] } },
      })
    ).toBe(true);
  });
});
