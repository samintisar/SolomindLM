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

Public SEO URLs use the same canonical list as the sitemap (`getIndexablePublicSeoPages()` → `canonicalUrl()`).

On each production build:

1. `scripts/indexnow-sync.ts` diffs the registry against `scripts/indexnow-state.json`
2. Added, materially updated (`lastmod` changed), and removed URLs are enqueued (deduped)
3. The queue is flushed to `https://api.indexnow.org/indexnow` in batches
4. `{INDEXNOW_KEY}.txt` is written to `dist/` for host verification

Setup:

1. `bun run --cwd apps/web indexnow:generate-key`
2. Add `INDEXNOW_KEY` to Vercel production environment variables
3. Deploy; confirm `https://www.solomindlm.com/{INDEXNOW_KEY}.txt` returns the raw key
4. Verify submissions in Bing Webmaster Tools → IndexNow

Only public marketing/docs URLs are submitted — never authenticated app routes. Preview builds skip submission unless `INDEXNOW_SUBMIT=true`.
