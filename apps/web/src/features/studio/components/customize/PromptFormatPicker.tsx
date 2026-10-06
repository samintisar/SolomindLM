import { Pencil } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/shared/components/ui/item";
import { cn } from "@/shared/utils/cn";
import type { StudioTool } from "../../services/promptsApi";
import type { StudioTypeKey } from "../../studioTypeStyle";
import { OptionCard } from "./OptionCard";
import { PromptField } from "./PromptField";
import {
  StudioCustomizeBody,
  StudioCustomizeFooter,
  StudioCustomizeHeader,
} from "./StudioCustomizeDialog";

export interface PromptFormat<Id extends string> {
  id: Id;
  title: string;
  description: string;
  /** The built-in prompt that "Edit" starts from; "" for the Create Your Own format. */
  prompt: string;
}

interface PromptFormatPickerProps<Id extends string> {
  kind: StudioTypeKey;
  title: string;
  description: string;
  studioTool: StudioTool;
  formats: readonly PromptFormat<Id>[];
  /** The Create Your Own format. A library prompt applied on the grid opens it. */
  customFormat: PromptFormat<Id>;
  /** A built-in format's card was clicked: generate at once. */
  onPick: (format: PromptFormat<Id>) => void;
  /** Generate from the prompt step. */
  onGenerate: (formatId: Id, prompt: string) => void;
  promptLabel: string;
  promptPlaceholder: string;
  generateLabel: string;
  /** Cards per row from the `lg` breakpoint. */
  columns: 3 | 4;
}

/** Which control opened the prompt step, so Back can give it focus again. */
interface Opener<Id extends string> {
  formatId: Id;
  control: "card" | "edit";
}

/**
 * Two steps: a grid of formats, then a prompt for the chosen one (Create Your Own, or a built-in
 * format's prompt to edit). It lives inside DialogContent, so each open starts on the grid.
 *
 * Each step replaces the control that was used to reach it, so focus is moved by hand: into the
 * prompt on the way in, and back to the card or Edit button that opened it on the way out.
 */
export function PromptFormatPicker<Id extends string>({
  kind,
  title,
  description,
  studioTool,
  formats,
  customFormat,
  onPick,
  onGenerate,
  promptLabel,
  promptPlaceholder,
  generateLabel,
  columns,
}: PromptFormatPickerProps<Id>) {
  const [configuring, setConfiguring] = useState<PromptFormat<Id> | null>(null);
  const [prompt, setPrompt] = useState("");
  const gridLabelId = useId();
  const formatTitleId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Opener<Id> | null>(null);
  const promptStepRef = useRef<HTMLDivElement>(null);
  const focusPromptAfterApplyRef = useRef(false);

  // Back to the grid: focus the card or Edit button that opened the prompt step. A layout effect,
  // so it runs before Radix's focus scope notices the removed Back button and focuses the dialog.
  useLayoutEffect(() => {
    if (configuring) return;
    const opener = openerRef.current;
    openerRef.current = null;
    if (!opener) return;
    const wrapper = Array.from(
      gridRef.current?.querySelectorAll<HTMLElement>("[data-format-id]") ?? []
    ).find((el) => el.dataset.formatId === opener.formatId);
    const target = wrapper?.querySelector<HTMLElement>(
      opener.control === "edit" ? "[data-format-edit]" : '[data-slot="card"] > button'
    );
    target?.focus();
  }, [configuring]);

  const configure = (format: PromptFormat<Id>, text: string, control: Opener<Id>["control"]) => {
    openerRef.current = { formatId: format.id, control };
    setConfiguring(format);
    setPrompt(text);
  };
  const promptLibrary = {
    studioTool,
    // On the prompt step a library prompt replaces the text and keeps the format (and the opener).
    // On the grid it opens Create Your Own, and Back returns to that card.
    onApplyPrompt: (text: string) => {
      if (configuring) {
        setPrompt(text);
        return;
      }
      focusPromptAfterApplyRef.current = true;
      configure(customFormat, text, "card");
    },
    // The library's close would otherwise focus Discover Prompts, over the new prompt box.
    focusAfterApply: () => {
      const focusPrompt = focusPromptAfterApplyRef.current;
      focusPromptAfterApplyRef.current = false;
      return focusPrompt ? (promptStepRef.current?.querySelector("textarea") ?? null) : null;
    },
  };

  if (configuring) {
    return (
      <>
        <StudioCustomizeHeader
          kind={kind}
          title={title}
          description={description}
          promptLibrary={promptLibrary}
          onBack={() => setConfiguring(null)}
        />
        <StudioCustomizeBody>
          <div
            ref={promptStepRef}
            className="flex flex-col gap-6 duration-300 ease-out animate-in fade-in-0 slide-in-from-right-4"
          >
            <Item variant="muted">
              <ItemContent>
                <ItemTitle id={formatTitleId}>{configuring.title}</ItemTitle>
                <ItemDescription>{configuring.description}</ItemDescription>
              </ItemContent>
            </Item>
            <PromptField
              label={promptLabel}
              placeholder={promptPlaceholder}
              value={prompt}
              onChange={setPrompt}
              studioTool={studioTool}
              tall
              autoFocus
              describedBy={formatTitleId}
            />
          </div>
        </StudioCustomizeBody>
        <StudioCustomizeFooter>
          <Button onClick={() => onGenerate(configuring.id, prompt)}>{generateLabel}</Button>
        </StudioCustomizeFooter>
      </>
    );
  }

  return (
    <>
      <StudioCustomizeHeader
        kind={kind}
        title={title}
        description={description}
        promptLibrary={promptLibrary}
      />
      <StudioCustomizeBody>
        <section
          aria-labelledby={gridLabelId}
          className="flex flex-col gap-3 duration-300 ease-out animate-in fade-in-0 slide-in-from-left-4"
        >
          <h3 id={gridLabelId} className="font-sans text-sm font-medium">
            Format
          </h3>
          <div
            ref={gridRef}
            className={cn(
              "grid gap-3 sm:grid-cols-2",
              columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"
            )}
          >
            {formats.map((format) => (
              // `contents` keeps the card a grid item; the wrapper only marks it for refocusing.
              <div key={format.id} data-format-id={format.id} className="contents">
                <OptionCard
                  title={format.title}
                  description={format.description}
                  onSelect={() =>
                    format.id === customFormat.id ? configure(format, "", "card") : onPick(format)
                  }
                  action={
                    format.prompt ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit the ${format.title} prompt`}
                        data-format-edit
                        onClick={() => configure(format, format.prompt, "edit")}
                      >
                        <Pencil />
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ))}
          </div>
        </section>
      </StudioCustomizeBody>
      <StudioCustomizeFooter />
    </>
  );
}
