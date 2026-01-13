import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client for OAuth authentication
 *
 * This client is used specifically for OAuth flow initiation.
 * The browser context ensures state cookies are set properly,
 * preventing the 'bad_oauth_state' error that occurs when
 * OAuth is initiated from the backend.
 *
 * Note: For security-sensitive operations, we use the backend API
 * instead of direct Supabase calls. This client is only used for
 * OAuth initiation where browser state management is required.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables. ' +
    'Google OAuth will not work. Please add these to your .env.local file.'
  );
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
);
