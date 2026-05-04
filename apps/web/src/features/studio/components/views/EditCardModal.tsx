import React, { useState, useEffect } from "react";
import { X, Edit3, Trash2, Save } from "lucide-react";
import { Flashcard } from "@/shared/types";

interface EditCardModalProps {
  isOpen: boolean;
  card?: { front: string; back: string; topic?: string | null; type?: Flashcard["type"] };
  cardIndex?: number;
  onSave: (data: { front: string; back: string }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export const EditCardModal: React.FC<EditCardModalProps> = ({
  isOpen,
  card,
  cardIndex,
  onSave,
  onCancel,
  onDelete,
}) => {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");

  useEffect(() => {
    if (card) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFront(card.front);
      setBack(card.back);
    } else {
      setFront("");
      setBack("");
    }
  }, [card]);

  if (!isOpen) return null;

  const isNewCard = cardIndex === undefined;

  const handleSave = () => {
    if (!front.trim() || !back.trim()) {
      return;
    }
    onSave({
      front: front.trim(),
      back: back.trim(),
    });
  };

  const handleDelete = () => {
    if (onDelete && confirm("Are you sure you want to delete this card?")) {
      onDelete();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />

      <div className="relative w-full max-w-3xl bg-background rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              <Edit3 className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {isNewCard ? "Add New Card" : "Edit Card"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isNewCard ? "Create a new flashcard" : "Edit flashcard content"}
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 md:p-8 space-y-6 overflow-y-auto">
          {/* Front (Question) */}
          <div className="space-y-3">
            <label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Front (Question)
            </label>
            <textarea
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="Enter the question or prompt..."
              className="w-full h-32 bg-background border border-border rounded-xl p-4 text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none placeholder:text-muted-foreground/50"
              autoFocus={isNewCard}
            />
          </div>

          {/* Back (Answer) */}
          <div className="space-y-3">
            <label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Back (Answer)
            </label>
            <textarea
              value={back}
              onChange={(e) => setBack(e.target.value)}
              placeholder="Enter the answer or explanation..."
              className="w-full h-32 bg-background border border-border rounded-xl p-4 text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-6 border-t border-border bg-muted/30 flex-shrink-0">
          <div className="flex gap-3">
            {!isNewCard && onDelete && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors text-sm font-medium"
              >
                <Trash2 className="w-4 h-4" />
                Delete Card
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-6 py-2.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!front.trim() || !back.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              <Save className="w-4 h-4" />
              {isNewCard ? "Add Card" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
