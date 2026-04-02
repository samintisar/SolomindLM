import { Flashcard } from '@/shared/types';

interface ProficiencyBadgeProps {
  card: Flashcard;
}

/**
 * Compact study status for the flashcard header (no pill chrome).
 */
export function ProficiencyBadge({ card }: ProficiencyBadgeProps) {
  const proficiency = card.proficiency;
  const interval = proficiency?.interval || 0;
  const streak = proficiency?.streak || 0;

  let label: string;
  let dotClass: string;

  if (interval >= 21) {
    label = 'Mastered';
    dotClass = 'bg-emerald-500/80 dark:bg-emerald-400/80';
  } else if (interval >= 7) {
    label = 'Learning';
    dotClass = 'bg-sky-500/80 dark:bg-sky-400/80';
  } else if (streak >= 3) {
    label = `${streak}-day streak`;
    dotClass = 'bg-amber-500/80 dark:bg-amber-400/80';
  } else if (proficiency?.totalReviews && proficiency.totalReviews > 0) {
    const accuracy = proficiency.correctCount / proficiency.totalReviews;
    if (accuracy >= 0.7) {
      label = 'Progressing';
      dotClass = 'bg-violet-500/80 dark:bg-violet-400/80';
    } else {
      label = 'Learning';
      dotClass = 'bg-sky-500/80 dark:bg-sky-400/80';
    }
  } else {
    label = 'New';
    dotClass = 'bg-muted-foreground/50';
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden />
      <span>{label}</span>
    </span>
  );
}
