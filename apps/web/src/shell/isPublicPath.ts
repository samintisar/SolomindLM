import { isClusterHubPath } from "@/features/landing/clusterHubPages";
import { isIntentLandingPath } from "@/features/landing/intentLandingPages";
import { isSeoContentPath } from "@/features/landing/seoContentPages";
import { getToolPageByPath } from "@/features/tools/toolPages";

/** Dev-only ui gallery (/dev/design). A build-time constant so production builds drop the chunk. */
export const DESIGN_GALLERY_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_DESIGN_GALLERY === "1";

const STATIC_PUBLIC_PATHS = new Set(["/", "/sign-in", "/privacy", "/terms", "/faq"]);

/**
 * Routes served by the lightweight public shell (marketing, legal, sign-in, free tools). Every
 * other path, unknown ones included, goes to the lazily loaded app shell.
 */
export function isPublicPath(
  pathname: string,
  { designGallery = DESIGN_GALLERY_ENABLED }: { designGallery?: boolean } = {}
): boolean {
  return (
    STATIC_PUBLIC_PATHS.has(pathname) ||
    (designGallery && pathname === "/dev/design") ||
    getToolPageByPath(pathname) !== undefined ||
    isIntentLandingPath(pathname) ||
    isClusterHubPath(pathname) ||
    isSeoContentPath(pathname)
  );
}
