import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchIcon } from "lucide-react";
import type { ReactElement } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { ThemeContext } from "@/shared/contexts/useTheme";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Badge } from "./badge";
import { Button } from "./button";
import { ButtonGroup } from "./button-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Checkbox } from "./checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemDescription,
  DropdownMenuItemIcon,
  DropdownMenuItemText,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import { Input } from "./input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "./input-group";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { ScrollArea } from "./scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Separator } from "./separator";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./sheet";
import { Skeleton } from "./skeleton";
import { Toaster } from "./sonner";
import { Spinner } from "./spinner";
import { Toggle } from "./toggle";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

// jsdom lacks the layout APIs Radix overlays touch; stub them for this file only.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

// Each case renders a component once (overlays forced open) and names text that must appear.
const cases: Array<[name: string, element: ReactElement, text: string]> = [
  [
    "AlertDialog",
    <AlertDialog open key="alert-dialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete notebook?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>,
    "Delete notebook?",
  ],
  [
    "Alert",
    <Alert key="alert">
      <AlertTitle>Heads up</AlertTitle>
      <AlertDescription>Details</AlertDescription>
    </Alert>,
    "Heads up",
  ],
  [
    "Avatar",
    <Avatar key="avatar">
      <AvatarImage src="/missing.png" alt="" />
      <AvatarFallback>SM</AvatarFallback>
    </Avatar>,
    "SM",
  ],
  ["Badge", <Badge key="badge">New</Badge>, "New"],
  [
    "Button asChild",
    <Button asChild key="button">
      <a href="/x">Link button</a>
    </Button>,
    "Link button",
  ],
  [
    "Card",
    <Card key="card">
      <CardHeader>
        <CardTitle>Card title</CardTitle>
        <CardDescription>Card description</CardDescription>
      </CardHeader>
      <CardContent>Body</CardContent>
    </Card>,
    "Card title",
  ],
  [
    "DropdownMenu",
    <DropdownMenu open key="dropdown-menu">
      <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Rename</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
    "Rename",
  ],
  [
    "Empty",
    <Empty key="empty">
      <EmptyHeader>
        <EmptyTitle>No sources</EmptyTitle>
        <EmptyDescription>Add one to get started.</EmptyDescription>
      </EmptyHeader>
    </Empty>,
    "No sources",
  ],
  [
    "Field",
    <Field key="field">
      <FieldLabel htmlFor="f">Name</FieldLabel>
      <Input id="f" />
      <FieldDescription>Your display name</FieldDescription>
    </Field>,
    "Name",
  ],
  [
    "InputGroup",
    <InputGroup key="input-group">
      <InputGroupInput placeholder="Search" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton>
          <SearchIcon />
          Go
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>,
    "Go",
  ],
  [
    "Popover",
    <Popover open key="popover">
      <PopoverTrigger>Open popover</PopoverTrigger>
      <PopoverContent>Popover body</PopoverContent>
    </Popover>,
    "Popover body",
  ],
  ["ScrollArea", <ScrollArea key="scroll-area">Scrollable</ScrollArea>, "Scrollable"],
  [
    "Select",
    <Select open value="a" key="select">
      <SelectTrigger>
        <SelectValue placeholder="Pick one" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="a">Option A</SelectItem>
      </SelectContent>
    </Select>,
    "Option A",
  ],
  [
    "Separator",
    <div key="separator">
      Above
      <Separator />
    </div>,
    "Above",
  ],
  [
    "Sheet",
    <Sheet open key="sheet">
      <SheetContent>
        <SheetTitle>Sheet title</SheetTitle>
        <SheetDescription>Sheet description</SheetDescription>
      </SheetContent>
    </Sheet>,
    "Sheet title",
  ],
  [
    "Skeleton",
    <div key="skeleton">
      Loading row
      <Skeleton className="h-4" />
    </div>,
    "Loading row",
  ],
  [
    "Spinner",
    <div key="spinner">
      Saving
      <Spinner />
    </div>,
    "Saving",
  ],
  ["Toggle", <Toggle key="toggle">Bold</Toggle>, "Bold"],
  [
    "ToggleGroup",
    <ToggleGroup type="single" key="toggle-group">
      <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
      <ToggleGroupItem value="list">List</ToggleGroupItem>
    </ToggleGroup>,
    "Grid",
  ],
  [
    "Tooltip (no app-level provider)",
    <Tooltip open key="tooltip">
      <TooltipTrigger>Hover me</TooltipTrigger>
      <TooltipContent>Tooltip text</TooltipContent>
    </Tooltip>,
    "Tooltip text",
  ],
];

describe("shadcn ui components render", () => {
  it.each(cases)("%s", (_name, element, text) => {
    render(element);
    expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  });

  it("design-system variants render: Card flush + interactive, Button ghost-destructive, ToggleGroup swatch", () => {
    const { container } = render(
      <>
        <Card variant="interactive" />
        <Card variant="flush" data-testid="flush-card">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button>toggle</Button>
            </CollapsibleTrigger>
          </Collapsible>
        </Card>
        <Button variant="ghost-destructive">x</Button>
        <Button variant="ghost-toggle-destructive" size="icon-md" aria-pressed>
          rec
        </Button>
        <ToggleGroup type="single" variant="swatch" size="sm">
          <ToggleGroupItem value="a" aria-label="a" />
        </ToggleGroup>
      </>
    );
    expect(container.querySelector('[data-variant="interactive"]')).not.toBeNull();
    const flush = screen.getByTestId("flush-card");
    expect(flush).toHaveAttribute("data-variant", "flush");
    expect(flush).toHaveClass("overflow-hidden", "gap-0", "py-0");
    // The trigger must keep the slot the flush variant targets, so its focus ring can go inset.
    expect(screen.getByRole("button", { name: "toggle" })).toHaveAttribute(
      "data-slot",
      "collapsible-trigger"
    );
    expect(flush.className).toContain(
      "[&_[data-slot=collapsible-trigger]]:focus-visible:ring-inset"
    );
    expect(screen.getByRole("button", { name: "x" })).toHaveClass("text-destructive");
    const toggle = screen.getByRole("button", { name: "rec", pressed: true });
    expect(toggle).toHaveAttribute("data-variant", "ghost-toggle-destructive");
    expect(toggle).toHaveClass("aria-pressed:bg-destructive-muted", "size-9");
    const swatch = screen.getByRole("radio", { name: "a" });
    expect(swatch).toHaveClass("rounded-full", "size-8", "p-1");
    for (const sizeClass of ["px-1.5", "px-2", "h-8", "h-9"]) {
      expect(swatch).not.toHaveClass(sizeClass);
    }
    expect(swatch).not.toHaveClass("px-3");
    expect(swatch).not.toHaveClass("rounded-none");
  });

  it("chat foundations render: Checkbox, RadioGroup, Collapsible, Alert warning, InputGroup composer", async () => {
    render(
      <>
        <Checkbox aria-label="c" />
        <RadioGroup>
          <RadioGroupItem value="a" aria-label="a" />
        </RadioGroup>
        <RadioGroup density="compact" data-testid="compact-radios" />
        <Collapsible>
          <CollapsibleTrigger>t</CollapsibleTrigger>
          <CollapsibleContent>x</CollapsibleContent>
        </Collapsible>
        <Alert variant="warning">w</Alert>
        <InputGroup variant="composer" size="auto" data-testid="ig" />
      </>
    );
    expect(screen.getByRole("checkbox", { name: "c" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "a" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "a" }).closest("[role=radiogroup]")).toHaveClass(
      "gap-3"
    );
    expect(screen.getByTestId("compact-radios")).toHaveClass("gap-0.5");
    expect(screen.getByRole("button", { name: "t" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveClass("bg-warning-muted");
    const composer = screen.getByTestId("ig");
    expect(composer).toHaveClass("rounded-2xl", "h-auto");
    for (const dropped of ["h-9", "rounded-md", "shadow-xs", "dark:bg-input/30"]) {
      expect(composer).not.toHaveClass(dropped);
    }

    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "t" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("x")).toBeVisible();
  });

  it("clicking blank space in an InputGroupAddon focuses the group's textarea", async () => {
    render(
      <InputGroup variant="composer" size="auto">
        <InputGroupTextarea aria-label="message" />
        <InputGroupAddon align="block-end" data-testid="addon" />
      </InputGroup>
    );
    await userEvent.setup().click(screen.getByTestId("addon"));
    expect(screen.getByRole("textbox", { name: "message" })).toHaveFocus();
  });

  it("Toaster renders inside the app ThemeContext", () => {
    const { container } = render(
      <ThemeContext.Provider value={{ theme: "dark", toggleTheme: () => {} }}>
        <Toaster position="bottom-right" />
      </ThemeContext.Provider>
    );
    expect(container.querySelector("section")).toBeInTheDocument();
  });

  it("FieldError collapses duplicate messages into one", () => {
    render(<FieldError errors={[{ message: "Required" }, { message: "Required" }]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/^Required$/);
  });

  it("InputGroupButton's xs icon size replaces Button's default icon size", () => {
    render(<InputGroupButton>Go</InputGroupButton>);
    const className = screen.getByRole("button", { name: "Go" }).className;
    expect(className).toContain("[&_svg:not([class*='size-'])]:size-3.5");
    expect(className).not.toContain("[&_svg:not([class*='size-'])]:size-4");
  });

  describe("soft layered controls", () => {
    it("Button outline is a token-driven raised chip", () => {
      render(<Button variant="outline">o</Button>);
      const outline = screen.getByRole("button", { name: "o" });
      expect(outline).toHaveClass("bg-surface-raised", "ring-1", "ring-hairline", "shadow-xs");
      expect(outline).not.toHaveClass("border-2");
      expect(outline.className).not.toContain("dark:");
    });

    it("ButtonGroup tray is a tinted pill that raises the open segment", () => {
      render(
        <ButtonGroup variant="tray" aria-label="tray">
          <Button variant="ghost" size="icon-sm" aria-label="a" aria-expanded="true" />
        </ButtonGroup>
      );
      const tray = screen.getByRole("group", { name: "tray" });
      expect(tray).toHaveClass("bg-secondary", "rounded-xl");
      expect(tray).toHaveAttribute("data-variant", "tray");
      expect(tray.className).toContain("[&>*]:rounded-lg");
      expect(tray.className).toContain("[&>[aria-expanded=true]]:bg-surface-raised");
      expect(tray.className).not.toContain("bg-card");
      expect(tray.className).not.toContain("rounded-l-none");
    });

    it("ButtonGroup default keeps the joined-segment classes", () => {
      render(
        <ButtonGroup aria-label="plain">
          <Button>1</Button>
          <Button>2</Button>
        </ButtonGroup>
      );
      const plain = screen.getByRole("group", { name: "plain" });
      expect(plain).toHaveAttribute("data-variant", "default");
      expect(plain.className).toContain("[&>*:not(:first-child)]:rounded-l-none");
    });

    it("Toggle outline is a token-driven raised chip", () => {
      render(<Toggle variant="outline" aria-label="t" />);
      const toggle = screen.getByRole("button", { name: "t" });
      expect(toggle).toHaveClass("bg-surface-raised", "ring-1", "ring-hairline");
      expect(toggle).not.toHaveClass("border");
    });

    it("Badge outline uses the hairline ring", () => {
      render(<Badge variant="outline">b</Badge>);
      expect(screen.getByText("b")).toHaveClass("bg-surface-raised", "ring-1", "ring-hairline");
    });
  });

  describe("soft floating layer", () => {
    it("menus float softly and support rich items", async () => {
      render(
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger>m</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Mode</DropdownMenuLabel>
            <DropdownMenuRadioGroup value="a">
              <DropdownMenuRadioItem value="a">
                <DropdownMenuItemIcon>
                  <svg aria-hidden />
                </DropdownMenuItemIcon>
                <DropdownMenuItemText>
                  Alpha
                  <DropdownMenuItemDescription>First</DropdownMenuItemDescription>
                </DropdownMenuItemText>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      const menu = await screen.findByRole("menu");
      expect(menu).toHaveClass("rounded-xl", "shadow-xl", "ring-1", "ring-hairline");
      expect(menu).not.toHaveClass("border");
      const item = screen.getByRole("menuitemradio", { name: /Alpha/ });
      expect(item).toHaveClass("rounded-lg", "min-h-9");
      expect(item).toHaveAttribute("data-state", "checked");
      expect(screen.getByText("First")).toHaveClass("text-xs", "text-muted-foreground");
    });

    it("radio items show a trailing check only when checked, and keep focus visible", async () => {
      render(
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger>m</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value="a">
              <DropdownMenuRadioItem value="a">Alpha</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="b">Beta</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      const checked = await screen.findByRole("menuitemradio", { name: "Alpha" });
      const indicator = checked.querySelector("span.absolute");
      expect(indicator).not.toBeNull();
      expect(indicator).toHaveClass("right-2.5");
      expect(indicator?.querySelector("svg")).not.toBeNull();
      expect(indicator?.querySelector("svg.lucide-check")).not.toBeNull();
      expect(indicator?.querySelector("svg.lucide-circle")).toBeNull();
      expect(checked).toHaveClass("data-[state=checked]:focus:bg-accent");

      const unchecked = screen.getByRole("menuitemradio", { name: "Beta" });
      expect(unchecked).toHaveAttribute("data-state", "unchecked");
      expect(unchecked.querySelector("svg")).toBeNull();
    });

    it("checkbox items show a trailing check and keep focus visible", async () => {
      render(
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger>m</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem checked>Gamma</DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      const item = await screen.findByRole("menuitemcheckbox", { name: "Gamma" });
      expect(item).toHaveAttribute("data-state", "checked");
      expect(item).toHaveClass("data-[state=checked]:focus:bg-accent");
      expect(item.querySelector("span.absolute svg.lucide-check")).not.toBeNull();
    });

    it("rich item parts expose their data-slots", async () => {
      render(
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger>m</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              <DropdownMenuItemIcon data-testid="icon" />
              <DropdownMenuItemText data-testid="text">
                T<DropdownMenuItemDescription data-testid="desc">D</DropdownMenuItemDescription>
              </DropdownMenuItemText>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      expect(await screen.findByTestId("icon")).toHaveAttribute(
        "data-slot",
        "dropdown-menu-item-icon"
      );
      expect(screen.getByTestId("text")).toHaveAttribute("data-slot", "dropdown-menu-item-text");
      expect(screen.getByTestId("desc")).toHaveAttribute(
        "data-slot",
        "dropdown-menu-item-description"
      );
    });

    it("Select content floats softly", async () => {
      render(
        <Select defaultOpen value="a">
          <SelectTrigger>
            <SelectValue placeholder="Pick one" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a">Option A</SelectItem>
          </SelectContent>
        </Select>
      );
      const listbox = await screen.findByRole("listbox");
      expect(listbox).toHaveClass("rounded-xl", "shadow-xl", "ring-1", "ring-hairline");
      expect(listbox).not.toHaveClass("border");
      const option = screen.getByRole("option", { name: "Option A" });
      expect(option).toHaveClass("rounded-lg", "min-h-9", "data-[state=checked]:focus:bg-accent");
      expect(option.querySelector("svg.lucide-check")).toHaveClass("text-foreground");
    });

    it("PopoverContent floats softly", () => {
      render(
        <Popover defaultOpen>
          <PopoverTrigger>p</PopoverTrigger>
          <PopoverContent>Popover body</PopoverContent>
        </Popover>
      );
      const content = screen.getByText("Popover body");
      expect(content).toHaveClass("rounded-2xl", "shadow-xl", "ring-1", "ring-hairline");
      expect(content).not.toHaveClass("border");
    });
  });
});
