import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { normalizeSupabaseUrl } from "@/lib/supabase-shared";

/**
 * Server-side Supabase admin client.
 *
 * Uses the SERVICE ROLE key, which BYPASSES Row-Level Security and has full
 * read/write access to the project. The `server-only` import above makes the
 * build fail if this module is ever imported into a client component, so the
 * service-role key can never leak into the browser bundle.
 *
 * For client-safe (anon key) operations, use `lib/supabase-browser.ts` instead.
 */

let cachedAdmin: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase admin client. Throws a clear error if the
 * required server env vars are missing, so misconfiguration fails loudly at the
 * point of use rather than producing confusing runtime errors.
 */
export function getSupabaseAdmin(): SupabaseClient {
	if (cachedAdmin) {
		return cachedAdmin;
	}

	const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

	if (!(url && serviceRoleKey)) {
		throw new Error(
			"Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.",
		);
	}

	cachedAdmin = createClient(normalizeSupabaseUrl(url), serviceRoleKey, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
		},
	});

	return cachedAdmin;
}
