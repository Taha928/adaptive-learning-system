/**
 * Isomorphic Supabase helpers safe to import from BOTH server and client code.
 * Must never reference the service-role key or `server-only`.
 */

/**
 * Normalize the Supabase project URL to the bare origin expected by
 * `@supabase/supabase-js` (e.g. `https://xxxx.supabase.co`). Strips a trailing
 * PostgREST path such as `/rest/v1/` if one was pasted by mistake.
 */
export function normalizeSupabaseUrl(url: string): string {
	return url.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
}
