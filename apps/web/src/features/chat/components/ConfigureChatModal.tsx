import { resolveSmartModel } from "@convex/_lib/resolveSmartModel";
import { GraduationCap, MessageSquare, PenLine } from "lucide-react";
import React, { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/shared/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { Spinner } from "@/shared/components/ui/spinner";
import { Textarea } from "@/shared/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import type { ChatSettings } from "@/shared/types";

const CUSTOM_INSTRUCTIONS_MAX_LENGTH = 10000;

interface ConfigureChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: ChatSettings) => void;
  /** Current notebook settings; undefined = defaults */
  chatSettings?: ChatSettings;
  /** Whether save is in flight */
  saving?: boolean;
  /** After the conversation has messages, instruction mode cannot be changed */
  instructionModeLocked?: boolean;
}

const INSTRUCTION_MODES = [
  {
    value: "default" as const,
    label: "Default",
    icon: MessageSquare,
    description: "Standard assistant behavior",
  },
  {
    value: "learningGuide" as const,
    label: "Learning Guide",
    icon: GraduationCap,
    description: "Step-by-step teaching style",
  },
  {
    value: "custom" as const,
    label: "Custom",
    icon: PenLine,
    description: "Your own instructions",
  },
] as const;

const RESPONSE_LENGTHS = [
  { value: "default" as const, label: "Default" },
  { value: "longer" as const, label: "Longer" },
  { value: "shorter" as const, label: "Shorter" },
] as const;

function normalizeSavedSettings(settings?: ChatSettings): ChatSettings {
  const instructionMode = settings?.instructionMode ?? "default";
  const responseLength = settings?.responseLength ?? "default";
  const smartModel = resolveSmartModel(settings?.smartModel);
  const out: ChatSettings = { instructionMode, responseLength, smartModel };
  if (instructionMode === "custom") {
    const t = (settings?.customInstructions ?? "").trim();
    out.customInstructions = t || undefined;
  }
  return out;
}

/** True when notebook props match the current modal state (nothing to persist). */
function settingsMatchSaved(next: ChatSettings, baseline: ChatSettings): boolean {
  if (
    next.instructionMode !== baseline.instructionMode ||
    next.responseLength !== baseline.responseLength ||
    next.smartModel !== baseline.smartModel
  ) {
    return false;
  }
  if (next.instructionMode === "custom") {
    const a = (next.customInstructions ?? "").trim();
    const b = (baseline.customInstructions ?? "").trim();
    return a === b;
  }
  return true;
}

export const ConfigureChatModal: React.FC<ConfigureChatModalProps> = ({
  isOpen,
  onClose,
  onSave,
  chatSettings,
  saving = false,
  instructionModeLocked = false,
}) => {
  const [instructionMode, setInstructionMode] = useState<ChatSettings["instructionMode"]>(
    chatSettings?.instructionMode ?? "default"
  );
  const [customInstructions, setCustomInstructions] = useState(
    chatSettings?.customInstructions ?? ""
  );
  const [responseLength, setResponseLength] = useState<ChatSettings["responseLength"]>(
    chatSettings?.responseLength ?? "default"
  );
  const customInstructionsId = useId();
  const modeIdBase = useId();

  // Sync when external settings change (e.g. after save)
  useEffect(() => {
    if (!isOpen) return;
    setInstructionMode(chatSettings?.instructionMode ?? "default");
    setCustomInstructions(chatSettings?.customInstructions ?? "");
    setResponseLength(chatSettings?.responseLength ?? "default");
  }, [isOpen, chatSettings]);

  const savedBaseline = normalizeSavedSettings(chatSettings);

  const handleSave = useCallback(() => {
    onSave({
      instructionMode,
      customInstructions: instructionMode === "custom" ? customInstructions.trim() : undefined,
      responseLength,
      smartModel: savedBaseline.smartModel,
    });
  }, [instructionMode, customInstructions, responseLength, savedBaseline.smartModel, onSave]);

  const pendingSave: ChatSettings = {
    instructionMode,
    customInstructions: instructionMode === "custom" ? customInstructions.trim() : undefined,
    responseLength,
    smartModel: savedBaseline.smartModel,
  };

  const hasUnsavedChanges = !settingsMatchSaved(pendingSave, savedBaseline);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-svh overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure chat</DialogTitle>
          <DialogDescription>Choose how the assistant responds in this notebook.</DialogDescription>
        </DialogHeader>

        <FieldSet>
          <FieldLegend variant="label">Instruction mode</FieldLegend>
          {instructionModeLocked && (
            <p role="status" className="font-sans text-xs text-muted-foreground">
              Start a new chat to use a different mode.
            </p>
          )}
          <RadioGroup
            aria-label="Instruction mode"
            value={instructionMode}
            onValueChange={(value) => setInstructionMode(value as ChatSettings["instructionMode"])}
            disabled={instructionModeLocked}
          >
            {INSTRUCTION_MODES.map((mode) => {
              const Icon = mode.icon;
              const titleId = `${modeIdBase}-${mode.value}-title`;
              const descId = `${modeIdBase}-${mode.value}-desc`;
              return (
                <label
                  key={mode.value}
                  className="group/mode flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 font-sans transition-colors has-disabled:cursor-not-allowed has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5"
                >
                  <RadioGroupItem
                    value={mode.value}
                    aria-labelledby={titleId}
                    aria-describedby={descId}
                  />
                  <Icon
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground group-has-disabled/mode:opacity-60"
                  />
                  <span className="flex min-w-0 flex-col group-has-disabled/mode:opacity-60">
                    <span id={titleId} className="text-sm font-semibold text-foreground">
                      {mode.label}
                    </span>
                    <span id={descId} className="text-xs text-muted-foreground">
                      {mode.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </RadioGroup>
        </FieldSet>

        {instructionMode === "custom" && (
          <Field>
            <FieldLabel htmlFor={customInstructionsId}>Custom instructions</FieldLabel>
            <Textarea
              id={customInstructionsId}
              value={customInstructions}
              readOnly={instructionModeLocked}
              onChange={(e) =>
                setCustomInstructions(e.target.value.slice(0, CUSTOM_INSTRUCTIONS_MAX_LENGTH))
              }
              placeholder="Tell the assistant how to behave when responding in this notebook..."
              className="h-36 resize-none"
            />
            <p className="text-right font-sans text-xs text-muted-foreground">
              {customInstructions.length} / {CUSTOM_INSTRUCTIONS_MAX_LENGTH}
            </p>
          </Field>
        )}

        <FieldSet>
          <FieldLegend variant="label">Response length</FieldLegend>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label="Response length"
            value={responseLength}
            onValueChange={(value) => {
              if (value) setResponseLength(value as ChatSettings["responseLength"]);
            }}
            className="w-full"
          >
            {RESPONSE_LENGTHS.map((opt) => (
              <ToggleGroupItem key={opt.value} value={opt.value} className="flex-1">
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldSet>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !hasUnsavedChanges}>
            {saving && <Spinner aria-hidden />}
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
