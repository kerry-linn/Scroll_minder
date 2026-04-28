import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase admin client using the service role key.
 * This bypasses Row Level Security and must NEVER be imported by client code.
 * Only used by protected server-side cron routes.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    throw new Error(
      "Missing admin Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
