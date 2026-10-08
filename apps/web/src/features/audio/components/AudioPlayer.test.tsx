import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PauseAlignment } from "../hooks/usePauseAlignedLines";
import { AudioPlayer } from "./AudioPlayer";

let resolvedUrl: string | null | undefined = "https://example.test/audio.mp3";
vi.mock("../hooks/useResolvedAudioPlaybackUrl", () => ({
  useResolvedAudioPlaybackUrl: () => resolvedUrl,
}));

let alignment: PauseAlignment = { lines: null, status: "idle" };
/** Records every call; returns `alignment`, or the real hook's result when `realAlignment`. */
const usePauseAlignedLines = vi.fn((..._args: [string | null, string, boolean]) => alignment);
let realAlignment = false;
vi.mock("../hooks/usePauseAlignedLines", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/usePauseAlignedLines")>();
  return {
    usePauseAlignedLines: (...args: [string | null, string, boolean]) => {
      const [url, transcript, enabled] = args;
      const fake = usePauseAlignedLines(...args);
      // Always called, so hooks keep their order; it only works when `realAlignment` is on.
      const real = actual.usePauseAlignedLines(url, transcript, realAlignment && enabled);
      return realAlignment ? real : fake;
    },
  };
});

vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
}));

/** Called on every render of the transcript reader, behind its memo. */
const transcriptRendered = vi.hoisted(() => vi.fn());
vi.mock("./TranscriptReaderView", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./TranscriptReaderView")>();
  const { createElement } = await import("react");
  return {
    TranscriptReaderView: (props: React.ComponentProps<typeof actual.TranscriptReaderView>) => {
      transcriptRendered();
      return createElement(actual.TranscriptReaderView, props);
    },
  };
});

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
  alignment = { lines: null, status: "idle" };
  usePauseAlignedLines.mockClear();
  transcriptRendered.mockClear();
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

  it("re-renders the transcript only when the active line changes, not on every timeupdate", () => {
    const { container } = renderPlayer();
    const audio = audioElement(container);
    Object.defineProperty(audio, "duration", { value: 100, configurable: true });
    fireEvent(audio, new Event("durationchange"));
    const timeUpdate = (seconds: number) => {
      audio.currentTime = seconds;
      fireEvent(audio, new Event("timeupdate"));
    };

    timeUpdate(0.5);
    const rendersOnFirstLine = transcriptRendered.mock.calls.length;
    timeUpdate(1);
    timeUpdate(2);
    // The scrubber still follows the time.
    expect(screen.getByRole("slider", { name: "Seek" })).toHaveAttribute("aria-valuenow", "2");
    expect(transcriptRendered).toHaveBeenCalledTimes(rendersOnFirstLine);

    timeUpdate(4);
    expect(transcriptRendered.mock.calls.length).toBeGreaterThan(rendersOnFirstLine);
    expect(screen.getByRole("button", { name: /Second line, answering/ })).toHaveAttribute(
      "aria-current",
      "true"
    );
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

  describe("older overviews without saved timings", () => {
    const transcript = "Alpha line.\nBeta line.";

    /** Loads the audio's duration and starts playback, as the element's events would. */
    function startPlaying(audio: HTMLAudioElement, durationSec = 600) {
      Object.defineProperty(audio, "duration", { value: durationSec, configurable: true });
      fireEvent(audio, new Event("durationchange"));
      fireEvent(audio, new Event("play"));
    }

    it("shows the estimate without a badge until played", () => {
      renderPlayer({ metadata: undefined, transcript });
      expect(screen.getByRole("button", { name: /Alpha line/ })).toBeInTheDocument();
      expect(screen.queryByText("Approximate sync")).not.toBeInTheDocument();
      expect(screen.queryByText("Syncing…")).not.toBeInTheDocument();
    });

    it("aligns them to the audio's pauses only once played", () => {
      const { container } = renderPlayer({ metadata: undefined, transcript });
      const audio = audioElement(container);
      Object.defineProperty(audio, "duration", { value: 600, configurable: true });
      fireEvent(audio, new Event("durationchange"));
      expect(usePauseAlignedLines).toHaveBeenLastCalledWith(
        "https://example.test/audio.mp3",
        transcript,
        false
      );
      fireEvent(audio, new Event("play"));
      expect(usePauseAlignedLines).toHaveBeenLastCalledWith(
        "https://example.test/audio.mp3",
        transcript,
        true
      );
      // Pausing again does not cancel it.
      fireEvent(audio, new Event("pause"));
      expect(usePauseAlignedLines).toHaveBeenLastCalledWith(
        "https://example.test/audio.mp3",
        transcript,
        true
      );
    });

    it("never aligns audio over 40 minutes, and says the sync is approximate", () => {
      const { container } = renderPlayer({ metadata: undefined, transcript });
      startPlaying(audioElement(container), 41 * 60);
      for (const call of usePauseAlignedLines.mock.calls) expect(call[2]).toBe(false);
      expect(screen.getByText("Approximate sync")).toBeInTheDocument();
    });

    it("uses the aligned lines and drops the badge once aligned", async () => {
      alignment = {
        status: "aligned",
        lines: [
          { speaker: null, text: "Alpha line.", startMs: 400, endMs: 5200 },
          { speaker: null, text: "Beta line.", startMs: 6100, endMs: 9000 },
        ],
      };
      const { container } = renderPlayer({ metadata: undefined, transcript });
      const audio = audioElement(container);
      startPlaying(audio, 100);
      await userEvent.click(screen.getByRole("button", { name: /Beta line/ }));
      expect(audio.currentTime).toBe(6.1);
      expect(screen.queryByText("Approximate sync")).not.toBeInTheDocument();
      expect(screen.queryByText("Syncing…")).not.toBeInTheDocument();
    });

    it("shows Syncing… while aligning", () => {
      alignment = { lines: null, status: "aligning" };
      const { container } = renderPlayer({ metadata: undefined, transcript });
      startPlaying(audioElement(container));
      expect(screen.getByText("Syncing…")).toBeInTheDocument();
      expect(screen.queryByText("Approximate sync")).not.toBeInTheDocument();
    });

    it("keeps the estimate and says so when alignment fails", () => {
      alignment = { lines: null, status: "failed" };
      const { container } = renderPlayer({ metadata: undefined, transcript });
      startPlaying(audioElement(container));
      expect(screen.getByRole("button", { name: /Beta line/ })).toBeInTheDocument();
      expect(screen.getByText("Approximate sync")).toBeInTheDocument();
    });

    it("ignores an alignment that does not match the transcript's lines", () => {
      alignment = {
        status: "aligned",
        lines: [{ speaker: null, text: "Alpha line.", startMs: 400, endMs: 9000 }],
      };
      const { container } = renderPlayer({ metadata: undefined, transcript });
      startPlaying(audioElement(container));
      expect(screen.getByRole("button", { name: /Beta line/ })).toBeInTheDocument();
      expect(screen.queryByText("Syncing…")).not.toBeInTheDocument();
    });

    it("says the sync is approximate for a single line, which has nothing to align", () => {
      renderPlayer({ metadata: undefined, transcript: "Only line." });
      expect(screen.getByText("Approximate sync")).toBeInTheDocument();
    });

    describe("with the real alignment hook", () => {
      const fetchMock = vi.fn();

      beforeEach(() => {
        realAlignment = true;
        // Hold the download open; unmounting aborts it, as a browser would.
        fetchMock.mockReset().mockImplementation(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
            })
        );
        vi.stubGlobal("fetch", fetchMock);
        vi.stubGlobal(
          "OfflineAudioContext",
          class {
            decodeAudioData() {
              return Promise.reject(new Error("not reached"));
            }
          }
        );
      });

      afterEach(() => {
        realAlignment = false;
        vi.unstubAllGlobals();
      });

      it("downloads nothing before play, and the audio once playback starts", () => {
        const { container } = renderPlayer({ metadata: undefined, transcript });
        const audio = audioElement(container);
        Object.defineProperty(audio, "duration", { value: 600, configurable: true });
        fireEvent(audio, new Event("durationchange"));
        expect(fetchMock).not.toHaveBeenCalled();

        fireEvent(audio, new Event("play"));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          "https://example.test/audio.mp3",
          expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
        expect(screen.getByText("Syncing…")).toBeInTheDocument();
      });

      it("never downloads a 41-minute overview", () => {
        const { container } = renderPlayer({ metadata: undefined, transcript });
        startPlaying(audioElement(container), 41 * 60);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.getByText("Approximate sync")).toBeInTheDocument();
      });
    });
  });

  it("never aligns an overview with saved timings", () => {
    alignment = {
      status: "aligned",
      lines: [{ speaker: null, text: "Wrong.", startMs: 0, endMs: 1 }],
    };
    renderPlayer();
    expect(usePauseAlignedLines).toHaveBeenCalled();
    for (const call of usePauseAlignedLines.mock.calls) expect(call[2]).toBe(false);
    expect(screen.getByRole("button", { name: /Second line, answering/ })).toBeInTheDocument();
    expect(screen.queryByText("Wrong.")).not.toBeInTheDocument();
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
