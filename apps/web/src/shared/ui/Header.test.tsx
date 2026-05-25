import { beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Header } from "./Header";

const mockUseQuery = vi.fn();
const mockShowChecklist = vi.fn(async () => {});
let capturedAvatarProps: {
  onShowChecklist?: () => void;
  showChecklistDismissed?: boolean;
} | null = null;

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/home", search: "" }),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (fn: { name?: string } | string) => {
    const name = typeof fn === "string" ? fn : String(fn.name ?? fn);
    if (name.includes("showChecklist")) return mockShowChecklist;
    return vi.fn();
  },
}));

vi.mock("@convex/_generated/api", () => ({
  api: {
    onboarding: {
      state: { getOnboardingState: { name: "getOnboardingState" } },
      mutations: {
        showChecklist: { name: "showChecklist" },
      },
    },
  },
}));

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "user@example.com", name: "User" },
    isAuthenticated: true,
    signOut: vi.fn(async () => {}),
  }),
}));

vi.mock("../contexts/useTheme", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

vi.mock("./DropdownMenu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div data-testid="dropdown">{children}</div>
  ),
}));

vi.mock("../../features/auth/components/AvatarDropdown", () => ({
  AvatarDropdown: (props: { onShowChecklist?: () => void; showChecklistDismissed?: boolean }) => {
    capturedAvatarProps = props;
    return <div data-testid="avatar-dropdown" />;
  },
}));

vi.mock("../hooks/useServiceErrorToast", () => ({
  useServiceErrorToast: () => ({ showError: vi.fn() }),
}));

describe("Header onboarding action wiring", () => {
  beforeEach(() => {
    capturedAvatarProps = null;
    mockUseQuery.mockReset();
    mockShowChecklist.mockClear();
  });

  test("shows checklist restore action only when dismissed and not completed", () => {
    mockUseQuery.mockReturnValue({
      _id: "row1",
      checklistDismissed: true,
      tourStatus: "active",
    });
    render(<Header title="Notebook" onRename={vi.fn()} isHome={true} onLogoClick={vi.fn()} />);
    expect(capturedAvatarProps?.showChecklistDismissed).toBe(true);
  });

  test("hides checklist restore action when tour already completed", () => {
    mockUseQuery.mockReturnValue({
      _id: "row1",
      checklistDismissed: true,
      tourStatus: "completed",
    });
    render(<Header title="Notebook" onRename={vi.fn()} isHome={true} onLogoClick={vi.fn()} />);
    expect(capturedAvatarProps?.showChecklistDismissed).toBe(false);
  });

  test("forwards show handler to mutation", async () => {
    mockUseQuery.mockReturnValue({
      _id: "row1",
      checklistDismissed: true,
      tourStatus: "active",
    });
    render(<Header title="Notebook" onRename={vi.fn()} isHome={true} onLogoClick={vi.fn()} />);

    await capturedAvatarProps?.onShowChecklist?.();

    expect(mockShowChecklist).toHaveBeenCalledTimes(1);
  });
});
