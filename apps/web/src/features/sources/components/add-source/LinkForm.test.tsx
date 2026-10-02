import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LinkForm } from "./LinkForm";

const showError = vi.fn();
vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ error: showError, success: vi.fn(), info: vi.fn() }),
}));

function setup(onUpload = vi.fn().mockResolvedValue(undefined)) {
  const onDone = vi.fn();
  const onBusyChange = vi.fn();
  render(
    <LinkForm
      kind="website"
      onUpload={onUpload}
      isUploading={false}
      onDone={onDone}
      onBusyChange={onBusyChange}
    />
  );
  return {
    onUpload,
    onDone,
    onBusyChange,
    field: screen.getByRole("textbox", { name: "Website URLs" }),
  };
}

describe("LinkForm", () => {
  it("toasts the exact message when no URL is valid", async () => {
    const { field, onUpload } = setup();
    await userEvent.type(field, "not a url");
    await userEvent.click(screen.getByRole("button", { name: "Add Sources" }));
    expect(showError).toHaveBeenCalledWith(
      "Please enter at least one valid URL (starting with http:// or https://)."
    );
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("submits http(s) URLs on Ctrl+Enter, then calls onDone", async () => {
    const { field, onUpload, onDone } = setup();
    await userEvent.type(field, "https://a.com ftp://x http://b.com");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onUpload).toHaveBeenCalledWith(["https://a.com", "http://b.com"]);
    expect(onDone).toHaveBeenCalled();
  });

  it("stays open when the upload rejects", async () => {
    const { field, onDone } = setup(vi.fn().mockRejectedValue(new Error("boom")));
    await userEvent.type(field, "https://a.com");
    await userEvent.click(screen.getByRole("button", { name: "Add Sources" }));
    expect(onDone).not.toHaveBeenCalled();
    expect(field).toBeInTheDocument();
  });

  it("disables submit while the input is blank", () => {
    setup();
    expect(screen.getByRole("button", { name: "Add Sources" })).toBeDisabled();
  });
});
