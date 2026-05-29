import { createClient as createSbClient } from '@supabase/supabase-js';

// Service role client - only use in server routes that need admin privileges
// (e.g., creating manager accounts).
export function createAdminClient() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

