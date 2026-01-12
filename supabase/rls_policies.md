# Supabase Row Level Security (RLS) Policies

This document defines all Row Level Security policies for the SolomindLM application.

**Last Updated:** 2026-01-11  
**Status:** Reflects current database state

## Policy Organization

Policies are organized by table and operation type (SELECT, INSERT, UPDATE, DELETE, ALL).

---

## Documents Table

**Table:** `documents`

### Policies

```sql
-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own documents
CREATE POLICY "Users can view their own documents"
ON documents
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own documents
CREATE POLICY "Users can insert their own documents"
ON documents
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own documents
CREATE POLICY "Users can update their own documents"
ON documents
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own documents
CREATE POLICY "Users can delete their own documents"
ON documents
FOR DELETE
USING (auth.uid() = user_id);
```

---

## Document Chunks Table

**Table:** `document_chunks`

### Policies

```sql
-- Enable RLS
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view chunks from their own documents
CREATE POLICY "Users can view chunks from their documents"
ON document_chunks
FOR SELECT
USING (
  document_id IN (
    SELECT documents.id
    FROM documents
    WHERE auth.uid() = documents.user_id
  )
);

-- Policy: Users can insert chunks for their own documents
CREATE POLICY "Users can insert chunks for their documents"
ON document_chunks
FOR INSERT
WITH CHECK (
  document_id IN (
    SELECT documents.id
    FROM documents
    WHERE auth.uid() = documents.user_id
  )
);

-- Policy: Users can update chunks for their own documents
CREATE POLICY "Users can update chunks in their documents"
ON document_chunks
FOR UPDATE
USING (
  document_id IN (
    SELECT documents.id
    FROM documents
    WHERE auth.uid() = documents.user_id
  )
)
WITH CHECK (
  document_id IN (
    SELECT documents.id
    FROM documents
    WHERE auth.uid() = documents.user_id
  )
);

-- Policy: Users can delete chunks for their own documents
CREATE POLICY "Users can delete chunks from their documents"
ON document_chunks
FOR DELETE
USING (
  document_id IN (
    SELECT documents.id
    FROM documents
    WHERE auth.uid() = documents.user_id
  )
);
```

---

## Notebooks Table

**Table:** `notebooks`

### Policies

```sql
-- Enable RLS
ALTER TABLE notebooks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own notebooks
CREATE POLICY "Users can view their own notebooks"
ON notebooks
FOR SELECT
USING (user_id = auth.uid());

-- Policy: Users can insert their own notebooks
CREATE POLICY "Users can insert their own notebooks"
ON notebooks
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own notebooks
CREATE POLICY "Users can update their own notebooks"
ON notebooks
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own notebooks
CREATE POLICY "Users can delete their own notebooks"
ON notebooks
FOR DELETE
USING (user_id = auth.uid());
```

---

## Notebook Folders Table

**Table:** `notebook_folders`

### Policies

```sql
-- Enable RLS
ALTER TABLE notebook_folders ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own folders
CREATE POLICY "Users can view their own folders"
ON notebook_folders
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own folders
CREATE POLICY "Users can create their own folders"
ON notebook_folders
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own folders
CREATE POLICY "Users can update their own folders"
ON notebook_folders
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own folders
CREATE POLICY "Users can delete their own folders"
ON notebook_folders
FOR DELETE
USING (auth.uid() = user_id);
```

---

## Notes Table

**Table:** `notes`

### Policies

```sql
-- Enable RLS
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own notes
CREATE POLICY "Users can view their own notes"
ON notes
FOR SELECT
USING (user_id = auth.uid());

-- Policy: Users can insert their own notes
CREATE POLICY "Users can insert their own notes"
ON notes
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own notes
CREATE POLICY "Users can update their own notes"
ON notes
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own notes
CREATE POLICY "Users can delete their own notes"
ON notes
FOR DELETE
USING (user_id = auth.uid());
```

---

## Flashcards Table

**Table:** `flashcards`

### Policies

```sql
-- Enable RLS
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own flashcards
CREATE POLICY "Users can only see their own flashcards"
ON flashcards
FOR SELECT
USING (user_id = auth.uid());

-- Policy: Users can insert their own flashcards
CREATE POLICY "Users can only create their own flashcards"
ON flashcards
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own flashcards
CREATE POLICY "Users can only update their own flashcards"
ON flashcards
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own flashcards
CREATE POLICY "Users can only delete their own flashcards"
ON flashcards
FOR DELETE
USING (user_id = auth.uid());
```

---

## Quizzes Table

**Table:** `quizzes`

### Policies

```sql
-- Enable RLS
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own quizzes
CREATE POLICY "Users can view their own quizzes"
ON quizzes
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own quizzes
CREATE POLICY "Users can insert their own quizzes"
ON quizzes
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own quizzes
CREATE POLICY "Users can update their own quizzes"
ON quizzes
FOR UPDATE
USING (auth.uid() = user_id);

-- Policy: Users can delete their own quizzes
CREATE POLICY "Users can delete their own quizzes"
ON quizzes
FOR DELETE
USING (auth.uid() = user_id);
```

**Note:** UPDATE policy does not include WITH CHECK clause in current implementation.

---

## Written Questions Table

**Table:** `written_questions`

### Policies

```sql
-- Enable RLS
ALTER TABLE written_questions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can access their own written questions (all operations)
CREATE POLICY "written_questions_user_access"
ON written_questions
FOR ALL
USING (auth.uid() = user_id);
```

**Note:** This table uses a single ALL policy covering SELECT, INSERT, UPDATE, and DELETE operations instead of separate policies per operation.

---

## Mind Maps Table

**Table:** `mindmaps`

### Policies

```sql
-- Enable RLS
ALTER TABLE mindmaps ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own mind maps
CREATE POLICY "Users can view their own mindmaps"
ON mindmaps
FOR SELECT
USING (user_id = auth.uid());

-- Policy: Users can insert their own mind maps
CREATE POLICY "Users can insert their own mindmaps"
ON mindmaps
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own mind maps
CREATE POLICY "Users can update their own mindmaps"
ON mindmaps
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own mind maps
CREATE POLICY "Users can delete their own mindmaps"
ON mindmaps
FOR DELETE
USING (user_id = auth.uid());
```

---

## Audio Overviews Table

**Table:** `audio_overviews`

### Policies

```sql
-- Enable RLS
ALTER TABLE audio_overviews ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own audio overviews
CREATE POLICY "Users can view their own audio overviews"
ON audio_overviews
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own audio overviews
CREATE POLICY "Users can insert their own audio overviews"
ON audio_overviews
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own audio overviews
CREATE POLICY "Users can update their own audio overviews"
ON audio_overviews
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own audio overviews
CREATE POLICY "Users can delete their own audio overviews"
ON audio_overviews
FOR DELETE
USING (auth.uid() = user_id);
```

---

## Conversations Table

**Table:** `conversations`

**Note:** Table is named `conversations` (not `chat_conversations`).

### Policies

```sql
-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own conversations
CREATE POLICY "Users can view their own conversations"
ON conversations
FOR SELECT
USING (user_id = auth.uid());

-- Policy: Users can insert their own conversations
CREATE POLICY "Users can insert their own conversations"
ON conversations
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own conversations
CREATE POLICY "Users can update their own conversations"
ON conversations
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own conversations
CREATE POLICY "Users can delete their own conversations"
ON conversations
FOR DELETE
USING (user_id = auth.uid());
```

---

## Messages Table

**Table:** `messages`

**Note:** Table is named `messages` (not `chat_messages`).

### Policies

```sql
-- Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view messages from their own conversations
CREATE POLICY "Users can view own messages"
ON messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.user_id = auth.uid()
  )
);

-- Policy: Users can insert messages to their own conversations
CREATE POLICY "Users can insert own messages"
ON messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.user_id = auth.uid()
  )
);

-- Policy: Users can update their own messages
CREATE POLICY "Users can update own messages"
ON messages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.user_id = auth.uid()
  )
);

-- Policy: Users can delete their own messages
CREATE POLICY "Users can delete own messages"
ON messages
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.user_id = auth.uid()
  )
);
```

**Security Note:** Policies check via the `conversations` table to ensure messages belong to conversations owned by the user. This provides better security than checking `user_id` directly, as it prevents users from accessing messages in conversations they don't own.

---

## User Profiles Table

**Table:** `user_profiles`

### Policies

```sql
-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
CREATE POLICY "Users can read own profile"
ON user_profiles
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
ON user_profiles
FOR UPDATE
USING (auth.uid() = user_id);
```

**Note:** INSERT and DELETE operations are not covered by explicit policies. These may be handled by database triggers or application-level logic.

---

## Rate Limit Config Table

**Table:** `rate_limit_config`

### Policies

```sql
-- Enable RLS
ALTER TABLE rate_limit_config ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read rate limit configuration
CREATE POLICY "Anyone can read rate limit config"
ON rate_limit_config
FOR SELECT
USING (true);

-- Policy: Service role can manage rate limit configuration
CREATE POLICY "Service can manage rate limit config"
ON rate_limit_config
FOR ALL
USING (true)
WITH CHECK (true);
```

**Note:** Service role bypasses RLS, so the ALL policy effectively allows service role to manage all operations.

---

## Rate Limit Usage Table

**Table:** `rate_limit_usage`

### Policies

```sql
-- Enable RLS
ALTER TABLE rate_limit_usage ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own usage, service can read all
CREATE POLICY "Users can read own usage, service can manage"
ON rate_limit_usage
FOR SELECT
USING (auth.uid() = user_id OR true);

-- Policy: Service role can manage rate limit usage
CREATE POLICY "Service can manage rate limit usage"
ON rate_limit_usage
FOR ALL
USING (true)
WITH CHECK (true);
```

**Note:** The SELECT policy allows all users to read all usage records (OR true). Service role can manage all operations.

---

## Stripe Subscriptions Table

**Table:** `stripe_subscriptions`

### Policies

```sql
-- Enable RLS
ALTER TABLE stripe_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view their own subscriptions
CREATE POLICY "Users can view their own subscriptions"
ON stripe_subscriptions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policy: Service role can insert subscriptions
CREATE POLICY "Allow service role inserts"
ON stripe_subscriptions
FOR INSERT
WITH CHECK (true);

-- Policy: Service role can update subscriptions
CREATE POLICY "Allow service role updates"
ON stripe_subscriptions
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Policy: Service role can delete subscriptions
CREATE POLICY "Allow service role deletes"
ON stripe_subscriptions
FOR DELETE
USING (true);
```

**Note:** Service role has full access to manage subscriptions. Users can only view their own subscriptions.

---

## Stripe Payment History Table

**Table:** `stripe_payment_history`

### Policies

```sql
-- Enable RLS
ALTER TABLE stripe_payment_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own payment history
CREATE POLICY "Users can view their own payment history"
ON stripe_payment_history
FOR SELECT
USING (user_id = auth.uid());

-- Policy: Service role can manage payment history
CREATE POLICY "Service role can manage payments"
ON stripe_payment_history
FOR ALL
USING (auth.role() = 'service_role');
```

---

## Stripe Webhook Events Table

**Table:** `stripe_webhook_events`

### Policies

```sql
-- Enable RLS
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can manage webhook events
CREATE POLICY "Service role manages webhook events"
ON stripe_webhook_events
FOR ALL
USING (auth.role() = 'service_role');
```

---

## Storage Buckets

### Documents Bucket

**Current Implementation:**

```sql
-- Ensure bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Policy: Service role can manage documents
CREATE POLICY "Allow service role to manage documents"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');

-- Policy: Users can upload to their own folder
-- Matches code structure: userId/noteId/filename
CREATE POLICY "Users can upload to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can view their own files
CREATE POLICY "Users can view own files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can update their own files
CREATE POLICY "Users can update own files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

**Security Note:** Policies use user-specific folders (`auth.uid()::text`) which matches the code's folder structure (`userId/noteId/filename`). This ensures users can only access files in their own folder, providing proper isolation.

### Audio Overviews Bucket

**Current Implementation:**

```sql
-- Make the audio-overviews bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'audio-overviews';

-- Policy: Service role can manage all audio overview files
CREATE POLICY "Service role can manage audio overviews"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'audio-overviews')
WITH CHECK (bucket_id = 'audio-overviews');

-- Policy: Users can upload audio files for their own audio overviews
-- Checks that the audioOverviewId in the path belongs to the user
CREATE POLICY "Users can upload to own audio overviews"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'audio-overviews'
  AND EXISTS (
    SELECT 1 FROM audio_overviews
    WHERE audio_overviews.id::text = (storage.foldername(name))[1]
    AND audio_overviews.user_id = auth.uid()
  )
);

-- Policy: Users can view audio files for their own audio overviews
CREATE POLICY "Users can view own audio files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'audio-overviews'
  AND EXISTS (
    SELECT 1 FROM audio_overviews
    WHERE audio_overviews.id::text = (storage.foldername(name))[1]
    AND audio_overviews.user_id = auth.uid()
  )
);

-- Policy: Users can delete audio files for their own audio overviews
CREATE POLICY "Users can delete own audio files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'audio-overviews'
  AND EXISTS (
    SELECT 1 FROM audio_overviews
    WHERE audio_overviews.id::text = (storage.foldername(name))[1]
    AND audio_overviews.user_id = auth.uid()
  )
);
```

**Security Note:** Policies verify ownership by checking that the `audioOverviewId` (extracted from the file path's first folder) belongs to the authenticated user via the `audio_overviews` table. This ensures users can only access audio files for their own audio overviews. The bucket is set to private to prevent public access.

---

## Implementation Notes

### Applying These Policies

1. Connect to your Supabase project's SQL Editor
2. Run each policy block individually
3. Verify policies are applied correctly

### Verification

```sql
-- Check if RLS is enabled on a table
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- View all policies on a table
SELECT * FROM pg_policies
WHERE tablename = 'documents';

-- View all storage policies
SELECT * FROM pg_policies
WHERE schemaname = 'storage';
```

### Security Best Practices

1. **Always enable RLS** on user data tables
2. **Use authenticated role checks** (`auth.uid()`) for user ownership
3. **Service role bypass** should be minimal and well-documented
4. **Storage buckets should be private** by default
5. **Use signed URLs** for temporary file access
6. **Regular audits** of policy effectiveness
7. **Consider cascading checks** for related tables (e.g., messages via conversations)

### Testing RLS

```sql
-- Test as a specific user
SET LOCAL request.jwt.claim.sub = 'USER_ID_HERE';

-- Run query to verify access
SELECT * FROM documents;
```

---

## Tables Not Currently in Database

The following tables are documented but do not exist in the current database:

- `reports` - Reports may be stored as notes with `note_type = 'report'`
- `user_subscriptions` - Subscription information is stored in `user_profiles` and `stripe_subscriptions`

---

## Version History

- **2026-01-11**: Fixed critical security issues
  - ✅ Updated `messages` policies to check via `conversations` table for enhanced security
  - ✅ Fixed storage policies to use user-specific folders (`auth.uid()::text`) matching code structure
  - ✅ Removed overly permissive storage policies
  - ✅ Updated documentation to reflect current secure implementation
- **2026-01-11**: Updated to reflect current database state
  - Fixed table names (`folders` → `notebook_folders`, `chat_conversations` → `conversations`, `chat_messages` → `messages`)
  - Updated policy expressions to match actual implementation
  - Added missing tables: `notes`, `user_profiles`, `rate_limit_config`, `rate_limit_usage`, `stripe_payment_history`, `stripe_webhook_events`
  - Documented `written_questions` ALL policy
  - Updated `stripe_subscriptions` policies
  - Documented current storage policies and recommended improvements
  - Added security notes for `messages` and storage policies
- **2026-01-11**: Initial RLS policy documentation created
  - Added policies for all user data tables
  - Added storage bucket policies
  - Added verification and testing sections
