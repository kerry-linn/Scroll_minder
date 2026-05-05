"use server";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Lazy initialization: build the client inside each function so that a missing
// env var surfaces as a proper { success: false } return instead of crashing
// the module during cold start (which leaves the client promise hung forever).
function createS3Client(): { client: S3Client; bucket: string } | null {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.AWS_S3_BUCKET_NAME;

  if (!region || !accessKeyId || !secretAccessKey || !bucket) {
    // biome-ignore lint/suspicious/noConsole: intentional server-side error logging for Vercel diagnostics
    console.error(
      "[attachments] Missing AWS env vars:",
      JSON.stringify({
        AWS_REGION: !!region,
        AWS_ACCESS_KEY_ID: !!accessKeyId,
        AWS_SECRET_ACCESS_KEY: !!secretAccessKey,
        AWS_S3_BUCKET_NAME: !!bucket,
      })
    );
    return null;
  }

  return {
    client: new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  };
}

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

const MAX_BYTES = 20 * 1024 * 1024;

type UploadUrlResult =
  | { success: true; signedUrl: string; s3Key: string }
  | { success: false; error: string };

type DownloadUrlResult =
  | { success: true; url: string }
  | { success: false; error: string };

export async function getPresignedUploadUrl(
  fileName: string,
  fileType: string,
  fileSize: number
): Promise<UploadUrlResult> {
  const aws = createS3Client();
  if (!aws) return { success: false, error: "Server misconfiguration." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated." };
  if (!ALLOWED_TYPES.has(fileType))
    return { success: false, error: "File type not allowed." };
  if (fileSize > MAX_BYTES)
    return { success: false, error: "File too large (max 20 MB)." };

  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const s3Key = `${user.id}/${crypto.randomUUID()}-${safeFileName}`;

  const command = new PutObjectCommand({
    Bucket: aws.bucket,
    Key: s3Key,
    ContentType: fileType,
  });

  try {
    const signedUrl = await getSignedUrl(aws.client, command, {
      expiresIn: 300,
    });
    return { success: true, signedUrl, s3Key };
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: intentional server-side error logging for Vercel diagnostics
    console.error("[getPresignedUploadUrl] getSignedUrl failed:", err);
    return { success: false, error: "Failed to generate upload URL." };
  }
}

export async function getPresignedDownloadUrl(
  s3Key: string
): Promise<DownloadUrlResult> {
  const aws = createS3Client();
  if (!aws) return { success: false, error: "Server misconfiguration." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated." };
  if (!s3Key.startsWith(`${user.id}/`)) {
    // biome-ignore lint/suspicious/noConsole: intentional server-side error logging for Vercel diagnostics
    console.error(
      `[getPresignedDownloadUrl] Access denied: key="${s3Key}" userId="${user.id}"`
    );
    return { success: false, error: "Access denied." };
  }

  const command = new GetObjectCommand({ Bucket: aws.bucket, Key: s3Key });

  try {
    const url = await getSignedUrl(aws.client, command, { expiresIn: 900 });
    return { success: true, url };
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: intentional server-side error logging for Vercel diagnostics
    console.error("[getPresignedDownloadUrl] getSignedUrl failed:", err);
    return { success: false, error: "Failed to generate download URL." };
  }
}

export async function deleteS3Object(s3Key: string): Promise<void> {
  const aws = createS3Client();
  if (!aws) return;
  try {
    await aws.client.send(new DeleteObjectCommand({ Bucket: aws.bucket, Key: s3Key }));
  } catch {
    // best effort — task row is already gone
  }
}
