import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { normalizeSupabaseUrl } from "@/lib/supabase-shared";

/**
 * Client-safe Supabase browser client (ANON key only).
 *
 * The anon key is designed to be public — it is protected by Row-Level
 * Security — so it is safe to ship in the browser bundle. NEVER import
 * `lib/supabase.ts` (service role) from a client component.
 *
 * Note: in this project, file uploads go through the secure server route at
 * `POST /api/uploads` (service role), so most components won't need this client
 * directly. It's provided for client-safe operations such as realtime
 * subscriptions or anon reads against RLS-protected tables.
 */

let cachedBrowser: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
	if (cachedBrowser) {
		return cachedBrowser;
	}

	const url = env.NEXT_PUBLIC_SUPABASE_URL;
	const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

	if (!(url && anonKey)) {
		throw new Error(
			"Supabase browser client is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
		);
	}

	cachedBrowser = createClient(normalizeSupabaseUrl(url), anonKey);
	return cachedBrowser;
}
