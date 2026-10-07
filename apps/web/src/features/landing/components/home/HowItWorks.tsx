import { Beat } from "./Beat";
import { AnswerDemo, SourceSlideDemo } from "./demo/CitationDemo";
import { LiteratureTableDemo, PrismaDemo } from "./demo/ResearchDemo";
import { DueTodayDemo, FlashcardDemo, QuizDemo, WrittenQuestionDemo } from "./demo/StudyDemo";
import { Accent, SectionHeading } from "./SectionHeading";

function ReadVisual() {
  return (
    <div
      aria-hidden
      className="relative flex flex-col gap-4 md:mx-auto md:block md:h-112 md:max-w-131"
    >
      <AnswerDemo className="md:absolute md:top-0 md:left-0 md:w-80" />
      <SourceSlideDemo className="md:absolute md:top-49 md:right-0 md:w-75" />
    </div>
  );
}

function PractiseVisual() {
  return (
    <div
      aria-hidden
      className="relative flex flex-col gap-4 md:mx-auto md:block md:h-135 md:max-w-131"
    >
      <FlashcardDemo className="md:absolute md:top-0 md:left-0 md:w-70 md:-rotate-2" />
      <QuizDemo className="md:absolute md:top-6 md:left-74 md:w-60 md:rotate-2" />
      <DueTodayDemo className="hidden md:absolute md:top-82 md:-left-4 md:block md:w-42 md:-rotate-4" />
      <WrittenQuestionDemo className="md:absolute md:top-72 md:left-32 md:w-90" />
    </div>
  );
}

function DeeperVisual() {
  return (
    <div
      aria-hidden
      className="relative flex flex-col gap-4 md:mx-auto md:block md:h-105 md:max-w-131"
    >
      <LiteratureTableDemo className="md:absolute md:top-8 md:left-0 md:w-118" />
      <PrismaDemo className="md:absolute md:top-66 md:-right-6 md:w-48" />
    </div>
  );
}

export function HowItWorks() {
  return (
    <section
      id="features"
      aria-labelledby="how-title"
      className="scroll-mt-20 px-6 pt-24 pb-8 md:pt-32"
    >
      <div className="mx-auto max-w-280">
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title={
            <>
              Read it. Practise it. <Accent>Go deeper.</Accent>
            </>
          }
          sub="One notebook per course or project. Every step stays tied to the sources you put in it."
        />
        <Beat
          number={1}
          label="Read with it"
          title="Every answer shows its working."
          body="Ask anything about your material. SolomindLM answers only from the sources in your notebook and cites each claim. Hover a number to see the passage; click it to open the page."
          points={[
            "Citations on every claim",
            "Chat, deep research or literature review",
            "Answers in the language you study in",
          ]}
          visual={<ReadVisual />}
        />
        <Beat
          flip
          number={2}
          label="Practise it"
          title="Then it makes you prove you know it."
          body="Turn a week of lectures into flashcards that come back just before you'd forget them, quizzes that explain every answer, and written questions marked against your own slides."
          points={[
            "Spaced-repetition flashcards",
            "Quizzes that explain every answer",
            "Written answers with feedback",
            "Mind maps and audio recaps",
          ]}
          visual={<PractiseVisual />}
        />
        <Beat
          number={3}
          label="Go deeper"
          title="When the slides aren't enough."
          body="Find and import papers, run deep research across the web and your notebook, or screen a stack of studies into a literature review with a PRISMA flow, in the citation style you need."
          points={[
            "Paper search, plus DOI, BibTeX and Zotero import",
            "Screening with a reason for every decision",
            "APA, MLA, Chicago, IEEE and more",
          ]}
          visual={<DeeperVisual />}
        />
      </div>
    </section>
  );
}
