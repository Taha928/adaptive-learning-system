/**
 * Small helpers for building Prisma `where` inputs without repetitive boilerplate.
 *
 * Prisma models define `AND` as `T | T[]`, which is annoying to append to.
 * These helpers normalize `AND` to an array and append clauses safely.
 */

export function appendAnd<T extends { AND?: unknown }>(
	where: T,
	clause: unknown,
): void {
	const current = normalizeAnd(where.AND);
	(where as { AND?: unknown }).AND = [...current, clause];
}

export function normalizeAnd(and: unknown): unknown[] {
	if (!and) return [];
	return Array.isArray(and) ? and : [and];
}
