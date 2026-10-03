import type { EvalFixture } from "../../types";

/**
 * Language learners pack fixtures. Requests are phrased the way a learner
 * would ask; studio focus goes through `studioParams.topic` (flashcards topic
 * / quiz focus). Notebook and document ids are filled in at run time from the
 * seeded "Language Learners" notebook, so they are never set here.
 *
 * `expectedAnswer` is a short reference for judges, not an enumeration target:
 * grammar tokens (du, mes, le…) are too short for substring recall, so
 * `expectedItems` stays empty.
 */
const base = {
  schemaVersion: 1,
  useCase: "language-learners",
  expectedItems: [] as string[],
} as const;

const tags = (...extra: string[]) => ["use-case", "language-learners", "french", ...extra];

export const languageLearnersFixtures: EvalFixture[] = [
  // ─── smoke ────────────────────────────────────────────────
  {
    ...base,
    id: "language-learners/flashcards-determiners",
    split: "smoke",
    runner: "flashcards",
    question: "Make flashcards so I can drill French articles and possessives before my quiz.",
    expectedAnswer:
      "Single-point cards on le/la/l'/les, un/une/des, du/de la/de l'/des and mon/ma/mes etc., " +
      "e.g. front: 'Tex présente ___ famille (his)' back: 'sa (famille is feminine)'.",
    expectedBehavior:
      "Cards cover definite, indefinite, partitive and possessive determiners from the notes. " +
      "Each card tests one form or rule, the front does not give the answer away, and the French is correct.",
    studioParams: {
      cardCount: 15,
      difficulty: "medium",
      topic: "articles and possessive determiners",
    },
    expectedStructure: { minItems: 10 },
    tags: tags("flashcards", "grammar"),
  },
  {
    ...base,
    id: "language-learners/quiz-passe-compose-easy",
    split: "smoke",
    runner: "quiz",
    question: "Give me an easy quiz on the passé composé. I'm a beginner.",
    expectedAnswer:
      "Short questions such as choosing the auxiliary for aller (être), forming the participle of finir (fini), " +
      "and agreement in 'elle est allée'.",
    expectedBehavior:
      "Beginner-level questions with short stems on choosing avoir vs être and forming past participles. " +
      "Exactly one option is correct per question and it matches the notes.",
    studioParams: {
      questionCount: 10,
      difficulty: "easy",
      topic: "passé composé with avoir and être",
    },
    expectedStructure: { minItems: 8 },
    tags: tags("quiz", "grammar", "beginner"),
  },

  // ─── train ────────────────────────────────────────────────
  {
    ...base,
    id: "language-learners/flashcards-vocab-from-dialogues",
    split: "train",
    runner: "flashcards",
    question:
      "Make vocabulary flashcards from the example dialogues: French word or phrase on one side, English on the other.",
    expectedAnswer:
      "Word/phrase cards taken from the dialogues, e.g. 'l'écureuil' – 'the squirrel', 'le tatou' – 'the armadillo', " +
      "with gender shown by the article.",
    expectedBehavior:
      "Vocabulary cards drawn from the example sentences and dialogues, with correct French (accents, articles showing gender) " +
      "and accurate English meanings.",
    studioParams: {
      cardCount: 20,
      difficulty: "medium",
      topic: "vocabulary from the example dialogues",
    },
    expectedStructure: { minItems: 12 },
    tags: tags("flashcards", "vocabulary"),
  },
  {
    ...base,
    id: "language-learners/flashcards-participle-agreement-only",
    split: "train",
    runner: "flashcards",
    question: "Only past participle agreement please. That's the part I keep getting wrong.",
    expectedAnswer:
      "Cards only on participle agreement: être verbs agree with the subject (elles sont allées); avoir verbs agree with a " +
      "preceding direct object (je l'ai embrassée); pronominal-verb agreement and its exceptions.",
    expectedBehavior:
      "Every card is about past participle agreement (with être, with a preceding direct object, pronominal verbs). " +
      "No cards on unrelated topics.",
    studioParams: { cardCount: 12, difficulty: "medium", topic: "past participle agreement only" },
    expectedStructure: { minItems: 8 },
    tags: tags("flashcards", "grammar", "custom-instructions"),
  },
  {
    ...base,
    id: "language-learners/flashcards-adjective-fill-in",
    split: "train",
    runner: "flashcards",
    question:
      "Give me fill-in-the-blank cards to practise where French adjectives go and how they agree.",
    expectedAnswer:
      "Fill-in-the-blank cards where the blank sits where the adjective belongs, e.g. 'C'est une ___ amie (bon)' → 'bonne', " +
      "and 'Tammy est une ___ Américaine (beau)' → 'belle'.",
    expectedBehavior:
      "Fill-in-the-blank cards on adjective placement and agreement. Filling each blank with the answer gives a grammatical French sentence, " +
      "and the blank's position is consistent with the answer.",
    studioParams: {
      cardCount: 12,
      difficulty: "medium",
      topic: "adjective placement and agreement, fill in the blank",
    },
    expectedStructure: { minItems: 8 },
    tags: tags("flashcards", "grammar", "fill-in-the-blank"),
  },
  {
    ...base,
    id: "language-learners/quiz-object-pronouns",
    split: "train",
    runner: "quiz",
    question: "Quiz me on direct and indirect object pronouns.",
    expectedAnswer:
      "Questions such as replacing 'à Tammy' with lui, 'le numéro' with le/l', and placing the pronoun before the auxiliary " +
      "(je l'ai rencontré) or after an affirmative imperative (embrasse-moi).",
    expectedBehavior:
      "Questions on choosing le/la/les vs lui/leur, elision (l', m', t') and pronoun placement. " +
      "Distractors are clearly wrong per the notes.",
    studioParams: {
      questionCount: 10,
      difficulty: "medium",
      topic: "direct and indirect object pronouns",
    },
    expectedStructure: { minItems: 8 },
    tags: tags("quiz", "grammar"),
  },
  {
    ...base,
    id: "language-learners/written-questions-grammar",
    split: "train",
    runner: "writtenQuestions",
    question: "Give me a few short written exercises to practise what's in these notes.",
    expectedAnswer:
      "A few short exercises, e.g. rewrite a sentence in the passé composé or replace nouns with object pronouns, " +
      "each with a correct model answer.",
    expectedBehavior:
      "Short written exercises (e.g. rewrite, transform or translate sentences) grounded in the notes, " +
      "with model answers in correct French.",
    studioParams: { questionCount: 5, difficulty: "medium" },
    expectedStructure: { minItems: 4 },
    tags: tags("writtenQuestions", "grammar"),
  },
  {
    ...base,
    id: "language-learners/chat-participle-agreement",
    split: "train",
    runner: "chat",
    question: "When does the past participle agree in the passé composé? Give me examples.",
    expectedAnswer:
      "With être, the past participle agrees with the subject (Elle est partie; Elles sont allées). With avoir, it agrees only " +
      "with a direct object that comes before the verb (Je ne l'ai pas embrassée). Pronominal verbs agree with the reflexive " +
      "pronoun when it is the direct object.",
    expectedBehavior:
      "Explains agreement with the subject for être verbs, agreement with a preceding direct object for avoir verbs, " +
      "and the pronominal-verb rule, each with an example from the notes.",
    scenarioCategory: "explanation",
    tags: tags("chat", "grammar"),
  },

  // ─── holdout (never tune against these) ───────────────────
  {
    ...base,
    id: "language-learners/quiz-partitive-vs-definite",
    split: "holdout",
    runner: "quiz",
    question: "Hard quiz: when do I use du / de la / des versus le / la / les?",
    expectedAnswer:
      "Harder questions contrasting partitive (du pain, de la musique) with definite articles for general truths and likes " +
      "(j'aime la musique), and de after a negative (je n'ai pas de …).",
    expectedBehavior:
      "Harder questions distinguishing partitive and definite articles, including de after a negative. " +
      "Exactly one correct option per question, consistent with the notes.",
    studioParams: {
      questionCount: 8,
      difficulty: "hard",
      topic: "partitive versus definite articles",
    },
    expectedStructure: { minItems: 6 },
    tags: tags("quiz", "grammar"),
  },
  {
    ...base,
    id: "language-learners/chat-possessive-before-vowel",
    split: "holdout",
    runner: "chat",
    question: "Why is it 'mon amie' and not 'ma amie' if amie is feminine?",
    expectedAnswer:
      "Ma, ta and sa become mon, ton and son before a feminine noun that starts with a vowel sound, so it is 'mon amie' " +
      "(as in 'Voici Tammy, mon amie'), pronounced with liaison.",
    expectedBehavior:
      "Explains that ma/ta/sa become mon/ton/son before a feminine noun starting with a vowel sound, " +
      "with an example from the notes.",
    scenarioCategory: "explanation",
    tags: tags("chat", "grammar"),
  },
];
