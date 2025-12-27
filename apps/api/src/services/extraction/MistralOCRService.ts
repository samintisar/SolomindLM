import axios from 'axios';

export class MistralOCRService {
  private apiKey: string;
  private baseUrl = 'https://api.mistral.ai/v1';
  private model = 'mistral-ocr-latest';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async callOcrEndpoint(documentUrl: string): Promise<string> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/ocr`,
        {
          model: this.model,
          document: {
            type: 'document_url',
            document_url: documentUrl,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000, // Best practice: 60s timeout
        }
      );

      // FIX: Handle the "pages" array structure
      if (response.data?.pages && Array.isArray(response.data.pages)) {
        return response.data.pages
          .map((page: any) => page.markdown || '')
          .join('\n\n');
      }

      // Fallback for other potential formats
      return response.data.markdown || response.data.text || '';
    } catch (error) {
      console.error('Mistral OCR error:', error);
      if (axios.isAxiosError(error)) {
        const details = error.response?.data
          ? JSON.stringify(error.response.data)
          : error.message;
        console.error('Mistral API Response:', { status: error.response?.status, details });
        throw new Error(`Mistral OCR failed: ${details}`);
      }
      throw new Error('Failed to process document with Mistral OCR');
    }
  }

  async processDocument(fileUrl: string): Promise<string> {
    return this.callOcrEndpoint(fileUrl);
  }

  async processFromUrl(url: string): Promise<string> {
    return this.callOcrEndpoint(url);
  }
}
