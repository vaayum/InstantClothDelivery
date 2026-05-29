const mockGetSignedUrl = jest.fn().mockResolvedValue("https://s3.amazonaws.com/presigned-test-url");

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
}));

jest.mock("@aws-sdk/client-s3");

afterEach(() => {
  delete process.env.CLOUDFRONT_DOMAIN;
  delete process.env.AWS_ENDPOINT_URL;
  delete process.env.AWS_S3_BUCKET;
  jest.resetModules();
  jest.clearAllMocks();
});

describe("cdnUrl", () => {
  it("uses CLOUDFRONT_DOMAIN when set", () => {
    process.env.CLOUDFRONT_DOMAIN = "https://cdn.threaddash.in";
    delete process.env.AWS_ENDPOINT_URL;
    jest.resetModules();
    const { cdnUrl } = require("../src/lib/s3");
    expect(cdnUrl("products/prod-1/abc.jpeg")).toBe(
      "https://cdn.threaddash.in/products/prod-1/abc.jpeg"
    );
  });

  it("falls back to Floci S3 URL when CLOUDFRONT_DOMAIN is not set", () => {
    delete process.env.CLOUDFRONT_DOMAIN;
    process.env.AWS_ENDPOINT_URL = "http://localhost:4566";
    process.env.AWS_S3_BUCKET = "threaddash-media";
    jest.resetModules();
    const { cdnUrl } = require("../src/lib/s3");
    expect(cdnUrl("products/prod-1/abc.jpeg")).toBe(
      "http://localhost:4566/threaddash-media/products/prod-1/abc.jpeg"
    );
  });

  it("falls back to localhost:4566 when neither CDN nor endpoint URL is set", () => {
    delete process.env.CLOUDFRONT_DOMAIN;
    delete process.env.AWS_ENDPOINT_URL;
    process.env.AWS_S3_BUCKET = "threaddash-media";
    jest.resetModules();
    const { cdnUrl } = require("../src/lib/s3");
    expect(cdnUrl("brands/nike/logo.png")).toBe(
      "http://localhost:4566/threaddash-media/brands/nike/logo.png"
    );
  });
});

describe("getPresignedUploadUrl", () => {
  it("returns signed URL from AWS SDK", async () => {
    process.env.AWS_S3_BUCKET = "threaddash-media";
    jest.resetModules();
    mockGetSignedUrl.mockClear();
    const { getPresignedUploadUrl } = require("../src/lib/s3");
    const url = await getPresignedUploadUrl("products/prod-1/img.jpeg", "image/jpeg");
    expect(url).toBe("https://s3.amazonaws.com/presigned-test-url");
    expect(mockGetSignedUrl).toHaveBeenCalled();
  });
});
