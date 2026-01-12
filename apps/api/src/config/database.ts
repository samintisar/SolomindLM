import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

// Only log in development mode and without sensitive data
if (env.NODE_ENV === 'development') {
  console.log('[Database] SUPABASE_URL:', env.SUPABASE_URL);
  console.log('[Database] Supabase client configured');
}

// Service role client - bypasses RLS, use for admin operations
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

/**
 * Create a Supabase client with user's JWT token for RLS-respecting operations
 * This client will respect RLS policies because it uses the user's JWT token
 * 
 * When using the anon key with a JWT token in the Authorization header,
 * Supabase's PostgREST will automatically use the JWT to determine the user
 * context for RLS policies (auth.uid())
 */
export function createUserClient(token: string): SupabaseClient {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  
  // Also set the session explicitly to ensure RLS can access auth.uid()
  // This is a workaround to ensure the JWT is recognized for RLS
  client.auth.setSession({
    access_token: token,
    refresh_token: '',
  } as any).catch(() => {
    // Ignore errors - the token in headers should be sufficient for RLS
  });
  
  return client;
}
