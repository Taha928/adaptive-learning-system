// Storage layer now backed by Supabase Storage (was AWS S3/R2).
// The previous S3 implementation remains in ./s3 for reference but is no longer
// wired in. All current callers get the Supabase-backed API from ./supabase,
// which keeps the legacy function names (getSignedUrl / getSignedUploadUrl) as
// shims so existing importers keep working.
export * from "./supabase";
