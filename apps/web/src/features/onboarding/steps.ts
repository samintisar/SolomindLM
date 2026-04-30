export const STEP_IDS = [
  "createNotebook",
  "addSource",
  "askQuestion",
  "generateArtifact",
] as const;

export type StepId = (typeof STEP_IDS)[number];
export type StepRoute = "home" | "notebook";

export interface StepDefinition {
  id: StepId;
  route: StepRoute;
  targetSelector: string;
  copy: string;
  /** Preferred side of the target to render the tooltip. */
  side: "top" | "right" | "bottom" | "left";
}

export const STEP_DEFINITIONS: readonly StepDefinition[] = [
  {
    id: "createNotebook",
    route: "home",
    targetSelector: '[data-onboarding="create-notebook-button"]',
    copy:
      "Notebooks are where your sources, chats, and study tools live. Create your first one.",
    side: "right",
  },
  {
    id: "addSource",
    route: "notebook",
    targetSelector: '[data-onboarding="add-source-button"]',
    copy:
      "Add a PDF, URL, YouTube link, or pasted text. This is the knowledge your AI will work from.",
    side: "right",
  },
  {
    id: "askQuestion",
    route: "notebook",
    targetSelector: '[data-onboarding="chat-input"]',
    copy: "Ask anything about your sources. Answers come with citations.",
    side: "top",
  },
  {
    id: "generateArtifact",
    route: "notebook",
    targetSelector: '[data-onboarding="studio-tool-grid"]',
    copy:
      "Pick any tool and generate your first artifact. We recommend a Report or Flashcards to start.",
    side: "left",
  },
];

export function findStep(id: StepId): StepDefinition {
  const step = STEP_DEFINITIONS.find((s) => s.id === id);
  if (!step) throw new Error(`Unknown step id: ${id}`);
  return step;
}

export function nextStep(id: StepId): StepDefinition | null {
  const idx = STEP_IDS.indexOf(id);
  if (idx === -1 || idx === STEP_IDS.length - 1) return null;
  return findStep(STEP_IDS[idx + 1]);
}

export const TOTAL_STEPS = STEP_IDS.length;
