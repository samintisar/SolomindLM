import { TEXT_TITLE_MAX_LENGTH } from "../_lib/textTitle";
import {
  PROMPT_DESCRIPTION_MAX_LENGTH,
  PROMPT_TEXT_MAX_LENGTH,
  PROMPT_TITLE_MAX_LENGTH,
} from "../studio/prompts/config";
import {
  promptField,
  type ShowcaseNotebook,
  type ShowcaseSource,
  type ShowcaseStudioItem,
  sourceKey,
} from "./manifest";
import { SHOWCASE_PROMPTS, type ShowcasePrompt } from "./promptPacks";

/** Counts the Studio dialogs offer (apps/web/src/features/studio/hooks/flows/useCreate*Flow.ts). */
const FLASHCARD_COUNTS = [20, 35, 55];
const QUIZ_COUNTS = [10, 20, 30];
const WRITTEN_QUESTION_COUNTS = [5, 10, 15];

/** apps/web/src/shared/notebook/notebookIcons.ts NOTEBOOK_ICON_NAMES. */
const NOTEBOOK_ICONS = [
  "Book",
  "BarChart",
  "Monitor",
  "Search",
  "Brain",
  "Globe",
  "FileText",
  "GraduationCap",
  "Lightbulb",
];

/** apps/web/src/shared/notebook/coverColor.ts COVER_COLORS. */
const COVER_COLORS = new Set([
  "bg-vintage-brown-300",
  "bg-vintage-red-300",
  "bg-vintage-orange-300",
  "bg-vintage-amber-300",
  "bg-vintage-amber-400",
  "bg-vintage-green-300",
  "bg-vintage-green-400",
  "bg-vintage-blue-300",
  "bg-vintage-blue-400",
  "bg-vintage-blue-500",
  "bg-vintage-brown-400",
  "bg-vintage-red-400",
  "bg-vintage-orange-400",
  "bg-vintage-amber-500",
  "bg-vintage-green-500",
  "bg-vintage-blue-200",
  "bg-vintage-red-200",
  "bg-vintage-orange-200",
]);

const MAX_SOURCES = 15;
/** The Prompt Library's limit; the Studio dialogs take a saved prompt as is. */
const MAX_PROMPT_CHARS = PROMPT_TEXT_MAX_LENGTH;
const TEXT_SOURCE_CHARS = { min: 500, max: 20_000 };

function httpsUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function validateSource(source: ShowcaseSource): string[] {
  const errors: string[] = [];
  if (source.kind === "text") {
    if (!source.title.trim() || source.title.length > TEXT_TITLE_MAX_LENGTH) {
      errors.push(`title must be 1–${TEXT_TITLE_MAX_LENGTH} characters`);
    }
    if (source.text.length < TEXT_SOURCE_CHARS.min || source.text.length > TEXT_SOURCE_CHARS.max) {
      errors.push(`text must be ${TEXT_SOURCE_CHARS.min}–${TEXT_SOURCE_CHARS.max} characters`);
    }
  } else {
    const url = httpsUrl(source.url);
    if (!url) errors.push("url must be https");
    if (source.kind === "youtube" && url && !/(^|\.)youtube\.com$|^youtu\.be$/.test(url.hostname)) {
      errors.push("not a YouTube URL");
    }
    if (source.kind === "file" && !source.fileName.toLowerCase().endsWith(".pdf")) {
      errors.push("a file source must be a .pdf");
    }
  }
  if (!source.licence.trim()) errors.push("licence is required");
  return errors;
}

function oneOf(name: string, value: number, allowed: number[]): string[] {
  return allowed.includes(value) ? [] : [`${name} must be one of ${allowed.join(", ")}`];
}

function validateStudioItem(item: ShowcaseStudioItem): string[] {
  const errors: string[] = [];
  const field = promptField(item.kind);
  const text = (item as Partial<Record<typeof field, string>>)[field];
  if (text !== undefined && (!text.trim() || text.length > MAX_PROMPT_CHARS)) {
    errors.push(`prompt/focus must be 1–${MAX_PROMPT_CHARS} characters`);
  }
  if (item.promptKey) {
    const prompt: ShowcasePrompt | undefined = SHOWCASE_PROMPTS[item.promptKey];
    if (!prompt) errors.push(`unknown promptKey "${item.promptKey}"`);
    else if (prompt.studioTool !== item.kind) {
      errors.push(`promptKey "${item.promptKey}" is a ${prompt.studioTool} prompt`);
    }
    if (text !== undefined) errors.push(`set promptKey or ${field}, not both`);
  }
  const hasPrompt = text !== undefined || item.promptKey !== undefined;
  switch (item.kind) {
    case "flashcards":
      return [...errors, ...oneOf("cardCount", item.cardCount, FLASHCARD_COUNTS)];
    case "quiz":
      return [...errors, ...oneOf("questionCount", item.questionCount, QUIZ_COUNTS)];
    case "writtenQuestions":
      return [...errors, ...oneOf("questionCount", item.questionCount, WRITTEN_QUESTION_COUNTS)];
    case "report":
      return item.reportType === "custom" && !hasPrompt
        ? [...errors, "a custom report needs a prompt"]
        : errors;
    case "spreadsheet":
      return item.spreadsheetType === "custom" && !hasPrompt
        ? [...errors, "a custom spreadsheet needs a prompt"]
        : errors;
    default:
      return errors;
  }
}

/** Every problem with the prompt packs, as readable lines; empty when they are valid. */
export function validatePromptPacks(prompts: Record<string, ShowcasePrompt>): string[] {
  const errors: string[] = [];
  const titles = new Set<string>();
  for (const [key, prompt] of Object.entries(prompts)) {
    const where = `prompt "${key}"`;
    if (!prompt.title.trim() || prompt.title.length > PROMPT_TITLE_MAX_LENGTH) {
      errors.push(`${where}: title must be 1–${PROMPT_TITLE_MAX_LENGTH} characters`);
    }
    if (titles.has(prompt.title)) errors.push(`${where}: duplicate title`);
    titles.add(prompt.title);
    if (prompt.description.length > PROMPT_DESCRIPTION_MAX_LENGTH) {
      errors.push(`${where}: description must be ≤${PROMPT_DESCRIPTION_MAX_LENGTH} characters`);
    }
    if (!prompt.text.trim() || prompt.text.length > PROMPT_TEXT_MAX_LENGTH) {
      errors.push(`${where}: text must be 1–${PROMPT_TEXT_MAX_LENGTH} characters`);
    }
  }
  return errors;
}

/** Every problem with the manifest, as readable lines; empty when it is valid. */
export function validateManifest(notebooks: readonly ShowcaseNotebook[]): string[] {
  const errors: string[] = [];
  const slugs = new Set<string>();
  const titles = new Set<string>();
  for (const notebook of notebooks) {
    const where = `notebook "${notebook.slug}"`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(notebook.slug)) {
      errors.push(`${where}: slug must be kebab-case`);
    }
    if (slugs.has(notebook.slug)) errors.push(`${where}: duplicate slug`);
    slugs.add(notebook.slug);
    if (titles.has(notebook.title)) errors.push(`${where}: duplicate title`);
    titles.add(notebook.title);
    if (!notebook.title || notebook.title !== notebook.title.trim()) {
      errors.push(`${where}: title must be non-empty and trimmed`);
    }
    if (!NOTEBOOK_ICONS.includes(notebook.icon)) {
      errors.push(`${where}: unknown icon "${notebook.icon}"`);
    }
    if (!COVER_COLORS.has(notebook.coverColor)) {
      errors.push(`${where}: unknown cover colour "${notebook.coverColor}"`);
    }

    const sourceCount = notebook.sources.length + (notebook.paperDiscovery?.take ?? 0);
    if (sourceCount < 1 || sourceCount > MAX_SOURCES) {
      errors.push(`${where}: needs 1–${MAX_SOURCES} sources, has ${sourceCount}`);
    }
    const keys = new Set<string>();
    notebook.sources.forEach((source, i) => {
      for (const error of validateSource(source)) errors.push(`${where} source ${i}: ${error}`);
      const key = sourceKey(source);
      if (keys.has(key)) errors.push(`${where} source ${i}: duplicate source`);
      keys.add(key);
    });
    notebook.studio.forEach((item, i) => {
      for (const error of validateStudioItem(item)) {
        errors.push(`${where} studio item ${i}: ${error}`);
      }
    });

    const discovery = notebook.paperDiscovery;
    if (discovery && (!discovery.query.trim() || discovery.take < 1)) {
      errors.push(`${where}: paperDiscovery needs a query and take ≥ 1`);
    }
    const pinned = discovery?.pinnedDois;
    if (discovery && pinned) {
      const unique = new Set(pinned.map((doi) => doi.trim().toLowerCase()));
      if (pinned.length !== discovery.take || unique.size !== pinned.length) {
        errors.push(`${where}: pinnedDois must be ${discovery.take} distinct DOIs`);
      }
    }
    if (notebook.literatureReview && !discovery) {
      errors.push(`${where}: a literature review needs paperDiscovery`);
    }
    if (notebook.studio.length === 0 && !notebook.literatureReview && !notebook.deepResearch) {
      errors.push(`${where}: has nothing to generate`);
    }
  }
  return errors;
}
