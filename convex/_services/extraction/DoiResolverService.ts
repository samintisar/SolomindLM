import { InputValidationError } from "../../_lib/errors";
import type { PaperRecord as BasePaperRecord } from "../../documents/paperRecord";

export interface PaperRecord extends BasePaperRecord {
  title: string;
  sourceType: "doi" | "bibtex" | "ris" | "zotero" | "mendeley" | "manual";
}

const DOI_REGEX = /^10\.\d{4,}\/.+/;

export class DoiResolverService {
  async resolve(doi: string): Promise<PaperRecord | null> {
    if (!DOI_REGEX.test(doi)) {
      throw new InputValidationError(`Invalid DOI format: ${doi}`, { field: "doi" });
    }

    return {
      title: "Stub Title",
      authors: [],
      abstract: "",
      doi,
      isOa: false,
      sourceType: "doi",
    };
  }

  async resolveBatch(dois: string[]): Promise<(PaperRecord | null)[]> {
    const invalidDois = dois.filter((doi) => !DOI_REGEX.test(doi));
    if (invalidDois.length > 0) {
      throw new InputValidationError(
        `Invalid DOI format(s): ${invalidDois.join(", ")}`,
        { field: "doi" }
      );
    }

    return dois.map((doi) => ({
      title: "Stub Title",
      authors: [],
      abstract: "",
      doi,
      isOa: false,
      sourceType: "doi",
    }));
  }
}
