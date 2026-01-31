#!/usr/bin/env bash
set -euo pipefail

# Deploy backend Lambda function
# Usage: ./deploy-backend.sh <environment>

ENVIRONMENT="${1:?Usage: deploy-backend.sh <dev|staging|prod>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../../backend"
TF_DIR="$SCRIPT_DIR/../terraform"

echo "=== GenBI Backend Deployment ==="
echo "Environment: $ENVIRONMENT"

# Get function name from Terraform
cd "$TF_DIR"
FUNCTION_NAME=$(terraform output -raw lambda_function_name 2>/dev/null)

if [[ -z "$FUNCTION_NAME" ]]; then
  echo "Error: Could not read lambda_function_name from Terraform output"
  exit 1
fi

# Build deployment package
echo "--- Building deployment package ---"
BUILD_DIR=$(mktemp -d)
cd "$BACKEND_DIR"

# Install dependencies
pip install -r requirements.txt -t "$BUILD_DIR" --quiet

# Copy source code
cp -r src "$BUILD_DIR/"

# Create zip
cd "$BUILD_DIR"
ZIP_FILE="/tmp/genbi-backend-${ENVIRONMENT}.zip"
zip -r "$ZIP_FILE" . -x "*.pyc" "__pycache__/*" "*.dist-info/*" > /dev/null

echo "--- Updating Lambda: $FUNCTION_NAME ---"
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://$ZIP_FILE" \
  --publish

# Wait for update
aws lambda wait function-updated-v2 --function-name "$FUNCTION_NAME"

# Cleanup
rm -rf "$BUILD_DIR" "$ZIP_FILE"

echo ""
echo "=== Backend deployed ==="
