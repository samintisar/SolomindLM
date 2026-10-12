import type { ReferenceChunk, Source } from "@/shared/types/index";

/** True when the citation comes from a notebook paper that holds only its abstract (#480). */
export function isAbstractOnlyReference(
  reference: Pick<ReferenceChunk, "documentId">,
  sources: Source[]
): boolean {
  const id = reference.documentId?.trim();
  if (!id) return false;
  return sources.find((s) => s.id === id)?.paper?.ingestionStatus === "metadata_only";
}
