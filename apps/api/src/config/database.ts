import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

console.log('[Database] SUPABASE_URL:', env.SUPABASE_URL);
console.log('[Database] SUPABASE_SERVICE_ROLE_KEY length:', env.SUPABASE_SERVICE_ROLE_KEY?.length);
console.log('[Database] SUPABASE_SERVICE_ROLE_KEY starts with:', env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20) + '...');

export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
