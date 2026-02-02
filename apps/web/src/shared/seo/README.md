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
