import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OnboardingProvider } from "./OnboardingProvider";
import { useOnboarding } from "./OnboardingContext";

const mockMutations = {
  startTour: vi.fn(async () => {}),
  advanceTourStep: vi.fn(async () => {}),
  skipTour: vi.fn(async () => {}),
  completeTour: vi.fn(async () => {}),
  getOrCreateOnboardingRow: vi.fn(async () => "row1"),
};

let mockState: {
  tourStatus: string;
  currentStepId?: string;
  checklistDismissed?: boolean;
  _id?: string;
} | null = null;
let mockChecklist = {
  createNotebook: false,
  addSource: false,
  askQuestion: false,
  generateArtifact: false,
};
let mockTour: {
  createNotebook: boolean;
  addSource: boolean;
  askQuestion: boolean;
  generateArtifact: boolean;
  tourNotebookId?: string;
} = {
  ...mockChecklist,
  tourNotebookId: undefined,
};
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

vi.mock("convex/react", () => ({
  useQuery: (fn: { name?: string } | string) => {
    const name = typeof fn === "string" ? fn : String(fn.name ?? fn);
    if (name.includes("getOnboardingState")) return mockState;
    if (name.includes("getChecklistProgress")) return mockChecklist;
    if (name.includes("getTourProgress")) return mockTour;
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
      },
    },
  },
}));

function ProbeStep() {
  const { currentStepId, tourStatus } = useOnboarding();
  return (
    <div data-testid="probe">
      {tourStatus}:{currentStepId ?? "none"}
    </div>
  );
}

function renderWith(authenticated = true, route = "/home") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <OnboardingProvider isAuthenticated={authenticated}>
        <ProbeStep />
      </OnboardingProvider>
    </MemoryRouter>,
  );
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  for (const m of Object.values(mockMutations)) m.mockClear();
  mockState = null;
  mockChecklist = {
    createNotebook: false,
    addSource: false,
    askQuestion: false,
    generateArtifact: false,
  };
  mockTour = {
    createNotebook: false,
    addSource: false,
    askQuestion: false,
    generateArtifact: false,
    tourNotebookId: undefined,
  };
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("OnboardingProvider", () => {
  test("calls startTour when state is pending", async () => {
    mockState = { tourStatus: "pending" };
    renderWith();
    await flushEffects();
    expect(mockMutations.startTour).toHaveBeenCalledTimes(1);
  });

  test("retries startTour after a transient failure", async () => {
    mockState = { tourStatus: "pending" };
    mockMutations.startTour
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(undefined);
    renderWith();
    await flushEffects();
    expect(mockMutations.startTour).toHaveBeenCalledTimes(2);
  });

  test("does not call startTour when state is skipped", async () => {
    mockState = { tourStatus: "skipped", _id: "row1" };
    renderWith();
    await flushEffects();
    expect(mockMutations.startTour).not.toHaveBeenCalled();
  });

  test("does not call startTour when state is completed", async () => {
    mockState = { tourStatus: "completed", _id: "row1" };
    renderWith();
    await flushEffects();
    expect(mockMutations.startTour).not.toHaveBeenCalled();
  });

  test("calls advanceTourStep when gating boolean flips on createNotebook", async () => {
    mockState = {
      tourStatus: "active",
      currentStepId: "createNotebook",
      _id: "row1",
    };
    mockTour = { ...mockTour, createNotebook: false };
    const { rerender } = renderWith();
    await flushEffects();
    mockTour = {
      ...mockTour,
      createNotebook: true,
      tourNotebookId: "nb1",
    };
    rerender(
      <MemoryRouter initialEntries={["/home"]}>
        <OnboardingProvider isAuthenticated={true}>
          <ProbeStep />
        </OnboardingProvider>
      </MemoryRouter>,
    );
    await flushEffects();
    expect(mockMutations.advanceTourStep).toHaveBeenCalledWith({
      expectedCurrentStepId: "createNotebook",
      tourNotebookId: "nb1",
    });
  });

  test("does not log stale step mismatch errors from advanceTourStep", async () => {
    mockState = {
      tourStatus: "active",
      currentStepId: "createNotebook",
      _id: "row1",
    };
    mockTour = {
      ...mockTour,
      createNotebook: true,
      tourNotebookId: "nb1",
    };
    mockMutations.advanceTourStep.mockRejectedValueOnce(
      new Error("Step mismatch: expected createNotebook, got addSource"),
    );

    renderWith();
    await flushEffects();
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      "[onboarding] failed to advance tour step",
      expect.anything(),
    );
  });

  test("logs non-stale advanceTourStep failures", async () => {
    mockState = {
      tourStatus: "active",
      currentStepId: "createNotebook",
      _id: "row1",
    };
    mockTour = {
      ...mockTour,
      createNotebook: true,
      tourNotebookId: "nb1",
    };
    const failure = new Error("network failed");
    mockMutations.advanceTourStep.mockRejectedValueOnce(failure);

    renderWith();
    await flushEffects();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[onboarding] failed to advance tour step",
      failure,
    );
  });

  test("retries completeTour after a transient failure", async () => {
    mockState = {
      tourStatus: "active",
      currentStepId: "generateArtifact",
      _id: "row1",
    };
    mockChecklist = {
      createNotebook: true,
      addSource: true,
      askQuestion: true,
      generateArtifact: true,
    };
    mockMutations.completeTour
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(undefined);

    renderWith();
    await flushEffects();
    expect(mockMutations.completeTour).toHaveBeenCalledTimes(2);
  });
});
