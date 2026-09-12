import {
  buildWebViewAuthInjectScript,
  buildWebViewAuthPostMessageScript,
} from "./buildWebViewAuthInjectScript";

// Greedy `(.*)` plus a newline-excluding `.` are what make this safe against
// payload-shaped inputs: `JSON.stringify` never emits a raw newline, so a
// value containing e.g. `;\nvar jwt = "pwned` can't smuggle a second
// assignment past the regex — the capture always spans to the last `;` on
// the matched line, which can only close the real literal or fail to parse.
function extractLiteral(script: string, varName: string): unknown {
  const match = script.match(new RegExp(`var ${varName} = (.*);`));
  if (!match) throw new Error(`no assignment found for ${varName} in script`);
  return JSON.parse(match[1]);
}

describe("buildWebViewAuthInjectScript", () => {
  it("embeds the deployment URL and JWT as valid JSON literals", () => {
    const script = buildWebViewAuthInjectScript(
      "https://foo-bar-123.convex.cloud",
      "jwt-token-abc"
    );

    expect(extractLiteral(script, "CONVEX_URL")).toBe("https://foo-bar-123.convex.cloud");
    expect(extractLiteral(script, "jwt")).toBe("jwt-token-abc");
  });

  it('embeds a null JWT as the JSON literal null, not the string "null"', () => {
    const script = buildWebViewAuthInjectScript("https://foo-bar-123.convex.cloud", null);

    expect(extractLiteral(script, "jwt")).toBeNull();
  });

  it("safely escapes a JWT containing quotes, backslashes, and newlines", () => {
    const trickyJwt = 'part-one\\part-two"quoted"\npart-three';
    const script = buildWebViewAuthInjectScript("https://foo-bar-123.convex.cloud", trickyJwt);

    expect(extractLiteral(script, "jwt")).toBe(trickyJwt);
  });

  it("derives the namespace by stripping non-alphanumeric characters from the deployment URL", () => {
    const script = buildWebViewAuthInjectScript("https://foo-bar-123.convex.cloud", "tok");

    expect(script).toContain('var ns = CONVEX_URL.replace(/[^a-zA-Z0-9]/g, "")');
  });

  it("emits syntactically valid JavaScript", () => {
    const trickyJwt = 'part-one\\part-two"quoted"\npart-three';
    expect(
      () =>
        new Function(buildWebViewAuthInjectScript("https://foo-bar-123.convex.cloud", trickyJwt))
    ).not.toThrow();
  });
});

describe("buildWebViewAuthPostMessageScript", () => {
  it("embeds a payload that round-trips through JSON.parse", () => {
    const script = buildWebViewAuthPostMessageScript(
      "https://foo-bar-123.convex.cloud",
      "jwt-token-abc"
    );

    expect(extractLiteral(script, "data")).toEqual({
      type: "native-auth:tokens",
      deploymentUrl: "https://foo-bar-123.convex.cloud",
      jwt: "jwt-token-abc",
    });
  });

  it("embeds a null JWT as null in the payload", () => {
    const script = buildWebViewAuthPostMessageScript("https://foo-bar-123.convex.cloud", null);
    const payload = extractLiteral(script, "data") as { jwt: unknown };

    expect(payload.jwt).toBeNull();
  });

  it("emits syntactically valid JavaScript", () => {
    const trickyJwt = 'part-one\\part-two"quoted"\npart-three';
    expect(
      () =>
        new Function(
          buildWebViewAuthPostMessageScript("https://foo-bar-123.convex.cloud", trickyJwt)
        )
    ).not.toThrow();
  });
});
