/**
 * DEFERRED — reference implementation only, not currently deployed.
 *
 * AWS Lambda malware scanning is planned but not yet configured for this
 * project. This file is kept as a reference for future implementation.
 * See README.md § "External scanner (deferred)" for context.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ALTERNATIVE: GuardDuty Malware Protection → ScrollMinder scan-callback Lambda
 *
 * NOTE: GuardDuty Malware Protection for S3 is a paid AWS feature and is NOT
 * available on the AWS free tier. The primary recommended scanner is ClamAV —
 * see clamav-scan-callback.mjs instead.
 *
 * Use this file only if you have GuardDuty enabled on your AWS account.
 * The callback route contract is identical to the ClamAV path, so you can
 * switch between the two at any time without changing your Next.js app.
 *
 * ── How it works ──────────────────────────────────────────────────────────────
 *
 *   Mode A  – S3 ObjectCreated (immediate, pre-scan)
 *             Fires the callback with verdict "pending" immediately after upload.
 *             GuardDuty then fires a second update via Mode B when the scan ends.
 *             Use this if you also want Mode B but need the "scanning" state to
 *             appear instantly.
 *
 *   Mode B  – EventBridge rule on GuardDuty finding (recommended, post-scan)
 *             Configure an EventBridge rule:
 *               Source      : aws.guardduty
 *               detail-type : GuardDuty Malware Protection Object Scan Result
 *             Route it to this Lambda. Verdict will be THREATS_FOUND or
 *             NO_THREATS_FOUND.
 *
 * Required Lambda environment variables:
 *   SCROLLMINDER_CALLBACK_URL    – e.g. https://yourdomain.com/api/attachments/scan-callback
 *   SCROLLMINDER_CALLBACK_SECRET – matches ATTACHMENT_SCAN_CALLBACK_SECRET in Vercel
 *
 * IAM permissions needed for the Lambda execution role:
 *   - s3:GetObject on your attachment bucket (for Mode A presign validation)
 *   - guardduty:GetFindings (optional, for richer finding details)
 */

const CALLBACK_URL = process.env.SCROLLMINDER_CALLBACK_URL;
const CALLBACK_SECRET = process.env.SCROLLMINDER_CALLBACK_SECRET;

/**
 * Maps a GuardDuty scan result string to the app's verdict vocabulary.
 * @param {string} gdVerdict
 * @returns {"NO_THREATS_FOUND"|"THREATS_FOUND"|"error"}
 */
function mapGuardDutyVerdict(gdVerdict) {
  switch (gdVerdict?.toUpperCase()) {
    case "NO_THREATS_FOUND":
      return "NO_THREATS_FOUND";
    case "THREATS_FOUND":
      return "THREATS_FOUND";
    default:
      return "error";
  }
}

/**
 * Extract scan result from a GuardDuty EventBridge event (Mode B).
 * @param {object} detail – event.detail from EventBridge
 * @returns {{ s3Key: string, verdict: string, reason: string|undefined }}
 */
function extractFromGuardDutyEvent(detail) {
  const s3Key = detail?.resourceDetails?.s3Object?.objectKey;
  const gdVerdict = detail?.scanResultDetails?.scanResult;
  const threats = detail?.scanResultDetails?.threats
    ?.map((t) => t.name)
    .join(", ");

  return {
    s3Key,
    verdict: mapGuardDutyVerdict(gdVerdict),
    reason: threats || gdVerdict,
  };
}

/**
 * Extract s3Key from an S3 ObjectCreated event (Mode A).
 * @param {object} record – one record from event.Records
 * @returns {string}
 */
function extractS3KeyFromRecord(record) {
  return decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
}

/**
 * POST the scan result to the ScrollMinder callback route.
 * @param {{ s3_key: string, verdict: string, reason?: string }} payload
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

/**
 * Lambda handler.
 *
 * Handles both:
 *   - S3 ObjectCreated events  (event.Records present)
 *   - EventBridge GuardDuty events (event.source === "aws.guardduty")
 */
export async function handler(event) {
  // biome-ignore lint/suspicious/noConsole: intentional Lambda diagnostic logging
  console.log("Received event:", JSON.stringify(event, null, 2));

  // ── Mode B: GuardDuty EventBridge finding ──────────────────────────────────
  if (event.source === "aws.guardduty") {
    const { s3Key, verdict, reason } = extractFromGuardDutyEvent(event.detail);

    if (!s3Key) {
      // biome-ignore lint/suspicious/noConsole: intentional Lambda diagnostic logging
      console.error(
        "Could not extract s3Key from GuardDuty event:",
        event.detail
      );
      return { statusCode: 400, body: "Missing s3Key in GuardDuty event." };
    }

    const result = await postCallback({ s3_key: s3Key, verdict, reason });
    // biome-ignore lint/suspicious/noConsole: intentional Lambda diagnostic logging
    console.log("Callback result:", result);
    return { statusCode: 200, body: JSON.stringify(result) };
  }

  // ── Mode A: S3 ObjectCreated ───────────────────────────────────────────────
  if (Array.isArray(event.Records)) {
    const results = await Promise.allSettled(
      event.Records.map(async (record) => {
        const s3Key = extractS3KeyFromRecord(record);
        // In Mode A we don't have the verdict yet; post "pending" so the task
        // row is stamped immediately. GuardDuty will follow up via Mode B.
        const result = await postCallback({
          s3_key: s3Key,
          verdict: "pending",
        });
        // biome-ignore lint/suspicious/noConsole: intentional Lambda diagnostic logging
        console.log(`[${s3Key}] callback:`, result);
        return result;
      })
    );

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      // biome-ignore lint/suspicious/noConsole: intentional Lambda diagnostic logging
      console.error("Some callbacks failed:", failures);
    }

    return {
      statusCode: 200,
      body: `Processed ${event.Records.length} record(s).`,
    };
  }

  // biome-ignore lint/suspicious/noConsole: intentional Lambda diagnostic logging
  console.warn("Unrecognised event shape:", event);
  return { statusCode: 400, body: "Unrecognised event shape." };
}
