import { describe, expect, it } from "vitest";
import { getPcmWavDurationSeconds } from "./wav";

/** Minimal mono PCM WAV @ 8kHz int16 for duration testing */
function makeSilentWav(seconds: number): Buffer {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const numSamples = Math.floor(seconds * sampleRate);
  const dataLength = numSamples * blockAlign;
  const data = Buffer.alloc(dataLength, 0);

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataLength, 40);

  return Buffer.concat([header, data]);
}

describe("getPcmWavDurationSeconds", () => {
  it("returns duration matching PCM data length and byteRate", () => {
    const buf = makeSilentWav(2);
    expect(getPcmWavDurationSeconds(buf)).toBeCloseTo(2, 5);
  });

  it("returns 0 for empty data chunk edge case", () => {
    const buf = makeSilentWav(0);
    expect(getPcmWavDurationSeconds(buf)).toBe(0);
  });
});
