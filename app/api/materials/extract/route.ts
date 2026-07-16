import { extractText, getDocumentProxy } from "unpdf";
import { getSession } from "@/lib/auth/server";
import { logger } from "@/lib/logger";

export const maxDuration = 30;

// 20 MB upload ceiling — generous for lecture notes, keeps memory bounded.
const MAX_BYTES = 20 * 1024 * 1024;

const PDF_TYPE = "application/pdf";
const DOCX_TYPE =
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Which formats can become a Material.
 *
 * DOCX is read with mammoth, already a dependency (the tutor chat uses it for
 * attachments). Note the difference in what that buys: a chat attachment goes
 * straight to the model and is forgotten, whereas text extracted here is stored
 * on the Material and flows through the same chunk -> embed -> retrieve pipeline
 * as a PDF, so it is searchable by every AI feature afterwards.
 */
function formatOf(file: File): "pdf" | "docx" | null {
	// Browsers occasionally send an empty or generic type, so fall back to the
	// extension rather than rejecting a file the user plainly named .docx.
	const type = file.type?.toLowerCase() ?? "";
	if (type === PDF_TYPE) return "pdf";
	if (type === DOCX_TYPE) return "docx";
	if (type) return null;

	const name = file.name?.toLowerCase() ?? "";
	if (name.endsWith(".pdf")) return "pdf";
	if (name.endsWith(".docx")) return "docx";
	return null;
}

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
		return errorResponse(
			"file_too_large",
			"File must be 20 MB or smaller",
			413,
		);
	}

	const format = formatOf(file);
	if (!format) {
		return errorResponse(
			"invalid_type",
			"Only PDF and DOCX files are supported",
			415,
		);
	}

	try {
		const buffer = new Uint8Array(await file.arrayBuffer());

		if (format === "docx") {
			const mammoth = await import("mammoth");
			const { value } = await mammoth.extractRawText({
				buffer: Buffer.from(buffer),
			});
			// A DOCX has no fixed page count — pagination is decided by the renderer,
			// not stored in the file. Reported as 0 rather than a fabricated number;
			// the response shape is unchanged either way.
			return Response.json({ text: value, pageCount: 0 });
		}

		const pdf = await getDocumentProxy(buffer);
		const { text, totalPages } = await extractText(pdf, { mergePages: true });

		return Response.json({
			text: Array.isArray(text) ? text.join("\n\n") : text,
			pageCount: totalPages,
		});
	} catch (error) {
		logger.error({ error, format }, "Failed to extract text from document");
		return errorResponse(
			"extraction_failed",
			`Could not read text from this ${format.toUpperCase()}`,
			422,
		);
	}
}
