"use node";

import { Mp3Encoder } from "@breezystack/lamejs";
import { parsePcmWav } from "./wav";

export const DEFAULT_AUDIO_MP3_BITRATE_KBPS = 64;

const MP3_SAMPLE_BLOCK_SIZE = 1152;

function readInt16PcmSamples(data: Buffer): Int16Array {
  if (data.length % 2 !== 0) {
    throw new Error("Invalid WAV: PCM data length must be even for 16-bit audio");
  }

  const samples = new Int16Array(data.length / 2);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = data.readInt16LE(i * 2);
  }
  return samples;
}

function deinterleaveStereo(samples: Int16Array): { left: Int16Array; right: Int16Array } {
  if (samples.length % 2 !== 0) {
    throw new Error("Invalid WAV: stereo PCM sample count must be even");
  }

  const frameCount = samples.length / 2;
  const left = new Int16Array(frameCount);
  const right = new Int16Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    left[frame] = samples[frame * 2];
    right[frame] = samples[frame * 2 + 1];
  }

  return { left, right };
}

/**
 * Encode one combined PCM WAV file to MP3.
 *
 * Keeping the WAV concatenation step and encoding once produces one coherent MP3
 * file, which is more reliable for browser duration/seek metadata than joining
 * many individually encoded MP3 snippets.
 */
export function encodePcmWavToMp3(
  wavBuffer: Buffer,
  options: { bitrateKbps?: number } = {}
): Buffer {
  const { format, data } = parsePcmWav(wavBuffer);

  if (format.bitsPerSample !== 16) {
    throw new Error(`Unsupported WAV bit depth: expected 16-bit PCM, got ${format.bitsPerSample}`);
  }

  if (format.numChannels !== 1 && format.numChannels !== 2) {
    throw new Error(`Unsupported WAV channel count: expected mono or stereo, got ${format.numChannels}`);
  }

  const bitrateKbps = options.bitrateKbps ?? DEFAULT_AUDIO_MP3_BITRATE_KBPS;
  const encoder = new Mp3Encoder(format.numChannels, format.sampleRate, bitrateKbps);
  const samples = readInt16PcmSamples(data);
  const chunks: Uint8Array[] = [];

  if (format.numChannels === 1) {
    for (let offset = 0; offset < samples.length; offset += MP3_SAMPLE_BLOCK_SIZE) {
      const encoded = encoder.encodeBuffer(samples.subarray(offset, offset + MP3_SAMPLE_BLOCK_SIZE));
      if (encoded.length > 0) chunks.push(encoded);
    }
  } else {
    const { left, right } = deinterleaveStereo(samples);
    for (let offset = 0; offset < left.length; offset += MP3_SAMPLE_BLOCK_SIZE) {
      const encoded = encoder.encodeBuffer(
        left.subarray(offset, offset + MP3_SAMPLE_BLOCK_SIZE),
        right.subarray(offset, offset + MP3_SAMPLE_BLOCK_SIZE)
      );
      if (encoded.length > 0) chunks.push(encoded);
    }
  }

  const finalChunk = encoder.flush();
  if (finalChunk.length > 0) chunks.push(finalChunk);

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}
