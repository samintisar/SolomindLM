import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { LanguageSelector } from "./LanguageSelector";

const setLanguage = vi.fn();

vi.mock("../hooks/useOutputLanguage", () => ({
  useOutputLanguage: () => ({
    language: "en",
    isLoading: false,
    setLanguage,
  }),
}));

describe("LanguageSelector", () => {
  test("opens output language options when clicked", async () => {
    const user = userEvent.setup();

    render(<LanguageSelector isAuthenticated={true} />);

    await user.click(screen.getByRole("button", { name: /output language/i }));

    expect(
      screen.getByRole("listbox", { name: /output language options/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /english/i })).toBeInTheDocument();
  });
});
