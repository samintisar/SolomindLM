import { describe, expect, test } from "vitest";
import { leftoverSourceRefs, remapDeep, withoutSystemFields } from "./transferRemap";

const DOC = "j578r20mjb2t3dzxk58y10z5gx8gjhqe";
const NEW_DOC = "k111111111111111111111111111111a";
const CITE = "q57bmq7mvbbsase2sf0nedbhzd8gjd0z";
const URL = "https://dev-host.convex.cloud/api/storage/kg2aaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NEW_URL = "https://prod-host.convex.cloud/api/storage/kg2bbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("remapDeep", () => {
  const ids = new Map([[DOC, NEW_DOC]]);
  const exact = new Map([[URL, NEW_URL]]);

  test("rewrites ids in fields, arrays and inside text, and file URLs whole", () => {
    const row = {
      documentId: DOC,
      metadata: { documentIds: [DOC, DOC], note: `see [1](source:${DOC})` },
      data: { imageUrl: URL },
      embedding: [0.1, 0.2],
      count: 3,
    };
    expect(remapDeep(row, ids, exact)).toEqual({
      documentId: NEW_DOC,
      metadata: { documentIds: [NEW_DOC, NEW_DOC], note: `see [1](source:${NEW_DOC})` },
      data: { imageUrl: NEW_URL },
      embedding: [0.1, 0.2],
      count: 3,
    });
  });

  test("leaves unknown tokens alone", () => {
    expect(remapDeep({ x: CITE }, ids, exact)).toEqual({ x: CITE });
  });
});

describe("leftoverSourceRefs", () => {
  test("names source ids and the source host still present", () => {
    expect(
      leftoverSourceRefs({ a: CITE, b: NEW_DOC, c: URL }, new Set([CITE, DOC]), "dev-host")
    ).toEqual([CITE, "dev-host"]);
    expect(leftoverSourceRefs({ a: NEW_DOC }, new Set([CITE, DOC]), "dev-host")).toEqual([]);
  });
});

test("withoutSystemFields drops _id and _creationTime", () => {
  expect(withoutSystemFields({ _id: DOC, _creationTime: 1, title: "T" })).toEqual({ title: "T" });
});
