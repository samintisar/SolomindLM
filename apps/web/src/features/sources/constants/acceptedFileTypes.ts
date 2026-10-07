/** File types the source uploader accepts, grouped under the name shown to users. */
const FILE_TYPE_GROUPS = [
  { label: "PDF", extensions: [".pdf"] },
  { label: "Word", extensions: [".docx"] },
  { label: "PowerPoint", extensions: [".pptx"] },
  { label: "Text", extensions: [".txt"] },
  { label: "Markdown", extensions: [".md"] },
  { label: "JSON", extensions: [".json"] },
  { label: "CSV", extensions: [".csv"] },
  { label: "PNG", extensions: [".png"] },
  { label: "JPEG", extensions: [".jpg", ".jpeg"] },
  { label: "AVIF", extensions: [".avif"] },
  { label: "WAV", extensions: [".wav"] },
  { label: "MP3", extensions: [".mp3"] },
  { label: "M4A", extensions: [".m4a"] },
  { label: "WebM", extensions: [".webm"] },
  { label: "FLAC", extensions: [".flac"] },
] as const;

export const ACCEPTED_FILE_TYPES: readonly string[] = FILE_TYPE_GROUPS.flatMap(
  (group) => group.extensions
);

/** Human-readable list for the drop zone, e.g. "PDF, Word, PowerPoint, …". */
export const ACCEPTED_FILE_TYPE_LABELS = FILE_TYPE_GROUPS.map((group) => group.label).join(", ");

export function isAcceptedFile(file: File): boolean {
  const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
  return ACCEPTED_FILE_TYPES.includes(extension);
}
