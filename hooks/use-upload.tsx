"use client";

import { useCallback, useState } from "react";

/**
 * Client hook for ChatGPT-style file/image uploads.
 *
 * Sends the file to the secure server route `POST /api/uploads`, which performs
 * auth + validation and stores it in the public Supabase "uploads" bucket. The
 * service-role key never touches the browser — only the resulting public URL
 * comes back.
 */

export type UploadedFile = {
	/** Permanent public URL to the uploaded object. */
	url: string;
	/** Object key within the bucket. */
	path: string;
	/** Original filename. */
	name: string;
	/** MIME type. */
	mediaType: string;
	/** Size in bytes. */
	size: number;
};

export type UseUploadResult = {
	uploadFile: (file: File | Blob, folder?: string) => Promise<UploadedFile>;
	isUploading: boolean;
	error: string | null;
};

export function useUpload(): UseUploadResult {
	const [isUploading, setIsUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const uploadFile = useCallback(
		async (file: File | Blob, folder?: string): Promise<UploadedFile> => {
			setIsUploading(true);
			setError(null);
			try {
				// `File` carries a name; a bare `Blob` (e.g. cropped image) needs one.
				const filename = file instanceof File ? file.name : "upload";
				const formData = new FormData();
				formData.append("file", file, filename);
				if (folder) {
					formData.append("folder", folder);
				}

				const res = await fetch("/api/uploads", {
					method: "POST",
					body: formData,
				});

				if (!res.ok) {
					const data = (await res.json().catch(() => null)) as {
						message?: string;
					} | null;
					throw new Error(data?.message ?? "Upload failed");
				}

				return (await res.json()) as UploadedFile;
			} catch (err) {
				const message = err instanceof Error ? err.message : "Upload failed";
				setError(message);
				throw err;
			} finally {
				setIsUploading(false);
			}
		},
		[],
	);

	return { uploadFile, isUploading, error };
}
