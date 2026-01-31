#!/usr/bin/env bash
set -euo pipefail

# Deploy frontend to S3 + invalidate CloudFront
# Usage: ./deploy-frontend.sh <environment>

ENVIRONMENT="${1:?Usage: deploy-frontend.sh <dev|staging|prod>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../../frontend"
TF_DIR="$SCRIPT_DIR/../terraform"

echo "=== GenBI Frontend Deployment ==="
echo "Environment: $ENVIRONMENT"

# Get Terraform outputs
cd "$TF_DIR"
S3_BUCKET=$(terraform output -raw s3_bucket_name 2>/dev/null)
CF_DIST_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null)

if [[ -z "$S3_BUCKET" ]]; then
  echo "Error: Could not read s3_bucket_name from Terraform output"
  exit 1
fi

# Build frontend
echo "--- Building frontend ---"
cd "$FRONTEND_DIR"
npm ci
npm run build

# Upload to S3
echo "--- Uploading to S3: $S3_BUCKET ---"
aws s3 sync dist/ "s3://$S3_BUCKET/" --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" \
  --exclude "*.json"

# Upload index.html and manifests with no-cache
aws s3 cp dist/index.html "s3://$S3_BUCKET/index.html" \
  --cache-control "no-cache, no-store, must-revalidate"

# Invalidate CloudFront
if [[ -n "$CF_DIST_ID" ]]; then
  echo "--- Invalidating CloudFront: $CF_DIST_ID ---"
  aws cloudfront create-invalidation \
    --distribution-id "$CF_DIST_ID" \
    --paths "/index.html" "/"
fi

echo ""
echo "=== Frontend deployed ==="
