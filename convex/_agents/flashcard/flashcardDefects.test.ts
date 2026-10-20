import { describe, expect, it } from "vitest";
import { findFlashcardDefect } from "./flashcardDefects";
import { getMapPrompt } from "./prompts";

function defect(front: string, back: string) {
  return findFlashcardDefect({ front, back });
}

describe("findFlashcardDefect: answer in a parenthetical on the front", () => {
  it("flags a fill-blank hint that is the answer itself", () => {
    expect(defect("Il cherche ___ (ses) clés.", "ses")).toBe("answer_in_front");
  });

  it("flags a multi-word answer given in parentheses", () => {
    expect(
      defect("What is the correct form for 'She went' (elle est allée)?", "elle est allée")
    ).toBe("answer_in_front");
  });

  it("flags a true/false verdict given in parentheses", () => {
    expect(
      defect(
        "True or False: Mitochondria are found only in animal cells. (False - also in plants)",
        "False — they are also found in plant cells."
      )
    ).toBe("answer_in_front");
  });

  it("flags a definition given in parentheses", () => {
    expect(
      defect(
        "Define: Mitochondria (The powerhouse of the cell that generates ATP)",
        "The powerhouse of the cell that generates ATP."
      )
    ).toBe("answer_in_front");
  });

  it("ignores markdown emphasis when comparing", () => {
    expect(defect("Il cherche ___ (**ses**) clés.", "**ses**")).toBe("answer_in_front");
  });

  it("allows a base-form hint that differs from the answer", () => {
    expect(defect("Il ___ (chercher) ses clés.", "cherche")).toBeNull();
  });

  it("allows an expansion that is not the answer", () => {
    expect(
      defect("What does ATP (adenosine triphosphate) provide to the cell?", "Energy for its work.")
    ).toBeNull();
  });

  it("allows a list of choices even when the answer is listed first", () => {
    expect(defect("___ (la/le) maison est grande.", "La")).toBeNull();
  });
});

describe("findFlashcardDefect: answer elsewhere in a fill-blank front", () => {
  it("flags a fill-blank whose answer is written out in the prompt", () => {
    expect(defect("Nous préférons le thé. Complete: Nous ___ le thé.", "préférons")).toBe(
      "answer_in_front"
    );
  });

  it("ignores a short function word that also appears in the sentence", () => {
    expect(defect("___ chat mange le poisson.", "Le")).toBeNull();
  });

  it("does not apply to questions without a blank", () => {
    expect(defect("What is the role of the nucleus?", "The nucleus stores DNA.")).toBeNull();
  });
});

describe("findFlashcardDefect: blank that breaks the sentence", () => {
  it("flags an elided answer after the full form of the same word", () => {
    expect(defect("Je ___ habite à Paris.", "j'")).toBe("blank_duplicates_neighbor");
  });

  it("flags an answer that repeats the word after the blank", () => {
    expect(defect("The cat ___ on the mat.", "sat on")).toBe("blank_duplicates_neighbor");
  });

  it("flags an answer that repeats the word before the blank", () => {
    expect(defect("I ate an ___ apple.", "an")).toBe("blank_duplicates_neighbor");
  });

  it("allows an answer that completes the sentence", () => {
    expect(defect("Tu ___ à Paris.", "habites")).toBeNull();
    expect(defect("Il ___ a vu hier.", "l'")).toBeNull();
  });
});

describe("findFlashcardDefect: clean cards", () => {
  it("returns null for an ordinary question", () => {
    expect(
      defect("What is the primary function of mitochondria?", "Producing ATP for the cell.")
    ).toBeNull();
  });

  it("returns null for an empty back", () => {
    expect(defect("Il cherche ___ (ses) clés.", "")).toBeNull();
  });

  it("returns null for brackets that hold content, such as citations or code", () => {
    expect(defect("What does xs[0] return when xs = [3, 4]?", "3 [1]")).toBeNull();
    expect(defect("What does the [term structure] model explain?", "Yield curves.")).toBeNull();
  });
});

describe("findFlashcardDefect: card copied from a prompt template", () => {
  it("flags an unfilled placeholder on either side", () => {
    expect(defect("What is the role of [concept] in [process]?", "It regulates it.")).toBe(
      "unfilled_template"
    );
    expect(defect("Define: elasticity", "[The source's definition of the term.]")).toBe(
      "unfilled_template"
    );
  });

  it("catches every placeholder the map prompt's templates use", () => {
    const prompt = getMapPrompt({
      chunk: "x",
      cardCount: 10,
      cardsPerChunk: 5,
      difficulty: "medium",
    });
    const placeholders = [...prompt.matchAll(/\[[a-z][^\]\n]*\]/gi)].map((m) => m[0]);
    expect(placeholders.length).toBeGreaterThan(10);
    for (const placeholder of placeholders) {
      expect(defect(`Front ${placeholder}`, "Back"), placeholder).toBe("unfilled_template");
    }
  });
});

describe("getMapPrompt: examples", () => {
  it("holds no topical example a sparse chunk could copy", () => {
    const prompt = getMapPrompt({
      chunk: "x",
      cardCount: 10,
      cardsPerChunk: 5,
      difficulty: "hard",
    });
    for (const term of ["mitochondri", "nucleus", "ARIMA", "softmax", "foreign key", "foo()"]) {
      expect(prompt.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });
});
