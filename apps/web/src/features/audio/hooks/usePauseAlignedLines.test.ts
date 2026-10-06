// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReaderLine } from "../transcript/transcriptLines";
import { usePauseAlignedLines } from "./usePauseAlignedLines";

const alignTranscriptToAudio = vi.fn();
vi.mock("../transcript/alignToPauses", () => ({
  alignTranscriptToAudio: (...args: unknown[]) => alignTranscriptToAudio(...args),
}));

const alignedLines: ReaderLine[] = [
  { speaker: null, text: "One.", startMs: 100, endMs: 900 },
  { speaker: null, text: "Two.", startMs: 1500, endMs: 3000 },
];
const samples = new Float32Array(16);

/** jsdom has no Web Audio: a stand-in that decodes at whatever rate it was created with. */
const contextRates: number[] = [];
let rejectRate: number | null = null;
let decodeError: Error | null = null;
class FakeOfflineAudioContext {
  readonly sampleRate: number;
  constructor(_channels: number, _length: number, sampleRate: number) {
    if (sampleRate === rejectRate) throw new DOMException("unsupported rate", "NotSupportedError");
    contextRates.push(sampleRate);
    this.sampleRate = sampleRate;
  }
  decodeAudioData(_data: ArrayBuffer) {
    if (decodeError) return Promise.reject(decodeError);
    return Promise.resolve({ sampleRate: this.sampleRate, getChannelData: () => samples });
  }
}

const okResponse = () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) });

interface PendingFetch {
  url: string;
  signal: AbortSignal;
  resolve: () => void;
}
/**
 * Holds every fetch until the test resolves it. By default an abort rejects it, as a browser
 * does; with `ignoreAbort` it can still resolve afterwards, like a response already in flight.
 */
function holdFetches({ ignoreAbort = false } = {}): PendingFetch[] {
  const pending: PendingFetch[] = [];
  fetchMock.mockImplementation(
    (url: string, init: RequestInit) =>
      new Promise((resolve, reject) => {
        const signal = init.signal as AbortSignal;
        if (!ignoreAbort) signal.addEventListener("abort", () => reject(signal.reason));
        pending.push({ url, signal, resolve: () => resolve(okResponse()) });
      })
  );
  return pending;
}

/** Lets queued microtasks (the deferred abort) run. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const fetchMock = vi.fn();
let warn: ReturnType<typeof vi.spyOn>;
let urlCounter = 0;
/** The cache is module-level, so every test uses its own URLs. */
const freshUrl = () => `https://example.test/audio-${++urlCounter}.mp3`;

beforeEach(() => {
  contextRates.length = 0;
  rejectRate = null;
  decodeError = null;
  alignTranscriptToAudio.mockReset().mockReturnValue(alignedLines);
  fetchMock.mockReset().mockImplementation(async () => okResponse());
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  warn.mockRestore();
});

describe("usePauseAlignedLines", () => {
  it("stays idle and fetches nothing when disabled or without a URL", () => {
    const disabled = renderHook(() => usePauseAlignedLines(freshUrl(), "One.\nTwo.", false));
    expect(disabled.result.current).toEqual({ lines: null, status: "idle" });
    const noUrl = renderHook(() => usePauseAlignedLines(null, "One.\nTwo.", true));
    expect(noUrl.result.current).toEqual({ lines: null, status: "idle" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("decodes the audio at 8 kHz and aligns the transcript to it", async () => {
    const url = freshUrl();
    const { result } = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    expect(result.current.status).toBe("aligning");
    await waitFor(() => expect(result.current.status).toBe("aligned"));
    expect(result.current.lines).toEqual(alignedLines);
    expect(fetchMock).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(contextRates).toEqual([8000]);
    expect(alignTranscriptToAudio).toHaveBeenCalledWith("One.\nTwo.", samples, 8000);
  });

  it("falls back to 22.05 kHz when an 8 kHz context is not supported", async () => {
    rejectRate = 8000;
    const url = freshUrl();
    const { result } = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    await waitFor(() => expect(result.current.status).toBe("aligned"));
    expect(contextRates).toEqual([22050]);
    expect(alignTranscriptToAudio).toHaveBeenCalledWith("One.\nTwo.", samples, 22050);
  });

  it("serves a reopened overview from the cache without fetching again", async () => {
    const url = freshUrl();
    const first = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    await waitFor(() => expect(first.result.current.status).toBe("aligned"));
    first.unmount();

    const again = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    expect(again.result.current).toEqual({ lines: alignedLines, status: "aligned" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one fetch between two players of the same audio", async () => {
    const url = freshUrl();
    const one = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    const two = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    await waitFor(() => expect(one.result.current.status).toBe("aligned"));
    await waitFor(() => expect(two.result.current.status).toBe("aligned"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts the fetch on unmount, quietly", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          signal = init.signal ?? undefined;
          signal?.addEventListener("abort", () => reject(signal?.reason));
        })
    );
    const url = freshUrl();
    const { unmount } = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    expect(signal?.aborted).toBe(false);
    unmount();
    await waitFor(() => expect(signal?.aborted).toBe(true));
    await Promise.resolve();
    expect(warn).not.toHaveBeenCalled();
    expect(alignTranscriptToAudio).not.toHaveBeenCalled();
  });

  it("fails with one warning when the audio cannot be fetched", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const url = freshUrl();
    const { result } = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.lines).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("fails with one warning on an HTTP error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const url = freshUrl();
    const { result } = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("fails with one warning when the lines cannot be aligned, and remembers it", async () => {
    alignTranscriptToAudio.mockReturnValue(null);
    const url = freshUrl();
    const first = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    await waitFor(() => expect(first.result.current.status).toBe("failed"));
    expect(warn).toHaveBeenCalledTimes(1);
    first.unmount();

    const again = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    expect(again.result.current).toEqual({ lines: null, status: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-aligns when the same audio comes with a different transcript", async () => {
    const url = freshUrl();
    const first = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    await waitFor(() => expect(first.result.current.status).toBe("aligned"));
    first.unmount();

    const other = renderHook(() => usePauseAlignedLines(url, "One.\nTwo, edited.", true));
    expect(other.result.current.status).toBe("aligning");
    await waitFor(() => expect(other.result.current.status).toBe("aligned"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(alignTranscriptToAudio).toHaveBeenLastCalledWith("One.\nTwo, edited.", samples, 8000);
  });

  it("fails at once, without fetching, where Web Audio is missing", () => {
    vi.stubGlobal("OfflineAudioContext", undefined);
    const url = freshUrl();
    const { result } = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    expect(result.current).toEqual({ lines: null, status: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the prefixed webkitOfflineAudioContext where that is all there is", async () => {
    vi.stubGlobal("OfflineAudioContext", undefined);
    vi.stubGlobal("webkitOfflineAudioContext", FakeOfflineAudioContext);
    const url = freshUrl();
    const { result } = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    await waitFor(() => expect(result.current.status).toBe("aligned"));
    expect(contextRates).toEqual([8000]);
  });

  it("remembers a decoding failure, so a remount does not download again", async () => {
    decodeError = new DOMException("Unable to decode audio data", "EncodingError");
    const url = freshUrl();
    const first = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    await waitFor(() => expect(first.result.current.status).toBe("failed"));
    expect(warn).toHaveBeenCalledTimes(1);
    first.unmount();

    const again = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    expect(again.result.current).toEqual({ lines: null, status: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a network failure on the next mount", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const url = freshUrl();
    const first = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    await waitFor(() => expect(first.result.current.status).toBe("failed"));
    first.unmount();

    const again = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    await waitFor(() => expect(again.result.current.status).toBe("aligned"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fetches once, and does not abort, under strict mode's remount", async () => {
    const pending = holdFetches();
    const url = freshUrl();
    const { result } = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true), {
      reactStrictMode: true,
    });
    await tick();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.signal.aborted).toBe(false);
    pending[0]?.resolve();
    await waitFor(() => expect(result.current.status).toBe("aligned"));
  });

  it("keeps aligning for one player when the other unmounts", async () => {
    const pending = holdFetches();
    const url = freshUrl();
    const one = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    const two = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    one.unmount();
    await tick();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.signal.aborted).toBe(false);
    pending[0]?.resolve();
    await waitFor(() => expect(two.result.current.status).toBe("aligned"));
  });

  it("starts afresh after an unmount cancelled the download", async () => {
    const pending = holdFetches();
    const url = freshUrl();
    const first = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    first.unmount();
    await tick();
    expect(pending[0]?.signal.aborted).toBe(true);

    const again = renderHook(() => usePauseAlignedLines(url, "One.\nTwo.", true));
    expect(again.result.current.status).toBe("aligning");
    expect(pending).toHaveLength(2);
    pending[1]?.resolve();
    await waitFor(() => expect(again.result.current.status).toBe("aligned"));
    expect(warn).not.toHaveBeenCalled();
  });

  it("drops the old audio when the URL changes mid-flight", async () => {
    const pending = holdFetches({ ignoreAbort: true });
    const oldUrl = freshUrl();
    const newUrl = freshUrl();
    const { result, rerender } = renderHook(
      ({ url }) => usePauseAlignedLines(url, "One.\nTwo.", true),
      { initialProps: { url: oldUrl } }
    );
    rerender({ url: newUrl });
    await tick();
    expect(pending.map((pendingFetch) => pendingFetch.url)).toEqual([oldUrl, newUrl]);
    expect(pending[0]?.signal.aborted).toBe(true);

    // The old response still arrives, but must not be analysed or land on the new key.
    pending[0]?.resolve();
    await tick();
    expect(alignTranscriptToAudio).not.toHaveBeenCalled();
    expect(result.current.status).toBe("aligning");

    pending[1]?.resolve();
    await waitFor(() => expect(result.current.status).toBe("aligned"));
    expect(alignTranscriptToAudio).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
