import { PromptTemplate } from '@langchain/core/prompts';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';

export class TitleGeneratorService {
  private llm: ChatTogetherAI;
  private promptTemplate: PromptTemplate;

  constructor(apiKey: string) {
    this.llm = new ChatTogetherAI({
      apiKey,
      model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      temperature: 0.3,
    });

    this.promptTemplate = PromptTemplate.fromTemplate(
      'Generate a concise, descriptive title (max 10 words) for this document chunk:\n\n{chunk}\n\nTitle:'
    );
  }

  async generateTitle(firstChunk: string): Promise<string> {
    try {
      const prompt = await this.promptTemplate.format({ chunk: firstChunk });
      const response = await this.llm.invoke(prompt);
      return response.content.toString().trim();
    } catch (error) {
      console.error('Title generator error:', error);
      throw new Error('Failed to generate title');
    }
  }
}
