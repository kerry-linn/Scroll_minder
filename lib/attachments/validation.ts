export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

export function validateUpload(
  fileType: string,
  fileSize: number
): { valid: true } | { valid: false; error: string } {
  if (!ALLOWED_MIME_TYPES.has(fileType)) {
    return { valid: false, error: "File type not allowed." };
  }
  if (fileSize > MAX_UPLOAD_BYTES) {
    return { valid: false, error: "File too large (max 20 MB)." };
  }
  return { valid: true };
}

export function validateS3KeyOwnership(
  s3Key: string,
  userId: string
): { valid: true } | { valid: false; error: string } {
  if (!s3Key.startsWith(`${userId}/`)) {
    return { valid: false, error: "Access denied." };
  }
  return { valid: true };
}
