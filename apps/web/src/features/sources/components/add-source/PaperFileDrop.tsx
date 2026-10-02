import { FileUp } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/shared/components/ui/button";

interface PaperFileDropProps {
  accept: string;
  /** Visible description, e.g. "A .bib file exported from Zotero". */
  hint: string;
  fileName: string | null;
  disabled?: boolean;
  onFile: (file: File) => void;
}

/** A keyboard-reachable file picker on a quiet dashed panel (no drag and drop, as before). */
export function PaperFileDrop({ accept, hint, fileName, disabled, onFile }: PaperFileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-8 text-center">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <FileUp /> {fileName ? "Choose another file" : "Choose file"}
      </Button>
      <p className="font-sans text-sm text-muted-foreground">{fileName ?? hint}</p>
    </div>
  );
}
