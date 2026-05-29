/**
 * Integration tests — require floci running at localhost:4566.
 * Run with: npm run test:integration
 *
 * Start floci first: docker compose up -d floci
 */

import { S3Client, CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import axios from "axios";

const ENDPOINT = process.env.AWS_ENDPOINT_URL ?? "http://localhost:4566";
const BUCKET = process.env.AWS_S3_BUCKET ?? "threaddash-media";
const REGION = process.env.AWS_REGION ?? "us-east-1";

// Set env before any module under test is loaded
process.env.AWS_ENDPOINT_URL = ENDPOINT;
process.env.AWS_S3_BUCKET = BUCKET;
process.env.AWS_REGION = REGION;
process.env.AWS_ACCESS_KEY_ID = "test";
process.env.AWS_SECRET_ACCESS_KEY = "test";
delete process.env.CLOUDFRONT_DOMAIN;

const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

beforeAll(async () => {
  const healthy = await axios
    .get(`${ENDPOINT}/_floci/health`, { timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  if (!healthy) {
    throw new Error(
      `Floci is not running at ${ENDPOINT}.\nStart it: docker compose up -d floci`
    );
  }

  try {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  } catch (e: any) {
    if (e.name !== "BucketAlreadyOwnedByYou" && e.name !== "BucketAlreadyExists") throw e;
  }
});

describe("S3 integration — Floci", () => {
  it("can upload an object and resolve the local CDN URL", async () => {
    const key = `products/test-product/test-${Date.now()}.jpeg`;

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: Buffer.from("fake-image-bytes"),
        ContentType: "image/jpeg",
      })
    );

    jest.resetModules();
    // Use require() — consistent with unit tests and avoids ESM dynamic import issues in Jest
    const { cdnUrl } = require("../../src/lib/s3");
    expect(cdnUrl(key)).toBe(`${ENDPOINT}/${BUCKET}/${key}`);
  });

  it("cdnUrl uses CLOUDFRONT_DOMAIN when set", () => {
    process.env.CLOUDFRONT_DOMAIN = "https://cdn.threaddash.in";
    jest.resetModules();
    const { cdnUrl } = require("../../src/lib/s3");
    expect(cdnUrl("products/x/img.jpeg")).toBe("https://cdn.threaddash.in/products/x/img.jpeg");
    delete process.env.CLOUDFRONT_DOMAIN;
  });

  it("getPresignedUploadUrl returns a URL pointing at floci", async () => {
    jest.resetModules();
    const { getPresignedUploadUrl } = require("../../src/lib/s3");
    const url = await getPresignedUploadUrl("products/prod-1/test.jpeg", "image/jpeg");
    expect(url).toContain(ENDPOINT);
    expect(url).toContain(BUCKET);
  });
});
