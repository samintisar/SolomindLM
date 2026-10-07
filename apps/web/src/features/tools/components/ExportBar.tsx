import { Copy, Download } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useToast } from "@/shared/contexts/useToast";
import {
  downloadTextFile,
  exportFileName,
  toAnkiText,
  toCsv,
  toQuizletText,
} from "../lib/flashcardExport";
import type { FreeDeck } from "../lib/freeToolClient";

export function ExportBar({ deck }: { deck: FreeDeck }) {
  const toast = useToast();

  const copyForQuizlet = async () => {
    try {
      await navigator.clipboard.writeText(toQuizletText(deck.cards));
      toast.success("Copied. In Quizlet, choose Import and paste.");
    } catch {
      toast.error("Couldn't copy. Download the CSV instead.");
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        onClick={() =>
          downloadTextFile(exportFileName(deck.title, "txt"), toAnkiText(deck.cards), "text/plain")
        }
      >
        <Download /> Download for Anki
      </Button>
      <Button variant="secondary" onClick={copyForQuizlet}>
        <Copy /> Copy for Quizlet
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          downloadTextFile(exportFileName(deck.title, "csv"), toCsv(deck.cards), "text/csv")
        }
      >
        <Download /> CSV
      </Button>
    </div>
  );
}
