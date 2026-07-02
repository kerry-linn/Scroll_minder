/**
 * DEFERRED — reference implementation only, not currently deployed.
 *
 * AWS Lambda malware scanning is planned but not yet configured for this
 * project. This file is kept as a reference for future implementation.
 * See README.md § "External scanner (deferred)" for context.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ClamAV Lambda Layer → ScrollMinder scan-callback
 *
 * Architecture
 * ──────────────────────────────────────────────────────────────────────────────
 * S3 ObjectCreated:* event
 *   └─▶ This Lambda (triggered directly — no EventBridge / GuardDuty needed)
 *         1. Downloads the file from S3 into /tmp
 *         2. Runs `clamscan` from the ClamAV Lambda Layer
 *         3. Maps the exit code to clean | infected | error
 *         4. POSTs { s3_key, verdict, reason } to /api/attachments/scan-callback
 *         5. Cleans up /tmp
 *
 * ClamAV Lambda Layer
 * ──────────────────────────────────────────────────────────────────────────────
 * The Lambda must have a ClamAV Layer attached before deployment.
 * Recommended community layer (maintained, pre-built for Amazon Linux 2):
 *   https://github.com/nicovak/clamav-lambda-layer
 *
 * Layer binaries are placed at /opt/bin/clamscan and /opt/lib/.
 * Virus definitions are downloaded on first cold start by the layer's
 * freshclam bootstrap. Set CLAMSCAN_PATH if your layer uses a different path.
 *
 * Required Lambda environment variables
 * ──────────────────────────────────────────────────────────────────────────────
 *   SCROLLMINDER_CALLBACK_URL    – https://yourdomain.vercel.app/api/attachments/scan-callback
 *   SCROLLMINDER_CALLBACK_SECRET – same value as ATTACHMENT_SCAN_CALLBACK_SECRET in Vercel
 *   CLAMSCAN_PATH                – (optional) path to clamscan binary; default /opt/bin/clamscan
 *
 * Required IAM permissions for the Lambda execution role
 * ──────────────────────────────────────────────────────────────────────────────
 *   s3:GetObject   on arn:aws:s3:::YOUR_BUCKET_NAME/*
 *
 * Recommended Lambda configuration
 * ──────────────────────────────────────────────────────────────────────────────
 *   Runtime          : Node.js 20.x
 *   Architecture     : x86_64
 *   Memory           : 1024 MB  (ClamAV engine is memory-hungry)
 *   Ephemeral storage: 512 MB   (for downloaded files + virus definitions)
 *   Timeout          : 60 s     (cold start with definition load can be slow)
 */

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const CALLBACK_URL = process.env.SCROLLMINDER_CALLBACK_URL;
const CALLBACK_SECRET = process.env.SCROLLMINDER_CALLBACK_SECRET;
const CLAMSCAN_PATH = process.env.CLAMSCAN_PATH ?? "/opt/bin/clamscan";

const s3 = new S3Client({});

// ── S3 helpers ────────────────────────────────────────────────────────────────

/**
 * Decode an S3 object key from an S3 event record.
 * S3 URL-encodes keys and replaces spaces with '+'.
 */
function decodeS3Key(record) {
  return decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
}

/**
 * Download an S3 object to a local path in /tmp.
 * Returns the local file path.
 */
async function downloadFromS3(bucket, key) {
  const localPath = join(
    tmpdir(),
    `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const { Body } = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  if (!Body) throw new Error(`S3 object body is empty for key: ${key}`);
  await pipeline(Body, createWriteStream(localPath));
  return localPath;
}

// ── ClamAV scan ───────────────────────────────────────────────────────────────

/**
 * Run clamscan on a local file.
 *
 * Exit codes (from clamav docs):
 *   0  – No virus found
 *   1  – Virus(es) found
 *   2+ – Errors occurred
 *
 * Returns { verdict: "clean"|"infected"|"error", reason?: string }
 */
async function runClamScan(filePath) {
  return new Promise((resolve) => {
    const proc = spawn(CLAMSCAN_PATH, [
      "--no-summary", // suppress the summary line for cleaner output
      "--infected", // only print infected files to stdout
      filePath,
    ]);

    const stdoutLines = [];
    const stderrLines = [];

    proc.stdout.on("data", (chunk) => stdoutLines.push(chunk.toString()));
    proc.stderr.on("data", (chunk) => stderrLines.push(chunk.toString()));

    proc.on("error", (err) => {
      // biome-ignore lint/suspicious/noConsole: intentional Lambda diagnostic logging
      console.error("[clamav] Failed to start clamscan process:", err.message);
      resolve({
        verdict: "error",
        reason: `clamscan process error: ${err.message}`,
      });
    });

    proc.on("close", (code) => {
      const stdout = stdoutLines.join("").trim();
      const stderr = stderrLines.join("").trim();

      // biome-ignore lint/suspicious/noConsole: intentional Lambda diagnostic logging
      console.log(
        `[clamav] exit=${code} stdout="${stdout}" stderr="${stderr}"`
      );

      if (code === 0) {
        resolve({ verdict: "clean" });
      } else if (code === 1) {
        // stdout contains the matched virus signature line(s) when --infected is used
        const reason = stdout || "Threat detected";
        resolve({ verdict: "infected", reason });
      } else {
        const reason = stderr || stdout || `clamscan exited with code ${code}`;
        resolve({ verdict: "error", reason });
      }
    });
  });
}

// ── Callback ──────────────────────────────────────────────────────────────────

/**
 * POST the scan result to the ScrollMinder callback route.
 */
async function postCallback(payload) {
  if (!CALLBACK_URL || !CALLBACK_SECRET) {
    throw new Error(
      "SCROLLMINDER_CALLBACK_URL and SCROLLMINDER_CALLBACK_SECRET must be set."
    );
  }

  const response = await fetch(CALLBACK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CALLBACK_SECRET}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Callback failed (${response.status}): ${text}`);
  }

  return response.json();
}

// ── Lambda handler ────────────────────────────────────────────────────────────

/**
 * Lambda handler. Triggered by S3 ObjectCreated:* events.
 * Each invocation processes every record in the batch (usually just one).
 */
export async function handler(event) {
  // biome-ignore lint/suspicious/noConsole: intentional Lambda diagnostic logging
  console.log("Received event:", JSON.stringify(event, null, 2));

  if (!Array.isArray(event.Records) || event.Records.length === 0) {
    // biome-ignore lint/suspicious/noConsole: intentional Lambda diagnostic logging
    console.warn("[clamav] No S3 records in event — nothing to scan.");
    return { statusCode: 200, body: "No records." };
  }

  const results = await Promise.allSettled(
    event.Records.map(async (record) => {
      const bucket = record.s3.bucket.name;
      const s3Key = decodeS3Key(record);
      let localPath = null;

      try {
        // biome-ignore lint/suspicious/noConsole: intentional Lambda diagnostic logging
        console.log(`[clamav] Scanning s3://${bucket}/${s3Key}`);

        localPath = await downloadFromS3(bucket, s3Key);
        const { verdict, reason } = await runClamScan(localPath);

        // biome-ignore lint/suspicious/noConsole: intentional Lambda diagnostic logging
        console.log(
          `[clamav] s3Key="${s3Key}" verdict="${verdict}" reason="${reason ?? ""}"`
        );

        const callbackResult = await postCallback({
          s3_key: s3Key,
          verdict,
          reason,
        });

        // biome-ignore lint/suspicious/noConsole: intentional Lambda diagnostic logging
        console.log(`[clamav] Callback accepted:`, callbackResult);
        return callbackResult;
      } finally {
        // Always remove the temp file regardless of scan outcome.
        if (localPath) {
          await rm(localPath, { force: true });
        }
      }
    })
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    // biome-ignore lint/suspicious/noConsole: intentional Lambda diagnostic logging
    console.error(
      "[clamav] Some scans failed:",
      failures.map((f) => f.reason)
    );
  }

  return {
    statusCode: 200,
    body: `Scanned ${event.Records.length} file(s). Failures: ${failures.length}.`,
  };
}
