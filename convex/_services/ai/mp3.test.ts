import { describe, expect, it } from "vitest";
import { encodePcmWavToMp3 } from "./mp3";

function makeSilentWav(seconds: number): Buffer {
  const sampleRate = 24000;
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

function startsLikeMp3(buffer: Buffer): boolean {
  const hasId3Tag = buffer.toString("ascii", 0, 3) === "ID3";
  const hasFrameSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  return hasId3Tag || hasFrameSync;
}

describe("encodePcmWavToMp3", () => {
  it("encodes PCM WAV speech audio into smaller MP3 bytes", () => {
    const wav = makeSilentWav(3);

    const mp3 = encodePcmWavToMp3(wav);

    expect(startsLikeMp3(mp3)).toBe(true);
    expect(mp3.length).toBeGreaterThan(0);
    expect(mp3.length).toBeLessThan(wav.length);
  });

  it("rejects buffers that are not PCM WAV audio", () => {
    expect(() => encodePcmWavToMp3(Buffer.from("not a wav"))).toThrow("Invalid WAV");
  });
});
