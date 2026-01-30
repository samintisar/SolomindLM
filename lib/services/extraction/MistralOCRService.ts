"use node"
import axios from 'axios';

export class MistralOCRService {
  private apiKey: string;
  private baseUrl = 'https://api.mistral.ai/v1';
  private model = 'mistral-ocr-latest';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Strip all media references from text (images, videos, audio, etc.)
   * This ensures only text content is returned
   */
  private stripMedia(text: string): string {
    return text
      // Remove markdown images: ![alt](url) or ![alt][ref]
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      .replace(/!\[([^\]]*)\]\[[^\]]+\]/g, '')
      // Remove reference-style image definitions: [id]: url
      .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
      // Remove HTML <img> tags
      .replace(/<img[^>]*>/gi, '')
      .replace(/<img[^>]*\/>/gi, '')
      // Remove HTML <video> tags
      .replace(/<video[^>]*>.*?<\/video>/gis, '')
      // Remove HTML <audio> tags
      .replace(/<audio[^>]*>.*?<\/audio>/gis, '')
      // Remove HTML <picture> tags
      .replace(/<picture[^>]*>.*?<\/picture>/gis, '')
      // Remove HTML <source> tags
      .replace(/<source[^>]*>/gi, '')
      .replace(/<source[^>]*\/>/gi, '')
      // Remove HTML <embed> tags
      .replace(/<embed[^>]*>/gi, '')
      .replace(/<embed[^>]*\/>/gi, '')
      // Remove HTML <object> tags
      .replace(/<object[^>]*>.*?<\/object>/gis, '')
      // Remove HTML <figure> tags with media (keep caption text)
      .replace(/<figure[^>]*>(.*?)<\/figure>/gis, (_, content) => {
        // Extract text from <figcaption> if present, otherwise remove
        const figcaption = content.match(/<figcaption[^>]*>(.*?)<\/figcaption>/is);
        return figcaption ? figcaption[1].trim() : '';
      })
      // Remove SVG elements
      .replace(/<svg[^>]*>.*?<\/svg>/gis, '')
      // Remove data URIs (embedded images)
      .replace(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, '')
      .replace(/data:video\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, '')
      .replace(/data:audio\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, '')
      // Remove markdown-style media file references
      .replace(/\[([^\]]*)\]\([^)]*\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg|pdf)[^)]*\)/gi, '')
      // Remove standalone media URLs (http/https)
      .replace(/https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg|pdf)(\?[^\s]*)?\b/gi, '')
      // Remove file paths with media extensions
      .replace(/[^\s]*\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|webm|mov|avi|mp3|wav|ogg)\b/gi, '')
      // Clean up extra whitespace and line breaks
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .replace(/^\s+|\s+$/g, '')
      .trim();
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
      let content = '';
      if (response.data?.pages && Array.isArray(response.data.pages)) {
        content = response.data.pages
          .map((page: any) => page.markdown || '')
          .join('\n\n');
      } else {
        // Fallback for other potential formats
        content = response.data.markdown || response.data.text || '';
      }

      // Strip all media references to ensure text-only output
      return this.stripMedia(content);
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
