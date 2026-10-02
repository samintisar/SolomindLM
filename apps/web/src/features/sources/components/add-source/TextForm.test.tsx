import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TextForm } from "./TextForm";

describe("TextForm", () => {
  it("is disabled until there is text, then uploads and calls onDone", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const onDone = vi.fn();
    render(
      <TextForm onUpload={onUpload} isUploading={false} onDone={onDone} onBusyChange={vi.fn()} />
    );
    const submit = screen.getByRole("button", { name: "Add Source" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Text" }), "   ");
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Text" }), "notes");
    await userEvent.click(submit);
    expect(onUpload).toHaveBeenCalledWith("   notes");
    expect(onDone).toHaveBeenCalled();
  });

  it("submits on Ctrl+Enter", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const onDone = vi.fn();
    render(
      <TextForm onUpload={onUpload} isUploading={false} onDone={onDone} onBusyChange={vi.fn()} />
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Text" }), "notes");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onUpload).toHaveBeenCalledWith("notes");
    expect(onDone).toHaveBeenCalled();
  });

  it("reports busy only for its own submit, not a shared upload", async () => {
    const onBusyChange = vi.fn();
    const { rerender } = render(
      <TextForm
        onUpload={vi.fn(() => new Promise<void>(() => undefined))}
        isUploading
        onDone={vi.fn()}
        onBusyChange={onBusyChange}
      />
    );
    expect(screen.getByRole("textbox", { name: "Text" })).toBeDisabled();
    expect(onBusyChange).not.toHaveBeenCalledWith(true);

    const onUpload = vi.fn(() => new Promise<void>(() => undefined));
    rerender(
      <TextForm
        onUpload={onUpload}
        isUploading={false}
        onDone={vi.fn()}
        onBusyChange={onBusyChange}
      />
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Text" }), "notes");
    await userEvent.click(screen.getByRole("button", { name: "Add Source" }));
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "Adding..." })).toBeDisabled();
  });
});
