import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { AVAILABLE_SMART_MODELS } from "@/shared/constants/models";
import { ModelMenu } from "./ModelMenu";
import { ModeMenu } from "./ModeMenu";

describe("ModeMenu", () => {
  test("labels the current mode and switches", async () => {
    const onModeChange = vi.fn();
    render(<ModeMenu mode="chat" onModeChange={onModeChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Composer mode: Chat" }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: /Deep Research/ }));
    expect(onModeChange).toHaveBeenCalledWith("deepResearch");
  });

  test("checks the current mode", async () => {
    render(<ModeMenu mode="literatureReview" onModeChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Composer mode: Literature Review" }));
    expect(await screen.findByRole("menuitemradio", { name: "Literature Review" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("menuitemradio", { name: "Chat" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  test("a disabled trigger cannot be opened", () => {
    render(<ModeMenu mode="chat" onModeChange={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: "Composer mode: Chat" })).toBeDisabled();
  });
});

describe("ModelMenu", () => {
  test("lists models and selects one", async () => {
    const onModelChange = vi.fn();
    render(<ModelMenu value={undefined} onModelChange={onModelChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^Model:/ }));
    const items = await screen.findAllByRole("menuitemradio");
    expect(items).toHaveLength(AVAILABLE_SMART_MODELS.length);
    await userEvent.click(items[items.length - 1]);
    expect(onModelChange).toHaveBeenCalledWith(AVAILABLE_SMART_MODELS.at(-1)?.id);
  });

  test("the trigger names the selected model and the menu checks it", async () => {
    const model = AVAILABLE_SMART_MODELS[1];
    render(<ModelMenu value={model.id} onModelChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: `Model: ${model.name}` }));
    expect(await screen.findByRole("menuitemradio", { name: model.name })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  test("falls back to the default model for an unknown id", () => {
    render(<ModelMenu value="not/a-model" onModelChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: `Model: ${AVAILABLE_SMART_MODELS[0].name}` })
    ).toBeInTheDocument();
  });
});
