"use server";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const s3 = new S3Client({
  region: requireEnv("AWS_REGION"),
  credentials: {
    accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
  },
});

const BUCKET = requireEnv("AWS_S3_BUCKET_NAME");

const ALLOWED_TYPES = new Set([
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

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

type UploadUrlResult =
  | { success: true; signedUrl: string; s3Key: string }
  | { success: false; error: string };

type DownloadUrlResult =
  | { success: true; url: string }
  | { success: false; error: string };

/**
 * Returns a short-lived presigned PUT URL so the browser can upload
 * a file directly to S3 without exposing credentials.
 *
 * The caller should PUT the file bytes to `signedUrl` with the
 * matching Content-Type header, then pass `s3Key` to createTask.
 */
export async function getPresignedUploadUrl(
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<UploadUrlResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated." };
  if (!ALLOWED_TYPES.has(fileType))
    return { success: false, error: "File type not allowed." };
  if (fileSize > MAX_BYTES)
    return { success: false, error: "File too large (max 20 MB)." };

  // Scope each object under the user's own prefix to enforce download ownership checks.
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const s3Key = `${user.id}/${crypto.randomUUID()}-${safeFileName}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ContentType: fileType,
  });

  try {
    // 5-minute window to complete the browser-side PUT
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    return { success: true, signedUrl, s3Key };
  } catch {
    return { success: false, error: "Failed to generate upload URL." };
  }
}

/**
 * Returns a short-lived presigned GET URL so the browser can download
 * a private S3 object. Enforces that the key belongs to the calling user.
 */
export async function getPresignedDownloadUrl(
  s3Key: string,
): Promise<DownloadUrlResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated." };
  if (!s3Key.startsWith(`${user.id}/`))
    return { success: false, error: "Access denied." };

  const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });

  try {
    // 15-minute window to view the file after clicking the link
    const url = await getSignedUrl(s3, command, { expiresIn: 900 });
    return { success: true, url };
  } catch {
    return { success: false, error: "Failed to generate download URL." };
  }
}
