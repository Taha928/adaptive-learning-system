// NOTE: this module is imported by client components (e.g. hooks/use-storage),
// so it must stay free of any `server-only` imports. The bucket name is a plain
// literal that mirrors UPLOADS_BUCKET in lib/storage/supabase.ts.

/** Primary public Supabase bucket for user uploads. Keep in sync with lib/storage/supabase.ts. */
const UPLOADS_BUCKET = "uploads";

export const storageConfig = {
	bucketNames: {
		// Primary public Supabase bucket for chat images, avatars, and logos.
		uploads: UPLOADS_BUCKET,
		// Backwards-compatible alias for legacy key-based references. Falls back
		// to the uploads bucket when the legacy env var is unset.
		images: process.env.NEXT_PUBLIC_IMAGES_BUCKET_NAME || UPLOADS_BUCKET,
	},
} satisfies StorageConfig;

// Type definitions
export type StorageConfig = {
	bucketNames: {
		uploads: string;
		images: string;
	};
};
