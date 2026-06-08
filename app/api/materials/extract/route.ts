import { extractText, getDocumentProxy } from "unpdf";
import { getSession } from "@/lib/auth/server";
import { logger } from "@/lib/logger";

export const maxDuration = 30;

// 20 MB upload ceiling — generous for lecture notes, keeps memory bounded.
const MAX_BYTES = 20 * 1024 * 1024;

function errorResponse(error: string, message: string, status: number) {
	return Response.json({ error, message }, { status });
}

/**
 * Extracts plain text from an uploaded PDF so it can be stored on a Material
 * and fed to the AI for topic segmentation / quiz generation.
 *
 * This is a route handler (not tRPC) because tRPC's JSON transport can't carry
 * binary file uploads. The client sends multipart/form-data with a `file` field
 * and receives `{ text, pageCount }` back.
 */
export async function POST(req: Request) {
	const session = await getSession();
	if (!session) {
		return errorResponse("unauthorized", "Authentication required", 401);
	}

	let file: File | null = null;
	try {
		const formData = await req.formData();
		const candidate = formData.get("file");
		if (candidate instanceof File) {
			file = candidate;
		}
	} catch (error) {
		logger.warn({ error }, "Invalid material extract request");
		return errorResponse("invalid_request", "Invalid form data", 400);
	}

	if (!file) {
		return errorResponse("invalid_request", "No file provided", 400);
	}

	if (file.size > MAX_BYTES) {
		return errorResponse("file_too_large", "PDF must be 20 MB or smaller", 413);
	}

	if (file.type && file.type !== "application/pdf") {
		return errorResponse("invalid_type", "Only PDF files are supported", 415);
	}

	try {
		const buffer = new Uint8Array(await file.arrayBuffer());
		const pdf = await getDocumentProxy(buffer);
		const { text, totalPages } = await extractText(pdf, { mergePages: true });

		return Response.json({
			text: Array.isArray(text) ? text.join("\n\n") : text,
			pageCount: totalPages,
		});
	} catch (error) {
		logger.error({ error }, "Failed to extract text from PDF");
		return errorResponse(
			"extraction_failed",
			"Could not read text from this PDF",
			422,
		);
	}
}
