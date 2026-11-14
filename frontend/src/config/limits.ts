/**
 * Client-side copy of the backend's default upload limit (TREEAI_MAX_UPLOAD_MB = 50).
 * Used only for an early, friendly check; the backend's 413 response remains authoritative.
 * Row and column limits are deliberately NOT duplicated here.
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
