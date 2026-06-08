import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function createPrismaClient() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL is required to initialize PrismaClient");
	}

	const schema = process.env.DATABASE_SCHEMA;
	const safeSchema =
		schema && /^[a-zA-Z0-9_]+$/.test(schema) ? schema : undefined;

	// Pass the pool config directly; the adapter builds the pg.Pool internally.
	// (Avoids a Pool type mismatch between @types/pg and @prisma/adapter-pg.)
	const adapter = new PrismaPg({
		connectionString,
		...(safeSchema
			? { options: `-c search_path=${safeSchema},public` }
			: undefined),
	});

	return new PrismaClient({ adapter });
}

declare global {
	// eslint-disable-next-line no-var
	var __prisma: PrismaClient | undefined;
}

export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
	globalThis.__prisma = prisma;
}
