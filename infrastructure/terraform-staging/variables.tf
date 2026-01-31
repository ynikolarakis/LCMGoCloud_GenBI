variable "aws_region" {
  description = "AWS region for staging deployment"
  type        = string
  default     = "eu-central-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "genbi"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "staging"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.medium"
}

variable "bedrock_model_id" {
  description = "Amazon Bedrock model ID for LLM"
  type        = string
  default     = "anthropic.claude-sonnet-4-5-20250514-v1:0"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "172.31.10.0/24"
}

variable "admin_password" {
  description = "Password for the cronos admin user"
  type        = string
  sensitive   = true
}
