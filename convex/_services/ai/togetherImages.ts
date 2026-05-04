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
  const { prompt, size = "1536x1024", timeoutMs = 180000 } = params;

  // Parse size into width/height for Together AI API
  const [widthStr, heightStr] = size.split("x");
  const width = parseInt(widthStr, 10) || 1536;
  const height = parseInt(heightStr, 10) || 1024;

  console.log(`[TogetherImage] Calling openai/gpt-image-1.5 with width=${width}, height=${height}`);

  const response = await Promise.race([
    client.images.generate({
      model: "openai/gpt-image-1.5",
      prompt,
      width,
      height,
      n: 1,
      steps: undefined,
      response_format: undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Image generation timeout")), timeoutMs)
    ),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.log(`[TogetherImage] Response keys: ${Object.keys(response as any).join(", ")}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp = response as any;
  console.log(`[TogetherImage] Response type: ${typeof resp}, has data: ${!!resp.data}`);

  if (resp.data) {
    console.log(`[TogetherImage] data length: ${resp.data.length}`);
    console.log(
      `[TogetherImage] data[0] keys: ${resp.data[0] ? Object.keys(resp.data[0]).join(", ") : "undefined"}`
    );
  }

  const imageData = resp.data?.[0];
  if (!imageData) {
    throw new Error(
      `No image data in response. Response: ${JSON.stringify({ ...resp, data: undefined })}`
    );
  }

  // Handle base64 response
  if (imageData.b64_json) {
    console.log(`[TogetherImage] Got base64 response, length: ${imageData.b64_json.length}`);
    const dataUrl = `data:image/png;base64,${imageData.b64_json}`;
    return { imageUrl: dataUrl };
  }

  // Handle URL response
  if (imageData.url) {
    console.log(`[TogetherImage] Got URL response: ${imageData.url.slice(0, 80)}...`);
    return { imageUrl: imageData.url };
  }

  throw new Error(
    `No image URL or base64 data in response. Available keys: ${Object.keys(imageData).join(", ")}`
  );
}
