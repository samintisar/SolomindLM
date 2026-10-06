import { describe, expect, it } from "vitest";
import { isReferenceListChunk, withoutReferenceLists } from "./referenceSections";

describe("isReferenceListChunk", () => {
  it.each([
    "References",
    "REFERENCES",
    "Reference",
    "7 References",
    "7. References",
    "Bibliography",
    "Works Cited",
    "Literature Cited",
    "References and Notes",
    "Reference List",
  ])("treats a chunk in the %s section as a reference list", (sectionTitle) => {
    expect(isReferenceListChunk({ sectionTitle, content: "[1] A. Author. A paper. 2020." })).toBe(
      true
    );
  });

  it.each([
    "Related Work",
    "2 RELATED WORK",
    "Methods",
    "References to prior work in this section",
    "Abstract",
  ])("keeps a chunk in the %s section", (sectionTitle) => {
    expect(isReferenceListChunk({ sectionTitle, content: "We compare against [1] and [2]." })).toBe(
      false
    );
  });

  it("recognises an untitled chunk that starts the reference list", () => {
    expect(
      isReferenceListChunk({ content: "## References\n\n[1] A. Author. A paper. 2020." })
    ).toBe(true);
    expect(isReferenceListChunk({ content: "**Bibliography**\n\nSmith, J. (2019)." })).toBe(true);
  });

  it("keeps untitled chunks that merely mention references", () => {
    expect(isReferenceListChunk({ content: "References to the dataset appear in Table 2." })).toBe(
      false
    );
    expect(isReferenceListChunk({ content: "Body text." })).toBe(false);
  });
});

describe("withoutReferenceLists", () => {
  const chunk = (documentId: string, chunkIndex: number, sectionTitle?: string) => ({
    documentId,
    chunkIndex,
    sectionTitle,
    content: `${documentId}${chunkIndex}`,
  });

  it("drops each document's reference list and keeps everything else, in order", () => {
    const chunks = [
      chunk("a", 0, "1 Introduction"),
      chunk("a", 1, "References"),
      chunk("a", 2, "A Appendix"),
      chunk("b", 0, "Abstract"),
      chunk("b", 1, "REFERENCES"),
    ];

    expect(withoutReferenceLists(chunks).map((c) => c.content)).toEqual(["a0", "a2", "b0"]);
  });

  it("drops the untitled citation chunks that follow an untitled reference heading", () => {
    const untitled = (chunkIndex: number, content: string) => ({
      documentId: "u",
      chunkIndex,
      content,
    });
    const chunks = [
      untitled(0, "Body text about the method."),
      untitled(1, "## References\n\n[1] A. Author. A paper. 2020."),
      untitled(2, "[2] B. Author. Another paper. 2021."),
      untitled(3, "## Appendix A\n\nExtra results."),
    ];

    expect(withoutReferenceLists(chunks).map((c) => c.chunkIndex)).toEqual([0, 3]);
  });

  it("follows chunkIndex order, not input order", () => {
    const chunks = [
      { documentId: "u", chunkIndex: 2, content: "[2] B. Author. 2021." },
      { documentId: "u", chunkIndex: 0, content: "Body." },
      { documentId: "u", chunkIndex: 1, content: "References\n[1] A. Author. 2020." },
    ];

    expect(withoutReferenceLists(chunks).map((c) => c.chunkIndex)).toEqual([0]);
  });

  it("ends an untitled reference list at a bold heading", () => {
    const chunks = [
      { documentId: "u", chunkIndex: 0, content: "Body." },
      { documentId: "u", chunkIndex: 1, content: "**References**\n\n[1] A. Author. 2020." },
      { documentId: "u", chunkIndex: 2, content: "[2] B. Author. 2021." },
      { documentId: "u", chunkIndex: 3, content: "**Appendix**\n\nExtra results." },
      { documentId: "u", chunkIndex: 4, content: "More appendix text." },
    ];

    expect(withoutReferenceLists(chunks).map((c) => c.chunkIndex)).toEqual([0, 3, 4]);
  });

  it("keeps a document that is nothing but a reference list", () => {
    const chunks = [chunk("bib", 0, "Bibliography"), chunk("bib", 1, "Bibliography")];

    expect(withoutReferenceLists(chunks)).toEqual(chunks);
  });
});
