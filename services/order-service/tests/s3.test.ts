describe("cdnUrl", () => {
  it("prepends CLOUDFRONT_DOMAIN to a key when CDN is set", () => {
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
});
