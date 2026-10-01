import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { renderMessageWithReferences } from "./messageRendering";
import type { RefHandlers } from "./messageRendering.utils";

const handlers: RefHandlers = { onRefEnter: vi.fn(), onRefLeave: vi.fn(), onRefToggle: vi.fn() };

function Message({ content, streaming }: { content: string; streaming: boolean }) {
  return (
    <div data-message-id="m1">
      {renderMessageWithReferences("m1", content, undefined, handlers, {
        isStreamingVisual: streaming,
      })}
    </div>
  );
}

describe("renderMessageWithReferences", () => {
  test.each([false, true])(
    "keeps the citation chip's DOM node across re-renders (streaming=%s)",
    async (streaming) => {
      const { container, rerender } = render(
        <Message content="Alpha claim [1]." streaming={streaming} />
      );
      const chip = await screen.findByRole("button", { name: "Reference 1" });
      expect(chip).toHaveAttribute("data-cite-message-id", "m1");
      expect(chip).toHaveAttribute("data-ref-id", "1");

      // Same content (e.g. a parent re-render for copiedMessageId), then appended streamed text.
      rerender(<Message content="Alpha claim [1]." streaming={streaming} />);
      expect(screen.getByRole("button", { name: "Reference 1" })).toBe(chip);
      rerender(<Message content="Alpha claim [1]. More streamed text" streaming={streaming} />);
      await waitFor(() => expect(container.textContent).toContain("More streamed text"));
      expect(screen.getByRole("button", { name: "Reference 1" })).toBe(chip);
      expect(chip.isConnected).toBe(true);
    }
  );
});
