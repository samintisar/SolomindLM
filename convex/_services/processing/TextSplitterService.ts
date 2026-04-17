"use node";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { countTokens } from "../../_agents/_shared/tokenizer.js";

export class TextSplitterService {
  static async splitText(text: string, chunkSize = 1000, chunkOverlap = 200): Promise<string[]> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators: ["\n\n", "\n", ". ", " ", ""],
      lengthFunction: (t) => countTokens(t),
    });

    return await splitter.splitText(text);
  }

  static estimateTokens(text: string): number {
    return countTokens(text);
  }

  static cleanup(): void {}
}
