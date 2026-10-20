# Showcase notebooks: copy from dev to prod instead of reseeding

**Status:** built and rehearsed on dev (2026-10-20). Pharmacology Essentials, with 13 sources, 3,913 chunks, 5 Studio items and an audio file, copied into a "Showcase rehearsal" folder. Every Studio reference points at the copy's own sources, and the audio is re-stored and loads. Approved by the maintainer. Replaces Runbook step 7 of the [seed plan](2026-10-16-showcase-notebooks-seed.md#runbook-maintainer-after-the-pr-is-reviewed).

## Why

Reseeding prod would repeat the whole dev run: about 55 Studio items, a literature review and two deep-research reports on Together, plus Mistral OCR for every PDF and paper and OpenAI embeddings for every source. It would also produce *different* content from the reviewed dev copy, because generation isn't deterministic.

Copying the finished dev notebooks gives prod exactly what was reviewed, and costs no model calls.

## Approach

A local script moves one notebook at a time:

1. It reads the notebook from dev through internal export queries.
2. It writes it to a JSON bundle on disk.
3. It replays the bundle into prod through internal import mutations, which remap every id.

Stored files (PDF sources, audio overviews, infographic images) are fetched by URL and re-stored by a prod action.

**Rejected:** `npx convex export` / `import`. It moves whole tables or deployments: `--replace` would wipe prod tables and `--append` keeps dev ids. Neither can pick out one owner's notebooks or remap ids.

### What a notebook copy holds

The same set the in-app fork copies (`notebooks/_forkNotebook.ts`), so forked and copied notebooks look alike.

| Data | Notes |
| --- | --- |
| `notebooks` row | Re-created in the prod owner's "Showcase" folder, using `ensureNotebook`'s logic (icon, cover, chat mode). |
| `documents` | New ids, built into a `docIdMap`. A `file` source's PDF is re-stored, giving it a new `storageId`. The `fullTextPolicy` and `paperRecord` fields are kept. |
| `documentChunks` | Text and the **embedding** (same model on both deployments, `text-embedding-3-small`), so nothing is re-embedded. Imported in batches of about 100 to stay under the 8 MiB argument limit. |
| Studio rows | `reports`, `flashcards`, `quizzes`, `writtenQuestions`, `mindmaps`, `audioOverviews`, `infographics`, `spreadsheets`. Document ids in their metadata are remapped with the fork's `remapDocumentIds`. |
| `audioOverviews.audioStorageId` | The MP3 is re-stored and `metadata.synthesis` is dropped, as the fork does. |
| `infographics` | The PNG is re-stored, and `data`'s image URL and storage id are rewritten to point at prod. `sourceDocumentIds` is remapped. |
| `literatureTables`, `literatureReports`, `citations` | The Studio copies of the review and the deep research. Citation ids and `citation.documentId` are remapped. |
| Not copied | The owner's chat threads, review sessions, research plans and runs, notes, viewer progress and shares. Viewers never see them, and the seed already copied the review and research outputs into Studio. |

The prompt packs need no copying. `syncShowcasePrompts` writes them from code on prod at no cost.

### As built

The CLI can't carry chunk embeddings in its arguments (Windows limits a command line to about 32 KB). So the source deployment writes the bundle to its own file storage, and the target fetches it by URL:

```bash
# source (dev): one notebook → bundle; prints bundleUrl, storageIds and counts
npx convex run showcase/transferActions:exportBundle '{"ownerEmail":"…","slug":"econ-101-midterm-prep"}'
# target (prod): new notebook in the owner's Showcase folder (folderName only for rehearsals)
npx convex run --prod showcase/transferActions:importBundle '{"ownerEmail":"…","bundleUrl":"…"}'
# source, once the import is checked: remove the bundle's files
npx convex run showcase/transferActions:deleteBundle '{"storageIds":["…"]}'
```

- `transfer.ts` holds the database side: `exportNotebookRows`, `exportChunksPage`, `beginImport` (refuses a second copy), `insertRows` (rows must belong to the target notebook) and `abortImport`.
- `transferActions.ts` (Node) holds the bundles and files.
- `transferRemap.ts` rewrites every id, storage id and file URL. Before any row is written, it checks the row names nothing from the source deployment.
- A failed import deletes the rows it inserted, its notebook and its files. Notebook deletion doesn't cascade (`account/_purge.ts`), so this has to be explicit.

### Originally planned code (superseded by "As built")

- `exportNotebook({ ownerEmail, slug, table, cursor })`: a paginated internal query returning rows, plus a signed URL for every stored file.
- `importNotebook({ ownerEmail, bundleMeta })`: creates the notebook and documents and returns the id maps. It refuses if the owner already has that notebook in Showcase, so it can't import twice.
- `importChunks` and `importStudioRows`: batched inserts through the id maps.
- `importFile({ url })`: an action that fetches a dev file URL and returns a prod `storageId`.
- `scripts/showcase-transfer.ts`: export (dev) → bundle in `archive/showcase-bundles/` (gitignored) → import (prod). It runs one notebook at a time and resumes from the last finished table.

After import, `seedStatus` on prod should show each notebook as **done**, since the planner sees every source and Studio item. `seedShowcase({ publish: true })` then only publishes, features and syncs the prompts.

## Rollout

1. Write the code, with convex-test tests: export → import round trip in one test deployment, id remapping, refusing a second import, and file re-storing (mocked fetch).
2. **Rehearsal on dev:** copy all 10 notebooks into a second dev account. Then check that:
   - chat answers cite the right sources;
   - PDFs open;
   - audio plays and infographics show;
   - the literature table's citations open;
   - a fork of a copied notebook works.
3. You review the dev notebooks (the content step that's already planned) and approve.
4. **Prod, each step needing your go-ahead:**
   - Merge #529, #532, #544 and #551.
   - Deploy.
   - Sign up the owner account on prod.
   - Run the transfer for all 10 notebooks.
   - Check them unpublished.
   - Publish with `seedShowcase({ publish: true })`.

## Cost and effort

- **Cost:** no Together, Mistral or OpenAI calls. Only Convex function calls and about 100 to 300 MB of transfer: chunk embeddings are about 12 KB each, and there are a few thousand chunks.
- **Effort:** about half a day to write and test, plus the dev rehearsal.

## Risks

- **Ids buried in JSON** that the fork's remapping doesn't cover would still point at dev ids. The dev rehearsal and an "every id in the bundle maps to a prod id" check in the import catch these.
- **Infographic `data` shape:** the image URL field has to be found and rewritten. The rehearsal checks the image loads.
- **Schema drift:** if prod's schema is behind dev's, imports fail validation. Import only after the PRs are deployed to prod.
- **Owner id differs on prod:** the import takes the owner by email, never by id.
