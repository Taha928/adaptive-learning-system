import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Supabase Storage helpers (server-side, service role).
 *
 * Replaces the previous S3/R2 implementation. The default bucket is "uploads"
 * and is created as PUBLIC, so stored objects resolve to permanent public URLs
 * (ChatGPT-style image links). All writes go through the service-role admin
 * client, so callers MUST do their own authorization first.
 */

/** Default public bucket for user uploads (chat images, avatars, logos). */
export const UPLOADS_BUCKET = "uploads";

/**
 * Validate and sanitize an object path to prevent traversal / injection.
 * Mirrors the protections of the old S3 layer.
 * @throws Error if the path is invalid.
 */
export function sanitizePath(path: string): string {
	if (!path) {
		throw new Error("Invalid path: empty");
	}
	if (path.includes("..")) {
		throw new Error("Invalid path: path traversal not allowed");
	}
	if (path.startsWith("/")) {
		throw new Error("Invalid path: absolute paths not allowed");
	}
	if (path.includes("\0")) {
		throw new Error("Invalid path: null bytes not allowed");
	}
	if (!/^[a-zA-Z0-9\-_/.]+$/.test(path)) {
		throw new Error(
			"Invalid path: only alphanumeric characters, hyphens, underscores, forward slashes, and dots are allowed",
		);
	}
	if (path.startsWith(".") || path.includes("/.")) {
		throw new Error("Invalid path: hidden files not allowed");
	}
	return path.replace(/\/+/g, "/");
}

// Buckets we've already confirmed/created this process, so we don't hit the
// management API on every upload. Resets on each cold start (Vercel-safe).
const ensuredBuckets = new Set<string>();

/**
 * Ensure a public bucket exists. Idempotent and cheap after the first call per
 * process. Lets the app work end-to-end without a manual dashboard step.
 */
export async function ensureBucket(
	bucket: string = UPLOADS_BUCKET,
	isPublic = true,
): Promise<void> {
	if (ensuredBuckets.has(bucket)) {
		return;
	}

	const supabase = getSupabaseAdmin();
	const { data: existing } = await supabase.storage.getBucket(bucket);

	if (!existing) {
		const { error } = await supabase.storage.createBucket(bucket, {
			public: isPublic,
		});
		// Ignore "already exists" races between concurrent cold starts.
		if (error && !/already exists/i.test(error.message)) {
			throw error;
		}
	}

	ensuredBuckets.add(bucket);
}

export type UploadResult = {
	/** Object key within the bucket (store this if you prefer keys over URLs). */
	path: string;
	/** Permanent public URL to the object. */
	url: string;
};

/**
 * Upload a file to a public Supabase bucket and return its public URL.
 * @throws Error if the upload fails.
 */
export async function uploadFile(params: {
	path: string;
	body: ArrayBuffer | Uint8Array | Blob | Buffer | File;
	contentType: string;
	bucket?: string;
	/** Overwrite an existing object at the same path. Defaults to false. */
	upsert?: boolean;
}): Promise<UploadResult> {
	const bucket = params.bucket ?? UPLOADS_BUCKET;
	const safePath = sanitizePath(params.path);

	const supabase = getSupabaseAdmin();
	await ensureBucket(bucket);

	const { error } = await supabase.storage
		.from(bucket)
		.upload(safePath, params.body, {
			contentType: params.contentType,
			upsert: params.upsert ?? false,
		});

	if (error) {
		throw error;
	}

	return { path: safePath, url: getPublicUrl(safePath, bucket) };
}

/** Build the permanent public URL for an object in a public bucket. */
export function getPublicUrl(
	path: string,
	bucket: string = UPLOADS_BUCKET,
): string {
	const safePath = sanitizePath(path);
	const supabase = getSupabaseAdmin();
	return supabase.storage.from(bucket).getPublicUrl(safePath).data.publicUrl;
}

/** Delete an object from a bucket. Safe to call for cleanup. */
export async function deleteFile(
	path: string,
	bucket: string = UPLOADS_BUCKET,
): Promise<void> {
	const safePath = sanitizePath(path);
	const supabase = getSupabaseAdmin();
	const { error } = await supabase.storage.from(bucket).remove([safePath]);
	if (error) {
		throw error;
	}
}

// ---------------------------------------------------------------------------
// Backward-compatible shims for the previous S3 API surface so existing
// importers (`@/lib/storage`) keep working. Since the bucket is public, the
// "signed" download URL is simply the public URL.
// ---------------------------------------------------------------------------

/** @deprecated Public bucket — returns the permanent public URL. */
export async function getSignedUrl(
	path: string,
	bucket: string,
	_expiresIn?: number,
): Promise<string> {
	return getPublicUrl(path, bucket || UPLOADS_BUCKET);
}

/**
 * Returns a one-time signed upload URL for direct client uploads. Most callers
 * should prefer the server route `POST /api/uploads` instead.
 */
export async function getSignedUploadUrl(
	path: string,
	bucket: string,
): Promise<string> {
	const safePath = sanitizePath(path);
	const targetBucket = bucket || UPLOADS_BUCKET;
	const supabase = getSupabaseAdmin();
	await ensureBucket(targetBucket);
	const { data, error } = await supabase.storage
		.from(targetBucket)
		.createSignedUploadUrl(safePath);
	if (error || !data) {
		throw new Error("Could not generate signed upload URL");
	}
	return data.signedUrl;
}
