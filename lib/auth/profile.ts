/**
 * Deriving display identity from an authenticated user.
 *
 * Pure and dependency-free on purpose: the same rules run on the server when a
 * workspace is created and in the browser when an avatar renders, so they must
 * not reach for prisma, env or headers. Keeping them here also means the naming
 * convention is unit-testable rather than an expression buried in a JSX prop.
 *
 * Names arrive from two places and neither is trustworthy: a sign-up form, and
 * Google's `name` claim. Both can be empty, padded, or a single word.
 */

/** Whitespace-split a display name into its parts, discarding empties. */
function nameParts(name: string | null | undefined): string[] {
	return (name ?? "").trim().split(/\s+/).filter(Boolean);
}

/** The name someone is called — the first word of their display name. */
export function firstNameFor(name: string | null | undefined): string | null {
	return nameParts(name)[0] ?? null;
}

/**
 * A personal workspace's name: "<First Name>'s Workspace".
 *
 * First name only, not the full name — "Muneeb Ahmad Khunzada's Workspace" is a
 * mouthful in a sidebar that is 200px wide, and nobody refers to their own
 * workspace by their surname.
 */
export function workspaceNameFor(name: string | null | undefined): string {
	const first = firstNameFor(name);
	return first ? `${first}'s Workspace` : "My Workspace";
}

/**
 * Avatar initials: first letter of the first and last name parts.
 *
 * Falls back to the email's first character, then "?" — a blank avatar looks
 * broken, and every user has at least an email.
 */
export function initialsFor(
	name: string | null | undefined,
	email?: string | null,
): string {
	const parts = nameParts(name);

	if (parts.length >= 2) {
		return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
	}
	if (parts.length === 1) {
		return parts[0]!.slice(0, 2).toUpperCase();
	}

	const fromEmail = (email ?? "").trim();
	return fromEmail ? fromEmail[0]!.toUpperCase() : "?";
}
