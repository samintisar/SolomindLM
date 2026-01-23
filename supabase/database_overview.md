# Database Schema & RLS Policies Overview

**Generated:** 2026-01-19  
**Total Tables:** 19  
**RLS Enabled:** All tables have RLS enabled

---

## Table of Contents

1. [Database Schema](#database-schema)
2. [Row Level Security Policies](#row-level-security-policies)
3. [Storage Policies](#storage-policies)
4. [Entity Relationships](#entity-relationships)

---

## Database Schema

### 1. `audio_overviews`
Stores AI-generated audio overview content with multiple format options.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | User owner |
| `notebook_id` | uuid | NO | - | Foreign key → `notebooks.id` |
| `title` | text | NO | - | Audio overview title |
| `transcript` | text | YES | - | Transcript text |
| `status` | text | NO | `'draft'` | Status: draft, generating, completed, failed |
| `metadata` | jsonb | YES | `'{}'` | Additional metadata |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Update timestamp |
| `audio_type` | text | YES | - | Type: deep_dive, brief, critique, debate |
| `audio_url` | text | YES | - | Public URL to audio file in storage |

**RLS:** ✅ Enabled

---

### 2. `conversations`
Chat conversations linked to notebooks.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `notebook_id` | uuid | NO | - | Foreign key → `notebooks.id` |
| `user_id` | uuid | NO | - | User owner |
| `title` | text | YES | - | Conversation title |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Update timestamp |

**RLS:** ✅ Enabled

---

### 3. `document_chunks`
Chunked document content with embeddings for vector search.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `document_id` | uuid | YES | - | Foreign key → `documents.id` |
| `user_id` | uuid | NO | - | User owner |
| `notebook_id` | uuid | NO | - | Foreign key → `notebooks.id` |
| `chunk_index` | integer | NO | - | Chunk position in document |
| `content` | text | NO | - | Chunk content |
| `embedding` | vector | YES | - | Vector embedding for search |
| `metadata` | jsonb | YES | `'{}'` | Additional metadata |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `content_tsv` | tsvector | YES | - | Full-text search vector |

**RLS:** ✅ Enabled

---

### 4. `documents`
Uploaded documents/files.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | User owner |
| `notebook_id` | uuid | NO | - | Foreign key → `notebooks.id` |
| `title` | text | YES | - | Document title |
| `file_name` | text | YES | - | Original filename |
| `file_type` | text | YES | - | File MIME type |
| `file_url` | text | YES | - | Storage URL |
| `status` | text | YES | `'pending'` | Processing status |
| `metadata` | jsonb | YES | `'{}'` | Additional metadata |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Update timestamp |

**RLS:** ✅ Enabled

---

### 5. `flashcards`
Flashcard sets generated from notebooks.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | User owner |
| `notebook_id` | uuid | NO | - | Foreign key → `notebooks.id` |
| `title` | text | NO | - | Flashcard set title |
| `status` | text | YES | `'draft'` | Status: draft, generating, completed, failed |
| `cards_data` | jsonb | YES | `'[]'` | Array of flashcard objects |
| `metadata` | jsonb | YES | `'{}'` | Additional metadata |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Update timestamp |

**RLS:** ✅ Enabled

---

### 6. `messages`
Chat messages within conversations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `conversation_id` | uuid | NO | - | Foreign key → `conversations.id` |
| `user_id` | uuid | NO | - | User owner |
| `role` | text | NO | - | Message role: user, assistant, system |
| `content` | text | NO | - | Message content |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `references` | jsonb | YES | `'[]'` | Array of reference objects with citations |
| `metadata` | jsonb | YES | `'{}'` | Additional metadata (model, tokens, etc.) |

**RLS:** ✅ Enabled

---

### 7. `mindmaps`
Mind map visualizations generated from notebooks.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | User owner |
| `notebook_id` | uuid | NO | - | Foreign key → `notebooks.id` |
| `title` | text | NO | - | Mind map title |
| `data` | jsonb | NO | `'{}'` | Mind map structure data |
| `status` | text | NO | `'draft'` | Status: draft, generating, completed, failed |
| `metadata` | jsonb | YES | `'{}'` | Additional metadata |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Update timestamp |

**RLS:** ✅ Enabled

---

### 8. `notebook_folders`
Organizational folders for notebooks.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | User owner |
| `name` | text | NO | - | Folder name |
| `color` | text | YES | `'bg-blue-500'` | UI color class |
| `icon` | text | YES | `'Folder'` | Icon identifier |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Update timestamp |

**RLS:** ✅ Enabled

---

### 9. `notebooks`
Main notebook entities.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | User owner |
| `title` | text | NO | - | Notebook title |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Update timestamp |
| `metadata` | jsonb | YES | `'{}'` | Additional metadata |
| `folder_id` | uuid | YES | - | Foreign key → `notebook_folders.id` |

**RLS:** ✅ Enabled

---

### 10. `notes`
Notes within notebooks (manual or generated reports).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | User owner |
| `notebook_id` | uuid | NO | - | Foreign key → `notebooks.id` |
| `title` | text | NO | - | Note title |
| `content` | text | NO | - | Note content |
| `note_type` | text | NO | `'manual'` | Type: manual, report |
| `metadata` | jsonb | YES | `'{}'` | Additional metadata |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Update timestamp |
| `status` | text | YES | `'completed'` | Status: draft, generating, completed, failed |

**RLS:** ✅ Enabled

---

### 11. `quizzes`
Quiz sets generated from notebooks.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | User owner |
| `notebook_id` | uuid | NO | - | Foreign key → `notebooks.id` |
| `title` | text | NO | - | Quiz title |
| `questions_data` | jsonb | YES | `'[]'` | Array of question objects |
| `status` | text | NO | `'draft'` | Status: draft, generating, completed, failed |
| `metadata` | jsonb | YES | `'{}'` | Additional metadata |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Update timestamp |

**RLS:** ✅ Enabled

---

### 12. `spreadsheets`
AI-generated spreadsheets from notebooks.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | User owner |
| `notebook_id` | uuid | NO | - | Foreign key → `notebooks.id` |
| `title` | text | NO | - | Spreadsheet title |
| `data` | jsonb | NO | `'{}'` | Spreadsheet structure data |
| `status` | text | NO | `'draft'` | Status: draft, generating, completed, failed |
| `metadata` | jsonb | YES | `'{}'` | Additional metadata |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Update timestamp |

**RLS:** ✅ Enabled

---

### 14. `rate_limit_config`
Configuration for rate limiting by tier and service type.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `tier` | text | NO | - | Tier: free, pro |
| `service_type` | text | NO | - | Service identifier |
| `daily_limit` | integer | NO | - | Daily request limit |
| `created_at` | timestamptz | NO | `now()` | Creation timestamp |
| `updated_at` | timestamptz | NO | `now()` | Update timestamp |

**RLS:** ✅ Enabled

---

### 15. `rate_limit_usage`
Tracks daily usage per user and service type.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | User owner |
| `service_type` | text | NO | - | Service identifier |
| `usage_date` | date | NO | `CURRENT_DATE` | Date of usage |
| `count` | integer | NO | `0` | Usage count |
| `reset_at` | timestamptz | NO | `CURRENT_DATE + 1 day` | Reset timestamp |
| `created_at` | timestamptz | NO | `now()` | Creation timestamp |
| `updated_at` | timestamptz | NO | `now()` | Update timestamp |

**RLS:** ✅ Enabled

---

### 15. `stripe_payment_history`
Payment history from Stripe invoices.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | User owner |
| `subscription_id` | uuid | NO | - | Foreign key → `stripe_subscriptions.id` |
| `stripe_invoice_id` | text | NO | - | Stripe invoice ID (unique) |
| `stripe_payment_intent_id` | text | YES | - | Stripe payment intent ID |
| `status` | text | NO | - | Status: draft, open, paid, void, uncollectible, deleted |
| `amount` | integer | NO | - | Amount in cents |
| `currency` | text | NO | `'usd'` | Currency code |
| `due_date` | timestamptz | YES | - | Payment due date |
| `paid_at` | timestamptz | YES | - | Payment timestamp |
| `metadata` | jsonb | YES | `'{}'` | Additional metadata |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |

**RLS:** ✅ Enabled

---

### 15. `stripe_subscriptions`
Stripe subscription records.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | User owner |
| `stripe_subscription_id` | text | NO | - | Stripe subscription ID (unique) |
| `stripe_customer_id` | text | NO | - | Stripe customer ID |
| `stripe_price_id` | text | NO | - | Stripe price ID |
| `status` | text | NO | - | Status: active, past_due, canceled, unpaid, incomplete, incomplete_expired, trialing, paused |
| `current_period_start` | timestamptz | NO | - | Period start |
| `current_period_end` | timestamptz | NO | - | Period end |
| `cancel_at_period_end` | boolean | YES | `false` | Cancel at period end flag |
| `interval` | text | NO | - | Billing interval: month, year |
| `amount` | integer | NO | - | Amount in cents |
| `currency` | text | NO | `'usd'` | Currency code |
| `metadata` | jsonb | YES | `'{}'` | Additional metadata |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Update timestamp |

**RLS:** ✅ Enabled

---

### 17. `stripe_webhook_events`
Stripe webhook event tracking.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `stripe_event_id` | text | NO | - | Stripe event ID (unique) |
| `event_type` | text | NO | - | Event type name |
| `processed` | boolean | YES | `false` | Processing status |
| `error_message` | text | YES | - | Error message if failed |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `processed_at` | timestamptz | YES | - | Processing timestamp |

**RLS:** ✅ Enabled

---

### 18. `user_profiles`
User profile and subscription tier information.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | User ID (unique, references auth.users) |
| `tier` | text | NO | `'free'` | Subscription tier: free, pro |
| `created_at` | timestamptz | NO | `now()` | Creation timestamp |
| `updated_at` | timestamptz | NO | `now()` | Update timestamp |
| `subscription_id` | uuid | YES | - | Foreign key → `stripe_subscriptions.id` |

**RLS:** ✅ Enabled

---

### 19. `written_questions`
Written question sets (short answer or essay) generated from notebooks.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | User owner |
| `notebook_id` | uuid | NO | - | Foreign key → `notebooks.id` |
| `title` | text | NO | - | Question set title |
| `questions_data` | jsonb | NO | `'[]'` | Array of question objects |
| `status` | text | NO | `'draft'` | Status: draft, generating, completed, failed |
| `metadata` | jsonb | NO | `'{}'` | Additional metadata |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Update timestamp |
| `question_type` | text | NO | - | Type: short (5 pts), essay (12 pts) |

**RLS:** ✅ Enabled

---

## Row Level Security Policies

All tables have RLS enabled. Policies are organized by table and operation type.

### `audio_overviews`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can view their own audio overviews | SELECT | `auth.uid() = user_id` |
| Users can insert their own audio overviews | INSERT | `auth.uid() = user_id` (WITH CHECK) |
| Users can update their own audio overviews | UPDATE | `auth.uid() = user_id` (USING & WITH CHECK) |
| Users can delete their own audio overviews | DELETE | `auth.uid() = user_id` |

---

### `conversations`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can view their own conversations | SELECT | `user_id = auth.uid()` |
| Users can insert their own conversations | INSERT | `user_id = auth.uid()` (WITH CHECK) |
| Users can update their own conversations | UPDATE | `user_id = auth.uid()` (USING & WITH CHECK) |
| Users can delete their own conversations | DELETE | `user_id = auth.uid()` |

---

### `document_chunks`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can view chunks from their documents | SELECT | `document_id IN (SELECT documents.id FROM documents WHERE auth.uid() = documents.user_id)` |
| Users can insert chunks for their documents | INSERT | `document_id IN (SELECT documents.id FROM documents WHERE auth.uid() = documents.user_id)` (WITH CHECK) |
| Users can update chunks in their documents | UPDATE | `document_id IN (SELECT documents.id FROM documents WHERE auth.uid() = documents.user_id)` (USING & WITH CHECK) |
| Users can delete chunks from their documents | DELETE | `document_id IN (SELECT documents.id FROM documents WHERE auth.uid() = documents.user_id)` |

---

### `documents`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can view their own documents | SELECT | `auth.uid() = user_id` |
| Users can insert their own documents | INSERT | `auth.uid() = user_id` (WITH CHECK) |
| Users can update their own documents | UPDATE | `auth.uid() = user_id` (USING & WITH CHECK) |
| Users can delete their own documents | DELETE | `auth.uid() = user_id` |

---

### `flashcards`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can only see their own flashcards | SELECT | `user_id = auth.uid()` |
| Users can only create their own flashcards | INSERT | `user_id = auth.uid()` (WITH CHECK) |
| Users can only update their own flashcards | UPDATE | `user_id = auth.uid()` (USING & WITH CHECK) |
| Users can only delete their own flashcards | DELETE | `user_id = auth.uid()` |

---

### `messages`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can view own messages | SELECT | `EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid())` |
| Users can insert own messages | INSERT | `EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid())` (WITH CHECK) |
| Users can update own messages | UPDATE | `EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid())` (USING & WITH CHECK) |
| Users can delete own messages | DELETE | `EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid())` |

**Note:** Policies check via `conversations` table to ensure messages belong to conversations owned by the user. This provides better security than checking `user_id` directly.

---

### `mindmaps`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can view their own mindmaps | SELECT | `user_id = auth.uid()` |
| Users can insert their own mindmaps | INSERT | `user_id = auth.uid()` (WITH CHECK) |
| Users can update their own mindmaps | UPDATE | `user_id = auth.uid()` (USING & WITH CHECK) |
| Users can delete their own mindmaps | DELETE | `user_id = auth.uid()` |

---

### `notebook_folders`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can view their own folders | SELECT | `auth.uid() = user_id` |
| Users can create their own folders | INSERT | `auth.uid() = user_id` (WITH CHECK) |
| Users can update their own folders | UPDATE | `auth.uid() = user_id` (USING & WITH CHECK) |
| Users can delete their own folders | DELETE | `auth.uid() = user_id` |

---

### `notebooks`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can view their own notebooks | SELECT | `user_id = auth.uid()` |
| Users can insert their own notebooks | INSERT | `user_id = auth.uid()` (WITH CHECK) |
| Users can update their own notebooks | UPDATE | `user_id = auth.uid()` (USING & WITH CHECK) |
| Users can delete their own notebooks | DELETE | `user_id = auth.uid()` |

---

### `notes`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can view their own notes | SELECT | `user_id = auth.uid()` |
| Users can insert their own notes | INSERT | `user_id = auth.uid()` (WITH CHECK) |
| Users can update their own notes | UPDATE | `user_id = auth.uid()` (USING & WITH CHECK) |
| Users can delete their own notes | DELETE | `user_id = auth.uid()` |

---

### `quizzes`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can view their own quizzes | SELECT | `auth.uid() = user_id` |
| Users can insert their own quizzes | INSERT | `auth.uid() = user_id` (WITH CHECK) |
| Users can update their own quizzes | UPDATE | `auth.uid() = user_id` (USING) |
| Users can delete their own quizzes | DELETE | `auth.uid() = user_id` |

---

### `spreadsheets`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can view their own spreadsheets | SELECT | `auth.uid() = user_id` |
| Users can insert their own spreadsheets | INSERT | `auth.uid() = user_id` (WITH CHECK) |
| Users can update their own spreadsheets | UPDATE | `auth.uid() = user_id` (USING & WITH CHECK) |
| Users can delete their own spreadsheets | DELETE | `auth.uid() = user_id` |

---

### `rate_limit_config`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Anyone can read rate limit config | SELECT | `true` |
| Service can manage rate limit config | ALL | `true` (USING & WITH CHECK) |

---

### `rate_limit_usage`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can read own usage, service can manage | SELECT | `auth.uid() = user_id OR true` |
| Service can manage rate limit usage | ALL | `true` (USING & WITH CHECK) |

---

### `stripe_payment_history`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can view their own payment history | SELECT | `user_id = auth.uid()` |
| Service role can manage payments | ALL | `auth.role() = 'service_role'` |

---

### `stripe_subscriptions`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can view their own subscriptions | SELECT | `user_id = auth.uid()` (authenticated role) |
| Allow service role inserts | INSERT | `true` (WITH CHECK) |
| Allow service role updates | UPDATE | `true` (USING & WITH CHECK) |
| Allow service role deletes | DELETE | `true` |

---

### `stripe_webhook_events`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Service role manages webhook events | ALL | `auth.role() = 'service_role'` |

---

### `user_profiles`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| Users can read own profile | SELECT | `auth.uid() = user_id` |
| Users can update own profile | UPDATE | `auth.uid() = user_id` (USING) |

**Note:** No INSERT or DELETE policies. INSERT likely handled by triggers/functions. DELETE may be restricted.

---

### `written_questions`

| Policy Name | Operation | Expression |
|-------------|-----------|------------|
| written_questions_user_access | ALL | `auth.uid() = user_id` |

**Note:** Single ALL policy covers all operations (SELECT, INSERT, UPDATE, DELETE).

---

## Storage Policies

### `storage.objects` (Documents Bucket)

| Policy Name | Operation | Roles | Expression |
|-------------|-----------|-------|------------|
| Allow service role to manage documents | ALL | service_role | `bucket_id = 'documents'` |
| Users can upload to own folder | INSERT | authenticated | `bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text` (WITH CHECK) |
| Users can view own files | SELECT | authenticated | `bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text` |
| Users can update own files | UPDATE | authenticated | `bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text` (USING & WITH CHECK) |
| Users can delete own files | DELETE | authenticated | `bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text` |

**Note:** Policies use user-specific folders (`auth.uid()::text`) which matches the code's folder structure (`userId/noteId/filename`). This ensures users can only access files in their own folder.

---

## Entity Relationships

### Core Hierarchy

```
user_profiles (user_id → auth.users.id)
  └── notebook_folders (user_id)
      └── notebooks (user_id, folder_id → notebook_folders.id)
          ├── notes (notebook_id → notebooks.id)
          ├── documents (notebook_id → notebooks.id)
          │   └── document_chunks (document_id → documents.id, notebook_id → notebooks.id)
          ├── conversations (notebook_id → notebooks.id)
          │   └── messages (conversation_id → conversations.id)
          ├── flashcards (notebook_id → notebooks.id)
          ├── quizzes (notebook_id → notebooks.id)
          ├── mindmaps (notebook_id → notebooks.id)
          ├── audio_overviews (notebook_id → notebooks.id)
          ├── written_questions (notebook_id → notebooks.id)
          └── spreadsheets (notebook_id → notebooks.id)
```

### Billing Hierarchy

```
user_profiles (user_id → auth.users.id)
  └── stripe_subscriptions (user_id, id)
      ├── stripe_payment_history (subscription_id → stripe_subscriptions.id)
      └── user_profiles.subscription_id → stripe_subscriptions.id
```

### Rate Limiting

```
rate_limit_config (tier, service_type)
  └── rate_limit_usage (user_id, service_type)
```

### Webhooks

```
stripe_webhook_events (independent, tracks Stripe events)
```

---

## Security Summary

### ✅ Strengths

1. **RLS Enabled:** All 18 tables have RLS enabled
2. **User Isolation:** Most tables properly isolate data by `user_id`
3. **Service Role Protection:** Sensitive operations (payments, webhooks) restricted to service role
4. **Cascading Security:** `document_chunks` properly checks ownership via parent `documents` table

### ✅ Recent Fixes (2026-01-11)

1. **Messages Table:** ✅ Updated policies to check via `conversations` table for enhanced security
2. **Storage Policies:** ✅ Fixed to use user-specific folders (`auth.uid()::text`) matching code structure
3. **Removed Overly Permissive Policies:** ✅ Removed policies that allowed access to shared `'private'` folder

### ⚠️ Minor Issues

1. **User Profiles:** No INSERT/DELETE policies documented (may be handled by triggers)
2. **Written Questions:** Uses single ALL policy instead of separate operation policies

### 📋 Recommendations

1. ✅ ~~Update `messages` policies to check via `conversations` table~~ - **FIXED**
2. ✅ ~~Review and update storage policies to match user-specific folder structure~~ - **FIXED**
3. Add explicit INSERT/DELETE policies for `user_profiles` or document trigger-based handling
4. Consider splitting `written_questions` ALL policy into separate operation policies for clarity

---

**Last Updated:** 2026-01-19  
**Recent Changes:** 
- Added `spreadsheets` table for AI-generated spreadsheets from notebooks
- Storage policies and messages security policies updated to match code structure and best practices
- Documents table schema fixed: `note_id` renamed to `notebook_id` with foreign key constraint to `notebooks.id`
- `document_chunks` table updated: `note_id` renamed to `notebook_id`
- Database functions updated: `match_documents` and `match_documents_hybrid` now use `notebook_id` parameter
