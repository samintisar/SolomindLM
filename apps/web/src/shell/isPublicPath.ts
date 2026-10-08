import { matchRoutes } from "react-router-dom";
import { PUBLIC_ROUTES } from "./publicRoutes";

/**
 * Whether the lightweight public shell serves this URL. Matches against the public route table
 * itself, so it follows React Router's rules (trailing slash, case). Every other path, unknown
 * ones included, goes to the lazily loaded app shell.
 */
export function isPublicPath(pathname: string): boolean {
  return matchRoutes(PUBLIC_ROUTES, pathname) !== null;
}
