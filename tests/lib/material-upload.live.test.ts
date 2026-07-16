import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createTestTRPCContext } from "@/tests/support/trpc-utils";
import { createCallerFactory } from "@/trpc/init";
import { appRouter } from "@/trpc/routers/app";

/**
 * Verifies RAG Phase 1 through the path a real upload actually takes — the
 * material.create / material.update tRPC mutations — rather than by calling the
 * indexer directly.
 *
 * Nothing about the organization or membership is faked into the context: the
 * session carries an activeOrganizationId and protectedOrganizationProcedure
 * resolves the org and role from the database itself, exactly as in production.
 *
 * Guarded behind VERIFY_RAG=true: needs a live database and spends real OpenAI
 * embedding calls.
 */

const USER_ID = "11111111-2222-3333-4444-555555555555";

// vi.mock factories are hoisted above module scope, so values the test only
// learns at run time have to reach the mocks through this.
const shared = vi.hoisted(() => ({
	activeOrganizationId: null as string | null,
	fullOrganization: null as unknown,
}));

// getFullOrganization is Better Auth reading a real session cookie, which a
// test process does not have. It is stubbed with the genuine organization and
// member rows read from the database, so the authorization logic that matters
// here — assertUserIsOrgMember matching the caller against real membership —
// still runs for real.
vi.mock("@/lib/auth", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/auth")>();
	return {
		...actual,
		auth: {
			...actual.auth,
			api: {
				...actual.auth.api,
				getFullOrganization: async () => shared.fullOrganization,
			},
		},
	};
});

vi.mock("next/headers", () => ({ headers: () => new Headers() }));
// Only getSession is faked. assertUserIsOrgMember stays real, so the org and
// role still come from the database exactly as they do in production.
vi.mock("@/lib/auth/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/auth/server")>()),
	getSession: async () => ({
		user: {
			id: "11111111-2222-3333-4444-555555555555",
			email: "rag-upload@example.com",
			name: "RAG Upload Test",
			role: "user",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
			image: null,
			banned: false,
		},
		session: { activeOrganizationId: shared.activeOrganizationId },
	}),
}));

// Pre-trimmed: createMaterialSchema trims extractedText, so an untrimmed
// fixture would fail the round-trip comparison on a trailing space alone.
const NOTES = [
	"Symmetric encryption uses a single shared secret key for both encryption and decryption. ".repeat(
		30,
	),
	"Asymmetric cryptography uses a public key that may be distributed and a private key kept secret. ".repeat(
		30,
	),
]
	.join("\n\n")
	.trim();

describe.runIf(process.env.VERIFY_RAG === "true")(
	"material upload -> chunks (live, via tRPC)",
	() => {
		it("embeds on create, re-embeds only on text change, leaves other uploads alone", async () => {
			const org = await prisma.organization.findFirstOrThrow();
			shared.activeOrganizationId = org.id;

			await prisma.user.upsert({
				where: { id: USER_ID },
				update: {},
				create: {
					id: USER_ID,
					email: "rag-upload@example.com",
					name: "RAG Upload Test",
					emailVerified: true,
				},
			});
			await prisma.member.upsert({
				where: {
					userId_organizationId: { userId: USER_ID, organizationId: org.id },
				},
				update: { role: "owner" },
				create: { userId: USER_ID, organizationId: org.id, role: "owner" },
			});

			// Feed the auth boundary the real rows it would have loaded itself.
			shared.fullOrganization = {
				...org,
				members: await prisma.member.findMany({
					where: { organizationId: org.id },
				}),
			};

			// Snapshot pre-existing uploads so we can prove they are untouched.
			const before = await prisma.material.findMany({
				select: { id: true, extractedText: true, status: true },
				orderBy: { id: "asc" },
			});

			const caller = createCallerFactory(appRouter)(
				createTestTRPCContext({ id: USER_ID } as never),
			);

			const course = await prisma.course.create({
				data: { organizationId: org.id, title: "RAG Upload Verification" },
			});

			try {
				// --- upload with text: chunks must appear --------------------
				const created = await caller.organization.material.create({
					courseId: course.id,
					title: "Crypto Notes",
					fileType: "note",
					extractedText: NOTES,
				});

				// API shape unchanged: still a Material, text still stored.
				expect(created.extractedText).toBe(NOTES);
				expect(created.status).toBe("ready");

				const stored = await prisma.$queryRaw<{ n: bigint; dims: number }[]>`
						SELECT count(*) AS n, max(vector_dims(embedding)) AS dims
						  FROM material_chunk WHERE material_id = ${created.id}::uuid`;
				expect(Number(stored[0]?.n)).toBeGreaterThan(0);
				expect(stored[0]?.dims).toBe(1536);

				// --- changed text: chunks rebuilt, not appended --------------
				const firstIds = (
					await prisma.materialChunk.findMany({
						where: { materialId: created.id },
						select: { id: true },
					})
				).map((c) => c.id);

				await caller.organization.material.update({
					id: created.id,
					extractedText: `${NOTES}\n\nA certificate authority signs certificates to bind identity to a key.`,
				});

				const secondIds = (
					await prisma.materialChunk.findMany({
						where: { materialId: created.id },
						select: { id: true },
					})
				).map((c) => c.id);
				expect(secondIds.length).toBeGreaterThan(0);
				expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);

				// --- title-only edit must NOT re-embed -----------------------
				await caller.organization.material.update({
					id: created.id,
					title: "Crypto Notes (renamed)",
				});
				const afterTitleEdit = (
					await prisma.materialChunk.findMany({
						where: { materialId: created.id },
						select: { id: true },
						orderBy: { chunkIndex: "asc" },
					})
				).map((c) => c.id);
				// Identical rows: no embeddings were regenerated.
				expect(afterTitleEdit).toEqual(secondIds);

				// --- upload with no text: no chunks, no failure --------------
				const linkOnly = await caller.organization.material.create({
					courseId: course.id,
					title: "External Link",
					fileType: "link",
					fileUrl: "https://example.com/notes",
				});
				expect(linkOnly.status).toBe("uploaded");
				expect(
					await prisma.materialChunk.count({
						where: { materialId: linkOnly.id },
					}),
				).toBe(0);

				// --- pre-existing uploads untouched --------------------------
				const after = await prisma.material.findMany({
					where: { id: { in: before.map((m) => m.id) } },
					select: { id: true, extractedText: true, status: true },
					orderBy: { id: "asc" },
				});
				expect(after).toEqual(before);

				// --- unrelated read APIs still work --------------------------
				const listed = await caller.organization.material.list({
					limit: 50,
					offset: 0,
				});
				expect(listed.total).toBeGreaterThan(0);
				const fetched = await caller.organization.material.get({
					id: created.id,
				});
				expect(fetched.id).toBe(created.id);
			} finally {
				await prisma.material.deleteMany({ where: { courseId: course.id } });
				await prisma.course.deleteMany({ where: { id: course.id } });
				await prisma.member.deleteMany({ where: { userId: USER_ID } });
				await prisma.user.deleteMany({ where: { id: USER_ID } });
			}
		}, 180_000);
	},
);
