# SEO metadata

This folder contains the `SEOMeta` component and structured-data helpers used for titles, descriptions, canonicals, and JSON-LD.

## Dynamic metadata for public notebooks (future)

When you add shareable notebook URLs (e.g. `/notebook/:id/public` or `/share/:id`), use `SEOMeta` in that route with metadata derived from the notebook:

- **title**: `${notebook.title} | SolomindLM`
- **description**: e.g. `AI research notebook with ${notebook.sourceCount} sources. ${notebook.description?.slice(0, 100) ?? ''}`
- **canonical**: `${BASE_URL}/notebook/${id}` (or the public URL)
- **noindex**: `notebook.isPrivate` (or equivalent) so private notebooks are not indexed

You can add a helper (e.g. `generateNotebookMetadata(notebook)`) in `SEOMeta.tsx` that returns these props for `SEOMeta`.

## Sitemap strategy

- **Static pages**: `public/sitemap.xml` lists `/`, `/privacy`, `/terms`. Update `lastmod` when you change those pages; add new static feature or blog URLs with appropriate `changefreq` and `priority`.
- **Dynamic content**: If you later have many public notebooks or blog posts, consider a server-generated sitemap or sitemap index (e.g. weekly for static, daily for dynamic).

## IndexNow

IndexNow reads the same URL list as search engines: `sitemap.xml`, generated from
`getIndexablePublicSeoPages()` by `buildSitemapXml()`.

1. During the build, `scripts/write-indexnow-key.ts` writes `{INDEXNOW_KEY}.txt` to `dist/` for host
   verification. Nothing is submitted at build time: the new deployment isn't live yet, and the build
   container keeps no state.
2. After Vercel reports a successful production deploy, `.github/workflows/indexnow.yml` runs
   `scripts/indexnow-post-deploy.ts`. It finds the previous production deployment through the GitHub
   Deployments API and diffs the two deployments' `sitemap.xml`.
3. Added, removed, and re-dated URLs are submitted to `https://api.indexnow.org/indexnow`. "Re-dated"
   means the page's `lastmod` changed. The sitemap omits `<lastmod>` for a page without one, so such a
   page is only submitted when it is new or when it gains a date.
4. If a sitemap can't be read or IndexNow rejects the request, the job fails. Deployments are
   immutable, so re-running it diffs the same two deployments and retries.

Setup:

1. `bun run --cwd apps/web indexnow:generate-key`
2. Add the key as `INDEXNOW_KEY` to Vercel production environment variables and as a GitHub repo
   secret
3. `VERCEL_AUTOMATION_BYPASS_SECRET` must be set on the `vercel-preview-bypass` GitHub environment
   (shared with `deployed-headers.yml`)
4. Deploy; confirm `https://www.solomindlm.com/{INDEXNOW_KEY}.txt` returns the raw key
5. Verify submissions in Bing Webmaster Tools → IndexNow

Only URLs in the sitemap are submitted — never authenticated app routes. Preview deployments are never submitted.
