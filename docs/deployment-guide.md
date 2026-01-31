# GenBI Platform — Deployment Guide

## Prerequisites

- AWS Account with permissions for: Lambda, RDS, S3, CloudFront, Cognito, Secrets Manager, Bedrock, CloudWatch
- Terraform >= 1.5
- Node.js >= 18
- Python >= 3.11
- AWS CLI configured

## Architecture

```
CloudFront (CDN) → S3 (Frontend)
API Gateway → Lambda (Backend) → RDS PostgreSQL (Metadata)
                                → Bedrock Claude (LLM)
                                → Secrets Manager (Credentials)
                                → Customer DB (MSSQL/MySQL/PostgreSQL)
```

## Step 1: Infrastructure Setup

```bash
cd infrastructure/terraform

# Initialize Terraform
terraform init

# Configure variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# Plan and apply
terraform plan
terraform apply
```

### Key Terraform Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `aws_region` | AWS region (e.g., `us-east-1`) | Yes |
| `environment` | `staging` or `production` | Yes |
| `vpc_cidr` | VPC CIDR block | Yes |
| `db_instance_class` | RDS instance class | Yes |
| `db_master_password` | Metadata DB password | Yes |
| `cognito_enabled` | Enable Cognito auth | No (default: false) |
| `domain_name` | Custom domain for CloudFront | No |

## Step 2: Backend Deployment

```bash
cd backend

# Install dependencies
pip install -r requirements.txt -t package/

# Package for Lambda
cd package && zip -r ../lambda.zip . && cd ..
zip lambda.zip -r src/

# Deploy (via CI/CD or manual)
aws lambda update-function-code \
  --function-name genbi-backend-${ENVIRONMENT} \
  --zip-file fileb://lambda.zip
```

### Backend Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GENBI_METADATA_DB_URL` | Full PostgreSQL connection string (local dev) | — |
| `GENBI_METADATA_DB_HOST` | DB host (AWS deployment, set by Terraform) | — |
| `GENBI_METADATA_DB_PORT` | DB port | `5432` |
| `GENBI_METADATA_DB_NAME` | DB name | — |
| `GENBI_METADATA_DB_USERNAME` | DB username | — |
| `GENBI_METADATA_DB_SECRET_ARN` | Secrets Manager ARN for DB password | — |
| `GENBI_AWS_REGION` | AWS region | `eu-west-1` |
| `GENBI_BEDROCK_MODEL_ID` | Claude model ID | `anthropic.claude-3-5-sonnet-20241022-v2:0` |
| `GENBI_BEDROCK_MAX_TOKENS` | Max LLM tokens | `4096` |
| `GENBI_AUTH_ENABLED` | Enable Cognito auth | `false` |
| `GENBI_COGNITO_USER_POOL_ID` | Cognito User Pool ID | — |
| `GENBI_COGNITO_CLIENT_ID` | Cognito App Client ID | — |
| `GENBI_RATE_LIMIT_RPM` | Rate limit per IP/minute | `60` |
| `GENBI_QUERY_TIMEOUT_SECONDS` | Query execution timeout | `30` |
| `GENBI_QUERY_MAX_ROWS` | Max rows returned | `10000` |
| `GENBI_ENVIRONMENT` | `development`/`staging`/`production` | `development` |

## Step 3: Frontend Deployment

```bash
cd frontend

# Install and build
npm install
npm run build

# Deploy to S3
aws s3 sync dist/ s3://genbi-frontend-${ENVIRONMENT}/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id ${DISTRIBUTION_ID} \
  --paths "/*"
```

### Frontend Environment Variables (Build Time)

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_COGNITO_USER_POOL_ID` | Cognito User Pool ID | Only if auth enabled |
| `VITE_COGNITO_CLIENT_ID` | Cognito App Client ID | Only if auth enabled |

## Step 4: Database Migrations

Migrations run automatically on startup in `development` and `staging` environments. For production, run manually:

```bash
# Trigger a Lambda invocation to run migrations
aws lambda invoke \
  --function-name genbi-backend-production \
  --payload '{}' \
  response.json
```

## Step 5: Enable Authentication (Optional)

1. Set `cognito_enabled = true` in Terraform and apply
2. Set backend env vars: `GENBI_AUTH_ENABLED=true`, `GENBI_COGNITO_USER_POOL_ID`, `GENBI_COGNITO_CLIENT_ID`
3. Set frontend build env vars: `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`
4. Rebuild and redeploy frontend

## CI/CD

The project includes GitHub Actions workflows:

- **`.github/workflows/ci.yml`** — Runs on push/PR: lint, test, build, terraform validate
- **`.github/workflows/deploy.yml`** — Manual dispatch: deploys to staging or production

### GitHub Setup

The deploy workflow uses **OIDC** (not access keys) to authenticate with AWS. Create GitHub environments for `staging` and `production`, then set the following **repository variables** (`vars.*`) on each environment:

| Variable | Description | Required |
|----------|-------------|----------|
| `AWS_DEPLOY_ROLE_ARN` | IAM role ARN with OIDC trust for GitHub Actions | Yes |
| `AWS_REGION` | AWS region | No (default: `us-east-1`) |
| `LAMBDA_FUNCTION_NAME` | Lambda function name (e.g., `genbi-staging-api`) | Yes |
| `S3_BUCKET_NAME` | Frontend S3 bucket name | Yes |
| `CLOUDFRONT_DIST_ID` | CloudFront distribution ID | Yes |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID | Only if auth enabled |
| `COGNITO_CLIENT_ID` | Cognito App Client ID | Only if auth enabled |

#### Setting up the OIDC IAM Role

1. In the AWS Console, go to IAM → Identity providers → Add provider
2. Select **OpenID Connect**, provider URL: `https://token.actions.githubusercontent.com`, audience: `sts.amazonaws.com`
3. Create an IAM role that trusts the GitHub OIDC provider, scoped to your repository
4. Attach policies for: Lambda, S3, CloudFront, CloudWatch Logs

## Monitoring

The Terraform monitoring module creates:

- CloudWatch alarms for Lambda errors, duration, and throttles
- CloudWatch dashboard with key metrics
- Log groups with configurable retention

Access the dashboard at: AWS Console → CloudWatch → Dashboards → `genbi-${environment}`

## Rollback Procedures

### Backend Rollback (Lambda)

Each Lambda deployment creates a new version. To roll back to a previous version:

```bash
# List recent Lambda versions
aws lambda list-versions-by-function \
  --function-name genbi-${ENVIRONMENT}-api \
  --query 'Versions[-5:].[Version,Description,LastModified]' \
  --output table

# Option 1: Redeploy a previous git commit via CI/CD
# In GitHub Actions → Deploy workflow → Run workflow → select environment
# Use the git ref of the known-good commit

# Option 2: Roll back to a previous Lambda version manually
# First, publish the current code as a version (if not already published)
aws lambda publish-version \
  --function-name genbi-${ENVIRONMENT}-api

# Download the code from a known-good version
aws lambda get-function \
  --function-name genbi-${ENVIRONMENT}-api \
  --qualifier ${GOOD_VERSION_NUMBER} \
  --query 'Code.Location' --output text | xargs curl -o rollback.zip

# Deploy the rollback package
aws lambda update-function-code \
  --function-name genbi-${ENVIRONMENT}-api \
  --zip-file fileb://rollback.zip
```

### Frontend Rollback (S3 + CloudFront)

```bash
# Option 1: Rebuild and deploy from a known-good git commit
git checkout ${GOOD_COMMIT_SHA}
cd frontend && npm ci && npm run build
aws s3 sync dist/ s3://genbi-${ENVIRONMENT}-frontend/ --delete
aws cloudfront create-invalidation \
  --distribution-id ${DISTRIBUTION_ID} \
  --paths "/*"

# Option 2: If S3 versioning is enabled, restore previous object versions
# List previous versions of index.html
aws s3api list-object-versions \
  --bucket genbi-${ENVIRONMENT}-frontend \
  --prefix index.html \
  --query 'Versions[:3].[VersionId,LastModified]' \
  --output table
```

### Database Rollback (Migrations)

Migrations are forward-only (no automatic down migrations). To roll back a schema change:

1. **Staging:** Restore from the most recent RDS automated snapshot:
   ```bash
   # List available snapshots
   aws rds describe-db-snapshots \
     --db-instance-identifier genbi-${ENVIRONMENT}-metadata \
     --query 'DBSnapshots[-3:].[DBSnapshotIdentifier,SnapshotCreateTime]' \
     --output table

   # Restore to a new instance
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier genbi-${ENVIRONMENT}-metadata-restored \
     --db-snapshot-identifier ${SNAPSHOT_ID}

   # After verification, rename instances to swap
   aws rds modify-db-instance \
     --db-instance-identifier genbi-${ENVIRONMENT}-metadata \
     --new-db-instance-identifier genbi-${ENVIRONMENT}-metadata-old
   aws rds modify-db-instance \
     --db-instance-identifier genbi-${ENVIRONMENT}-metadata-restored \
     --new-db-instance-identifier genbi-${ENVIRONMENT}-metadata
   ```

2. **Production:** Use RDS point-in-time recovery for minimal data loss:
   ```bash
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier genbi-prod-metadata \
     --target-db-instance-identifier genbi-prod-metadata-pitr \
     --restore-time ${ISO_TIMESTAMP}
   ```

### Infrastructure Rollback (Terraform)

```bash
cd infrastructure/terraform

# Review what Terraform wants to change
terraform plan

# If a recent terraform apply caused issues, check the state
terraform state list

# Roll back to a previous Terraform state (if using S3 backend with versioning)
# 1. List state file versions in S3
aws s3api list-object-versions \
  --bucket ${TF_STATE_BUCKET} \
  --prefix ${ENVIRONMENT}/terraform.tfstate \
  --query 'Versions[:5].[VersionId,LastModified]' \
  --output table

# 2. Download the previous state
aws s3api get-object \
  --bucket ${TF_STATE_BUCKET} \
  --key ${ENVIRONMENT}/terraform.tfstate \
  --version-id ${PREVIOUS_VERSION_ID} \
  previous.tfstate

# 3. Push the old state back (CAUTION: review first)
terraform state push previous.tfstate

# 4. Apply to reconcile infrastructure with the restored state
terraform apply
```

### Full Environment Rollback Checklist

For a coordinated rollback across all components:

1. **Assess** — Identify which component(s) caused the issue (backend, frontend, DB, infra)
2. **Communicate** — Notify users of maintenance if needed
3. **Roll back backend** — Restore previous Lambda version
4. **Roll back frontend** — Redeploy from known-good commit + invalidate CloudFront
5. **Roll back database** — Only if migration caused data issues (snapshot restore)
6. **Verify** — Hit `/api/v1/health`, test a query, check CloudWatch for errors
7. **Post-mortem** — Document what went wrong and update runbook

---

## Uninstall / Full Teardown

This procedure removes **all** GenBI resources from the AWS account. Data will be permanently lost.

### Pre-Teardown Checklist

- [ ] Export any data you want to keep (RDS snapshots, S3 backups, CloudWatch logs)
- [ ] Notify all users that the platform is being decommissioned
- [ ] Confirm you are targeting the correct AWS account and environment
- [ ] Ensure no other services depend on GenBI resources (VPC peering, shared subnets, etc.)

### Step 1: Create Final Backups (Optional)

```bash
# Create a final RDS snapshot
aws rds create-db-snapshot \
  --db-instance-identifier genbi-${ENVIRONMENT}-metadata \
  --db-snapshot-identifier genbi-${ENVIRONMENT}-final-$(date +%Y%m%d)

# Download S3 frontend assets
aws s3 sync s3://genbi-${ENVIRONMENT}-frontend/ ./backup-frontend/

# Export CloudWatch logs
aws logs create-export-task \
  --log-group-name /aws/lambda/genbi-${ENVIRONMENT}-api \
  --from $(date -d '30 days ago' +%s)000 \
  --to $(date +%s)000 \
  --destination genbi-${ENVIRONMENT}-frontend \
  --destination-prefix logs-export
```

### Step 2: Disable Deletion Protection (Production Only)

Production RDS has deletion protection enabled. Disable it before Terraform destroy:

```bash
aws rds modify-db-instance \
  --db-instance-identifier genbi-prod-metadata \
  --no-deletion-protection \
  --apply-immediately
```

Wait for the modification to complete:

```bash
aws rds wait db-instance-available \
  --db-instance-identifier genbi-prod-metadata
```

### Step 3: Empty S3 Bucket

Terraform cannot delete a non-empty S3 bucket (unless `force_destroy = true`, which is already set for non-prod environments). For production:

```bash
aws s3 rm s3://genbi-prod-frontend/ --recursive
```

### Step 4: Terraform Destroy

```bash
cd infrastructure/terraform

# Review what will be destroyed
terraform plan -destroy

# Destroy all resources
terraform destroy
```

Terraform will prompt for confirmation. Type `yes` to proceed. This destroys:

| Resource | Module |
|----------|--------|
| VPC, subnets, IGW, route tables, security groups | networking |
| RDS PostgreSQL instance, subnet group, Secrets Manager secret | database |
| Cognito User Pool + client | auth |
| Lambda function, IAM role, CloudWatch log group | backend |
| API Gateway HTTP API, stage, log group | api |
| S3 bucket, CloudFront distribution, OAI | frontend |
| CloudWatch alarms, dashboard, SNS topic | monitoring |

### Step 5: Clean Up Remaining Resources

Some resources may survive `terraform destroy`:

```bash
# Delete Secrets Manager secrets (they have a recovery window)
aws secretsmanager delete-secret \
  --secret-id genbi/${ENVIRONMENT}/metadata-db \
  --force-delete-without-recovery

# Delete any customer connection secrets
aws secretsmanager list-secrets \
  --filter Key=name,Values=genbi/connections/ \
  --query 'SecretList[].Name' --output text | \
  xargs -I{} aws secretsmanager delete-secret \
    --secret-id {} --force-delete-without-recovery

# Delete CloudWatch log groups (if not removed by Terraform)
aws logs delete-log-group \
  --log-group-name /aws/lambda/genbi-${ENVIRONMENT}-api 2>/dev/null
aws logs delete-log-group \
  --log-group-name /aws/apigateway/genbi-${ENVIRONMENT} 2>/dev/null
```

### Step 6: Remove Terraform State

```bash
# Delete the state file from S3
aws s3 rm s3://${TF_STATE_BUCKET}/${ENVIRONMENT}/terraform.tfstate

# Delete the DynamoDB lock entry
aws dynamodb delete-item \
  --table-name genbi-terraform-lock \
  --key "{\"LockID\":{\"S\":\"${TF_STATE_BUCKET}/${ENVIRONMENT}/terraform.tfstate-md5\"}}"

# If this was the last environment, delete the state bucket and lock table
aws s3 rb s3://${TF_STATE_BUCKET} --force
aws dynamodb delete-table --table-name genbi-terraform-lock
```

### Step 7: Remove GitHub Configuration

1. Delete the GitHub environment (`staging` or `production`) in Settings → Environments
2. Remove the OIDC IAM role from the AWS account:
   ```bash
   aws iam delete-role-policy \
     --role-name genbi-github-deploy \
     --policy-name deploy-permissions
   aws iam delete-role --role-name genbi-github-deploy
   ```
3. Remove the OIDC identity provider (only if no other repos use it):
   ```bash
   aws iam delete-open-id-connect-provider \
     --open-id-connect-provider-arn arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com
   ```

### Post-Teardown Verification

Confirm no GenBI resources remain:

```bash
# Search for any resources tagged with the project
aws resourcegroupstaggingapi get-resources \
  --tag-filters Key=Project,Values=genbi \
  --query 'ResourceTagMappingList[].ResourceARN' \
  --output table
```

If this returns results, investigate and remove them manually.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Lambda timeout | Increase `GENBI_QUERY_TIMEOUT_SECONDS` and Lambda timeout |
| Rate limit errors | Increase `GENBI_RATE_LIMIT_RPM` |
| Auth token expired | Frontend auto-refreshes; check Cognito token lifetime |
| Migration failures | Check Lambda logs; ensure RDS is accessible from Lambda VPC |
| Bedrock errors | Verify model access is enabled in the AWS region |
