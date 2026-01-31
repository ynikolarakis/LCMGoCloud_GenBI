terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Backend configured in backend.tf (see backend.tf.example)
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ================================================================
# Modules
# ================================================================

module "networking" {
  source       = "./modules/networking"
  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
}

module "database" {
  source                = "./modules/database"
  project_name          = var.project_name
  environment           = var.environment
  db_name               = var.db_name
  db_username           = var.db_username
  db_instance_class     = var.db_instance_class
  private_subnet_ids    = module.networking.private_subnet_ids
  rds_security_group_id = module.networking.rds_security_group_id
}

module "auth" {
  source       = "./modules/auth"
  project_name = var.project_name
  environment  = var.environment
}

module "backend" {
  source                   = "./modules/backend"
  project_name             = var.project_name
  environment              = var.environment
  aws_region               = var.aws_region
  lambda_memory_size       = var.lambda_memory_size
  lambda_timeout           = var.lambda_timeout
  bedrock_model_id         = var.bedrock_model_id
  private_subnet_ids       = module.networking.private_subnet_ids
  lambda_security_group_id = module.networking.lambda_security_group_id
  db_endpoint              = module.database.db_endpoint
  db_name                  = module.database.db_name
  db_username              = module.database.db_username
  db_password_secret_arn   = module.database.db_password_secret_arn
}

module "api" {
  source               = "./modules/api"
  project_name         = var.project_name
  environment          = var.environment
  lambda_invoke_arn    = module.backend.lambda_invoke_arn
  lambda_function_name = module.backend.lambda_function_name
}

module "frontend" {
  source       = "./modules/frontend"
  project_name = var.project_name
  environment  = var.environment
  api_endpoint = module.api.api_endpoint
}

module "monitoring" {
  source               = "./modules/monitoring"
  project_name         = var.project_name
  environment          = var.environment
  aws_region           = var.aws_region
  lambda_function_name = module.backend.lambda_function_name
  api_gateway_name     = "${var.project_name}-${var.environment}-api"
  rds_instance_id      = "${var.project_name}-${var.environment}-metadata"
  alert_email          = var.alert_email
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
