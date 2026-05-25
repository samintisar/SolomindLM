export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ar", label: "Arabic" },
  { code: "bn", label: "Bengali" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "hi", label: "Hindi" },
  { code: "id", label: "Indonesian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "es", label: "Spanish" },
  { code: "tr", label: "Turkish" },
  { code: "ur", label: "Urdu" },
  { code: "vi", label: "Vietnamese" },
] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const VALID_LANGUAGE_CODES: string[] = SUPPORTED_LANGUAGES.map((l) => l.code);

/**
 * Appends a language instruction to a system prompt.
 * Returns the prompt unchanged for English or unknown codes (no prompt overhead).
 */
export function withLanguageInstruction(systemPrompt: string, language?: string): string {
  if (!language || language === "en") return systemPrompt;
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === language);
  if (!lang) return systemPrompt;
  return `${systemPrompt}\n\nIMPORTANT: You must respond entirely in ${lang.label}. All output text must be in ${lang.label}.`;
}
