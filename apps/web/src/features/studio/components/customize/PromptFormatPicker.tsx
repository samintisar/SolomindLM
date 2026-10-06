import { Pencil } from "lucide-react";
import { useId, useState } from "react";
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

/**
 * Two steps: a grid of formats, then a prompt for the chosen one (Create Your Own, or a built-in
 * format's prompt to edit). It lives inside DialogContent, so each open starts on the grid.
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

  const configure = (format: PromptFormat<Id>, text: string) => {
    setConfiguring(format);
    setPrompt(text);
  };
  const promptLibrary = {
    studioTool,
    onApplyPrompt: (text: string) => configure(configuring ?? customFormat, text),
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
          <div className="flex flex-col gap-6 duration-300 ease-out animate-in fade-in-0 slide-in-from-right-4">
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>{configuring.title}</ItemTitle>
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
            className={cn(
              "grid gap-3 sm:grid-cols-2",
              columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"
            )}
          >
            {formats.map((format) => (
              <OptionCard
                key={format.id}
                title={format.title}
                description={format.description}
                onSelect={() =>
                  format.id === customFormat.id ? configure(format, "") : onPick(format)
                }
                action={
                  format.prompt ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit the ${format.title} prompt`}
                      onClick={() => configure(format, format.prompt)}
                    >
                      <Pencil />
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </div>
        </section>
      </StudioCustomizeBody>
    </>
  );
}
