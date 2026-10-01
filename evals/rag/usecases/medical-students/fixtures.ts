import type { EvalFixture } from "../../types";

/**
 * Medical students pack fixtures. Requests are phrased the way a medical student
 * would ask; studio focus goes through `studioParams.topic`. Notebook and
 * document ids are filled in at run time from the seeded "Medical Students"
 * notebook, so they are never set here.
 *
 * `expectedItems` holds only distinctive terms the output should contain;
 * `expectedAnswer` is a short reference for judges.
 */
const base = {
  schemaVersion: 1,
  useCase: "medical-students",
} as const;

const tags = (...extra: string[]) => ["use-case", "medical-students", "anatomy", ...extra];

export const medicalStudentsFixtures: EvalFixture[] = [
  // ─── smoke ────────────────────────────────────────────────
  {
    ...base,
    id: "medical-students/flashcards-heart-anatomy",
    split: "smoke",
    runner: "flashcards",
    question:
      "Make flashcards from my heart anatomy lecture so I can learn the chambers, valves and vessels.",
    expectedItems: ["right atrium", "left ventricle", "tricuspid"],
    expectedAnswer:
      "Single-fact cards on the four chambers, the atrioventricular and semilunar valves, and the great vessels, " +
      "e.g. front: 'Valve between the right atrium and right ventricle' back: 'tricuspid valve'.",
    expectedBehavior:
      "Cards cover chambers, valves and great vessels from the lecture. Each card tests one structure, " +
      "the front does not give the answer away, and every term is spelled as in the source.",
    studioParams: {
      cardCount: 15,
      difficulty: "medium",
      topic: "heart chambers, valves and great vessels",
    },
    expectedStructure: { minItems: 10 },
    tags: tags("flashcards", "cardiovascular"),
  },
  {
    ...base,
    id: "medical-students/quiz-cranial-nerves-easy",
    split: "smoke",
    runner: "quiz",
    question: "Give me an easy quiz on the cranial nerves. I just started neuro.",
    expectedItems: [],
    expectedAnswer:
      "Short questions matching a cranial nerve to its main function or type, e.g. the optic nerve carries vision, " +
      "the hypoglossal nerve moves the tongue.",
    expectedBehavior:
      "Beginner questions, each testing one nerve's name, number, function or sensory/motor type from the source. " +
      "Exactly one option is correct and it matches the source.",
    studioParams: {
      questionCount: 10,
      difficulty: "easy",
      topic: "cranial nerve names and functions",
    },
    expectedStructure: { minItems: 8 },
    tags: tags("quiz", "nervous-system"),
  },

  // ─── train ────────────────────────────────────────────────
  {
    ...base,
    id: "medical-students/flashcards-cranial-nerve-functions",
    split: "train",
    runner: "flashcards",
    question: "Make one flashcard per cranial nerve: nerve on the front, what it does on the back.",
    expectedItems: [
      "olfactory",
      "optic",
      "oculomotor",
      "trochlear",
      "trigeminal",
      "abducens",
      "facial",
      "vestibulocochlear",
      "glossopharyngeal",
      "vagus",
      "accessory",
      "hypoglossal",
    ],
    expectedAnswer:
      "Twelve cards, one per cranial nerve, each giving that nerve's function from the source " +
      "(e.g. abducens: controls the lateral rectus muscle of the eye; vagus: sensory and parasympathetic supply to the neck and most chest and abdominal organs).",
    expectedBehavior:
      "One card for each of the twelve cranial nerves, built from the source's per-nerve descriptions. Functions match the source; " +
      "no card mixes two nerves.",
    studioParams: {
      cardCount: 12,
      difficulty: "medium",
      topic: "the twelve cranial nerves and their functions",
    },
    expectedStructure: { minItems: 12 },
    tags: tags("flashcards", "nervous-system"),
  },
  {
    ...base,
    id: "medical-students/quiz-cardiac-cycle",
    split: "train",
    runner: "quiz",
    question:
      "Quiz me on the cardiac cycle: the phases, when the valves open and close, and the pressures.",
    expectedItems: [],
    expectedAnswer:
      "Questions on the four stages of the cycle (isovolumic relaxation, inflow, isovolumic contraction, ejection), on how " +
      "they group into ventricular diastole (including atrial systole) and ventricular systole, and on valve opening and " +
      "closing as pressures change (AV valves close under back-pressure as the ventricles contract; the aortic and " +
      "pulmonary valves open once ventricular pressure exceeds that in the aorta and pulmonary arteries).",
    expectedBehavior:
      "Questions on stage order, valve timing and pressure relationships from the lecture. " +
      "Exactly one option is correct per question, and every statement matches the source.",
    studioParams: {
      questionCount: 10,
      difficulty: "medium",
      topic: "phases of the cardiac cycle, valve timing and pressures",
    },
    expectedStructure: { minItems: 8 },
    tags: tags("quiz", "cardiovascular", "process"),
  },
  {
    ...base,
    id: "medical-students/quiz-cardiovascular-mixed",
    split: "train",
    runner: "quiz",
    question: "Make a quiz that mixes heart structure with how the heart works during each beat.",
    expectedItems: [],
    expectedAnswer:
      "Questions that connect structures to the cycle, e.g. which valves close under back-pressure as the ventricles " +
      "start to contract, or which ventricle ejects blood through the aortic valve into the aorta.",
    expectedBehavior:
      "Questions drawing on both the heart anatomy and the cardiac cycle material, some linking a structure to its role " +
      "in a phase. Exactly one correct option per question, consistent with the sources.",
    studioParams: {
      questionCount: 10,
      difficulty: "medium",
      topic: "heart structures and their roles in the cardiac cycle",
    },
    expectedStructure: { minItems: 8 },
    scenarioCategory: "multi-doc",
    tags: tags("quiz", "cardiovascular", "multi-doc"),
  },
  {
    ...base,
    id: "medical-students/written-questions-filtration",
    split: "train",
    runner: "writtenQuestions",
    question:
      "Give me exam-style short-answer questions on glomerular filtration, with model answers.",
    expectedItems: ["net filtration pressure"],
    expectedAnswer:
      "Questions such as 'Explain how net filtration pressure is calculated', with model answers that follow the source's equation, " +
      "GFR = K_f × (P_G − P_B − Π_G + Π_B): hydrostatic pressure in the glomerular capillaries " +
      "(P_G) and in Bowman's capsule (P_B), and colloid osmotic pressure in the capillaries (Π_G) and in Bowman's capsule " +
      "(Π_B, taken as about zero in a healthy nephron).",
    expectedBehavior:
      "Short-answer questions on filtration pressures and GFR. Model answers explain the mechanism step by step, " +
      "use the source's values and add no clinical claims the source lacks.",
    studioParams: {
      questionCount: 5,
      difficulty: "medium",
      topic: "glomerular filtration and net filtration pressure",
    },
    expectedStructure: { minItems: 4 },
    tags: tags("writtenQuestions", "renal", "mechanism"),
  },
  {
    ...base,
    id: "medical-students/chat-av-valve-closure",
    split: "train",
    runner: "chat",
    question: "Why do the AV valves close at the start of ventricular systole?",
    expectedItems: ["isovolumic contraction"],
    expectedAnswer:
      "When the ventricles start contracting, back-pressure against them builds and forces the AV (mitral and tricuspid) " +
      "valves closed, which stops blood flowing in or out of the ventricles; this is the isovolumic contraction stage.",
    expectedBehavior:
      "Explains the pressure change that closes the AV valves, in the order the lecture gives it, with citations, " +
      "and names the isovolumic contraction phase.",
    scenarioCategory: "causality",
    tags: tags("chat", "cardiovascular", "mechanism"),
  },
  {
    ...base,
    id: "medical-students/chat-normal-gfr",
    split: "train",
    runner: "chat",
    question: "What's a normal GFR, and what sets the net filtration pressure?",
    expectedItems: ["125", "net filtration pressure"],
    expectedAnswer:
      "The source gives a normal GFR of 100–130 (average 125) mL/min/1.73 m² in men and 90–120 mL/min/1.73 m² in women " +
      "younger than 40. Net filtration pressure is P_G − P_B − Π_G + Π_B: hydrostatic pressure in the glomerular " +
      "capillaries minus hydrostatic pressure in Bowman's capsule, minus colloid osmotic pressure in the capillaries plus " +
      "that in Bowman's capsule (about zero in a healthy nephron). GFR is K_f times this net pressure.",
    expectedBehavior:
      "Gives the normal GFR range and average with the source's units, and the hydrostatic and colloid osmotic pressures " +
      "that set net filtration pressure, with citations. States no pressure values the source does not give.",
    scenarioCategory: "factoid",
    tags: tags("chat", "renal", "values"),
  },

  // ─── holdout (never tune against these) ───────────────────
  {
    ...base,
    id: "medical-students/quiz-filtration-hard",
    split: "holdout",
    runner: "quiz",
    question:
      "Hard quiz on glomerular filtration: pressures, GFR and how the kidney keeps it steady.",
    expectedItems: [],
    expectedAnswer:
      "Harder questions on how each pressure changes net filtration pressure and GFR, and on the regulation of GFR " +
      "as the source describes it (afferent versus efferent arteriole constriction or dilation, the myogenic response, " +
      "tubuloglomerular feedback, the RAAS and sympathetic activation).",
    expectedBehavior:
      "Harder questions that require reasoning about pressure changes and GFR regulation. Exactly one correct option per " +
      "question, every value and mechanism consistent with the source.",
    studioParams: {
      questionCount: 8,
      difficulty: "hard",
      topic: "filtration pressures, GFR and its regulation",
    },
    expectedStructure: { minItems: 6 },
    tags: tags("quiz", "renal", "mechanism"),
  },
  {
    ...base,
    id: "medical-students/chat-lateral-gaze-nerve",
    split: "holdout",
    runner: "chat",
    question:
      "If a patient can't move one eye outward, which cranial nerve is most likely involved, based on my notes?",
    expectedItems: ["abducens", "lateral rectus"],
    expectedAnswer:
      "The abducens nerve (cranial nerve VI), which controls the lateral rectus muscle of the eye.",
    expectedBehavior:
      "Names the abducens nerve and the lateral rectus from the cranial nerve material, with citations, " +
      "without adding diagnoses or treatments the notes do not contain.",
    scenarioCategory: "explanation",
    tags: tags("chat", "nervous-system", "applied"),
  },
];
