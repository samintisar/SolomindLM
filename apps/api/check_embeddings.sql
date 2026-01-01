-- Check if match_documents RPC function exists
SELECT 
  routine_name,
  routine_type,
  routine_schema
FROM information_schema.routines 
WHERE routine_name LIKE '%match%' OR routine_name LIKE '%document%'
ORDER BY routine_name;

-- Check for document_chunks table structure
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'document_chunks'
ORDER BY ordinal_position;

-- Check if any embeddings exist
SELECT 
  COUNT(*) as total_chunks,
  COUNT(embedding) as chunks_with_embeddings,
  COUNT(DISTINCT note_id) as notebooks_with_embeddings
FROM document_chunks;

-- Check for this specific notebook
SELECT 
  COUNT(*) as chunks,
  COUNT(embedding) as with_embeddings
FROM document_chunks
WHERE note_id = '68b1eda2-6876-44b5-b3c4-2fd9c2d930fd'
  AND user_id = '2fba958e-09a9-4200-8980-28589543928e';
