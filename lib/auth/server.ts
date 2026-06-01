import "server-only";

import { TRPCError } from "@trpc/server";
import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export const getSession = cache(async () => {
	const session = await auth.api.getSession({
		headers: await headers(),
		query: {
			disableCookieCache: true,
		},
	});

	return session;
});

export const getActiveSessions = cache(async () => {
	const sessions = await auth.api.listSessions({
		headers: await headers(),
	});

	return sessions;
});

export const getOrganizationById = cache(async (id: string) => {
	try {
		const activeOrganization = await auth.api.getFullOrganization({
			query: {
				organizationId: id,
			},
			headers: await headers(),
		});

		return activeOrganization;
	} catch (error) {
		logger.debug({ error, organizationId: id }, "Failed to get organization");
		return null;
	}
});

export async function assertUserIsOrgMember(
	organizationId: string,
	userId: string,
) {
	const organization = await getOrganizationById(organizationId);
	if (!organization) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Organization not found",
		});
	}

	const membership = organization.members.find((m) => m.userId === userId);
	if (!membership) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Not a member of the organization",
		});
	}

	return { organization, membership };
}

export const getOrganizationList = cache(async () => {
	try {
		const organizationList = await auth.api.listOrganizations({
			headers: await headers(),
		});

		return organizationList;
	} catch (error) {
		logger.debug({ error }, "Failed to list organizations");
		return [];
	}
});

/**
 * StudyNex single-workspace model.
 *
 * The product is presented as a single-user learning app, but internally each
 * user still owns exactly one "workspace" (an organization) so that all the
 * multi-tenant data plumbing (courses, materials, quizzes, chats scoped by
 * organizationId) keeps working unchanged.
 *
 * This ensures the signed-in user has an active workspace:
 *  1. If the session already has an active organization, returns it.
 *  2. Otherwise reuses the user's first existing membership, or
 *  3. Creates a personal workspace on the fly.
 * In all cases it sets the workspace active on the session and returns its id.
 *
 * Returns null only when there is no session.
 */
export const ensureActiveWorkspace = cache(async (): Promise<string | null> => {
	const session = await getSession();
	if (!session) {
		return null;
	}

	const requestHeaders = await headers();

	// Already have an active workspace on the session.
	if (session.session.activeOrganizationId) {
		return session.session.activeOrganizationId;
	}

	// Reuse an existing membership if the user already has a workspace.
	const existingMembership = await prisma.member.findFirst({
		where: { userId: session.user.id },
		select: { organizationId: true },
		orderBy: { createdAt: "asc" },
	});

	let organizationId = existingMembership?.organizationId ?? null;

	// No workspace yet — create a personal one. The slug is derived from the
	// user id so it is deterministic and unique (one workspace per user).
	if (!organizationId) {
		try {
			const created = await auth.api.createOrganization({
				body: {
					name: session.user.name
						? `${session.user.name}'s Workspace`
						: "My Workspace",
					slug: `ws-${session.user.id.toLowerCase()}`,
				},
				headers: requestHeaders,
			});
			organizationId = created?.id ?? null;
		} catch (error) {
			logger.error({ error }, "Failed to create personal workspace");
			return null;
		}
	}

	if (organizationId) {
		try {
			await auth.api.setActiveOrganization({
				body: { organizationId },
				headers: requestHeaders,
			});
		} catch (error) {
			logger.error({ error, organizationId }, "Failed to set active workspace");
		}
	}

	return organizationId;
});

export const getUserAccounts = cache(async () => {
	try {
		const userAccounts = await auth.api.listUserAccounts({
			headers: await headers(),
		});

		return userAccounts;
	} catch (error) {
		logger.debug({ error }, "Failed to list user accounts");
		return [];
	}
});
