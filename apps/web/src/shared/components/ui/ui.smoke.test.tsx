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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Checkbox } from "./checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

  it("design-system variants render: Card interactive, Button ghost-destructive, ToggleGroup swatch", () => {
    const { container } = render(
      <>
        <Card variant="interactive" />
        <Button variant="ghost-destructive">x</Button>
        <ToggleGroup type="single" variant="swatch" size="sm">
          <ToggleGroupItem value="a" aria-label="a" />
        </ToggleGroup>
      </>
    );
    expect(container.querySelector('[data-variant="interactive"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "x" })).toHaveClass("text-destructive");
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
});
