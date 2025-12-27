import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export class TextSplitterService {
  private splitter: RecursiveCharacterTextSplitter;

  constructor() {
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', ' ', ''],
    });
  }

  async splitText(text: string): Promise<string[]> {
    try {
      return await this.splitter.splitText(text);
    } catch (error) {
      console.error('Text splitter error:', error);
      throw new Error('Failed to split text');
    }
  }
}
