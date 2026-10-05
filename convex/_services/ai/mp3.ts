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
    throw new Error(
      `Unsupported WAV channel count: expected mono or stereo, got ${format.numChannels}`
    );
  }

  const bitrateKbps = options.bitrateKbps ?? DEFAULT_AUDIO_MP3_BITRATE_KBPS;
  const encoder = new Mp3Encoder(format.numChannels, format.sampleRate, bitrateKbps);
  const samples = readInt16PcmSamples(data);
  const chunks: Uint8Array[] = [];

  if (format.numChannels === 1) {
    for (let offset = 0; offset < samples.length; offset += MP3_SAMPLE_BLOCK_SIZE) {
      const encoded = encoder.encodeBuffer(
        samples.subarray(offset, offset + MP3_SAMPLE_BLOCK_SIZE)
      );
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

/**
 * Joins MP3s encoded separately by {@link encodePcmWavToMp3}, one per synthesis chunk. lamejs
 * writes bare constant-bitrate frames with no ID3 tag or Xing/Info header, so the files join byte
 * for byte into one valid stream whose duration players compute from the bitrate. Each join adds
 * only the encoder's padding, tens of milliseconds between dialogue lines.
 */
export function concatenateMp3Buffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    throw new Error("No MP3 audio to join");
  }
  return Buffer.concat(buffers);
}

const MPEG1_L3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2_L3_KBPS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
/** Sample rates by version bits: 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5 (1 is reserved). */
const SAMPLE_RATES: Record<number, readonly number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

/**
 * Decoded length of an MP3 stream in milliseconds, counted from its Layer III frame headers.
 * This is what a player's clock reaches at the end of the file, encoder delay and padding
 * included, so it is the right offset for whatever audio is joined after it.
 */
export function getMp3DurationMs(buffer: Buffer): number {
  let offset = 0;
  let samples = 0;
  let sampleRate = 0;
  while (offset + 4 <= buffer.length) {
    const b1 = buffer[offset + 1];
    const b2 = buffer[offset + 2];
    if (buffer[offset] !== 0xff || (b1 & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }
    const version = (b1 >> 3) & 0x3;
    const layer = (b1 >> 1) & 0x3;
    const bitrateIndex = b2 >> 4;
    const rateIndex = (b2 >> 2) & 0x3;
    if (
      version === 1 ||
      layer !== 1 ||
      bitrateIndex === 0 ||
      bitrateIndex === 15 ||
      rateIndex === 3
    ) {
      offset += 1;
      continue;
    }
    const isMpeg1 = version === 3;
    const kbps = (isMpeg1 ? MPEG1_L3_KBPS : MPEG2_L3_KBPS)[bitrateIndex];
    const rate = SAMPLE_RATES[version][rateIndex];
    const samplesPerFrame = isMpeg1 ? 1152 : 576;
    const padding = (b2 >> 1) & 0x1;
    const frameLength = Math.floor(((samplesPerFrame / 8) * kbps * 1000) / rate) + padding;
    if (frameLength <= 4) {
      offset += 1;
      continue;
    }
    samples += samplesPerFrame;
    sampleRate = rate;
    offset += frameLength;
  }
  return sampleRate > 0 ? (samples / sampleRate) * 1000 : 0;
}
