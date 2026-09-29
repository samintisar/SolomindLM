import { describe, expect, it, vi } from "vitest";
import { EmptyLlmResponseError } from "../_shared/llmErrors";
import { generateValidatedDialogueScript, parseDialogueScriptResponse } from "./scriptParsing";

const line = (speaker: "host_a" | "host_b", text: string) => JSON.stringify({ speaker, text });

describe("parseDialogueScriptResponse", () => {
  it("parses a valid dialogue JSON array from surrounding text", () => {
    const result = parseDialogueScriptResponse(
      'Here is the script:\n[{"speaker":"host_a","text":"Specific opening."},{"speaker":"host_b","text":"Useful pushback."}]',
      2
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.script).toEqual([
        { speaker: "host_a", text: "Specific opening." },
        { speaker: "host_b", text: "Useful pushback." },
      ]);
    }
  });

  it("rejects an unparseable response", () => {
    const result = parseDialogueScriptResponse("I cannot make JSON for this.", 2);

    expect(result).toEqual({
      ok: false,
      reason: "missing_json_array",
    });
  });

  it("rejects scripts that are too short to be a useful overview", () => {
    const result = parseDialogueScriptResponse(
      '[{"speaker":"host_a","text":"Too short."},{"speaker":"host_b","text":"Still too short."}]',
      3
    );

    expect(result).toEqual({
      ok: false,
      reason: "too_short",
      actualLines: 2,
      minimumLines: 3,
    });
  });

  it("rejects entries with invalid speakers or blank text", () => {
    const result = parseDialogueScriptResponse(
      '[{"speaker":"host_c","text":"Wrong speaker."},{"speaker":"host_b","text":"   "}]',
      1
    );

    expect(result).toEqual({
      ok: false,
      reason: "invalid_line",
      lineIndex: 0,
    });
  });

  it("salvages complete lines from output truncated mid-object", () => {
    const truncated = `[${line("host_a", "First point.")},${line("host_b", "Second point.")},${line("host_a", "Third point.")},{"speaker":"host_b","text":"Cut off mid-sen`;

    const result = parseDialogueScriptResponse(truncated, 3);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.script.map((l) => l.text)).toEqual([
        "First point.",
        "Second point.",
        "Third point.",
      ]);
    }
  });

  it("drops isolated malformed entries but keeps the valid ones", () => {
    const response = `[${line("host_a", "One.")},{"speaker":"host_c","text":"Bad speaker."},${line("host_b", "Two.")},${line("host_a", 'Three with "quotes" and {braces}.')}]`;

    const result = parseDialogueScriptResponse(response, 3);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.script).toHaveLength(3);
      expect(result.script[2].text).toBe('Three with "quotes" and {braces}.');
    }
  });

  it("still rejects a truncated response when too few lines survive", () => {
    const truncated = `[${line("host_a", "Only one.")},{"speaker":"host_b","text":"Cut`;

    const result = parseDialogueScriptResponse(truncated, 3);

    expect(result.ok).toBe(false);
  });
});

describe("generateValidatedDialogueScript", () => {
  const validResponse = `[${line("host_a", "A.")},${line("host_b", "B.")}]`;

  it("returns the script from the first valid attempt", async () => {
    const generate = vi.fn().mockResolvedValue(validResponse);

    const result = await generateValidatedDialogueScript({
      generate,
      minimumLines: 2,
      maxAttempts: 2,
    });

    expect(result.attempt).toBe(1);
    expect(result.script).toHaveLength(2);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("retries once after an unparsable response and succeeds", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce("Sorry, here is some prose.")
      .mockResolvedValueOnce(validResponse);
    const onAttemptFailed = vi.fn();

    const result = await generateValidatedDialogueScript({
      generate,
      minimumLines: 2,
      maxAttempts: 2,
      onAttemptFailed,
    });

    expect(result.attempt).toBe(2);
    expect(generate).toHaveBeenNthCalledWith(2, 2, "invalid_script");
    expect(onAttemptFailed).toHaveBeenCalledTimes(1);
  });

  it("throws instead of returning placeholder content when every attempt fails", async () => {
    const generate = vi.fn().mockResolvedValue("no json here");

    await expect(
      generateValidatedDialogueScript({ generate, minimumLines: 2, maxAttempts: 2 })
    ).rejects.toThrow(/failed after 2 attempt\(s\).*No JSON array/);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("stops retrying when canRetry returns false", async () => {
    const generate = vi.fn().mockResolvedValue("no json here");

    await expect(
      generateValidatedDialogueScript({
        generate,
        minimumLines: 2,
        maxAttempts: 3,
        canRetry: () => false,
      })
    ).rejects.toThrow(/failed after 1 attempt\(s\)/);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("propagates generate errors without retrying", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("provider down"));

    await expect(
      generateValidatedDialogueScript({ generate, minimumLines: 2, maxAttempts: 2 })
    ).rejects.toThrow("provider down");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("retries after an empty model response (e.g. output budget spent on reasoning)", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new EmptyLlmResponseError({ model: "m", finishReason: "length" }))
      .mockResolvedValueOnce(validResponse);
    const onAttemptFailed = vi.fn();

    const result = await generateValidatedDialogueScript({
      generate,
      minimumLines: 2,
      maxAttempts: 2,
      onAttemptFailed,
    });

    expect(result.attempt).toBe(2);
    expect(onAttemptFailed).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, reason: expect.stringMatching(/empty.*length/i) })
    );
  });

  it("fails with the empty-response reason when every attempt comes back empty", async () => {
    const generate = vi
      .fn()
      .mockRejectedValue(new EmptyLlmResponseError({ model: "m", finishReason: "length" }));

    await expect(
      generateValidatedDialogueScript({ generate, minimumLines: 2, maxAttempts: 2 })
    ).rejects.toThrow(/failed after 2 attempt\(s\).*empty/i);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("stops after an empty response when canRetry returns false", async () => {
    const generate = vi
      .fn()
      .mockRejectedValue(new EmptyLlmResponseError({ model: "m", finishReason: "length" }));

    await expect(
      generateValidatedDialogueScript({
        generate,
        minimumLines: 2,
        maxAttempts: 2,
        canRetry: () => false,
      })
    ).rejects.toThrow(/failed after 1 attempt\(s\).*empty/i);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("tells the retry why the previous attempt failed", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new EmptyLlmResponseError({ model: "m", finishReason: "length" }))
      .mockResolvedValueOnce("not a script")
      .mockResolvedValueOnce(validResponse);

    await generateValidatedDialogueScript({ generate, minimumLines: 2, maxAttempts: 3 });

    expect(generate.mock.calls).toEqual([
      [1, undefined],
      [2, "empty_response"],
      [3, "invalid_script"],
    ]);
  });
});
