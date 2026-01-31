variable "project_name" {
  type    = string
  default = "genbi"
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

# Notification
variable "alert_email" {
  type        = string
  default     = ""
  description = "Email address for alarm notifications. Leave empty to skip."
}

# Lambda
variable "lambda_function_name" {
  type = string
}

variable "lambda_error_threshold" {
  type    = number
  default = 5
}

variable "lambda_duration_threshold_ms" {
  type    = number
  default = 10000
}

# API Gateway
variable "api_gateway_name" {
  type = string
}

variable "api_5xx_threshold" {
  type    = number
  default = 5
}

variable "api_latency_threshold_ms" {
  type    = number
  default = 5000
}

# RDS (optional)
variable "rds_instance_id" {
  type    = string
  default = ""
}

variable "rds_max_connections_threshold" {
  type    = number
  default = 50
}
