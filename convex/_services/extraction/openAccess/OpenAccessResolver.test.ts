import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  candidateKey,
  candidatesFromLocations,
  resolveOpenAccessCandidates,
} from "./OpenAccessResolver";

describe("candidatesFromLocations", () => {
  it("orders by version (published, accepted, submitted, unknown), PDF before HTML", () => {
    const out = candidatesFromLocations(
      [
        { pdfUrl: "https://repo.example.org/preprint.pdf", version: "submittedVersion" },
        {
          pdfUrl: "https://journal.example.com/article.pdf",
          version: "publishedVersion",
          license: "cc-by",
        },
        {
          landingUrl: "https://www.ncbi.nlm.nih.gov/pmc/articles/4221854",
          version: "acceptedVersion",
        },
        { pdfUrl: "https://uni.example.edu/accepted.pdf", version: "acceptedVersion" },
        { pdfUrl: "https://mirror.example.net/unknown.pdf" },
      ],
      []
    );
    expect(out.map((c) => [c.url, c.kind, c.version])).toEqual([
      ["https://journal.example.com/article.pdf", "pdf", "publishedVersion"],
      ["https://uni.example.edu/accepted.pdf", "pdf", "acceptedVersion"],
      ["https://pmc.ncbi.nlm.nih.gov/articles/PMC4221854/", "html", "acceptedVersion"],
      ["https://repo.example.org/preprint.pdf", "pdf", "submittedVersion"],
      ["https://mirror.example.net/unknown.pdf", "pdf", undefined],
    ]);
    expect(out[0]).toMatchObject({ license: "cc-by", host: "journal.example.com" });
  });

  it("turns arXiv locations into the arXiv PDF, from the URL or the OAI id", () => {
    const out = candidatesFromLocations(
      [
        { landingUrl: "http://arxiv.org/abs/1304.1068v2", version: "submittedVersion" },
        { pmhId: "oai:arXiv.org:hep-th/9901001", version: "submittedVersion" },
      ],
      []
    );
    expect(out.map((c) => c.url)).toEqual([
      "https://arxiv.org/pdf/1304.1068v2",
      "https://arxiv.org/pdf/hep-th/9901001",
    ]);
    expect(out.every((c) => c.kind === "pdf")).toBe(true);
  });

  it("turns a PMC id (bare or from a PMC PDF URL) into the PMC article page", () => {
    const out = candidatesFromLocations(
      [
        {
          pdfUrl: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC777/pdf/",
          version: "publishedVersion",
        },
      ],
      ["https://www.ncbi.nlm.nih.gov/pmc/articles/888"]
    );
    expect(out.map((c) => [c.url, c.kind])).toEqual([
      ["https://pmc.ncbi.nlm.nih.gov/articles/PMC777/", "html"],
      ["https://pmc.ncbi.nlm.nih.gov/articles/PMC888/", "html"],
    ]);
  });

  it("drops duplicates, keeping the version and licence another copy knew", () => {
    const out = candidatesFromLocations(
      [
        { pdfUrl: "http://journal.example.com/article.pdf#page=1" },
        {
          pdfUrl: "https://journal.example.com/article.pdf",
          version: "publishedVersion",
          license: "cc-by",
        },
      ],
      []
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      url: "https://journal.example.com/article.pdf",
      version: "publishedVersion",
      license: "cc-by",
    });
  });

  it("includes the record's own pdfUrl, matched to a known location's version", () => {
    const out = candidatesFromLocations(
      [{ pdfUrl: "https://journal.example.com/article.pdf", version: "publishedVersion" }],
      [],
      "https://journal.example.com/article.pdf"
    );
    expect(out).toHaveLength(1);
    expect(out[0].version).toBe("publishedVersion");
  });

  it("ignores non-http URLs", () => {
    expect(candidatesFromLocations([{ pdfUrl: "ftp://x.example/a.pdf" }], [])).toEqual([]);
  });
});

describe("candidateKey", () => {
  it("ignores scheme, case of host, trailing slash and fragment", () => {
    expect(candidateKey("http://PMC.ncbi.nlm.nih.gov/articles/PMC1/#x")).toBe(
      candidateKey("https://pmc.ncbi.nlm.nih.gov/articles/PMC1")
    );
  });
});

describe("resolveOpenAccessCandidates", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function route(routes: Record<string, { status: number; body?: unknown }>) {
    mockFetch.mockImplementation(async (url: string) => {
      const key = Object.keys(routes).find((k) => String(url).includes(k));
      const r = key ? routes[key] : { status: 404 };
      return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
        status: r.status,
      });
    });
  }

  it("merges Unpaywall and OpenAlex locations and sends a contact email to both", async () => {
    route({
      "api.unpaywall.org/v2/10.1038/nature12373": {
        status: 200,
        body: {
          oa_locations: [
            {
              url_for_pdf: "https://www.nature.com/articles/nature12373.pdf",
              url_for_landing_page: "https://doi.org/10.1038/nature12373",
              version: "publishedVersion",
              license: null,
            },
            {
              url_for_pdf: "https://arxiv.org/pdf/1304.1068",
              version: "submittedVersion",
              pmh_id: "oai:arXiv.org:1304.1068",
            },
          ],
        },
      },
      "api.openalex.org/works/doi:10.1038/nature12373": {
        status: 200,
        body: {
          ids: { pmcid: "https://www.ncbi.nlm.nih.gov/pmc/articles/4221854" },
          locations: [
            {
              is_oa: true,
              pdf_url: "https://www.nature.com/articles/nature12373.pdf",
              version: "publishedVersion",
            },
            { is_oa: false, landing_page_url: "https://pubmed.ncbi.nlm.nih.gov/23903748" },
          ],
        },
      },
    });

    const out = await resolveOpenAccessCandidates({ doi: "https://doi.org/10.1038/nature12373" });

    expect(out.map((c) => c.url)).toEqual([
      "https://www.nature.com/articles/nature12373.pdf",
      "https://arxiv.org/pdf/1304.1068",
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC4221854/",
    ]);
    const urls = mockFetch.mock.calls.map(([u]) => String(u));
    expect(urls.find((u) => u.includes("unpaywall"))).toMatch(/[?&]email=[^&]+%40/);
    expect(urls.find((u) => u.includes("openalex"))).toMatch(/[?&]mailto=[^&]+%40/);
  });

  it("looks a paper up on OpenAlex by id when it has no DOI, and skips Unpaywall", async () => {
    route({
      "api.openalex.org/works/W2159974629": {
        status: 200,
        body: { locations: [{ is_oa: true, pdf_url: "https://repo.example.org/a.pdf" }] },
      },
    });
    const out = await resolveOpenAccessCandidates({
      openAlexId: "https://openalex.org/W2159974629",
    });
    expect(out.map((c) => c.url)).toEqual(["https://repo.example.org/a.pdf"]);
    expect(mockFetch.mock.calls.some(([u]) => String(u).includes("unpaywall"))).toBe(false);
  });

  it("falls back to the record's pdfUrl when both lookups fail", async () => {
    route({
      "api.unpaywall.org": { status: 404 },
      "api.openalex.org": { status: 503 },
    });
    const out = await resolveOpenAccessCandidates({
      doi: "10.1/x",
      pdfUrl: "https://repo.example.org/x.pdf",
    });
    expect(out.map((c) => c.url)).toEqual(["https://repo.example.org/x.pdf"]);
  });

  it("retries a 429 once, then gives up without throwing", async () => {
    route({ "api.unpaywall.org": { status: 429 }, "api.openalex.org": { status: 429 } });
    const out = await resolveOpenAccessCandidates({ doi: "10.1/y" });
    expect(out).toEqual([]);
    expect(mockFetch.mock.calls.filter(([u]) => String(u).includes("unpaywall"))).toHaveLength(2);
  });

  it("makes no requests without a DOI or OpenAlex id", async () => {
    const out = await resolveOpenAccessCandidates({ pdfUrl: "https://arxiv.org/pdf/2005.11401" });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(out.map((c) => c.url)).toEqual(["https://arxiv.org/pdf/2005.11401"]);
  });
});
