import {
  ArchiveIcon,
  BrainIcon,
  CopyIcon,
  DownloadIcon,
  InfoIcon,
  MicIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  SparklesIcon,
  StarIcon,
  TrashIcon,
  TriangleAlertIcon,
  UserIcon,
  ZapIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/components/ui/alert-dialog";
import { Badge } from "@/shared/components/ui/badge";
import { Button, type ButtonProps } from "@/shared/components/ui/button";
import { ButtonGroup } from "@/shared/components/ui/button-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemDescription,
  DropdownMenuItemIcon,
  DropdownMenuItemText,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@/shared/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/utils/cn";

/**
 * Dev-only gallery of every ui primitive, one section per group. Deterministic by design (static copy,
 * no Convex, no auth) so Playwright can screenshot each `data-gallery-section`. Routed at /dev/design
 * by App.tsx in dev builds, or in a build made with VITE_DESIGN_GALLERY=1.
 */

type Variant = NonNullable<ButtonProps["variant"]>;
type Size = NonNullable<ButtonProps["size"]>;

const BUTTON_VARIANTS: Variant[] = [
  "default",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "ghost-destructive",
  "ghost-toggle-destructive",
  "link",
];

const EXTRA_SIZES: Size[] = [
  "xs",
  "sm-adaptive",
  "lg",
  "icon",
  "icon-md",
  "icon-lg",
  "chip",
  "avatar",
];

/** Open layers stay open: the gallery has no interactions that should close them. */
function keepOpen() {
  // Controlled `open` with no state change: outside clicks and focus moves can't dismiss the layer.
}

/** Popovers and dialogs must not steal focus on open: it paints focus rings and moves focus off the other layers. */
function noAutoFocus(event: Event) {
  event.preventDefault();
}

function Section({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section aria-label={name} data-gallery-section={name} className="space-y-4">
      <h2 className="font-display text-lg">{name}</h2>
      {children}
    </section>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <p className="font-sans text-xs text-muted-foreground">{children}</p>;
}

/**
 * A box that open layers portal into. The translate makes the box the containing block for
 * `position: fixed` descendants, so popper wrappers and dialogs sit inside it, not the viewport.
 * Children render once the box exists, because Radix falls back to document.body for a null container.
 */
function Frame({
  className,
  children,
}: {
  className?: string;
  children: (container: HTMLElement) => ReactNode;
}) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return (
    <div
      ref={setContainer}
      className={cn(
        "relative translate-x-0 overflow-hidden rounded-2xl bg-muted/30 p-4 ring-1 ring-hairline",
        className
      )}
    >
      {container && children(container)}
    </div>
  );
}

function ButtonsSection() {
  return (
    <Section name="Buttons">
      <div className="space-y-3">
        {BUTTON_VARIANTS.map((variant) => (
          <div key={variant} className="flex flex-wrap items-center gap-3">
            <Caption>{variant}</Caption>
            <Button variant={variant}>Default</Button>
            <Button variant={variant} size="sm">
              Small
            </Button>
            <Button
              variant={variant}
              size="icon-sm"
              aria-label={`${variant} icon`}
              aria-pressed={variant === "ghost-toggle-destructive" ? true : undefined}
            >
              <MicIcon />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Caption>states</Caption>
        <Button disabled>Disabled</Button>
        <Button variant="outline" disabled>
          Disabled outline
        </Button>
        <Button>
          <PlusIcon />
          Leading icon
        </Button>
        <Button variant="outline" aria-invalid="true">
          Invalid
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Caption>extra sizes</Caption>
        {EXTRA_SIZES.map((size) => (
          <Button key={size} variant="outline" size={size} aria-label={`${size} size`}>
            {size.startsWith("icon") ? (
              <StarIcon />
            ) : size === "avatar" ? (
              <UserIcon />
            ) : size === "chip" ? (
              "Summarise the key findings across every source"
            ) : (
              size
            )}
          </Button>
        ))}
      </div>
    </Section>
  );
}

function TraySection() {
  return (
    <Section name="Tray">
      <div className="flex flex-wrap items-center gap-6">
        <ButtonGroup variant="tray">
          <Button variant="ghost" size="icon-sm" aria-label="Copy">
            <CopyIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Edit" aria-expanded="true">
            <PencilIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Download">
            <DownloadIcon />
          </Button>
        </ButtonGroup>
        <ButtonGroup>
          <Button variant="outline">Previous</Button>
          <Button variant="outline">Next</Button>
        </ButtonGroup>
      </div>
    </Section>
  );
}

function MenusSection() {
  return (
    <Section name="Menus">
      <div className="grid gap-6 md:grid-cols-2">
        <Frame className="h-120">
          {(container) => (
            <DropdownMenu open modal={false} onOpenChange={keepOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-expanded="true">
                  Open menu
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent container={container} align="start">
                <DropdownMenuLabel>Notebook</DropdownMenuLabel>
                <DropdownMenuItem>
                  <PencilIcon />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <ArchiveIcon />
                  Archive
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <TrashIcon />
                  Delete
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Mode</DropdownMenuLabel>
                <DropdownMenuRadioGroup value="balanced">
                  <DropdownMenuRadioItem value="fast">
                    <DropdownMenuItemIcon>
                      <ZapIcon />
                    </DropdownMenuItemIcon>
                    <DropdownMenuItemText>
                      Fast
                      <DropdownMenuItemDescription>
                        Quick, lighter answers
                      </DropdownMenuItemDescription>
                    </DropdownMenuItemText>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="balanced">
                    <DropdownMenuItemIcon>
                      <SparklesIcon />
                    </DropdownMenuItemIcon>
                    <DropdownMenuItemText>
                      Balanced
                      <DropdownMenuItemDescription>
                        Good for most questions
                      </DropdownMenuItemDescription>
                    </DropdownMenuItemText>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="deep">
                    <DropdownMenuItemIcon>
                      <BrainIcon />
                    </DropdownMenuItemIcon>
                    <DropdownMenuItemText>
                      Deep
                      <DropdownMenuItemDescription>
                        Slower, more thorough
                      </DropdownMenuItemDescription>
                    </DropdownMenuItemText>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </Frame>
        <Frame className="h-120">
          {(container) => (
            <Popover open onOpenChange={keepOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" aria-expanded="true">
                  Open popover
                </Button>
              </PopoverTrigger>
              <PopoverContent container={container} align="start" onOpenAutoFocus={noAutoFocus}>
                <PopoverHeader>
                  <PopoverTitle>Sharing</PopoverTitle>
                  <PopoverDescription>
                    Anyone with the link can view this notebook. Editing stays limited to you.
                  </PopoverDescription>
                </PopoverHeader>
              </PopoverContent>
            </Popover>
          )}
        </Frame>
      </div>
      <Caption>
        The open Select list and the alert dialog are modal, so they render on their own pages:{" "}
        <a href="?layer=select" className="underline underline-offset-4">
          ?layer=select
        </a>{" "}
        and{" "}
        <a href="?layer=alert-dialog" className="underline underline-offset-4">
          ?layer=alert-dialog
        </a>
        .
      </Caption>
    </Section>
  );
}

function SelectItems() {
  return (
    <>
      <SelectItem value="notebooks">Notebooks</SelectItem>
      <SelectItem value="sources">Sources</SelectItem>
      <SelectItem value="notes">Notes</SelectItem>
    </>
  );
}

function FieldsSection() {
  return (
    <Section name="Fields">
      <div className="grid gap-4 md:grid-cols-2">
        <Input placeholder="Notebook title" aria-label="Input" />
        <Input defaultValue="Not a valid title" aria-invalid="true" aria-label="Invalid input" />
        <Textarea placeholder="Describe what this notebook is for" aria-label="Textarea" />
        <Select defaultValue="sources">
          <SelectTrigger className="w-full" aria-label="Select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItems />
          </SelectContent>
        </Select>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search sources" aria-label="Search" />
          <InputGroupAddon align="inline-end">
            <InputGroupText>12 results</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </div>
      <InputGroup variant="composer" size="auto" className="max-w-2xl">
        <InputGroupTextarea
          placeholder="Ask anything about your sources"
          rows={2}
          aria-label="Composer"
        />
        <InputGroupAddon align="block-end">
          <InputGroupButton variant="ghost" size="icon-sm" aria-label="Attach">
            <PaperclipIcon />
          </InputGroupButton>
          <InputGroupButton variant="ghost" size="icon-sm" aria-label="Dictate">
            <MicIcon />
          </InputGroupButton>
          <InputGroupButton variant="ghost" size="icon-sm" aria-label="Send" className="ml-auto">
            <SendIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Section>
  );
}

function CardsSection() {
  return (
    <Section name="Cards">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Default card</CardTitle>
            <CardDescription>In-flow surface: fill, hairline ring, soft shadow.</CardDescription>
          </CardHeader>
          <CardContent>Cards, list rows and fields share this layer of the ladder.</CardContent>
        </Card>
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Elevated card</CardTitle>
            <CardDescription>A larger shadow for featured content.</CardDescription>
          </CardHeader>
          <CardContent>Use sparingly: one per view at most.</CardContent>
        </Card>
        <Card variant="interactive">
          <button
            type="button"
            className="flex flex-col gap-1 p-4 text-left font-sans outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="font-semibold">Interactive card</span>
            <span className="text-sm text-muted-foreground">
              The whole card is one button and lifts on hover.
            </span>
          </button>
        </Card>
        <Card variant="flush">
          <div className="p-4">First row</div>
          <div className="border-border/50 not-first:border-t p-4">Second row</div>
          <div className="border-border/50 not-first:border-t p-4">Third row</div>
        </Card>
      </div>
    </Section>
  );
}

function DeleteNotebookAlert({ defaultOpen }: { defaultOpen?: boolean }) {
  return (
    <AlertDialog defaultOpen={defaultOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Open alert dialog</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this notebook?</AlertDialogTitle>
          <AlertDialogDescription>
            Its sources, notes and generated content are removed for good. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DialogsSection() {
  return (
    <Section name="Dialogs">
      <Frame className="h-96">
        {(container) => (
          <Dialog open modal={false} onOpenChange={keepOpen}>
            <DialogContent container={container} onOpenAutoFocus={noAutoFocus}>
              <DialogHeader>
                <DialogTitle>Rename notebook</DialogTitle>
                <DialogDescription>Pick a title you will recognise in the list.</DialogDescription>
              </DialogHeader>
              <Input defaultValue="Quarterly research" aria-label="Notebook title" />
              <DialogFooter>
                <Button variant="outline">Cancel</Button>
                <Button>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </Frame>
      <div className="flex flex-wrap items-center gap-3">
        <DeleteNotebookAlert />
        <Caption>
          Alert dialogs are always modal, so the open state is at{" "}
          <a href="?layer=alert-dialog" className="underline underline-offset-4">
            ?layer=alert-dialog
          </a>
          .
        </Caption>
      </div>
    </Section>
  );
}

function BadgesAndAlertsSection() {
  return (
    <Section name="Badges and alerts">
      <div className="flex flex-wrap items-center gap-3">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="destructive">Destructive</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="ghost">Ghost</Badge>
        <Badge variant="link">Link</Badge>
      </div>
      <div className="space-y-3">
        <Alert>
          <InfoIcon />
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>Your sources are still being processed.</AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Upload failed</AlertTitle>
          <AlertDescription>The file is larger than the limit for your plan.</AlertDescription>
        </Alert>
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>Almost out of credits</AlertTitle>
          <AlertDescription>Two generations left this month.</AlertDescription>
        </Alert>
      </div>
    </Section>
  );
}

/** Modal layers (Select list, alert dialog) hide and trap the rest of the page, so each gets its own page. */
function ModalLayer({ layer }: { layer: string }) {
  if (layer === "select") {
    return (
      <Section name="Select list">
        <Select open value="sources" onOpenChange={keepOpen}>
          <SelectTrigger className="w-64" aria-label="Select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItems />
          </SelectContent>
        </Select>
        <div className="h-60" />
      </Section>
    );
  }
  if (layer === "alert-dialog") {
    return (
      <Section name="Alert dialog">
        <DeleteNotebookAlert defaultOpen />
      </Section>
    );
  }
  return null;
}

export default function DesignGallery() {
  const layer = new URLSearchParams(window.location.search).get("layer");

  return (
    <main className="mx-auto max-w-5xl space-y-12 p-8">
      <h1 className="font-display text-2xl">Design gallery</h1>
      {layer ? (
        <ModalLayer layer={layer} />
      ) : (
        <>
          <ButtonsSection />
          <TraySection />
          <MenusSection />
          <FieldsSection />
          <CardsSection />
          <DialogsSection />
          <BadgesAndAlertsSection />
        </>
      )}
    </main>
  );
}
