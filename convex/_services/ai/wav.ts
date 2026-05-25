"use node";

export interface WavFormat {
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
}

export interface ParsedPcmWav {
  format: WavFormat;
  data: Buffer;
}

const RIFF_HEADER_SIZE = 44;
const PCM_AUDIO_FORMAT = 1;

function readChunkId(buffer: Buffer, offset: number): string {
  return buffer.toString("ascii", offset, offset + 4);
}

export function parsePcmWav(buffer: Buffer): ParsedPcmWav {
  if (buffer.length < RIFF_HEADER_SIZE) {
    throw new Error("Invalid WAV: file is too small");
  }

  if (readChunkId(buffer, 0) !== "RIFF" || readChunkId(buffer, 8) !== "WAVE") {
    throw new Error("Invalid WAV: missing RIFF/WAVE header");
  }

  let offset = 12;
  let format: WavFormat | null = null;
  let data: Buffer | null = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = readChunkId(buffer, offset);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkEnd > buffer.length) {
      throw new Error(`Invalid WAV: ${chunkId} chunk exceeds file size`);
    }

    if (chunkId === "fmt ") {
      if (chunkSize < 16) {
        throw new Error("Invalid WAV: fmt chunk is too small");
      }

      format = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        numChannels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        byteRate: buffer.readUInt32LE(chunkStart + 8),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    } else if (chunkId === "data") {
      data = buffer.subarray(chunkStart, chunkEnd);
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!format) {
    throw new Error("Invalid WAV: missing fmt chunk");
  }

  if (format.audioFormat !== PCM_AUDIO_FORMAT) {
    throw new Error(`Unsupported WAV format: expected PCM, got ${format.audioFormat}`);
  }

  if (!data) {
    throw new Error("Invalid WAV: missing data chunk");
  }

  return { format, data };
}

function assertSameFormat(first: WavFormat, next: WavFormat): void {
  if (
    first.audioFormat !== next.audioFormat ||
    first.numChannels !== next.numChannels ||
    first.sampleRate !== next.sampleRate ||
    first.byteRate !== next.byteRate ||
    first.blockAlign !== next.blockAlign ||
    first.bitsPerSample !== next.bitsPerSample
  ) {
    throw new Error("Cannot concatenate WAV files with different audio formats");
  }
}

function createPcmWavHeader(format: WavFormat, dataLength: number): Buffer {
  const header = Buffer.alloc(RIFF_HEADER_SIZE);
  const riffChunkSize = 36 + dataLength;

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(riffChunkSize, 4);
  header.write("WAVE", 8, "ascii");

  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(format.audioFormat, 20);
  header.writeUInt16LE(format.numChannels, 22);
  header.writeUInt32LE(format.sampleRate, 24);
  header.writeUInt32LE(format.byteRate, 28);
  header.writeUInt16LE(format.blockAlign, 32);
  header.writeUInt16LE(format.bitsPerSample, 34);

  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataLength, 40);

  return header;
}

/** Duration of PCM WAV audio in seconds (from `data` chunk length / `byteRate`). */
export function getPcmWavDurationSeconds(buffer: Buffer): number {
  const { format, data } = parsePcmWav(buffer);
  if (format.byteRate <= 0) return 0;
  return data.length / format.byteRate;
}

export function concatenateWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    throw new Error("Cannot concatenate zero WAV files");
  }

  const parsed = buffers.map(parsePcmWav);
  const format = parsed[0].format;

  for (const wav of parsed.slice(1)) {
    assertSameFormat(format, wav.format);
  }

  const dataLength = parsed.reduce((total, wav) => total + wav.data.length, 0);
  return Buffer.concat([createPcmWavHeader(format, dataLength), ...parsed.map((wav) => wav.data)]);
}
