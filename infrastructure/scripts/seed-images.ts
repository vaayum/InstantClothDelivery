import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { S3Client, CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const ENDPOINT = process.env.AWS_ENDPOINT_URL ?? "http://localhost:4566";
const BUCKET   = process.env.AWS_S3_BUCKET    ?? "threaddash-media";
const REGION   = process.env.AWS_REGION       ?? "us-east-1";

const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID     ?? "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
  },
});

const prisma = new PrismaClient();

function cdnUrl(key: string): string {
  const cdn = process.env.CLOUDFRONT_DOMAIN;
  if (cdn) return `${cdn}/${key}`;
  const base = process.env.FLOCI_PUBLIC_URL ?? ENDPOINT;
  return `${base}/${BUCKET}/${key}`;
}

async function ensureBucket() {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`  Bucket "${BUCKET}" created.`);
  } catch (e: any) {
    if (e.name === "BucketAlreadyOwnedByYou" || e.name === "BucketAlreadyExists") {
      console.log(`  Bucket "${BUCKET}" already exists.`);
    } else {
      throw e;
    }
  }
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function upload(key: string, data: Buffer): Promise<string> {
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: data, ContentType: "image/jpeg" })
  );
  return cdnUrl(key);
}

async function seedProducts() {
  const products = await prisma.product.findMany({ where: { isActive: true } });
  console.log(`\nProducts (${products.length}):`);

  for (const p of products) {
    const placeholderUrl = `https://picsum.photos/seed/${encodeURIComponent(p.id)}/600/800`;
    const key = `products/${p.id}/${randomUUID()}.jpeg`;

    try {
      const data = await downloadImage(placeholderUrl);
      const url  = await upload(key, data);
      await prisma.product.update({ where: { id: p.id }, data: { images: [url] } });
      console.log(`  ✓  ${p.name.padEnd(30)} ${url}`);
    } catch (e) {
      console.error(`  ✗  ${p.name}: ${(e as Error).message}`);
    }
  }
}

async function seedBrands() {
  const brands = await prisma.brand.findMany();
  console.log(`\nBrands (${brands.length}):`);

  for (const b of brands) {
    const placeholderUrl = `https://picsum.photos/seed/${encodeURIComponent(b.slug)}/200/200`;
    const key = `brands/${b.id}/${randomUUID()}.jpeg`;

    try {
      const data    = await downloadImage(placeholderUrl);
      const logoUrl = await upload(key, data);
      await prisma.brand.update({ where: { id: b.id }, data: { logoUrl } });
      console.log(`  ✓  ${b.name.padEnd(12)} ${logoUrl}`);
    } catch (e) {
      console.error(`  ✗  ${b.name}: ${(e as Error).message}`);
    }
  }
}

async function main() {
  console.log("ThreadDash — Image Seed Script");
  console.log("================================");
  console.log(`Floci endpoint : ${ENDPOINT}`);
  console.log(`Bucket         : ${BUCKET}`);

  await ensureBucket();
  await seedProducts();
  await seedBrands();

  const secret = process.env.ADMIN_SECRET;
  console.log("\n================================");
  if (secret) {
    console.log("Admin Dashboard login secret (use in the login form at http://localhost:5174):");
    console.log(`  ADMIN_SECRET = ${secret}`);
  } else {
    console.log("Tip: set ADMIN_SECRET=<any-string> in your .env to enable admin dashboard login.");
  }

  console.log("\nDone! Open the customer app — products and brands should now show images.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
