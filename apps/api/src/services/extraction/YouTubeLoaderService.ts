import { YoutubeLoader } from '@langchain/community/document_loaders/web/youtube';

export class YouTubeLoaderService {
  async loadTranscript(videoUrl: string): Promise<string> {
    try {
      const loader = YoutubeLoader.createFromUrl(videoUrl, {
        language: 'en',
        addVideoInfo: true,
      });

      const docs = await loader.load();
      return docs.map((doc) => doc.pageContent).join('\n\n');
    } catch (error) {
      console.error('YouTube loader error:', error);
      throw new Error('Failed to load YouTube transcript');
    }
  }

  extractVideoId(url: string): string {
    const regex =
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    if (!match || !match[1]) {
      throw new Error('Invalid YouTube URL');
    }
    return match[1];
  }
}
