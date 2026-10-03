import { Button } from "@/shared/components/ui/button";

interface FollowUpChipsProps {
  followUps: string[];
  onSend: (text: string) => void;
}

/** Suggested next questions; each chip sends its text. Long questions wrap inside the chip. */
export function FollowUpChips({ followUps, onSend }: FollowUpChipsProps) {
  if (followUps.length === 0) return null;
  return (
    <div className="mt-6 w-full font-sans">
      <p className="mb-2 text-sm font-semibold text-foreground">Follow-ups</p>
      <div className="flex flex-wrap gap-2">
        {followUps.map((q, i) => (
          <Button
            key={`${i}-${q}`}
            type="button"
            variant="outline"
            size="chip"
            className="max-w-full"
            onClick={() => onSend(q)}
          >
            {q}
          </Button>
        ))}
      </div>
    </div>
  );
}
