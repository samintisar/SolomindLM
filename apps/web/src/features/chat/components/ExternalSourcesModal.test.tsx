import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ExternalSourcesModal } from "./ExternalSourcesModal";

const sources = [
  { title: "Paper A", url: "https://a.example", snippet: "snippet a", sourceType: "academic" },
  { title: "Paper B", url: "https://b.example", snippet: "snippet b", sourceType: "web" },
];

const checkbox = (title: string) =>
  screen.getByRole("checkbox", { name: new RegExp(`include ${title}`, "i") });
const addButton = () => screen.getByRole("button", { name: /^add/i });

function setup(props: Partial<React.ComponentProps<typeof ExternalSourcesModal>> = {}) {
  const onAddSelected = vi.fn();
  const onClose = vi.fn();
  render(
    <ExternalSourcesModal
      isOpen
      onClose={onClose}
      sources={sources}
      onAddSelected={onAddSelected}
      {...props}
    />
  );
  return { onAddSelected, onClose };
}

describe("ExternalSourcesModal", () => {
  test("renders a labelled, described dialog", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: /sources/i });
    expect(dialog).toHaveAccessibleDescription(/choose which sources/i);
  });

  test("adds only the checked sources", async () => {
    const { onAddSelected } = setup();
    await userEvent.click(checkbox("Paper B"));
    await userEvent.click(addButton());
    expect(onAddSelected).toHaveBeenCalledWith([expect.objectContaining({ title: "Paper B" })]);
    expect(onAddSelected.mock.calls[0][0]).toHaveLength(1);
  });

  test("Add is disabled until something is selected", async () => {
    setup();
    expect(addButton()).toBeDisabled();
    await userEvent.click(checkbox("Paper A"));
    expect(addButton()).toBeEnabled();
    expect(addButton()).toHaveTextContent("Add 1");
  });

  test("select all and deselect all toggle every source", async () => {
    const { onAddSelected } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(checkbox("Paper A")).toBeChecked();
    expect(checkbox("Paper B")).toBeChecked();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await userEvent.click(addButton());
    expect(onAddSelected.mock.calls[0][0]).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(checkbox("Paper A")).not.toBeChecked();
    expect(checkbox("Paper B")).not.toBeChecked();
  });

  test("clicking a source link does not toggle its checkbox", async () => {
    setup();
    const link = screen.getByRole("link", { name: /paper a/i });
    expect(link).toHaveAttribute("href", "https://a.example");
    expect(link).toHaveAttribute("target", "_blank");
    link.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(link);
    expect(checkbox("Paper A")).not.toBeChecked();
  });

  test("the loading state disables Add and Cancel", async () => {
    setup({ isLoading: true });
    expect(screen.getByRole("button", { name: /adding/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  test("Cancel closes the dialog", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  test("selection resets when the dialog reopens", async () => {
    const onAddSelected = vi.fn();
    const props = { onClose: vi.fn(), sources, onAddSelected };
    const { rerender } = render(<ExternalSourcesModal isOpen {...props} />);
    await userEvent.click(checkbox("Paper A"));
    expect(checkbox("Paper A")).toBeChecked();
    rerender(<ExternalSourcesModal isOpen={false} {...props} />);
    rerender(<ExternalSourcesModal isOpen {...props} />);
    expect(checkbox("Paper A")).not.toBeChecked();
  });

  test("renders nothing when closed", () => {
    setup({ isOpen: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
