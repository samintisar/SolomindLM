import type React from "react";
import { MessageMarkdown } from "../components/MessageMarkdown";
import type { RefHandlers } from "./messageRendering.utils";

export function renderMessageWithReferences(
  messageId: string,
  content: string,
  _references: unknown[] | undefined,
  handlers: RefHandlers | undefined,
  options?: { isStreamingVisual?: boolean }
): React.ReactNode {
  return (
    <MessageMarkdown
      messageId={messageId}
      content={content}
      handlers={handlers}
      streaming={!!options?.isStreamingVisual}
    />
  );
}
