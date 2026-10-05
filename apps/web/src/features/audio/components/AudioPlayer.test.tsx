import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioPlayer } from "./AudioPlayer";

let resolvedUrl: string | null | undefined = "https://example.test/audio.mp3";
vi.mock("../hooks/useResolvedAudioPlaybackUrl", () => ({
  useResolvedAudioPlaybackUrl: () => resolvedUrl,
}));

vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
}));

const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

const metadata = {
  audioType: "debate",
  lines: [
    { speaker: "host_a", text: "First line of the show.", startMs: 0, endMs: 3000 },
    { speaker: "host_b", text: "Second line, answering.", startMs: 3000, endMs: 7000 },
  ],
};

function renderPlayer(props: Partial<React.ComponentProps<typeof AudioPlayer>> = {}) {
  return render(
    <AudioPlayer
      audioUrl="stored-audio"
      audioOverviewId="overview-1"
      transcript="First line of the show.\nSecond line, answering."
      title="My overview"
      metadata={metadata}
      {...props}
    />
  );
}

function audioElement(container: HTMLElement): HTMLAudioElement {
  const audio = container.querySelector("audio");
  if (!audio) throw new Error("no <audio> element");
  return audio;
}

beforeEach(() => {
  resolvedUrl = "https://example.test/audio.mp3";
  play.mockClear();
  pause.mockClear();
  HTMLMediaElement.prototype.play = play as unknown as typeof HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.pause = pause as unknown as typeof HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.load = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn() as unknown as typeof HTMLElement.prototype.scrollTo;
  Reflect.deleteProperty(HTMLElement.prototype, "checkVisibility");
});

describe("AudioPlayer", () => {
  it("renders the saved lines as buttons and seeks to a clicked line", async () => {
    const { container } = renderPlayer();
    const audio = audioElement(container);
    Object.defineProperty(audio, "duration", { value: 100, configurable: true });
    fireEvent(audio, new Event("durationchange"));
    await userEvent.click(screen.getByRole("button", { name: /Second line, answering/ }));
    expect(audio.currentTime).toBe(3);
  });

  it("ignores a line click until the audio can seek", async () => {
    const { container } = renderPlayer();
    await userEvent.click(screen.getByRole("button", { name: /Second line, answering/ }));
    expect(audioElement(container).currentTime).toBe(0);
  });

  it("shows the title and a subtitle from the audio type", () => {
    renderPlayer();
    expect(screen.getByText("My overview")).toBeInTheDocument();
    expect(screen.getByText("Debate · 2 hosts")).toBeInTheDocument();
  });

  it("falls back to a generic subtitle for an unknown or missing audio type", () => {
    const { rerender } = renderPlayer({ metadata: { ...metadata, audioType: "mystery" } });
    expect(screen.getByText("Audio overview · 2 hosts")).toBeInTheDocument();
    rerender(
      <AudioPlayer audioUrl="stored-audio" audioOverviewId="overview-1" title="My overview" />
    );
    expect(screen.getByText("Audio overview · 2 hosts")).toBeInTheDocument();
  });

  it("estimates lines from the transcript when there are no saved timings", () => {
    renderPlayer({ metadata: undefined, transcript: "Alpha line.\nBeta line." });
    expect(screen.getByRole("button", { name: /Alpha line/ })).toBeInTheDocument();
    expect(screen.getByText("Approximate sync")).toBeInTheDocument();
  });

  it("names the skip buttons and announces the keyboard shortcuts", () => {
    renderPlayer();
    expect(screen.getByRole("button", { name: "Back 10 seconds" })).toHaveAttribute(
      "aria-keyshortcuts",
      "ArrowLeft"
    );
    expect(screen.getByRole("button", { name: "Forward 10 seconds" })).toHaveAttribute(
      "aria-keyshortcuts",
      "ArrowRight"
    );
    expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Space k"
    );
  });

  it("skips with the buttons", async () => {
    const { container } = renderPlayer();
    const audio = audioElement(container);
    Object.defineProperty(audio, "duration", { value: 100, configurable: true });
    audio.currentTime = 20;
    fireEvent(audio, new Event("durationchange"));
    await userEvent.click(screen.getByRole("button", { name: "Forward 10 seconds" }));
    expect(audio.currentTime).toBe(30);
    await userEvent.click(screen.getByRole("button", { name: "Back 10 seconds" }));
    expect(audio.currentTime).toBe(20);
  });

  it("links to download the audio", () => {
    renderPlayer();
    expect(screen.getByRole("link", { name: "Download audio" })).toHaveAttribute(
      "href",
      "https://example.test/audio.mp3"
    );
  });

  describe("keyboard", () => {
    it("toggles play with Space and k on the page", async () => {
      renderPlayer();
      await userEvent.keyboard(" ");
      expect(play).toHaveBeenCalledTimes(1);
      await userEvent.keyboard("k");
      expect(play).toHaveBeenCalledTimes(2);
    });

    it("skips with the arrow keys", async () => {
      const { container } = renderPlayer();
      const audio = audioElement(container);
      Object.defineProperty(audio, "duration", { value: 100, configurable: true });
      audio.currentTime = 50;
      fireEvent(audio, new Event("durationchange"));

      await userEvent.keyboard("{ArrowRight}");
      expect(audio.currentTime).toBe(60);
      await userEvent.keyboard("{ArrowLeft}");
      expect(audio.currentTime).toBe(50);
    });

    it("lets the scrubber handle arrows itself, skipping once", async () => {
      const { container } = renderPlayer();
      const audio = audioElement(container);
      Object.defineProperty(audio, "duration", { value: 100, configurable: true });
      audio.currentTime = 50;
      fireEvent(audio, new Event("timeupdate")); // the scrubber reads state, not the element

      screen.getByRole("slider", { name: "Seek" }).focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(audio.currentTime).toBe(60);
    });

    it("ignores keys typed into a text field", async () => {
      renderPlayer();
      const input = document.createElement("input");
      document.body.append(input);
      input.focus();
      await userEvent.keyboard(" k");
      expect(play).not.toHaveBeenCalled();
      input.remove();
    });

    it("leaves Space to a focused button", async () => {
      renderPlayer();
      screen.getByRole("button", { name: /Second line, answering/ }).focus();
      await userEvent.keyboard(" ");
      // The space presses the focused line (a seek); it must not also toggle playback.
      expect(play).not.toHaveBeenCalled();
    });

    it("ignores modified keys", async () => {
      renderPlayer();
      await userEvent.keyboard("{Control>}k{/Control}");
      expect(play).not.toHaveBeenCalled();
    });

    it("ignores keys while the player is hidden", async () => {
      renderPlayer();
      HTMLElement.prototype.checkVisibility = () => false;
      await userEvent.keyboard(" ");
      expect(play).not.toHaveBeenCalled();
    });

    it("ignores arrows when focus is elsewhere on the page", async () => {
      const { container } = renderPlayer();
      const audio = audioElement(container);
      Object.defineProperty(audio, "duration", { value: 100, configurable: true });
      audio.currentTime = 50;
      fireEvent(audio, new Event("durationchange"));
      const outside = document.createElement("div");
      outside.tabIndex = 0;
      document.body.append(outside);
      outside.focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(audio.currentTime).toBe(50);
      outside.remove();
    });

    it("ignores Space on a tab, menu item or modal", async () => {
      renderPlayer();
      for (const html of [
        '<div role="tab" tabindex="0"></div>',
        '<div role="menuitem" tabindex="0"></div>',
        '<div aria-modal="true"><div tabindex="0"></div></div>',
      ]) {
        const host = document.createElement("div");
        host.innerHTML = html;
        document.body.append(host);
        (host.querySelector("[tabindex]") as HTMLElement).focus();
        await userEvent.keyboard(" ");
        host.remove();
      }
      expect(play).not.toHaveBeenCalled();
    });

    it("removes its listener once unmounted", async () => {
      const remove = vi.spyOn(window, "removeEventListener");
      const { unmount } = renderPlayer();
      unmount();
      expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
      remove.mockRestore();
      await userEvent.keyboard(" ");
      expect(play).not.toHaveBeenCalled();
    });
  });

  describe("states", () => {
    it("shows a loading message while the URL resolves", () => {
      resolvedUrl = undefined;
      renderPlayer();
      expect(screen.getByText("Loading audio...")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    });

    it("explains when the URL cannot be resolved", () => {
      resolvedUrl = null;
      renderPlayer();
      expect(
        screen.getByText("Could not resolve audio URL. Try regenerating the audio overview.")
      ).toBeInTheDocument();
    });

    it("shows the audio error", () => {
      const { container } = renderPlayer();
      fireEvent(audioElement(container), new Event("error"));
      expect(screen.getByText("Audio failed to load")).toBeInTheDocument();
    });

    it("has a back button on mobile when onBack is given", async () => {
      const onBack = vi.fn();
      renderPlayer({ onBack });
      await userEvent.click(screen.getByRole("button", { name: "Back to Studio" }));
      expect(onBack).toHaveBeenCalled();
    });
  });
});
