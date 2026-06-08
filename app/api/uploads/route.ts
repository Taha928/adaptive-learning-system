import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/auth/server";
import { logger } from "@/lib/logger";
import { UPLOADS_BUCKET, uploadFile } from "@/lib/storage/supabase";

export const maxDuration = 30;

/**
 * Secure server-side file upload to Supabase Storage (ChatGPT-style uploads).
 *
 * Why a route handler (not tRPC): tRPC's JSON transport can't carry binary file
 * uploads. The client sends `multipart/form-data` with a `file` field and gets
 * back `{ url, path, name, mediaType, size }` where `url` is a permanent public
 * URL.
 *
 * Security:
 *  - Requires an authenticated session.
 *  - Uploads run with the service-role key, which stays server-side only.
 *  - File type is allow-listed and size is capped before writing.
 *  - Object keys are namespaced per user and randomized to prevent collisions
 *    and guessing.
 */

// ~12 MB ceiling — generous for images/screenshots, keeps memory bounded.
const MAX_BYTES = 12 * 1024 * 1024;

// Allow-list of acceptable upload types (images + PDF, like ChatGPT).
const ALLOWED_MIME = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"image/heic",
	"image/heif",
	"application/pdf",
]);

const EXT_BY_MIME: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif",
	"image/heic": "heic",
	"image/heif": "heif",
	"application/pdf": "pdf",
};

function errorResponse(error: string, message: string, status: number) {
	return Response.json({ error, message }, { status });
}

export async function POST(req: Request) {
	const session = await getSession();
	if (!session) {
		return errorResponse("unauthorized", "Authentication required", 401);
	}

	let file: File | null = null;
	let folder = "chat";
	try {
		const formData = await req.formData();
		const candidate = formData.get("file");
		if (candidate instanceof File) {
			file = candidate;
		}
		// Optional sub-folder (e.g. "avatars", "logos", "chat"). Sanitized below.
		const folderInput = formData.get("folder");
		if (typeof folderInput === "string" && folderInput.trim()) {
			folder = folderInput.trim();
		}
	} catch (error) {
		logger.warn({ error }, "Invalid upload request");
		return errorResponse("invalid_request", "Invalid form data", 400);
	}

	if (!file) {
		return errorResponse("invalid_request", "No file provided", 400);
	}

	if (file.size === 0) {
		return errorResponse("invalid_request", "File is empty", 400);
	}

	if (file.size > MAX_BYTES) {
		return errorResponse(
			"file_too_large",
			"File must be 12 MB or smaller",
			413,
		);
	}

	const mediaType = file.type.toLowerCase();
	if (!ALLOWED_MIME.has(mediaType)) {
		return errorResponse(
			"invalid_type",
			"Unsupported file type. Allowed: PNG, JPEG, WebP, GIF, HEIC, PDF.",
			415,
		);
	}

	// Keep folder safe: a single segment of [a-z0-9-_].
	const safeFolder =
		folder
			.toLowerCase()
			.replace(/[^a-z0-9\-_]/g, "")
			.slice(0, 32) || "chat";
	const ext = EXT_BY_MIME[mediaType] ?? "bin";
	const path = `${safeFolder}/${session.user.id}/${randomUUID()}.${ext}`;

	try {
		const bytes = new Uint8Array(await file.arrayBuffer());
		const { url, path: storedPath } = await uploadFile({
			path,
			body: bytes,
			contentType: mediaType,
			bucket: UPLOADS_BUCKET,
		});

		return Response.json({
			url,
			path: storedPath,
			name: file.name,
			mediaType,
			size: file.size,
		});
	} catch (error) {
		logger.error({ error, userId: session.user.id }, "Supabase upload failed");
		return errorResponse(
			"upload_failed",
			"Could not upload the file. Please try again.",
			500,
		);
	}
}
