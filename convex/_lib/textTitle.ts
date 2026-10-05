/** Name a pasted-text source has until it gets a typed or generated title. */
export const PASTED_TEXT_TITLE = "Pasted text";

/** Longest title a user can give pasted text. */
export const TEXT_TITLE_MAX_LENGTH = 200;

const TITLE_SOURCE_LIMIT = 2000;

/** The title the user typed for pasted text, or null when the name is empty or the placeholder. */
export function userTitleForText(fileName: string | undefined): string | null {
  const title = fileName?.trim();
  if (!title || title.toLowerCase() === PASTED_TEXT_TITLE.toLowerCase()) return null;
  return title;
}

/** The start of the pasted text, used to generate a title when none was typed. */
export function textTitleSource(text: string): string {
  return text.trim().slice(0, TITLE_SOURCE_LIMIT);
}
