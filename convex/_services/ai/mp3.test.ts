import { describe, expect, it } from "vitest";
import { concatenateMp3Buffers, encodePcmWavToMp3, getMp3DurationMs } from "./mp3";

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

describe("concatenateMp3Buffers", () => {
  it("joins chunk MP3s in order", () => {
    const joined = concatenateMp3Buffers([Buffer.from([1, 2, 3]), Buffer.from([4, 5])]);

    expect([...joined]).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects an empty list", () => {
    expect(() => concatenateMp3Buffers([])).toThrow("No MP3 audio to join");
  });

  // Byte-level joining is only valid while the encoder writes bare frames with no header block.
  it("joins encoder output that has no ID3 tag or Xing/Info header", () => {
    const chunk = encodePcmWavToMp3(makeSilentWav(1));

    expect(chunk[0] === 0xff && (chunk[1] & 0xe0) === 0xe0).toBe(true);
    expect(chunk.includes("Xing")).toBe(false);
    expect(chunk.includes("Info")).toBe(false);
    const joined = concatenateMp3Buffers([chunk, chunk]);
    expect(joined.length).toBe(chunk.length * 2);
    expect(joined[chunk.length] === 0xff && (joined[chunk.length + 1] & 0xe0) === 0xe0).toBe(true);
  });
});

describe("getMp3DurationMs", () => {
  it("measures the decoded length of an encoded MP3", () => {
    const ms = getMp3DurationMs(encodePcmWavToMp3(makeSilentWav(2)));
    // LAME adds encoder delay and end padding (a few frames at most).
    expect(ms).toBeGreaterThanOrEqual(2000);
    expect(ms).toBeLessThan(2200);
  });

  it("adds up across joined MP3s", () => {
    const a = encodePcmWavToMp3(makeSilentWav(1));
    const b = encodePcmWavToMp3(makeSilentWav(1.5));
    expect(getMp3DurationMs(concatenateMp3Buffers([a, b]))).toBeCloseTo(
      getMp3DurationMs(a) + getMp3DurationMs(b),
      5
    );
  });

  it("returns 0 for bytes with no MPEG frames", () => {
    expect(getMp3DurationMs(Buffer.from("not audio at all"))).toBe(0);
  });
});
