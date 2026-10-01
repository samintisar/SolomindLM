import type { UseCasePack } from "../types";

/**
 * Medical students: study material uploaded as PDF (here Wikipedia anatomy &
 * physiology articles). Rubric checks describe what a good study aid looks like
 * for any medical content, not these particular sources.
 */
export const medicalStudentsPack: UseCasePack = {
  id: "medical-students",
  title: "Medical Students",
  notebookTitle: "Medical Students",
  advertisedClaim:
    "Turn dense lectures and research papers into memorizable flashcards and quizzes.",
  features: ["flashcards", "quiz", "writtenQuestions", "chat"],
  sources: [
    "heart-anatomy.pdf",
    "cardiac-cycle.pdf",
    "cranial-nerves.pdf",
    "glomerular-filtration.pdf",
  ],
  rubric: [
    {
      id: "front-hides-answer",
      question:
        "Does every card's front avoid stating, abbreviating or hinting at the answer given on its back?",
      appliesTo: ["flashcards"],
      evidence: "output",
    },
    {
      id: "one-fact-per-item",
      question:
        "Does each card or question test a single structure, function, value or step (one structure or nerve together with its functions counts as a single item)?",
      appliesTo: ["flashcards", "quiz"],
      evidence: "output",
    },
    {
      id: "terms-and-values-exact",
      question:
        "Are all anatomical and physiological terms spelled correctly, and do all numbers and units match the source exactly?",
      appliesTo: ["flashcards", "quiz", "writtenQuestions", "chat"],
      evidence: "sources",
    },
    {
      id: "answer-key-supported",
      question:
        "Is every answer, answer key and model answer supported by the source, with no distractor that is also correct?",
      appliesTo: ["flashcards", "quiz", "writtenQuestions"],
      evidence: "sources",
    },
    {
      id: "mechanism-in-order",
      question:
        "If the request or the output concerns a mechanism or process, does the output give the cause-and-effect steps in the order the source does, rather than just naming terms (or does neither the request nor the output concern a mechanism or process)?",
      appliesTo: ["chat", "writtenQuestions"],
      evidence: "sources",
    },
    {
      id: "no-unsourced-clinical-claims",
      question:
        "Does the output avoid clinical claims (diagnoses, treatments, drug or dose facts) that the source does not contain?",
      appliesTo: ["chat", "writtenQuestions"],
      evidence: "sources",
    },
  ],
};
