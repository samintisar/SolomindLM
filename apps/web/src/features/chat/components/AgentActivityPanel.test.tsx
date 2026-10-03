import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { AgentActivityPanel } from "./AgentActivityPanel";

const STORAGE_KEY = "solomind-chat-activity-open";

const searchCall = { tool: "search_documents", query: "atp", status: "done" as const };

function renderPanel(overrides: Partial<React.ComponentProps<typeof AgentActivityPanel>> = {}) {
  return render(
    <AgentActivityPanel
      isStreaming={false}
      activityPhase={null}
      activityPhases={[]}
      toolCalls={[searchCall]}
      groundingChecks={[]}
      {...overrides}
    />
  );
}

describe("AgentActivityPanel", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test("disclosure toggles the details region", async () => {
    renderPanel();
    const trigger = screen.getByRole("button", { name: /searched sources for "atp"/i });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region")).toBeInTheDocument();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  test("persists the open state in sessionStorage when not streaming", async () => {
    renderPanel();
    const trigger = screen.getByRole("button", { name: /searched sources/i });
    await userEvent.click(trigger);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe("0");
    await userEvent.click(trigger);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe("1");
  });

  test("restores the stored open state on mount", () => {
    sessionStorage.setItem(STORAGE_KEY, "0");
    renderPanel();
    expect(screen.getByRole("button", { name: /searched sources/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  test("a failed hard grounding check renders as a polite status note", () => {
    renderPanel({
      groundingChecks: [
        { passed: false, message: "Some claims are not supported", issues: ["Claim A"] },
      ],
    });
    const note = screen.getByRole("status");
    expect(note).toHaveTextContent("Some claims are not supported");
    expect(note).toHaveTextContent("Claim A");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("soft grounding notes are not status alerts", () => {
    renderPanel({
      groundingChecks: [{ passed: true, soft: true, message: "Low confidence", issues: [] }],
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Low confidence")).toBeInTheDocument();
  });

  test("source badges link out when the source has a url, plain otherwise", () => {
    renderPanel({
      references: [
        {
          id: 1,
          sourceId: "s1",
          documentId: "d1",
          sourceTitle: "Cell Biology.pdf",
          content: "ATP is the energy currency",
          chunkIndex: 0,
        },
        {
          id: 2,
          sourceId: "s2",
          documentId: "d2",
          sourceTitle: "Article",
          sourceUrl: "https://example.com/post",
          content: "More",
          chunkIndex: 0,
        },
      ],
    });
    expect(screen.getByText("Cell Biology.pdf")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open Article in a new tab" });
    expect(link).toHaveAttribute("href", "https://example.com/post");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveTextContent("WEB");
  });
});
