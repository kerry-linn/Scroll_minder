import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Creates a Supabase client in the context of Next.js middleware so that
 * auth tokens can be refreshed and written back to response cookies.
 *
 * The caller must pass the mutable response so cookies can be set on it.
 */
export function createSupabaseMiddlewareClient(
  request: NextRequest,
  response: NextResponse
) {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    (() => {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
    })();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    (() => {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
      );
    })();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });
}
