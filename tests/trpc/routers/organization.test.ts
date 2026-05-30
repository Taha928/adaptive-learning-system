import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createTestTRPCContext } from "@/tests/support/trpc-utils";
import { createCallerFactory } from "@/trpc/init";
import { appRouter } from "@/trpc/routers/app";

// Mock next/headers for test environment
vi.mock("next/headers", () => ({
	headers: () => new Headers(),
}));

// Define a consistent test user
const testUser = {
	id: "test-user-id",
	email: "test@example.com",
	name: "Test User",
	role: "user",
	emailVerified: true,
	createdAt: new Date(),
	updatedAt: new Date(),
	image: null,
	username: "test",
	banned: false,
	banReason: null,
	banExpires: null,
	onboardingComplete: false,
	twoFactorEnabled: false,
};

// Mock getSession for protectedProcedure to return a valid session
vi.mock("@/lib/auth/server", () => ({
	getSession: async () => ({ user: testUser }),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/auth")>();
	return {
		...actual,
		auth: {
			...actual.auth,
			api: {
				...actual.auth.api,
				listOrganizations: async () => [], // Return an empty array or mock organizations
			},
		},
	};
});

async function ensureTestUserInDb() {
	const email = testUser.email;
	const userByEmail = await prisma.user.findUnique({
		where: { email },
		select: { id: true },
	});
	if (!userByEmail) {
		await prisma.user.create({
			data: {
				id: testUser.id,
				email: testUser.email,
				name: testUser.name,
				emailVerified: true,
				createdAt: testUser.createdAt,
				updatedAt: testUser.updatedAt,
				image: null,
				username: "test",
				role: "user",
				banned: false,
				banReason: null,
				banExpires: null,
				onboardingComplete: false,
			},
		});
	}
}

describe("organizationRouter", () => {
	describe("getAll", () => {
		it("returns all organizations for the user", async () => {
			await ensureTestUserInDb();
			const ctx = createTestTRPCContext(testUser);
			const caller = createCallerFactory(appRouter)(ctx);
			const result = await caller.organization.list();
			expect(Array.isArray(result)).toBe(true);
		});
	});
});
