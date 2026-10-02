import { act, cleanup, render, screen } from "@testing-library/react";
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

  it("submits video URLs through the Video URLs field", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const onDone = vi.fn();
    render(
      <LinkForm
        kind="video"
        onUpload={onUpload}
        isUploading={false}
        onDone={onDone}
        onBusyChange={vi.fn()}
      />
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Video URLs" }),
      "https://youtu.be/abc"
    );
    await userEvent.click(screen.getByRole("button", { name: "Add Sources" }));
    expect(onUpload).toHaveBeenCalledWith(["https://youtu.be/abc"]);
    expect(onDone).toHaveBeenCalled();
  });

  it("reports busy while its own submit runs and clears it on unmount", async () => {
    const { field, onBusyChange } = setup(vi.fn(() => new Promise<void>(() => undefined)));
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    await userEvent.type(field, "https://a.com");
    await userEvent.click(screen.getByRole("button", { name: "Add Sources" }));
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "Adding..." })).toBeDisabled();
    cleanup();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it("clears busy when the upload settles", async () => {
    let resolve: () => void = () => undefined;
    const onUpload = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        })
    );
    const { field, onBusyChange } = setup(onUpload);
    await userEvent.type(field, "https://a.com");
    await userEvent.click(screen.getByRole("button", { name: "Add Sources" }));
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    await act(async () => resolve());
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it("disables but does not report busy while another upload runs", () => {
    const onBusyChange = vi.fn();
    render(
      <LinkForm
        kind="website"
        onUpload={vi.fn()}
        isUploading
        onDone={vi.fn()}
        onBusyChange={onBusyChange}
      />
    );
    expect(screen.getByRole("textbox", { name: "Website URLs" })).toBeDisabled();
    expect(onBusyChange).not.toHaveBeenCalledWith(true);
  });

  it("names the busy button by its text only", () => {
    render(
      <LinkForm
        kind="website"
        onUpload={vi.fn()}
        isUploading
        onDone={vi.fn()}
        onBusyChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Adding..." })).toBeDisabled();
  });

  it("disables submit while the input is blank", () => {
    setup();
    expect(screen.getByRole("button", { name: "Add Sources" })).toBeDisabled();
  });
});
