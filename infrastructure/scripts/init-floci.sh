#!/usr/bin/env bash
# Creates the threaddash-media S3 bucket in Floci on first start
set -e

BUCKET="${BUCKET_NAME:-threaddash-media}"
ENDPOINT="http://localhost:4566"

aws --endpoint-url="$ENDPOINT" \
    --region us-east-1 \
    s3 mb "s3://$BUCKET" 2>/dev/null || true

echo "Bucket $BUCKET ready."
