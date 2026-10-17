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
    expectedPassages: [
      "The past participle of a verb which takes être agrees in gender and number with the subject;",
      "in most cases, the past participle of pronominal verbs agrees in gender and number with the gender and number of the reflexive pronoun",
      "The past participle agrees in gender and in number with a preceding direct object.",
    ],
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

  {
    ...base,
    id: "language-learners/chat-unanswerable-subjunctive",
    split: "train",
    runner: "chat",
    question:
      "How do I form the subjunctive after 'il faut que'? Show me faire in the subjunctive.",
    expectedItems: [],
    expectAbstain: true,
    expectedAnswer:
      "The notes do not cover the subjunctive, so the correct reply says the sources do not cover it and gives no subjunctive forms or rules.",
    expectedBehavior:
      "Pass if the answer clearly states that the sources do not cover the subjunctive, and any additional content is explicitly labelled as general knowledge not from the sources. " +
      "Fail if it presents facts as if drawn from the sources, or answers without acknowledging the gap.",
    tags: tags("chat", "unanswerable"),
  },

  {
    ...base,
    id: "language-learners/chat-followup-etre-examples",
    split: "train",
    runner: "chat",
    question: "What are two more examples of that from my notes?",
    turns: [
      { role: "user", content: "Which verbs take être in the passé composé?" },
      {
        role: "assistant",
        content:
          "Many intransitive verbs of coming and going take être, for example aller (to go): je suis allé(e). " +
          "Other verbs of movement follow the same pattern.",
      },
    ],
    chatSettings: { instructionMode: "learningGuide" },
    expectedItems: [],
    expectedAnswer:
      "Two more verbs of coming and going that take être in the passé composé, such as venir, partir, arriver or entrer, " +
      "with the participle agreeing with the subject (for example elle est arrivée).",
    expectedBehavior:
      "Stays on the earlier topic, verbs of coming and going that take être in the passé composé, and gives two new examples " +
      "from the notes. Learning guide mode may guide with a question first, but the reply must build on that topic " +
      "and must not switch to avoir verbs or another tense.",
    tags: tags("chat", "multi-turn", "learning-guide", "grammar"),
  },
  {
    ...base,
    id: "language-learners/chat-followup-possessive-examples",
    split: "train",
    runner: "chat",
    question: "What are two more examples of that rule from my notes?",
    turns: [
      { role: "user", content: "How do ma, ta and sa change before a vowel?" },
      {
        role: "assistant",
        content:
          "Before a feminine noun that starts with a vowel sound, ma, ta and sa become mon, ton and son, as in 'mon amie'. " +
          "This is the liaison rule for possessive determiners.",
      },
    ],
    chatSettings: { instructionMode: "learningGuide" },
    expectedItems: [],
    expectedAnswer:
      "Two more examples of ma, ta and sa becoming mon, ton and son before a feminine noun that starts with a vowel sound, " +
      "such as mon adresse, ton école or son histoire.",
    expectedBehavior:
      "Stays on the mon/ton/son rule for feminine nouns that begin with a vowel sound and gives two new examples with the " +
      "correct forms. Learning guide mode may guide with a question first, but must build on that rule.",
    tags: tags("chat", "multi-turn", "learning-guide", "grammar"),
  },
  {
    ...base,
    id: "language-learners/chat-followup-unresolved-le-la",
    split: "train",
    runner: "chat",
    question: "Give me two more of those.",
    turns: [
      { role: "user", content: "What's the difference between le and la?" },
      {
        role: "assistant",
        content:
          "Le goes with masculine singular nouns and la with feminine singular nouns, for example le tatou and la chatte. " +
          "Do you want the plural forms too?",
      },
    ],
    chatSettings: { instructionMode: "default" },
    expectedItems: [],
    expectedAnswer:
      "Default mode does not carry the earlier turns into the answer, and 'those' has no clear referent on its own. The correct " +
      "reply asks what kind of examples are wanted, or says it needs the topic, rather than listing examples as if it knew.",
    expectedBehavior:
      "Does not guess what 'those' refers to and answer confidently. Acceptable: a clarifying question, or an explicit note that " +
      "the question needs the topic. A confident list presented as a continuation of the earlier discussion is a failure.",
    tags: tags("chat", "multi-turn", "follow-up"),
  },

  {
    ...base,
    id: "language-learners/chat-answer-in-french",
    split: "train",
    runner: "chat",
    question: "How do I form the passé composé with avoir? Give me one example.",
    expectedItems: [],
    expectedAnswer:
      "Subject plus avoir in the present plus the past participle, for example « J'ai mangé » (I ate / I have eaten), explained in French.",
    expectedBehavior:
      "The whole answer is written in French, although the question is in English, because the notebook output language is French. " +
      "The grammar is grounded in the notes and includes an example. An English answer fails this case; French grammar terms and example sentences are fine.",
    chat: { outputLanguage: "fr" },
    tags: tags("chat", "output-language", "grammar"),
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
    expectedPassages: [
      "Ma, ta, sa become mon, ton, son in front of feminine nouns beginning with a vowel sound.",
      "Tex: Voici Tammy, mon amie, et ses amies Bette et Fiona, c'est-à-dire nos amies.",
    ],
    expectedAnswer:
      "Ma, ta and sa become mon, ton and son before a feminine noun that starts with a vowel sound, so it is 'mon amie' " +
      "(as in 'Voici Tammy, mon amie'), pronounced with liaison.",
    expectedBehavior:
      "Explains that ma/ta/sa become mon/ton/son before a feminine noun starting with a vowel sound, " +
      "with an example from the notes.",
    scenarioCategory: "explanation",
    tags: tags("chat", "grammar"),
  },
  {
    ...base,
    id: "language-learners/chat-unanswerable-imperfect",
    split: "holdout",
    runner: "chat",
    question: "How do I conjugate the imperfect tense of être? Give me all the forms.",
    expectedItems: [],
    expectAbstain: true,
    expectedAnswer:
      "The notes do not cover the imperfect, so the correct reply says the sources do not cover it and gives no imperfect forms.",
    expectedBehavior:
      "Pass if the answer clearly states that the sources do not cover the imperfect, and any additional content is explicitly labelled as general knowledge not from the sources. " +
      "Fail if it presents facts as if drawn from the sources, or answers without acknowledging the gap.",
    tags: tags("chat", "unanswerable"),
  },
  {
    ...base,
    id: "language-learners/chat-followup-unresolved-other-example",
    split: "holdout",
    runner: "chat",
    question: "Now do the same thing with the other example from before.",
    turns: [
      { role: "user", content: "How do lui and leur replace indirect objects?" },
      {
        role: "assistant",
        content:
          "Lui replaces an indirect object for one person, as in 'Je parle à Tammy' becoming 'Je lui parle'. " +
          "Leur replaces one for several people. Would you like another example?",
      },
    ],
    chatSettings: { instructionMode: "default" },
    expectedItems: [],
    expectedAnswer:
      "The question depends on an 'other example' the earlier turns do not contain. The correct reply asks which example " +
      "is meant, or says it cannot tell without more context, and does not invent an example.",
    expectedBehavior:
      "Does not invent the 'other example' or present a made-up pronoun sentence as the one from before. Acceptable: a " +
      "clarifying question or an explicit note that the question needs the example. A confident answer that treats an " +
      "invented example as the earlier one is a failure.",
    tags: tags("chat", "multi-turn", "follow-up"),
  },
];
