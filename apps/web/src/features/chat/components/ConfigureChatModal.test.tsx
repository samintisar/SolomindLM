import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ConfigureChatModal } from "./ConfigureChatModal";

const modeGroup = () => screen.getByRole("radiogroup", { name: /instruction mode/i });
const lengthGroup = () => screen.getByRole("radiogroup", { name: /response length/i });

describe("ConfigureChatModal", () => {
  test("saves the chosen mode, instructions and length", async () => {
    const onSave = vi.fn();
    render(<ConfigureChatModal isOpen onClose={vi.fn()} onSave={onSave} />);
    expect(screen.getByRole("dialog", { name: /configure chat/i })).toBeInTheDocument();
    await userEvent.click(within(modeGroup()).getByRole("radio", { name: /custom/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /custom instructions/i }), "Be brief");
    await userEvent.click(within(lengthGroup()).getByRole("radio", { name: /shorter/i }));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        instructionMode: "custom",
        customInstructions: "Be brief",
        responseLength: "shorter",
      })
    );
  });

  test("mode radios are named by title and described by their description", () => {
    render(<ConfigureChatModal isOpen onClose={vi.fn()} onSave={vi.fn()} />);
    const radio = within(modeGroup()).getByRole("radio", { name: "Learning Guide" });
    expect(radio).toHaveAccessibleDescription("Step-by-step teaching style");
  });

  test("locked instruction mode disables the options and explains why", () => {
    render(<ConfigureChatModal isOpen onClose={vi.fn()} onSave={vi.fn()} instructionModeLocked />);
    const radios = within(modeGroup()).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    for (const r of radios) expect(r).toBeDisabled();
    expect(screen.getByText(/start a new chat to use a different mode/i)).toBeInTheDocument();
  });

  test("locked custom instructions are read-only", () => {
    render(
      <ConfigureChatModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
        instructionModeLocked
        chatSettings={{
          instructionMode: "custom",
          customInstructions: "Be formal",
          responseLength: "default",
        }}
      />
    );
    expect(screen.getByRole("textbox", { name: /custom instructions/i })).toHaveAttribute(
      "readonly"
    );
  });

  test("custom instructions are capped at 10,000 characters", () => {
    render(
      <ConfigureChatModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
        chatSettings={{ instructionMode: "custom", responseLength: "default" }}
      />
    );
    const box = screen.getByRole("textbox", { name: /custom instructions/i });
    fireEvent.change(box, { target: { value: "a".repeat(10050) } });
    expect((box as HTMLTextAreaElement).value).toHaveLength(10000);
    expect(screen.getByText(/10000 \/ 10000/)).toBeInTheDocument();
  });

  test("response length cannot be deselected", async () => {
    render(<ConfigureChatModal isOpen onClose={vi.fn()} onSave={vi.fn()} />);
    const def = within(lengthGroup()).getByRole("radio", { name: /default/i });
    expect(def).toBeChecked();
    await userEvent.click(def);
    expect(def).toBeChecked();
  });

  test("Save is disabled until something changes, and while saving", async () => {
    const { rerender } = render(<ConfigureChatModal isOpen onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    await userEvent.click(within(lengthGroup()).getByRole("radio", { name: /longer/i }));
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
    rerender(<ConfigureChatModal isOpen onClose={vi.fn()} onSave={vi.fn()} saving />);
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  test("Escape closes", async () => {
    const onClose = vi.fn();
    render(<ConfigureChatModal isOpen onClose={onClose} onSave={vi.fn()} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
