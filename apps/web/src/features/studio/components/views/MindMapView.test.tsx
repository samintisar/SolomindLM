import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MindMapNote } from "@/shared/types/index";
import { MindMapView } from "./MindMapView";

type Handler = (value: number) => void;

// A stand-in for Mind Elixir: it records its options and the calls the view makes, and keeps a
// `scaleVal` that `scaleFit` sets to whatever the test says the fitted zoom is.
const h = vi.hoisted(() => ({
  instances: [] as Array<{
    options: Record<string, unknown>;
    scaleVal: number;
    handlers: Map<string, Handler[]>;
    init: ReturnType<typeof vi.fn>;
    scale: ReturnType<typeof vi.fn>;
    scaleFit: ReturnType<typeof vi.fn>;
    toCenter: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    changeTheme: ReturnType<typeof vi.fn>;
    bus: {
      addListener: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
      fire: (type: string, value: number) => void;
    };
  }>,
  fitted: 1,
  failToLoad: false,
}));

vi.mock("mind-elixir", () => {
  class FakeMindElixir {
    static RIGHT = 1;
    options: Record<string, unknown>;
    scaleVal = 1;
    handlers = new Map<string, Handler[]>();
    bus = {
      addListener: vi.fn((type: string, fn: Handler) => {
        this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
      }),
      removeListener: vi.fn((type: string, fn: Handler) => {
        this.handlers.set(
          type,
          (this.handlers.get(type) ?? []).filter((x) => x !== fn)
        );
      }),
      fire: (type: string, value: number) => {
        for (const fn of this.handlers.get(type) ?? []) fn(value);
      },
    };
    init = vi.fn();
    scale = vi.fn((value: number) => {
      this.scaleVal = value;
      this.bus.fire("scale", value);
    });
    scaleFit = vi.fn(() => {
      this.scaleVal = h.fitted;
      this.bus.fire("scale", h.fitted);
    });
    toCenter = vi.fn();
    destroy = vi.fn();
    changeTheme = vi.fn();
    constructor(options: Record<string, unknown>) {
      if (h.failToLoad) throw new Error("chunk failed to load");
      this.options = options;
      h.instances.push(this as never);
    }
  }
  return { default: FakeMindElixir };
});

function tree(childCount: number, grandchildrenEach = 0) {
  return {
    id: "root",
    topic: "Root",
    children: Array.from({ length: childCount }, (_, i) => ({
      id: `c${i}`,
      topic: `Child ${i}`,
      children: Array.from({ length: grandchildrenEach }, (_, j) => ({
        id: `c${i}-${j}`,
        topic: `Grandchild ${i}.${j}`,
        children: [],
      })),
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
    ...overrides,
  };
}

async function renderReady(note: MindMapNote = mindMapNote(), props = {}) {
  const view = render(<MindMapView note={note} {...props} />);
  await waitFor(() => expect(h.instances).toHaveLength(1));
  const mind = h.instances[0];
  await waitFor(() => expect(mind.scaleFit).toHaveBeenCalled());
  return { ...view, mind };
}

beforeEach(() => {
  h.instances.length = 0;
  h.fitted = 1;
  h.failToLoad = false;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.classList.remove("dark");
  document.documentElement.style.removeProperty("--studio-mindmap");
});

describe("MindMapView", () => {
  it("opens the map read-only, since edits would never be saved", async () => {
    const { mind } = await renderReady();
    expect(mind.options.editable).toBe(false);
    expect(mind.options.keypress).toBe(false);
    expect(mind.options.draggable).toBe(false);
  });

  it("passes the zoom limits and a theme built on the app's tokens", async () => {
    const { mind } = await renderReady();
    expect(mind.options.scaleMin).toBe(0.2);
    expect(mind.options.scaleMax).toBe(2);
    const theme = mind.options.theme as { cssVar: Record<string, string>; palette: string[] };
    for (const key of [
      "--main-color",
      "--main-bgcolor",
      "--color",
      "--bgcolor",
      "--panel-color",
      "--panel-bgcolor",
      "--panel-border-color",
    ]) {
      expect(theme.cssVar[key]).toMatch(/^var\(/);
    }
    expect(theme.palette.length).toBeGreaterThan(0);
  });

  it("resolves the branch colours to real values, since SVG stroke attributes can't read var()", async () => {
    document.documentElement.style.setProperty("--studio-mindmap", "rgb(1, 2, 3)");
    const { mind } = await renderReady();
    const { palette } = mind.options.theme as { palette: string[] };
    expect(palette[0]).toBe("rgb(1, 2, 3)");
    for (const colour of palette) expect(colour).not.toMatch(/var\(/);
  });

  it("opens a large map at a readable zoom instead of the tiny fitted one (#171)", async () => {
    h.fitted = 0.03;
    const { mind } = await renderReady();
    expect(mind.toCenter).toHaveBeenCalled();
    expect(mind.scale).toHaveBeenLastCalledWith(0.6);
    expect(await screen.findByText("60%")).toBeInTheDocument();
  });

  it("keeps the fitted zoom when it is already readable", async () => {
    h.fitted = 0.8;
    const { mind } = await renderReady();
    expect(mind.scale).not.toHaveBeenCalled();
    expect(await screen.findByText("80%")).toBeInTheDocument();
  });

  it("collapses the branches of a map with more than 40 nodes", async () => {
    // 1 root + 5 children + 5 × 8 grandchildren = 46 nodes.
    const note = mindMapNote({
      mindMapData: { nodeData: tree(5, 8) } as MindMapNote["mindMapData"],
    });
    const { mind } = await renderReady(note);
    const { nodeData } = mind.init.mock.calls[0][0] as {
      nodeData: { children: Array<{ expanded?: boolean }> };
    };
    expect(nodeData.children.every((child) => child.expanded === false)).toBe(true);
  });

  it("zooms in and out in steps", async () => {
    h.fitted = 0.8;
    const user = userEvent.setup();
    const { mind } = await renderReady();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(mind.scale).toHaveBeenLastCalledWith(1);
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(mind.scale).toHaveBeenLastCalledWith(0.8);
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("fits the map to the view, never below the zoom floor", async () => {
    const user = userEvent.setup();
    const { mind } = await renderReady();
    mind.scaleFit.mockClear();
    h.fitted = 0.05;
    await user.click(screen.getByRole("button", { name: "Fit to view" }));
    expect(mind.scaleFit).toHaveBeenCalledTimes(1);
    expect(mind.scale).toHaveBeenLastCalledWith(0.2);
    expect(screen.getByText("20%")).toBeInTheDocument();
  });

  it("shows the zoom the map reports, wheel zoom included", async () => {
    const { mind } = await renderReady();
    act(() => mind.bus.fire("scale", 1.5));
    expect(screen.getByText("150%")).toBeInTheDocument();
  });

  it("stops listening and destroys the map on unmount", async () => {
    const { mind, unmount } = await renderReady();
    const [handler] = mind.handlers.get("scale") ?? [];
    unmount();
    expect(mind.bus.removeListener).toHaveBeenCalledWith("scale", handler);
    expect(mind.destroy).toHaveBeenCalled();
  });

  it("re-applies the theme when the app switches between light and dark", async () => {
    const { mind } = await renderReady();
    document.documentElement.classList.add("dark");
    await waitFor(() => expect(mind.changeTheme).toHaveBeenCalled());
  });

  it("has one toolbar in both modes, with a full-screen toggle", async () => {
    const onToggleExpanded = vi.fn();
    const user = userEvent.setup();
    await renderReady(mindMapNote(), { isExpanded: true, onToggleExpanded });
    expect(screen.getAllByRole("button", { name: "Zoom in" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Exit full screen" }));
    expect(onToggleExpanded).toHaveBeenCalled();
  });

  it("puts full screen above the app header and leaves it on Escape", async () => {
    const onToggleExpanded = vi.fn();
    const user = userEvent.setup();
    await renderReady(mindMapNote(), { isExpanded: true, onToggleExpanded });
    const exit = screen.getByRole("button", { name: "Exit full screen" });
    expect(exit.closest(".fixed")).toHaveClass("z-100");
    await user.keyboard("{Escape}");
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape when not in full screen", async () => {
    const onToggleExpanded = vi.fn();
    const user = userEvent.setup();
    await renderReady(mindMapNote(), { onToggleExpanded });
    await user.keyboard("{Escape}");
    expect(onToggleExpanded).not.toHaveBeenCalled();
  });

  it("names the mobile back button 'Back to Studio'", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    await renderReady(mindMapNote(), { onBack });
    expect(screen.getByRole("button", { name: "Expand to full screen" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Studio" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows an alert when generation failed", () => {
    render(
      <MindMapView
        note={mindMapNote({ status: "failed", metadata: { error: "The model timed out" } })}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Mind map generation failed");
    expect(screen.getByRole("alert")).toHaveTextContent("The model timed out");
    expect(h.instances).toHaveLength(0);
  });

  it("says so when the map can't be loaded, instead of leaving a blank canvas", async () => {
    h.failToLoad = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<MindMapView note={mindMapNote()} />);
    expect(await screen.findByText("Couldn't load the mind map")).toBeInTheDocument();
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
});
