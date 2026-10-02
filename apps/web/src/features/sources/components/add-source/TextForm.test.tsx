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
});
