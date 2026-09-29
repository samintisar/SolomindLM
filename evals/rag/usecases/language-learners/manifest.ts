import type { UseCasePack } from "../types";

/**
 * Language learners: grammar and vocabulary study material in a target
 * language (here French course notes). Rubric checks describe what a good
 * study aid looks like for any language learner, not these particular sources.
 */
export const languageLearnersPack: UseCasePack = {
  id: "language-learners",
  title: "Language Learners",
  notebookTitle: "Language Learners",
  advertisedClaim: "Create vocabulary lists and grammar exercises from any content.",
  features: ["flashcards", "quiz", "writtenQuestions", "chat"],
  sources: ["determiners.md", "adjectives.md", "passe-compose.md", "pronouns.md"],
  rubric: [
    {
      id: "front-hides-answer",
      question:
        "Does every card's front avoid stating, translating or hinting at the answer given on its back?",
      appliesTo: ["flashcards"],
      evidence: "output",
    },
    {
      id: "one-point-per-item",
      question:
        "Does each card or question test a single vocabulary item or a single grammar point?",
      appliesTo: ["flashcards", "quiz"],
      evidence: "output",
    },
    {
      id: "target-language-correct",
      question:
        "Is all target-language text in the output correct (spelling, accents, gender and number agreement, elision) and consistent with the source?",
      appliesTo: ["flashcards", "quiz", "writtenQuestions", "chat"],
      evidence: "sources",
    },
    {
      id: "answer-key-supported",
      question:
        "Is every answer, answer key and explanation supported by the source, with no reversed rules, invented reasons or distractors that are also correct?",
      appliesTo: ["flashcards", "quiz"],
      evidence: "sources",
    },
    {
      id: "blanks-complete-correctly",
      question:
        "Wherever an item contains a blank, does inserting the given answer produce a grammatical sentence (or does the output contain no blanks)?",
      appliesTo: ["flashcards", "quiz"],
      evidence: "output",
    },
    {
      id: "explains-with-example",
      question:
        "Does the answer explain the rule and illustrate it with at least one example taken from the source?",
      appliesTo: ["chat"],
      evidence: "sources",
    },
  ],
};
