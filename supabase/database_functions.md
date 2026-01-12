# Database Functions & Triggers Documentation

**Last Updated:** 2026-01-11  
**Total Functions:** 15  
**Total Triggers:** 8

This document describes all custom functions and triggers in the SolomindLM database.

---

## Table of Contents

1. [Rate Limiting Functions](#rate-limiting-functions)
2. [User & Subscription Functions](#user--subscription-functions)
3. [Document Search Functions](#document-search-functions)
4. [Security Functions](#security-functions)
5. [Trigger Functions](#trigger-functions)
6. [Triggers](#triggers)

---

## Rate Limiting Functions

### `check_and_increment_rate_limit`

**Purpose:** Atomically checks if a user has remaining quota and increments usage if allowed.

**Signature:**
```sql
check_and_increment_rate_limit(
  p_user_id uuid,
  p_service_type text,
  p_limit integer
) RETURNS boolean
```

**Parameters:**
- `p_user_id` - User ID to check
- `p_service_type` - Service type identifier
- `p_limit` - Daily limit for this service

**Returns:** `boolean` - `true` if allowed and incremented, `false` if limit exceeded

**Volatility:** VOLATILE  
**Security:** SECURITY DEFINER

**Description:**
- Inserts a new usage record if one doesn't exist for today
- Checks current count BEFORE incrementing (prevents race conditions)
- Returns `false` if already at or over limit
- Atomically increments count if within limit
- Returns `true` if increment was successful

**Usage Example:**
```sql
SELECT check_and_increment_rate_limit(
  'user-uuid-here',
  'chat',
  100
);
```

---

### `check_rate_limit`

**Purpose:** Checks current rate limit status without incrementing usage.

**Signature:**
```sql
check_rate_limit(
  p_user_id uuid,
  p_service_type text
) RETURNS jsonb
```

**Parameters:**
- `p_user_id` - User ID to check
- `p_service_type` - Service type identifier

**Returns:** `jsonb` - Status object with:
```json
{
  "allowed": boolean,
  "tier": "free" | "pro",
  "limit": integer,
  "used": integer,
  "remaining": integer,
  "error": string (optional)
}
```

**Volatility:** VOLATILE  
**Security:** SECURITY DEFINER

**Description:**
- Gets user tier from `user_profiles`
- Looks up daily limit from `rate_limit_config`
- Gets current usage count for today
- Calculates remaining quota
- Returns comprehensive status object

**Usage Example:**
```sql
SELECT check_rate_limit('user-uuid-here', 'chat');
-- Returns: {"allowed": true, "tier": "pro", "limit": 1000, "used": 42, "remaining": 958}
```

---

### `get_rate_limit_usage`

**Purpose:** Gets current usage count for a user and service type for today.

**Signature:**
```sql
get_rate_limit_usage(
  p_user_id uuid,
  p_service_type text
) RETURNS integer
```

**Parameters:**
- `p_user_id` - User ID
- `p_service_type` - Service type identifier

**Returns:** `integer` - Current usage count (0 if no record exists)

**Volatility:** VOLATILE  
**Security:** SECURITY DEFINER

**Description:**
- Queries `rate_limit_usage` for today's count
- Returns 0 if no record exists (COALESCE)

**Usage Example:**
```sql
SELECT get_rate_limit_usage('user-uuid-here', 'chat');
-- Returns: 42
```

---

### `get_remaining_quota`

**Purpose:** Calculates remaining quota for a user given a limit.

**Signature:**
```sql
get_remaining_quota(
  p_user_id uuid,
  p_service_type text,
  p_limit integer
) RETURNS integer
```

**Parameters:**
- `p_user_id` - User ID
- `p_service_type` - Service type identifier
- `p_limit` - Daily limit

**Returns:** `integer` - Remaining quota (never negative, minimum 0)

**Volatility:** VOLATILE  
**Security:** SECURITY DEFINER

**Description:**
- Gets current usage via `get_rate_limit_usage`
- Calculates `limit - used`
- Uses `GREATEST(0, ...)` to ensure non-negative result

**Usage Example:**
```sql
SELECT get_remaining_quota('user-uuid-here', 'chat', 100);
-- Returns: 58 (if 42 used)
```

---

### `increment_and_check_rate_limit`

**Purpose:** Atomically checks rate limit, increments usage if allowed, and returns status.

**Signature:**
```sql
increment_and_check_rate_limit(
  p_user_id uuid,
  p_service_type text
) RETURNS jsonb
```

**Parameters:**
- `p_user_id` - User ID
- `p_service_type` - Service type identifier

**Returns:** `jsonb` - Status object (same format as `check_rate_limit`)

**Volatility:** VOLATILE  
**Security:** SECURITY DEFINER

**Description:**
- Gets user tier and configured limit
- Calls `check_and_increment_rate_limit` to atomically check and increment
- Gets updated usage count
- Returns comprehensive status with updated counts

**Usage Example:**
```sql
SELECT increment_and_check_rate_limit('user-uuid-here', 'chat');
-- Returns: {"allowed": true, "tier": "pro", "limit": 1000, "used": 43, "remaining": 957}
```

**Note:** This is the recommended function to use when you need to both check and increment in a single atomic operation.

---

## User & Subscription Functions

### `get_user_tier`

**Purpose:** Gets the subscription tier for a user.

**Signature:**
```sql
get_user_tier(
  p_user_id uuid
) RETURNS text
```

**Parameters:**
- `p_user_id` - User ID

**Returns:** `text` - Tier: `'free'` or `'pro'` (defaults to `'free'` if no profile exists)

**Volatility:** VOLATILE  
**Security:** SECURITY DEFINER

**Description:**
- Queries `user_profiles` for user tier
- Returns `'free'` as default if profile doesn't exist (COALESCE)

**Usage Example:**
```sql
SELECT get_user_tier('user-uuid-here');
-- Returns: 'pro'
```

---

### `get_user_subscription_status`

**Purpose:** Gets active subscription status for a user.

**Signature:**
```sql
get_user_subscription_status(
  p_user_id uuid
) RETURNS TABLE(
  has_subscription boolean,
  status text,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean,
  billing_interval text,
  amount integer
)
```

**Parameters:**
- `p_user_id` - User ID

**Returns:** Table with subscription details, or single row with `has_subscription = false` if no active subscription

**Volatility:** VOLATILE  
**Security:** SECURITY DEFINER

**Description:**
- Queries `stripe_subscriptions` for active subscriptions
- Returns most recent active subscription
- If no active subscription found, returns single row with `has_subscription = false` and NULLs

**Usage Example:**
```sql
SELECT * FROM get_user_subscription_status('user-uuid-here');
-- Returns: (true, 'active', '2026-02-01 00:00:00+00', false, 'month', 999)
```

---

## Document Search Functions

### `match_documents`

**Purpose:** Performs vector similarity search on document chunks.

**Signature:**
```sql
match_documents(
  query_embedding vector,
  user_id uuid,
  notebook_id uuid,
  match_threshold double precision DEFAULT 0.78,
  match_count integer DEFAULT 5,
  document_ids uuid[] DEFAULT NULL
) RETURNS TABLE(
  id uuid,
  document_id uuid,
  content text,
  similarity double precision,
  title text,
  file_name text,
  chunk_index integer
)
```

**Parameters:**
- `query_embedding` - Vector embedding of the search query
- `user_id` - User ID (for RLS filtering)
- `notebook_id` - Notebook ID to filter chunks
- `match_threshold` - Minimum similarity score (default: 0.78)
- `match_count` - Maximum number of results (default: 5)
- `document_ids` - Optional array to filter specific documents (NULL = all)

**Returns:** Table of matching document chunks with similarity scores

**Volatility:** VOLATILE  
**Security:** SECURITY DEFINER

**Description:**
- Uses cosine distance (`<=>`) for vector similarity
- Filters by user_id and notebook_id (respects RLS)
- Optionally filters by specific document IDs
- Returns results ordered by similarity (highest first)
- Includes document metadata (title, file_name)

**Usage Example:**
```sql
SELECT * FROM match_documents(
  '[0.1, 0.2, 0.3, ...]'::vector,
  'user-uuid-here',
  'notebook-uuid-here',
  0.75,
  10
);
```

---

### `match_documents_hybrid`

**Purpose:** Performs hybrid search combining vector similarity and full-text keyword search using Reciprocal Rank Fusion (RRF).

**Signature:**
```sql
match_documents_hybrid(
  query_embedding vector,
  query_text text,
  user_id uuid,
  notebook_id uuid,
  match_threshold double precision DEFAULT 0.78,
  match_count integer DEFAULT 10,
  document_ids uuid[] DEFAULT NULL,
  rrf_k integer DEFAULT 60
) RETURNS TABLE(
  id uuid,
  document_id uuid,
  content text,
  similarity double precision,
  title text,
  file_name text,
  chunk_index integer,
  rrf_score double precision,
  vector_rank bigint,
  keyword_rank bigint
)
```

**Parameters:**
- `query_embedding` - Vector embedding of the search query
- `query_text` - Text query for keyword search
- `user_id` - User ID (for RLS filtering)
- `notebook_id` - Notebook ID to filter chunks
- `match_threshold` - Minimum vector similarity (default: 0.78)
- `match_count` - Maximum number of results (default: 10)
- `document_ids` - Optional array to filter specific documents
- `rrf_k` - RRF constant for score fusion (default: 60)

**Returns:** Table of matching chunks with combined RRF scores

**Volatility:** VOLATILE  
**Security:** SECURITY DEFINER

**Description:**
- **Vector Search:** Performs cosine similarity search on embeddings
- **Keyword Search:** Uses PostgreSQL full-text search (`tsvector`) with `websearch_to_tsquery`
- **Fusion:** Combines results using Reciprocal Rank Fusion (RRF) algorithm
- **RRF Formula:** `1/(k + rank)` for each search, then summed
- Handles cases where `websearch_to_tsquery` fails (fallback to `to_tsquery`)
- Returns results ordered by RRF score (highest first)
- Includes both vector and keyword ranks for debugging

**Usage Example:**
```sql
SELECT * FROM match_documents_hybrid(
  '[0.1, 0.2, 0.3, ...]'::vector,
  'machine learning algorithms',
  'user-uuid-here',
  'notebook-uuid-here',
  0.75,
  20,
  NULL,
  60
);
```

**Algorithm Details:**
- RRF combines rankings from both searches
- Higher `rrf_k` value gives more weight to top results
- Default `rrf_k = 60` is a common choice for balancing precision and recall

---

## Security Functions

### `check_service_role`

**Purpose:** Checks if the current request is using the service role.

**Signature:**
```sql
check_service_role() RETURNS boolean
```

**Returns:** `boolean` - `true` if service role, `false` otherwise

**Volatility:** STABLE  
**Security:** SECURITY DEFINER

**Description:**
- Reads JWT claims from `request.jwt.claims`
- Checks if `role` claim is `'service_role'` or NULL
- Returns `true` if service role (bypasses RLS)
- Handles exceptions gracefully (assumes service role if can't read claims)

**Usage Example:**
```sql
SELECT check_service_role();
-- Returns: true (if service role) or false (if authenticated user)
```

---

### `is_service_role`

**Purpose:** Alternative service role check function.

**Signature:**
```sql
is_service_role() RETURNS boolean
```

**Returns:** `boolean` - `true` if service role

**Volatility:** VOLATILE  
**Security:** SECURITY DEFINER

**Description:**
- Similar to `check_service_role` but different implementation
- Checks JWT claims for role = 'service_role' or NULL
- Less error handling than `check_service_role`

**Note:** `check_service_role` is recommended for better error handling.

---

## Trigger Functions

### `handle_new_user`

**Purpose:** Creates a user profile when a new user is created in auth.users.

**Signature:**
```sql
handle_new_user() RETURNS trigger
```

**Returns:** `trigger` - Returns NEW record

**Volatility:** VOLATILE  
**Security:** SECURITY DEFINER

**Description:**
- Triggered AFTER INSERT on `auth.users`
- Creates a new record in `user_profiles` with:
  - `user_id` = NEW.id
  - `tier` = 'free'
- Ensures every user has a profile

**Trigger:** `on_auth_user_created` on `auth.users` (AFTER INSERT)

**Usage:** Automatically executed when new users sign up.

---

### `handle_updated_at`

**Purpose:** Automatically updates the `updated_at` timestamp on record updates.

**Signature:**
```sql
handle_updated_at() RETURNS trigger
```

**Returns:** `trigger` - Returns NEW record with updated timestamp

**Volatility:** VOLATILE  
**Security:** SECURITY DEFINER

**Description:**
- Sets `NEW.updated_at = now()` before update
- Generic function that can be used on any table with `updated_at` column

**Triggers:**
- `conversations_updated_at` on `conversations` (BEFORE UPDATE)
- `set_updated_at_conversations` on `conversations` (BEFORE UPDATE)
- `notebooks_updated_at` on `notebooks` (BEFORE UPDATE)

**Usage:** Automatically executed on UPDATE operations.

---

### `update_document_chunks_tsv`

**Purpose:** Automatically updates the `content_tsv` (full-text search vector) when document chunk content changes.

**Signature:**
```sql
update_document_chunks_tsv() RETURNS trigger
```

**Returns:** `trigger` - Returns NEW record with updated tsvector

**Volatility:** VOLATILE  
**Security:** SECURITY DEFINER

**Description:**
- Converts `NEW.content` to `tsvector` using `to_tsvector('english', ...)`
- Sets `NEW.content_tsv` before insert/update
- Enables full-text search on document chunks

**Triggers:**
- `trigger_update_document_chunks_tsv` on `document_chunks` (BEFORE INSERT, BEFORE UPDATE)

**Usage:** Automatically executed when document chunks are inserted or updated.

---

### `update_user_tier_from_subscription`

**Purpose:** Automatically updates user tier in `user_profiles` when subscription status changes.

**Signature:**
```sql
update_user_tier_from_subscription() RETURNS trigger
```

**Returns:** `trigger` - Returns NEW record

**Volatility:** VOLATILE  
**Security:** SECURITY DEFINER

**Description:**
- **When subscription becomes active:**
  - Sets `user_profiles.tier = 'pro'`
  - Sets `user_profiles.subscription_id = NEW.id`
- **When subscription is canceled/past_due/unpaid (from active):**
  - Sets `user_profiles.tier = 'free'`
- Only triggers on status transitions (not every update)

**Triggers:**
- `trigger_update_user_tier` on `stripe_subscriptions` (AFTER INSERT, AFTER UPDATE)

**Usage:** Automatically executed when subscriptions are created or updated.

---

## Triggers

### Auth Schema Triggers

#### `on_auth_user_created`
- **Table:** `auth.users`
- **Event:** INSERT
- **Timing:** AFTER
- **Function:** `handle_new_user()`
- **Purpose:** Creates user profile when new user signs up

---

### Public Schema Triggers

#### `conversations_updated_at`
- **Table:** `conversations`
- **Event:** UPDATE
- **Timing:** BEFORE
- **Function:** `handle_updated_at()`
- **Purpose:** Updates `updated_at` timestamp

#### `set_updated_at_conversations`
- **Table:** `conversations`
- **Event:** UPDATE
- **Timing:** BEFORE
- **Function:** `handle_updated_at()`
- **Purpose:** Updates `updated_at` timestamp (duplicate trigger)

**Note:** Two triggers exist for the same purpose. Consider consolidating.

#### `notebooks_updated_at`
- **Table:** `notebooks`
- **Event:** UPDATE
- **Timing:** BEFORE
- **Function:** `handle_updated_at()`
- **Purpose:** Updates `updated_at` timestamp

#### `trigger_update_document_chunks_tsv`
- **Table:** `document_chunks`
- **Event:** INSERT, UPDATE
- **Timing:** BEFORE
- **Function:** `update_document_chunks_tsv()`
- **Purpose:** Updates full-text search vector when content changes

#### `trigger_update_user_tier`
- **Table:** `stripe_subscriptions`
- **Event:** INSERT, UPDATE
- **Timing:** AFTER
- **Function:** `update_user_tier_from_subscription()`
- **Purpose:** Updates user tier based on subscription status

---

## Function Categories Summary

### Rate Limiting (5 functions)
- `check_and_increment_rate_limit` - Atomic check and increment
- `check_rate_limit` - Check status without incrementing
- `get_rate_limit_usage` - Get current usage count
- `get_remaining_quota` - Calculate remaining quota
- `increment_and_check_rate_limit` - Check, increment, and return status

### User & Subscription (2 functions)
- `get_user_tier` - Get user subscription tier
- `get_user_subscription_status` - Get active subscription details

### Document Search (2 functions)
- `match_documents` - Vector similarity search
- `match_documents_hybrid` - Hybrid vector + keyword search with RRF

### Security (2 functions)
- `check_service_role` - Check if service role (recommended)
- `is_service_role` - Alternative service role check

### Trigger Functions (4 functions)
- `handle_new_user` - Create user profile on signup
- `handle_updated_at` - Auto-update timestamps
- `update_document_chunks_tsv` - Update full-text search vectors
- `update_user_tier_from_subscription` - Sync user tier with subscription

---

## Security Considerations

### SECURITY DEFINER Functions

All functions use `SECURITY DEFINER`, which means they execute with the privileges of the function owner (typically the database superuser). This is necessary for:

1. **Bypassing RLS:** Functions need to read/write data regardless of user permissions
2. **Cross-schema access:** Accessing `auth.users` from public schema
3. **Atomic operations:** Ensuring rate limiting and other operations are atomic

### Best Practices

1. **Always use parameterized queries** - Functions use parameters to prevent SQL injection
2. **Validate inputs** - Functions should validate user inputs where applicable
3. **Audit function usage** - Monitor function calls for security issues
4. **Limit function privileges** - Only grant necessary permissions

---

## Performance Considerations

### Rate Limiting Functions
- Use `increment_and_check_rate_limit` for atomic operations
- Consider connection pooling for high-concurrency scenarios
- Index on `(user_id, service_type, usage_date)` in `rate_limit_usage`

### Document Search Functions
- `match_documents_hybrid` is more expensive but provides better results
- Use `match_documents` for simple vector-only searches
- Ensure `document_chunks.embedding` has a vector index (ivfflat or hnsw)
- Ensure `document_chunks.content_tsv` has a GIN index for full-text search

### Trigger Functions
- Triggers add overhead to INSERT/UPDATE operations
- `update_document_chunks_tsv` performs text processing on every insert/update
- Consider batch operations for bulk updates

---

## Usage Examples

### Rate Limiting
```sql
-- Check and increment in one call
SELECT increment_and_check_rate_limit('user-id', 'chat');

-- Just check status
SELECT check_rate_limit('user-id', 'chat');

-- Get usage count
SELECT get_rate_limit_usage('user-id', 'chat');
```

### Document Search
```sql
-- Vector search only
SELECT * FROM match_documents(
  query_embedding,
  'user-id',
  'note-id',
  0.75,
  10
);

-- Hybrid search (recommended)
SELECT * FROM match_documents_hybrid(
  query_embedding,
  'search query text',
  'user-id',
  'note-id',
  0.75,
  20
);
```

### User Information
```sql
-- Get user tier
SELECT get_user_tier('user-id');

-- Get subscription status
SELECT * FROM get_user_subscription_status('user-id');
```

---

## Version History

- **2026-01-11**: Updated function signatures
  - Changed `note_id` parameter to `notebook_id` in `match_documents` and `match_documents_hybrid` functions
  - Updated to match database schema changes (documents table now uses `notebook_id`)
- **2026-01-11**: Initial documentation created
  - Documented all 15 functions
  - Documented all 8 triggers
  - Added usage examples and performance considerations
