import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OnboardingProvider } from "./OnboardingProvider";
import { TourTooltip } from "./components/TourTooltip";
import { ChecklistCard } from "./components/ChecklistCard";
import { useOnboarding } from "./OnboardingContext";

const STEPS = [
  "createNotebook",
  "addSource",
  "askQuestion",
  "openStudio",
  "generateArtifact",
] as const;

let state: {
  tourStatus: string;
  currentStepId?: string;
  checklistDismissed: boolean;
  _id?: string;
} = {
  tourStatus: "pending",
  checklistDismissed: false,
  _id: "row1",
};
let tour: {
  createNotebook: boolean;
  addSource: boolean;
  askQuestion: boolean;
  openStudio: boolean;
  generateArtifact: boolean;
  tourNotebookId: string | undefined;
} = {
  createNotebook: false,
  addSource: false,
  askQuestion: false,
  openStudio: false,
  generateArtifact: false,
  tourNotebookId: undefined,
};
let checklist = {
  createNotebook: false,
  addSource: false,
  askQuestion: false,
  openStudio: false,
  generateArtifact: false,
};

const mockMutations = {
  startTour: vi.fn(async () => {
    state = { ...state, tourStatus: "active", currentStepId: "createNotebook" };
  }),
  advanceTourStep: vi.fn(
    async (args: { expectedCurrentStepId: string; tourNotebookId?: string }) => {
      const idx = STEPS.indexOf(
        args.expectedCurrentStepId as (typeof STEPS)[number],
      );
      if (args.tourNotebookId) {
        tour = { ...tour, tourNotebookId: args.tourNotebookId };
      }
      if (idx === STEPS.length - 1) {
        state = { ...state, tourStatus: "completed", currentStepId: undefined };
      } else {
        state = { ...state, currentStepId: STEPS[idx + 1] };
      }
    },
  ),
  skipTour: vi.fn(async () => {
    state = { ...state, tourStatus: "skipped", currentStepId: undefined };
  }),
  completeTour: vi.fn(async () => {
    state = { ...state, tourStatus: "completed", currentStepId: undefined };
  }),
  getOrCreateOnboardingRow: vi.fn(async () => "row1"),
  dismissChecklist: vi.fn(async () => {
    state = { ...state, checklistDismissed: true };
  }),
};

vi.mock("convex/react", () => ({
  useQuery: (fn: { name?: string } | string) => {
    const name = typeof fn === "string" ? fn : String(fn.name ?? fn);
    if (name.includes("getOnboardingState")) return state;
    if (name.includes("getChecklistProgress")) return checklist;
    if (name.includes("getTourProgress")) return tour;
    return undefined;
  },
  useMutation: (fn: { name?: string } | string) => {
    const name = typeof fn === "string" ? fn : String(fn.name ?? fn);
    for (const [key, m] of Object.entries(mockMutations)) {
      if (name.includes(key)) return m;
    }
    return vi.fn();
  },
}));

vi.mock("@convex/_generated/api", () => ({
  api: {
    onboarding: {
      state: {
        getOnboardingState: { name: "getOnboardingState" },
        getOrCreateOnboardingRow: { name: "getOrCreateOnboardingRow" },
      },
      progress: {
        getChecklistProgress: { name: "getChecklistProgress" },
        getTourProgress: { name: "getTourProgress" },
      },
      mutations: {
        startTour: { name: "startTour" },
        advanceTourStep: { name: "advanceTourStep" },
        skipTour: { name: "skipTour" },
        completeTour: { name: "completeTour" },
        dismissChecklist: { name: "dismissChecklist" },
      },
    },
  },
}));

function setupTarget(attr: string) {
  const el = document.createElement("button");
  el.setAttribute("data-onboarding", attr);
  el.getBoundingClientRect = () =>
    ({
      top: 50,
      left: 50,
      right: 100,
      bottom: 80,
      width: 50,
      height: 30,
      x: 50,
      y: 50,
      toJSON() {},
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

function StudioOpener() {
  const { notifyStudioOpen } = useOnboarding();
  return (
    <button data-testid="open-studio" onClick={notifyStudioOpen}>
      open
    </button>
  );
}

function App() {
  return (
    <MemoryRouter initialEntries={["/home"]}>
      <OnboardingProvider isAuthenticated>
        <TourTooltip />
        <ChecklistCard />
        <StudioOpener />
      </OnboardingProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  document.body.innerHTML = "";
  for (const m of Object.values(mockMutations)) m.mockClear();
  state = {
    tourStatus: "pending",
    checklistDismissed: false,
    _id: "row1",
  };
  tour = {
    createNotebook: false,
    addSource: false,
    askQuestion: false,
    openStudio: false,
    generateArtifact: false,
    tourNotebookId: undefined,
  };
  checklist = {
    createNotebook: false,
    addSource: false,
    askQuestion: false,
    openStudio: false,
    generateArtifact: false,
  };
});

describe("Onboarding integration — happy path", () => {
  test("tour advances through all 5 steps and completes", async () => {
    setupTarget("create-notebook-button");
    const { rerender } = render(<App />);

    // Auto-launch fired startTour which mutated external mock state. Re-render
    // so the provider picks up the new tourStatus/currentStepId from useQuery.
    await waitFor(() => expect(mockMutations.startTour).toHaveBeenCalled());
    rerender(<App />);

    await waitFor(() =>
      expect(screen.getByText(/Create your first one/)).toBeInTheDocument(),
    );

    // Step 1 → 2: user creates a notebook
    setupTarget("add-source-button");
    tour = { ...tour, createNotebook: true, tourNotebookId: "nb1" };
    checklist = { ...checklist, createNotebook: true };
    rerender(<App />);
    // advanceTourStep mock flips state.currentStepId; rerender to pick it up.
    await waitFor(() =>
      expect(mockMutations.advanceTourStep).toHaveBeenLastCalledWith({
        expectedCurrentStepId: "createNotebook",
        tourNotebookId: "nb1",
      }),
    );
    rerender(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Add a PDF/)).toBeInTheDocument(),
    );

    // Step 2 → 3: user adds a source
    setupTarget("chat-input");
    tour = { ...tour, addSource: true };
    checklist = { ...checklist, addSource: true };
    rerender(<App />);
    await waitFor(() =>
      expect(mockMutations.advanceTourStep).toHaveBeenLastCalledWith({
        expectedCurrentStepId: "addSource",
      }),
    );
    rerender(<App />);
    await waitFor(() =>
      expect(
        screen.getByText(/Ask anything about your sources/),
      ).toBeInTheDocument(),
    );

    // Step 3 → 4: user asks a question
    setupTarget("studio-panel-toggle");
    tour = { ...tour, askQuestion: true };
    checklist = { ...checklist, askQuestion: true };
    rerender(<App />);
    await waitFor(() =>
      expect(mockMutations.advanceTourStep).toHaveBeenLastCalledWith({
        expectedCurrentStepId: "askQuestion",
      }),
    );
    rerender(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Studio turns your sources/)).toBeInTheDocument(),
    );

    // Step 4 → 5: user opens Studio (via local state notify)
    setupTarget("studio-tool-grid");
    const userEvent = (await import("@testing-library/user-event")).default;
    await userEvent.click(screen.getByTestId("open-studio"));
    checklist = { ...checklist, openStudio: true };
    await waitFor(() =>
      expect(mockMutations.advanceTourStep).toHaveBeenLastCalledWith({
        expectedCurrentStepId: "openStudio",
      }),
    );
    rerender(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Pick any tool/)).toBeInTheDocument(),
    );

    // Step 5 → completed: user generates an artifact
    tour = { ...tour, generateArtifact: true };
    checklist = { ...checklist, generateArtifact: true };
    rerender(<App />);
    await waitFor(() =>
      expect(mockMutations.advanceTourStep).toHaveBeenLastCalledWith({
        expectedCurrentStepId: "generateArtifact",
      }),
    );
    rerender(<App />);
    await waitFor(() => expect(state.tourStatus).toBe("completed"));
  });
});
