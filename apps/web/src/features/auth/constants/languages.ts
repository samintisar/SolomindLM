export const SUPPORTED_LANGUAGES = [
  { code: "en",    label: "English" },
  { code: "ar",    label: "Arabic" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "fr",    label: "French" },
  { code: "de",    label: "German" },
  { code: "hi",    label: "Hindi" },
  { code: "id",    label: "Indonesian" },
  { code: "ja",    label: "Japanese" },
  { code: "ko",    label: "Korean" },
  { code: "pt",    label: "Portuguese" },
  { code: "ru",    label: "Russian" },
  { code: "es",    label: "Spanish" },
  { code: "tr",    label: "Turkish" },
  { code: "ur",    label: "Urdu" },
  { code: "vi",    label: "Vietnamese" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];
