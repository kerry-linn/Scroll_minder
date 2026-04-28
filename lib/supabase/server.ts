import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function resolveSupabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim()
  );
}

/** Pick the first available key — service role skips RLS; anon/publishable follow RLS. */
export function resolveSupabaseKey(): string | undefined {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    process.env.SUPABASE_ANON_KEY?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return key;
}

/** Returns a lazily-initialized Supabase client for server-side use. */
export function getSupabaseServer(): SupabaseClient {
  if (_client) return _client;

  const url = resolveSupabaseUrl();
  const key = resolveSupabaseKey();

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL plus one key: SUPABASE_SERVICE_ROLE_KEY (recommended for trusted server inserts) OR NEXT_PUBLIC_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(resolveSupabaseUrl() && resolveSupabaseKey());
}
