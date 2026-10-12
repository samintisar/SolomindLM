import { describe, expect, it } from "vitest";
import { hostNeedingResolution, isBlockedIpAddress, isPublicHttpUrl } from "./publicUrl";

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
    "http://[::127.0.0.1]/x",
    "http://[64:ff9b::169.254.169.254]/x",
    "http://[64:ff9b:1::1]/x",
    "http://[2002:c0a8:101::1]/x",
  ])("blocks %s", (url) => {
    expect(isPublicHttpUrl(url)).toBe(false);
  });

  it("allows NAT64 and 6to4 addresses that carry a public IPv4 address", () => {
    expect(isPublicHttpUrl("http://[64:ff9b::8.8.8.8]/x")).toBe(true);
    expect(isPublicHttpUrl("http://[2002:808:808::1]/x")).toBe(true);
  });
});

describe("isBlockedIpAddress", () => {
  it.each([
    ["10.1.2.3", true],
    ["169.254.169.254", true],
    ["::1", true],
    ["::ffff:127.0.0.1", true],
    ["::ffff:7f00:1", true],
    ["64:ff9b::a00:1", true],
    ["fd12:3456::1", true],
    ["fe80::1%eth0", true],
    ["not-an-ip", true],
    ["93.184.216.34", false],
    ["2606:4700::1111", false],
  ])("%s → blocked %s", (address, blocked) => {
    expect(isBlockedIpAddress(address)).toBe(blocked);
  });
});

describe("hostNeedingResolution", () => {
  it("returns DNS names only", () => {
    expect(hostNeedingResolution("https://Repo.Example.org./a")).toBe("repo.example.org");
    expect(hostNeedingResolution("https://8.8.8.8/a")).toBeNull();
    expect(hostNeedingResolution("https://[2606:4700::1111]/a")).toBeNull();
  });
});
