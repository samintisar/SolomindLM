import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { RegisteredPack } from "./types";

/** Extensions the ingestion pipeline (convex/documents/embeddingJob.ts) handles, with upload content types. */
export const SOURCE_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".md": "text/markdown",
  ".txt": "text/plain",
};

export interface SourceDigest {
  fileName: string;
  sha256: string;
}

export interface LocalSourceFile extends SourceDigest {
  contentType: string;
  bytes: Uint8Array;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sourceExtension(fileName: string): string {
  return extname(fileName).toLowerCase();
}

/** Read every source listed in the manifest, in manifest order. */
export function readPackSources({ pack, dir }: RegisteredPack): LocalSourceFile[] {
  return pack.sources.map((fileName) => {
    const bytes = new Uint8Array(readFileSync(join(dir, "sources", fileName)));
    return {
      fileName,
      sha256: sha256Hex(bytes),
      contentType: SOURCE_CONTENT_TYPES[sourceExtension(fileName)] ?? "application/octet-stream",
      bytes,
    };
  });
}
