/**
 * Strip heavy payloads from studio list rows. Full content loads via `notes.index.get`.
 */

const LIST_CONTENT_PREVIEW_CHARS = 200;

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function summarizeReportRow<T extends { content?: unknown }>(item: T) {
  const { content: _content, ...rest } = item;
  return rest;
}

export function summarizeFlashcardRow<T extends { cardsData?: unknown }>(item: T) {
  const { cardsData, ...rest } = item;
  return { ...rest, _cardsCount: countArray(cardsData) };
}

export function summarizeQuizRow<T extends { questionsData?: unknown }>(item: T) {
  const { questionsData, ...rest } = item;
  return { ...rest, _questionsCount: countArray(questionsData) };
}

export function summarizeMindMapRow<T extends { data?: unknown }>(item: T) {
  const { data: _data, ...rest } = item;
  return rest;
}

export function summarizeAudioOverviewRow<T extends { transcript?: unknown }>(item: T) {
  const { transcript: _transcript, ...rest } = item;
  return rest;
}

export function summarizeInfographicRow<T extends { data?: { imageUrl?: string } | unknown }>(
  item: T
) {
  const data = item.data;
  const imageUrl =
    data && typeof data === "object" && data !== null && "imageUrl" in data
      ? (data as { imageUrl?: string }).imageUrl
      : undefined;
  const { data: _data, ...rest } = item;
  return imageUrl ? { ...rest, _imageUrl: imageUrl } : rest;
}

export function summarizeSpreadsheetRow<T extends { data?: unknown }>(item: T) {
  const { data: _data, ...rest } = item;
  return rest;
}

export function summarizeWrittenQuestionsRow<T extends { questionsData?: unknown }>(item: T) {
  const { questionsData, ...rest } = item;
  return { ...rest, _questionsCount: countArray(questionsData) };
}

export function summarizeUserNoteRow<T extends { content?: unknown; messages?: unknown }>(item: T) {
  const { messages: _messages, content, ...rest } = item;
  const text = typeof content === "string" ? content : "";
  return {
    ...rest,
    content: text.slice(0, LIST_CONTENT_PREVIEW_CHARS),
    _contentTruncated: text.length > LIST_CONTENT_PREVIEW_CHARS,
  };
}

export function summarizeListRow(item: Record<string, unknown> & { _type: string }) {
  switch (item._type) {
    case "report":
      return summarizeReportRow(item as { content?: unknown });
    case "flashcard":
      return summarizeFlashcardRow(item as { cardsData?: unknown });
    case "quiz":
      return summarizeQuizRow(item as { questionsData?: unknown });
    case "mindmap":
      return summarizeMindMapRow(item as { data?: unknown });
    case "audioOverview":
      return summarizeAudioOverviewRow(item as { transcript?: unknown });
    case "infographic":
      return summarizeInfographicRow(item as { data?: { imageUrl?: string } | unknown });
    case "spreadsheet":
      return summarizeSpreadsheetRow(item as { data?: unknown });
    case "writtenQuestions":
      return summarizeWrittenQuestionsRow(item as { questionsData?: unknown });
    case "note":
      return summarizeUserNoteRow(item as { content?: unknown; messages?: unknown });
    default:
      return item;
  }
}
