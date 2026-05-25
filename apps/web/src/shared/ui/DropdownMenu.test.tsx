import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, test, vi } from "vitest";
import { DropdownMenu } from "./DropdownMenu";

function NestedMenuItem() {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        role="menuitem"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
      >
        Output language
      </button>
      {isOpen ? <div role="listbox">Language options</div> : null}
    </>
  );
}

describe("DropdownMenu", () => {
  test("closes after clicking a regular menu item", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <DropdownMenu trigger={<button type="button">Open menu</button>}>
        <button type="button" role="menuitem" onClick={onClick}>
          Logout
        </button>
      </DropdownMenu>
    );

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    await user.click(screen.getByRole("menuitem", { name: /logout/i }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("keeps the menu open after clicking an expandable menu item", async () => {
    const user = userEvent.setup();

    render(
      <DropdownMenu trigger={<button type="button">Open menu</button>}>
        <NestedMenuItem />
      </DropdownMenu>
    );

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    await user.click(screen.getByRole("menuitem", { name: /output language/i }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("listbox")).toHaveTextContent(/language options/i);
  });
});
