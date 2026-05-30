// Adapted from https://www.answeroverflow.com/m/1128519076952682517

import fs from "node:fs";
import path from "node:path";
import { GenericContainer } from "testcontainers";

type PgClient = import("pg").Client;

async function waitForDatabase(
	connectionString: string,
	maxRetries = 30,
	delay = 250,
) {
	const { Client } = await import("pg");

	for (let i = 0; i < maxRetries; i++) {
		try {
			const client = new Client({ connectionString });
			await client.connect();
			await client.query("SELECT 1");
			await client.end();
			return;
		} catch (error) {
			if (i === maxRetries - 1) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(
					`Database failed to become ready after ${maxRetries} attempts. Last error: ${message}`,
				);
			}
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
}

function hashStringToInt32(input: string): number {
	let hash = 0;
	for (let i = 0; i < input.length; i++) {
		hash = (hash << 5) - hash + input.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

function getPrismaMigrationSqlPaths(): string[] {
	const prismaMigrationsDir = path.join(process.cwd(), "prisma", "migrations");

	if (!fs.existsSync(prismaMigrationsDir)) return [];

	const entries = fs
		.readdirSync(prismaMigrationsDir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort();

	return entries
		.map((dir) => path.join(prismaMigrationsDir, dir, "migration.sql"))
		.filter((p) => fs.existsSync(p));
}

function rewriteMigrationSqlForSchema(
	sqlText: string,
	schemaName: string,
): string {
	// Legacy schema had many FKs schema-qualified to public.
	// For worker-isolated schemas, rewrite those references to the worker schema.
	const qualified = `"${schemaName}"`;

	return sqlText
		.replaceAll('"public".', `${qualified}.`)
		.replaceAll('CREATE TABLE "', `CREATE TABLE ${qualified}."`)
		.replaceAll('ALTER TABLE "', `ALTER TABLE ${qualified}."`)
		.replaceAll('CREATE INDEX "', `CREATE INDEX "`)
		.replaceAll('ON "', `ON ${qualified}."`);
}

async function ensureSchemaMigrationsApplied(
	client: PgClient,
	schemaName: string,
) {
	// Marker table in the schema
	const markerTable = `${schemaName}.schema_migration_status`;

	const exists = await client.query(`SELECT to_regclass($1) as regclass`, [
		markerTable,
	]);
	const alreadyApplied = Boolean(exists.rows[0]?.regclass);
	if (alreadyApplied) return;

	// Serialize migration per schema (prevents concurrent workers stepping on each other)
	const lockKey = hashStringToInt32(schemaName);
	await client.query("SELECT pg_advisory_lock($1)", [lockKey]);
	try {
		// Re-check under lock
		const existsLocked = await client.query(
			`SELECT to_regclass($1) as regclass`,
			[markerTable],
		);
		if (existsLocked.rows[0]?.regclass) return;

		await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
		await client.query(`SET search_path TO "${schemaName}", public`);

		const migrationSqlPaths = getPrismaMigrationSqlPaths();
		for (const migrationPath of migrationSqlPaths) {
			const raw = fs.readFileSync(migrationPath, "utf-8");
			const rewritten = rewriteMigrationSqlForSchema(raw, schemaName);
			await client.query(rewritten);
		}

		await client.query(`
			CREATE TABLE IF NOT EXISTS "${schemaName}".schema_migration_status (
				schema_name TEXT PRIMARY KEY,
				migrations_applied BOOLEAN DEFAULT TRUE,
				applied_at TIMESTAMP DEFAULT NOW()
			)
		`);
		await client.query(
			`INSERT INTO "${schemaName}".schema_migration_status(schema_name) VALUES ($1) ON CONFLICT DO NOTHING`,
			[schemaName],
		);
	} finally {
		await client.query("SELECT pg_advisory_unlock($1)", [lockKey]);
	}
}

export async function setupDockerTestDb() {
	const POSTGRES_PORT = 5445;

	const container = await new GenericContainer("supabase/postgres:15.8.1.100")
		.withEnvironment({ POSTGRES_PASSWORD: "password" })
		.withExposedPorts({ host: POSTGRES_PORT, container: 5432 })
		.withCommand([
			"postgres",
			"-c",
			"config_file=/etc/postgresql/postgresql.conf",
		])
		.withHealthCheck({
			test: [
				"CMD-SHELL",
				"PGPASSWORD=password pg_isready --host localhost --username postgres --dbname postgres",
			],
			interval: 250,
			timeout: 3000,
			retries: 1000,
		})
		.start();

	const adminConnectionString = `postgres://supabase_admin:password@${container.getHost()}:${container.getMappedPort(5432)}/postgres`;
	await waitForDatabase(adminConnectionString);

	const connectionString = `postgres://postgres:password@${container.getHost()}:${container.getMappedPort(5432)}/postgres`;

	const { Client } = await import("pg");
	const client = new Client({ connectionString });
	await client.connect();

	// Apply migrations to public schema for the main test DB
	await ensureSchemaMigrationsApplied(client, "public");

	const confirmDatabaseReady = await client.query("SELECT 1");

	return {
		container,
		confirmDatabaseReady,
		client,
		connectionString,
	};
}

// Global test database pool for isolation
const testDatabasePool = new Map<string, { url: string; schema?: string }>();

export const getIsolatedDatabaseUrl = async (): Promise<string> => {
	const workerId = process.env.VITEST_WORKER_ID || "1";

	if (!/^[0-9]+$/.test(workerId)) {
		throw new Error(
			`Invalid VITEST_WORKER_ID: expected numeric value, got '${workerId}'`,
		);
	}

	const poolKey = `test_db_${workerId}`;

	if (testDatabasePool.has(poolKey)) {
		const config = testDatabasePool.get(poolKey);
		if (!config)
			throw new Error(`Database URL not found for worker ${workerId}`);
		return config.url;
	}

	let globalDatabaseUrl = globalThis.__TEST_DATABASE_URL__;

	if (!globalDatabaseUrl) {
		try {
			const TEST_DB_INFO_FILE = path.join(process.cwd(), ".test-db-info.json");
			const dbInfo = JSON.parse(fs.readFileSync(TEST_DB_INFO_FILE, "utf-8"));
			globalDatabaseUrl = dbInfo.connectionString;
		} catch {
			// ignore
		}
	}

	const baseDatabaseUrl = globalDatabaseUrl || process.env.DATABASE_URL;
	if (!baseDatabaseUrl) {
		throw new Error(
			"DATABASE_URL is not set and no global test container available.",
		);
	}

	const schemaName = `test_${workerId}`;

	const { Client } = await import("pg");
	const client = new Client({ connectionString: baseDatabaseUrl });
	await client.connect();
	try {
		await ensureSchemaMigrationsApplied(client, schemaName);
	} finally {
		await client.end();
	}

	// Append search_path to the connection string to enforce isolation
	const isolatedUrl = `${baseDatabaseUrl}?options=-c%20search_path%3D${schemaName},public`;

	// Store the base URL and schema name for later use
	testDatabasePool.set(poolKey, {
		url: baseDatabaseUrl,
		schema: schemaName,
	});

	return isolatedUrl;
};

export const getTestSchema = (): string | undefined => {
	const workerId = process.env.VITEST_WORKER_ID || "1";

	if (!/^[0-9]+$/.test(workerId)) {
		throw new Error(
			`Invalid VITEST_WORKER_ID: expected numeric value, got '${workerId}'`,
		);
	}

	const poolKey = `test_db_${workerId}`;
	return testDatabasePool.get(poolKey)?.schema;
};

export async function truncateDb(): Promise<void> {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL is not set for database tests");
	}

	const schema = process.env.DATABASE_SCHEMA ?? "public";
	if (!/^[a-zA-Z0-9_]+$/.test(schema)) {
		throw new Error(
			`Invalid DATABASE_SCHEMA: expected [a-zA-Z0-9_]+, got '${schema}'`,
		);
	}

	const { Client } = await import("pg");
	const client = new Client({ connectionString });
	await client.connect();
	try {
		const tables = await client.query<{ tablename: string }>(
			`SELECT tablename FROM pg_tables WHERE schemaname = $1`,
			[schema],
		);

		const names = tables.rows
			.map((r) => r.tablename)
			.filter((t) => t !== "schema_migration_status");

		if (names.length === 0) return;

		const quoted = names
			.map((t) => `"${schema}"."${t.replaceAll('"', '""')}"`)
			.join(", ");

		await client.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`);
	} finally {
		await client.end();
	}
}
