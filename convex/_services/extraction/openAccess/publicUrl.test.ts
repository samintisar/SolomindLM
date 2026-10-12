import { describe, expect, it } from "vitest";
import { isPublicHttpUrl } from "./publicUrl";

describe("isPublicHttpUrl", () => {
  it("allows public http(s) hosts", () => {
    expect(isPublicHttpUrl("https://arxiv.org/pdf/1304.1068")).toBe(true);
    expect(isPublicHttpUrl("http://repository.example.edu:8080/a.pdf")).toBe(true);
    expect(isPublicHttpUrl("https://8.8.8.8/x")).toBe(true);
    expect(isPublicHttpUrl("https://[2606:4700::1111]/x")).toBe(true);
  });

  it.each([
    "ftp://example.org/a.pdf",
    "file:///etc/passwd",
    "not a url",
    "http://user:pw@example.org/",
    "http://localhost/x",
    "http://LOCALHOST./x",
    "http://intranet/x",
    "http://db.internal/x",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://printer.local/x",
    "http://127.0.0.1/x",
    "http://2130706433/x",
    "http://0x7f.0.0.1/x",
    "http://10.0.0.5/x",
    "http://172.16.0.1/x",
    "http://192.168.1.1/x",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/x",
    "http://0.0.0.0/x",
    "http://224.0.0.1/x",
    "http://[::1]/x",
    "http://[::ffff:127.0.0.1]/x",
    "http://[fd00::1]/x",
    "http://[fe80::1]/x",
  ])("blocks %s", (url) => {
    expect(isPublicHttpUrl(url)).toBe(false);
  });
});
