import { BookOpen, Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";

export function HomeEmptyState({ onCreateNotebook }: { onCreateNotebook: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BookOpen />
        </EmptyMedia>
        <EmptyTitle>Create your first notebook</EmptyTitle>
        <EmptyDescription>
          Add PDFs, links or notes, then chat with them and turn them into flashcards, quizzes and
          reports.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onCreateNotebook}>
          <Plus />
          New notebook
        </Button>
      </EmptyContent>
    </Empty>
  );
}
