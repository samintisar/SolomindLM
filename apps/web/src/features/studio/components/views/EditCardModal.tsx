import { Save, Trash2 } from "lucide-react";
import React, { useState } from "react";
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
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Textarea } from "@/shared/components/ui/textarea";
import { Flashcard } from "@/shared/types";

interface EditCardModalProps {
  isOpen: boolean;
  card?: { front: string; back: string; topic?: string | null; type?: Flashcard["type"] };
  cardIndex?: number;
  onSave: (data: { front: string; back: string }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

type CardData = NonNullable<EditCardModalProps["card"]>;

interface CardFormProps {
  card?: CardData;
  isNewCard: boolean;
  canDelete: boolean;
  onSave: EditCardModalProps["onSave"];
  onCancel: () => void;
  onDelete?: () => void;
}

// Lives inside DialogContent, which Radix unmounts on close, so every open starts from the card
// it was given and never shows the previous draft.
const CardForm: React.FC<CardFormProps> = ({
  card,
  isNewCard,
  canDelete,
  onSave,
  onCancel,
  onDelete,
}) => {
  const [front, setFront] = useState(card?.front ?? "");
  const [back, setBack] = useState(card?.back ?? "");

  const handleSave = () => {
    if (!front.trim() || !back.trim()) {
      return;
    }
    onSave({
      front: front.trim(),
      back: back.trim(),
    });
  };

  return (
    <>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="flashcard-front">Front (question)</FieldLabel>
          <Textarea
            id="flashcard-front"
            rows={5}
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder="Enter the question or prompt..."
            autoFocus={isNewCard}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="flashcard-back">Back (answer)</FieldLabel>
          <Textarea
            id="flashcard-back"
            rows={5}
            value={back}
            onChange={(e) => setBack(e.target.value)}
            placeholder="Enter the answer or explanation..."
          />
        </Field>
      </FieldGroup>

      <DialogFooter className="sm:justify-between">
        {!isNewCard && canDelete ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost-destructive">
                <Trash2 />
                Delete Card
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this card?</AlertDialogTitle>
                <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => onDelete?.()}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!front.trim() || !back.trim()}>
            <Save />
            {isNewCard ? "Add Card" : "Save Changes"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
};

export const EditCardModal: React.FC<EditCardModalProps> = ({
  isOpen,
  card,
  cardIndex,
  onSave,
  onCancel,
  onDelete,
}) => {
  // The parent clears the card in the same update that closes the dialog, but the dialog fades out
  // for ~200ms. Keep the last card seen while open so it doesn't turn into "Add New Card" mid-fade.
  const canDelete = Boolean(onDelete);
  const [shown, setShown] = useState({ card, cardIndex, canDelete });
  if (
    isOpen &&
    (shown.card !== card || shown.cardIndex !== cardIndex || shown.canDelete !== canDelete)
  ) {
    setShown({ card, cardIndex, canDelete });
  }
  const isNewCard = shown.cardIndex === undefined;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNewCard ? "Add New Card" : "Edit Card"}</DialogTitle>
          <DialogDescription>
            {isNewCard ? "Create a new flashcard" : "Edit flashcard content"}
          </DialogDescription>
        </DialogHeader>
        <CardForm
          card={shown.card}
          isNewCard={isNewCard}
          canDelete={shown.canDelete}
          onSave={onSave}
          onCancel={onCancel}
          onDelete={onDelete}
        />
      </DialogContent>
    </Dialog>
  );
};
