import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MindMapNote } from "@/shared/types/index";
import { askPrompt } from "../mindmap/outline";
import { MindMapView } from "./MindMapView";

const chat = vi.hoisted(() => ({ isChatStreaming: false, remoteGenerationBlocksSend: false }));
vi.mock("@/features/chat/useChatStreaming", () => ({ useChatStreamingContext: () => chat }));
vi.mock("@/shared/contexts/useToast", () => ({ useToast: () => ({ error: vi.fn() }) }));

function tree(childCount: number) {
  return {
    id: "root",
    topic: "Root",
    children: Array.from({ length: childCount }, (_, i) => ({
      id: `c${i}`,
      topic: `Child ${i}`,
      children: [{ id: `c${i}-0`, topic: `Grandchild ${i}`, children: [] }],
    })),
  };
}

function mindMapNote(overrides: Partial<MindMapNote> = {}): MindMapNote {
  return {
    id: "m1",
    title: "Photosynthesis",
    preview: "",
    type: "mindmap",
    status: "completed",
    content: "",
    mindMapData: { nodeData: tree(3) } as MindMapNote["mindMapData"],
    metadata: { documentIds: ["d1", "d2"] },
    ...overrides,
  };
}

beforeEach(() => {
  chat.isChatStreaming = false;
  chat.remoteGenerationBlocksSend = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("MindMapView", () => {
  it("shows the main branches as tree items under the note's title", () => {
    render(<MindMapView note={mindMapNote()} />);
    expect(screen.getByRole("heading", { name: "Photosynthesis" })).toBeInTheDocument();
    const items = screen.getAllByRole("treeitem");
    expect(items.map((el) => el.textContent)).toEqual([
      expect.stringContaining("Child 0"),
      expect.stringContaining("Child 1"),
      expect.stringContaining("Child 2"),
    ]);
  });

  it("asks the chat about a clicked topic, scoped to the map's own sources", async () => {
    const onAskInChat = vi.fn();
    render(<MindMapView note={mindMapNote()} onAskInChat={onAskInChat} />);
    await userEvent.click(screen.getByRole("button", { name: "Child 1" }));
    expect(onAskInChat).toHaveBeenCalledWith(askPrompt("Child 1", "Photosynthesis"), ["d1", "d2"]);
  });

  it("doesn't ask while the chat is answering", async () => {
    chat.isChatStreaming = true;
    const onAskInChat = vi.fn();
    render(<MindMapView note={mindMapNote()} onAskInChat={onAskInChat} />);
    await userEvent.click(screen.getByRole("button", { name: "Child 1" }));
    expect(onAskInChat).not.toHaveBeenCalled();
  });

  it("doesn't ask while another device's answer blocks sending", async () => {
    chat.remoteGenerationBlocksSend = true;
    const onAskInChat = vi.fn();
    render(<MindMapView note={mindMapNote()} onAskInChat={onAskInChat} />);
    await userEvent.click(screen.getByRole("button", { name: "Child 1" }));
    expect(onAskInChat).not.toHaveBeenCalled();
  });

  it("shows topics as plain text when there is nowhere to ask", () => {
    render(<MindMapView note={mindMapNote()} />);
    expect(screen.queryByRole("button", { name: "Child 1" })).not.toBeInTheDocument();
    expect(screen.getByText("Child 1")).toBeInTheDocument();
  });

  it("names the mobile back button 'Back to Studio'", async () => {
    const onBack = vi.fn();
    render(<MindMapView note={mindMapNote()} onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: "Back to Studio" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("has no back button when there is nowhere to go back to", () => {
    render(<MindMapView note={mindMapNote()} />);
    expect(screen.queryByRole("button", { name: "Back to Studio" })).not.toBeInTheDocument();
  });

  it("has no full screen or zoom controls any more", () => {
    render(<MindMapView note={mindMapNote()} />);
    expect(screen.queryByRole("button", { name: /full screen/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /zoom/i })).not.toBeInTheDocument();
  });

  it("resets what is open when a different map is shown", async () => {
    const { rerender } = render(<MindMapView note={mindMapNote()} />);
    await userEvent.click(screen.getByRole("button", { name: "Expand Child 0" }));
    expect(screen.getByRole("treeitem", { name: "Child 0" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    rerender(<MindMapView note={mindMapNote({ id: "m2" })} />);
    expect(screen.getByRole("treeitem", { name: "Child 0" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("keeps what is open when the same map arrives again as a new object", async () => {
    const { rerender } = render(<MindMapView note={mindMapNote()} />);
    await userEvent.click(screen.getByRole("button", { name: "Expand Child 0" }));
    rerender(
      <MindMapView
        note={mindMapNote({
          mindMapData: { nodeData: tree(3) } as MindMapNote["mindMapData"],
        })}
      />
    );
    expect(screen.getByRole("treeitem", { name: "Child 0" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("shows an alert when generation failed", () => {
    render(
      <MindMapView
        note={mindMapNote({ status: "failed", metadata: { error: "The model timed out" } })}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Mind map generation failed");
    expect(screen.getByRole("alert")).toHaveTextContent("The model timed out");
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
  });

  it("shows a fallback message when the stored error has no usable text", () => {
    render(
      <MindMapView
        note={mindMapNote({
          status: "failed",
          mindMapData: undefined,
          metadata: { error: { message: { nested: true } } } as unknown as MindMapNote["metadata"],
        })}
      />
    );
    expect(screen.getByText("An unknown error occurred")).toBeInTheDocument();
  });

  it("shows an empty state when there is no map data", () => {
    render(<MindMapView note={mindMapNote({ mindMapData: undefined as never })} />);
    expect(screen.getByText("No mind map data available")).toBeInTheDocument();
  });

  it("shows an empty state when the map has no topics", () => {
    render(
      <MindMapView
        note={mindMapNote({ mindMapData: { nodeData: tree(0) } as MindMapNote["mindMapData"] })}
      />
    );
    expect(screen.getByText("This mind map has no topics")).toBeInTheDocument();
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
  });
});
