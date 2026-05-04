import React from "react";

export function stripReferencesSection(content: string): string {
  const referencesPattern = /\n?(?:References|Reference):\s*\n?[\d\s.,\-:–—]*$/i;
  const match = content.match(referencesPattern);
  if (match) {
    return content.substring(0, match.index).trim();
  }
  return content;
}

export interface RefHandlers {
  onRefHover: (refId: number, messageId: string, event: React.MouseEvent) => void;
  onRefLeave: () => void;
  onRefClick: (
    refId: number,
    messageId: string,
    event: React.MouseEvent | React.TouchEvent
  ) => void;
}
