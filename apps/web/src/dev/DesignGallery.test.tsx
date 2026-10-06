import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import DesignGallery from "./DesignGallery";

test("gallery renders a section per primitive group", () => {
  render(<DesignGallery />);
  for (const name of [
    "Buttons",
    "Tray",
    "Menus",
    "Fields",
    "Cards",
    "Dialogs",
    "Badges and alerts",
    "Toggles",
    "Tables",
  ]) {
    expect(screen.getByRole("region", { name })).toBeInTheDocument();
  }
});
