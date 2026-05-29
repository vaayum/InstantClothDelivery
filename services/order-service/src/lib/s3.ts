import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpointUrl = process.env.AWS_ENDPOINT_URL; // set → Floci locally; unset → real AWS in prod
const BUCKET = process.env.AWS_S3_BUCKET ?? "threaddash-media";
const CDN = process.env.CLOUDFRONT_DOMAIN; // set in prod, unset locally

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  ...(endpointUrl ? { endpoint: endpointUrl, forcePathStyle: true } : {}),
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
  },
});

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(s3, command, { expiresIn: 300 }); // 5-minute upload window
}

export function cdnUrl(key: string): string {
  if (CDN) return `${CDN}/${key}`;
  // Local dev: serve directly from Floci S3 (no CloudFront)
  const base = endpointUrl ?? "http://localhost:4566";
  return `${base}/${BUCKET}/${key}`;
}
