import { MemberRole, UserRole } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Seed a ready-to-use, verified admin account + organization for local/demo use.
 *
 * Guarded behind SEED_DB=true so it never runs during the normal test suite.
 * Run it with:
 *   $env:SEED_DB="true"; npm run with-dev-env -- vitest run tests/seed/seed-user.test.ts
 *
 * Uses Better Auth's own password hasher (better-auth/crypto) so the credential
 * is byte-compatible with the live sign-in flow — a raw bcrypt/scrypt insert
 * would not match.
 */

const EMAIL = "admin@tutor.test";
const PASSWORD = "Password123!";
const NAME = "Tutor Admin";
const USERNAME = "tutoradmin";
const ORG_NAME = "Demo Academy";
const ORG_SLUG = "demo-academy";

describe.runIf(process.env.SEED_DB === "true")("seed default user", () => {
	it("creates a verified admin + organization", async () => {
		const hashedPassword = await hashPassword(PASSWORD);

		// 1. Verified, onboarded platform admin.
		const user = await prisma.user.upsert({
			where: { email: EMAIL },
			update: {
				emailVerified: true,
				onboardingComplete: true,
				role: UserRole.admin,
			},
			create: {
				email: EMAIL,
				name: NAME,
				username: USERNAME,
				emailVerified: true,
				onboardingComplete: true,
				role: UserRole.admin,
			},
		});

		// 2. Credential account (email/password) with a Better-Auth-compatible hash.
		const existingCredential = await prisma.account.findFirst({
			where: { providerId: "credential", userId: user.id },
			select: { id: true },
		});
		if (existingCredential) {
			await prisma.account.update({
				where: { id: existingCredential.id },
				data: { password: hashedPassword },
			});
		} else {
			await prisma.account.create({
				data: {
					providerId: "credential",
					accountId: user.id,
					userId: user.id,
					password: hashedPassword,
				},
			});
		}

		// 3. Organization the user owns, so the tutor features work immediately.
		const organization = await prisma.organization.upsert({
			where: { slug: ORG_SLUG },
			update: { name: ORG_NAME },
			create: { name: ORG_NAME, slug: ORG_SLUG },
		});

		// 4. Owner membership.
		await prisma.member.upsert({
			where: {
				userId_organizationId: {
					userId: user.id,
					organizationId: organization.id,
				},
			},
			update: { role: MemberRole.owner },
			create: {
				userId: user.id,
				organizationId: organization.id,
				role: MemberRole.owner,
			},
		});

		// 5. Credit balance record (template expects one per org).
		await prisma.creditBalance.upsert({
			where: { organizationId: organization.id },
			update: {},
			create: { organizationId: organization.id, balance: 1000 },
		});

		expect(user.emailVerified).toBe(true);

		// biome-ignore lint/suspicious/noConsole: seed script needs to print credentials
		console.log(
			`\n✅ Seeded login:\n   email:    ${EMAIL}\n   password: ${PASSWORD}\n   org:      ${ORG_NAME}\n`,
		);
	});
});
