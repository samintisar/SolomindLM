import { describe, expect, it } from "vitest";
import { CLUSTER_HUB_PAGES } from "@/features/landing/clusterHubPages";
import { INTENT_LANDING_PAGES } from "@/features/landing/intentLandingPages";
import { SEO_CONTENT_PAGES } from "@/features/landing/seoContentPages";
import { FREE_TOOL_PAGES } from "@/features/tools/toolPages";
import { isPublicPath } from "./isPublicPath";
import { DESIGN_GALLERY_ENABLED } from "./publicRoutes";

describe("isPublicPath", () => {
  it.each(["/", "/sign-in", "/privacy", "/terms", "/faq", "/pricing", "/tools/pdf-to-flashcards"])(
    "treats %s as public",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    }
  );

  it("treats every intent, cluster hub, SEO content and tool page as public", () => {
    const paths = [
      ...INTENT_LANDING_PAGES,
      ...CLUSTER_HUB_PAGES,
      ...SEO_CONTENT_PAGES,
      ...FREE_TOOL_PAGES,
    ].map((page) => page.path);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(isPublicPath(path), path).toBe(true);
    }
  });

  it.each([
    "/home",
    "/billing",
    "/folder/abc",
    "/notebook/abc",
    "/notebook/abc/table/t1",
    "/notebook/abc/report/r1",
    "/share/fork/token",
    "/admin/feedback",
    "/unknown",
    "/faq/extra",
    "/tools",
  ])("treats %s as an app route", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });

  it.each(["/sign-in/", "/faq/", "/privacy/", "/tools/pdf-to-flashcards/", "/FAQ"])(
    "matches %s like React Router does (trailing slash, case)",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    }
  );

  it("only treats /dev/design as public when the gallery is built", () => {
    expect(isPublicPath("/dev/design")).toBe(DESIGN_GALLERY_ENABLED);
  });
});
