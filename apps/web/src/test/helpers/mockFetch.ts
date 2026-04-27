/**
 * Build a mock Response with a ReadableStream body for streaming tests.
 *
 * Lines are emitted one at a time with a small delay to simulate
 * real streaming behavior. Uses TextEncoder + ReadableStream.
 *
 * Usage:
 *   const response = createMockStreamResponse([
 *     "__STATUS:thinking:Processing...",
 *     "Hello world",
 *     "__DONE",
 *   ]);
 *   await consumePersistentTextStream(response, callbacks);
 */

export function createMockStreamResponse(lines: string[]): Response {
  const encoder = new TextEncoder();

  let lineIndex = 0;

  const stream = new ReadableStream({
    async pull(controller) {
      if (lineIndex >= lines.length) {
        controller.close();
        return;
      }

      const line = lines[lineIndex];
      controller.enqueue(encoder.encode(line + "\n"));
      lineIndex++;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Build a mock Response that emits the entire body at once (no streaming).
 */
export function createMockImmediateResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
