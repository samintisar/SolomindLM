import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MiniAudioPlayer } from "./MiniAudioPlayer";

let resolvedUrl: string | null | undefined = "https://example.test/audio.mp3";
vi.mock("../hooks/useResolvedAudioPlaybackUrl", () => ({
  useResolvedAudioPlaybackUrl: () => resolvedUrl,
}));

const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

function renderMini(props: Partial<React.ComponentProps<typeof MiniAudioPlayer>> = {}) {
  const onClose = vi.fn();
  const onExpand = vi.fn();
  const utils = render(
    <MiniAudioPlayer
      audioUrl="stored-audio"
      audioOverviewId="overview-1"
      title="My overview"
      isVisible
      onClose={onClose}
      onExpand={onExpand}
      {...props}
    />
  );
  return { ...utils, onClose, onExpand };
}

beforeEach(() => {
  resolvedUrl = "https://example.test/audio.mp3";
  play.mockClear();
  pause.mockClear();
  HTMLMediaElement.prototype.play = play as unknown as typeof HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.pause = pause as unknown as typeof HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.load = vi.fn();
});

describe("MiniAudioPlayer", () => {
  it("renders the shared controls by name", () => {
    renderMini();
    expect(screen.getByText("My overview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back 10 seconds" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forward 10 seconds" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Playback speed 1×" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Seek" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download audio" })).toHaveAttribute(
      "href",
      "https://example.test/audio.mp3"
    );
    expect(screen.getByRole("button", { name: "Expand player" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close player" })).toBeInTheDocument();
  });

  it("has no global keyboard shortcuts to announce", () => {
    renderMini();
    expect(screen.getByRole("button", { name: "Play" })).not.toHaveAttribute("aria-keyshortcuts");
    expect(screen.getByRole("button", { name: "Back 10 seconds" })).not.toHaveAttribute(
      "aria-keyshortcuts"
    );
  });

  it("calls onClose and onExpand", async () => {
    const { onClose, onExpand } = renderMini();
    await userEvent.click(screen.getByRole("button", { name: "Close player" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Expand player" }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when hidden", () => {
    const { container } = renderMini({ isVisible: false });
    expect(container).toBeEmptyDOMElement();
    expect(play).not.toHaveBeenCalled();
  });

  it("attempts autoplay once when it becomes visible with a source", () => {
    const { rerender, onClose, onExpand } = renderMini({ isVisible: false });
    const visible = (
      <MiniAudioPlayer
        audioUrl="stored-audio"
        audioOverviewId="overview-1"
        isVisible
        onClose={onClose}
        onExpand={onExpand}
      />
    );
    rerender(visible);
    expect(play).toHaveBeenCalledTimes(1);
    rerender(visible);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("shows the loading, unresolved and error states", () => {
    resolvedUrl = undefined;
    const { unmount } = renderMini();
    expect(screen.getByText("Loading audio...")).toBeInTheDocument();
    expect(play).not.toHaveBeenCalled();
    unmount();

    resolvedUrl = null;
    renderMini();
    expect(
      screen.getByText(
        "Could not resolve audio URL. Try regenerating the audio overview or check your connection."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download audio" })).toBeDisabled();
  });
});
