import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

function createPrismaClient() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL is required to initialize PrismaClient");
	}

	const schema = process.env.DATABASE_SCHEMA;
	const safeSchema =
		schema && /^[a-zA-Z0-9_]+$/.test(schema) ? schema : undefined;

	const pool = new Pool({
		connectionString,
		...(safeSchema
			? { options: `-c search_path=${safeSchema},public` }
			: undefined),
	});

	return new PrismaClient({
		adapter: new PrismaPg(pool),
	});
}

declare global {
	// eslint-disable-next-line no-var
	var __prisma: PrismaClient | undefined;
}

export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
	globalThis.__prisma = prisma;
}
