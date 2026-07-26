import { S3Client } from "@aws-sdk/client-s3";

// Cloudflare R2 is S3-compatible. These env vars are set in Vercel.
export const R2_BUCKET = process.env.R2_BUCKET || "albumap-audio";

export function r2Client() {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const endpoint =
    process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

const EXT_TO_TYPE: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  m4a: "audio/mp4",
  aiff: "audio/aiff",
  aif: "audio/aiff",
  flac: "audio/flac",
  ogg: "audio/ogg",
};

export function contentTypeForName(name: string): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return EXT_TO_TYPE[ext] || "application/octet-stream";
}

export function fmtForName(name: string): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "wav") return "wav";
  if (ext === "mp3" || ext === "mpeg") return "mp3";
  return "m4a";
}
