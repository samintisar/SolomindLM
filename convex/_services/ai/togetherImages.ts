"use node";

import Together from "together-ai";

export interface GenerateInfographicImageParams {
  prompt: string;
  size?: string;
  quality?: string;
  timeoutMs?: number;
}

export async function generateInfographicImage(
  client: Together,
  params: GenerateInfographicImageParams
): Promise<{ imageUrl: string }> {
  const { prompt, size = "1536x1024", quality = "medium", timeoutMs = 180000 } = params;

  const response = await Promise.race([
    client.images.generate({
      model: "openai/gpt-image-1.5",
      prompt,
      size: size as any,
      quality: quality as any,
      n: 1,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Image generation timeout")), timeoutMs)
    ),
  ]);

  const imageData = (response as any).data?.[0];
  if (!imageData) {
    throw new Error("No image data in response");
  }

  // Handle base64 response (default for gpt-image-1.5)
  if (imageData.b64_json) {
    const buffer = Buffer.from(imageData.b64_json, "base64");
    // Return a data URL for now - the caller will store it
    const dataUrl = `data:image/png;base64,${imageData.b64_json}`;
    return { imageUrl: dataUrl };
  }

  // Handle URL response
  if (imageData.url) {
    return { imageUrl: imageData.url };
  }

  throw new Error("No image URL or base64 data in response");
}
