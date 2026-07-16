import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Boot-time check that authentication can actually complete in this environment.
 *
 * Auth *depends* on outbound email in production and nowhere else:
 *   - emailVerification.sendOnSignUp is production-only
 *   - emailAndPassword.requireEmailVerification is production-only
 *   - password reset always needs it, but is only reachable once a user exists
 *
 * Both send paths swallow the error in development and rethrow in production
 * (see lib/auth/index.ts), so a production deploy with no email provider boots
 * perfectly happily and then returns a 500 to the first person who tries to sign
 * up — the failure lands on a user, at random, long after the mistake. This
 * moves that discovery to deploy time, addressed to the operator.
 *
 * Two levels, because NODE_ENV=production means two different things:
 *
 *   - A real deployment (VERCEL_ENV=production): refuse to start. Sign-up is
 *     the front door; shipping it broken is worse than not shipping.
 *   - A local production BUILD (`next build && next start`): warn, and run.
 *     Existing verified users sign in fine here — only sign-up and reset need
 *     mail — and killing a working local demo to prevent a path the operator
 *     is not using would be the wrong trade.
 *
 * Deliberately NOT enforced in lib/env.ts: Next sets NODE_ENV=production during
 * `next build`, so a schema-level rule would fail every build on a machine with
 * no mail credentials, CI included. This runs from instrumentation's register(),
 * which only executes when a server actually starts.
 */
export function assertAuthEmailConfigured(): void {
	if (env.NODE_ENV !== "production") {
		// Dev/test never send, so a missing key is not a fault — but say so once,
		// or the first person to test "forgot password" locally loses an hour.
		if (!env.RESEND_API_KEY) {
			logger.info(
				"Email sending is not configured (RESEND_API_KEY unset). Verification and password-reset emails are disabled; sign-in does not require verification outside production.",
			);
		}
		return;
	}

	const missing = [
		!env.RESEND_API_KEY && "RESEND_API_KEY",
		!env.EMAIL_FROM && "EMAIL_FROM",
	].filter((v): v is string => typeof v === "string");

	if (missing.length === 0) return;

	const isRealDeployment = env.VERCEL_ENV === "production";
	const detail = [
		`${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not set, but NODE_ENV is production.`,
		"Production requires email verification before sign-in and sends a verification mail on sign-up, so sign-up and password reset will fail for every user.",
		"Set RESEND_API_KEY and EMAIL_FROM (https://resend.com/api-keys); EMAIL_FROM must be on a domain verified in Resend.",
	].join(" ");

	if (isRealDeployment) {
		const message = `Refusing to start: ${detail}`;
		// Logged as well as thrown: the throw may be reformatted by the platform,
		// and this is the message the operator needs to read.
		logger.fatal({ missing }, message);
		throw new Error(message);
	}

	logger.warn(
		{ missing },
		`Email is not configured: ${detail} This is a local production build, so it will start anyway — already-verified accounts can still sign in. A real deployment refuses to start in this state.`,
	);
}
