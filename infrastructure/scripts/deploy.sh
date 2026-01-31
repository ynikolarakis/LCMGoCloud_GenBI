#!/usr/bin/env bash
set -euo pipefail

# GenBI Platform Deployment Script
# Usage: ./deploy.sh <environment> [plan|apply|destroy]

ENVIRONMENT="${1:?Usage: deploy.sh <dev|staging|prod> [plan|apply|destroy]}"
ACTION="${2:-plan}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TF_DIR="$SCRIPT_DIR/../terraform"

echo "=== GenBI Platform Deployment ==="
echo "Environment: $ENVIRONMENT"
echo "Action: $ACTION"
echo ""

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
  echo "Error: Environment must be dev, staging, or prod"
  exit 1
fi

# Check tfvars exists
TFVARS="$TF_DIR/environments/${ENVIRONMENT}.tfvars"
if [[ ! -f "$TFVARS" ]]; then
  echo "Error: $TFVARS not found"
  exit 1
fi

cd "$TF_DIR"

# Initialize
echo "--- Terraform Init ---"
terraform init -upgrade

# Run action
case "$ACTION" in
  plan)
    echo "--- Terraform Plan ---"
    terraform plan -var-file="$TFVARS" -out="tfplan-${ENVIRONMENT}"
    ;;
  apply)
    echo "--- Terraform Apply ---"
    terraform apply -var-file="$TFVARS" -auto-approve
    ;;
  destroy)
    if [[ "$ENVIRONMENT" == "prod" ]]; then
      echo "WARNING: You are about to destroy PRODUCTION infrastructure!"
      read -rp "Type 'destroy-prod' to confirm: " confirm
      if [[ "$confirm" != "destroy-prod" ]]; then
        echo "Aborted."
        exit 1
      fi
    fi
    echo "--- Terraform Destroy ---"
    terraform destroy -var-file="$TFVARS" -auto-approve
    ;;
  *)
    echo "Error: Action must be plan, apply, or destroy"
    exit 1
    ;;
esac

echo ""
echo "=== Done ==="
