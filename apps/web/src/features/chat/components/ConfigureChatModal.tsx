import React, { useState, useEffect, useCallback } from "react";
import { X, MessageSquare, GraduationCap, PenLine, Check } from "lucide-react";
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
  { value: "default" as const, label: "Default", icon: MessageSquare, description: "Standard assistant behavior" },
  { value: "learningGuide" as const, label: "Learning Guide", icon: GraduationCap, description: "Step-by-step teaching style" },
  { value: "custom" as const, label: "Custom", icon: PenLine, description: "Your own instructions" },
] as const;

const RESPONSE_LENGTHS = [
  { value: "default" as const, label: "Default" },
  { value: "longer" as const, label: "Longer" },
  { value: "shorter" as const, label: "Shorter" },
] as const;

function normalizeSavedSettings(settings?: ChatSettings): ChatSettings {
  const instructionMode = settings?.instructionMode ?? "default";
  const responseLength = settings?.responseLength ?? "default";
  const smartModel = settings?.smartModel ?? "openai/gpt-oss-120b";
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
  /** Shown after the user taps another instruction mode once the chat already has messages. */
  const [showMidChatSwitchWarning, setShowMidChatSwitchWarning] = useState(false);

  // Sync when external settings change (e.g. after save)
  useEffect(() => {
    if (!isOpen) return;
    setInstructionMode(chatSettings?.instructionMode ?? "default");
    setCustomInstructions(chatSettings?.customInstructions ?? "");
    setResponseLength(chatSettings?.responseLength ?? "default");
  }, [isOpen, chatSettings]);

  useEffect(() => {
    if (isOpen) setShowMidChatSwitchWarning(false);
  }, [isOpen]);

  const savedBaseline = normalizeSavedSettings(chatSettings);

  const handleSave = useCallback(() => {
    onSave({
      instructionMode,
      customInstructions:
        instructionMode === "custom" ? customInstructions.trim() : undefined,
      responseLength,
      smartModel: savedBaseline.smartModel,
    });
  }, [instructionMode, customInstructions, responseLength, savedBaseline.smartModel, onSave]);

  if (!isOpen) return null;

  const pendingSave: ChatSettings = {
    instructionMode,
    customInstructions:
      instructionMode === "custom" ? customInstructions.trim() : undefined,
    responseLength,
    smartModel: savedBaseline.smartModel,
  };

  const hasUnsavedChanges = !settingsMatchSaved(pendingSave, savedBaseline);

  return (
    <div className="fixed inset-0 z-120 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative flex max-h-[90vh] min-h-0 w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-card font-sans text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-card p-6">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 shrink-0 text-primary" />
            <h2 className="font-sans text-xl font-bold tracking-tight">Configure chat</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto bg-card/50 p-6 md:p-8">
          {/* Instruction mode */}
          <div className="space-y-4">
            <h3 className="font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
              Instruction mode
            </h3>
            {instructionModeLocked && showMidChatSwitchWarning && (
              <p
                role="status"
                aria-live="polite"
                className="rounded-lg border border-border/60 bg-muted/35 px-3 py-2 font-sans text-xs text-muted-foreground"
              >
                Start a new chat to use a different mode.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {INSTRUCTION_MODES.map((mode) => {
                const Icon = mode.icon;
                const selected = instructionMode === mode.value;
                const lockedNonSelectable = instructionModeLocked && !selected;
                return (
                  <button
                    key={mode.value}
                    type="button"
                    aria-disabled={lockedNonSelectable || undefined}
                    onClick={() => {
                      if (instructionModeLocked) {
                        if (!selected) setShowMidChatSwitchWarning(true);
                        return;
                      }
                      setInstructionMode(mode.value);
                    }}
                    className={[
                      "group relative flex w-full items-center gap-3.5 rounded-xl border py-3.5 pl-3.5 pr-4 text-left transition-[border-color,background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      lockedNonSelectable
                        ? "cursor-not-allowed border-border/35 bg-muted/15 opacity-50"
                        : selected
                          ? "border-border/55 bg-secondary/30 shadow-sm"
                          : "border-border/45 bg-card/90 hover:border-border/65 hover:bg-secondary/15",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
                        selected
                          ? "border-primary/20 bg-primary/9 text-primary shadow-[inset_0_1px_0_0_oklch(1_0_0_/0.45)]"
                          : "border-border/50 bg-background/70 text-muted-foreground group-hover:border-primary/25 group-hover:bg-secondary/25 group-hover:text-primary",
                      ].join(" ")}
                    >
                      <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.85} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-[0.9375rem] font-semibold leading-snug tracking-tight text-foreground">
                        {mode.label}
                      </p>
                      <p className="mt-0.5 font-serif text-[13px] leading-relaxed text-muted-foreground/92">
                        {mode.description}
                      </p>
                    </div>
                    {selected && (
                      <div className="flex shrink-0 items-center self-center pl-1">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary"
                          aria-hidden
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom instructions */}
          {instructionMode === "custom" && (
            <div className="space-y-4">
              <h3 className="font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
                Custom instructions
              </h3>
              <textarea
                value={customInstructions}
                readOnly={instructionModeLocked}
                onChange={(e) =>
                  setCustomInstructions(e.target.value.slice(0, CUSTOM_INSTRUCTIONS_MAX_LENGTH))
                }
                placeholder="Tell the assistant how to behave when responding in this notebook..."
                className={[
                  "h-36 w-full resize-none rounded-lg border border-border bg-background p-5 font-serif text-base leading-relaxed transition-all placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-ring",
                  instructionModeLocked ? "cursor-default opacity-90" : "",
                ].join(" ")}
              />
              <p className="text-right font-sans text-xs text-muted-foreground">
                {customInstructions.length} / {CUSTOM_INSTRUCTIONS_MAX_LENGTH}
              </p>
            </div>
          )}

          {/* Response length */}
          <div className="space-y-4">
            <h3 className="font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
              Response length
            </h3>
            <div className="flex w-full rounded-xl border border-border/50 bg-background p-1 shadow-inner">
              {RESPONSE_LENGTHS.map((opt) => {
                const active = responseLength === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setResponseLength(opt.value)}
                    className={[
                      "min-w-0 flex-1 rounded-lg px-3 py-2.5 text-center font-sans text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-secondary/10 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasUnsavedChanges}
            className="rounded-xl px-6 py-2 text-sm font-bold bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};
