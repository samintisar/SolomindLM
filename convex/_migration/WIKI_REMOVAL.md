# Wiki feature removal (production)

The `wikis` / `wikiArticles` tables are **removed from the schema** in this codebase. If a **legacy deployment** still contained wiki documents at the time of the schema deploy, those documents must be deleted **before** or **during** a migration window where the schema still allows those tables.

## Current branch (no wiki tables in schema)

- New deployments and this repo no longer define wiki tables.
- There is **no Convex function** in this repo that can delete rows from tables that are not in `schema.ts`.
- If production still has wiki tables from an older schema version, use one of these approaches:

1. **Two-step deploy (safest)**  
   - Deploy a temporary branch that still includes `wikis` / `wikiArticles` in `schema.ts`.  
   - Run a batched internal mutation (or dashboard script) to delete all rows.  
   - Deploy this branch that removes the tables from `schema.ts`.

2. **Convex dashboard / support**  
   - For one-off cleanup, coordinate with your team’s operational process for deleting orphaned data.

## Confirmation

After migration, verify there are no wiki-related documents in backups or exports that you still need.
