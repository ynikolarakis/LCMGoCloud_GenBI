variable "project_name" { type = string }
variable "environment" { type = string }
variable "aws_region" { type = string }
variable "lambda_memory_size" { type = number }
variable "lambda_timeout" { type = number }
variable "bedrock_model_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "lambda_security_group_id" { type = string }
variable "db_endpoint" { type = string }
variable "db_name" { type = string }
variable "db_username" { type = string }
variable "db_password_secret_arn" { type = string }

# IAM Role for Lambda
resource "aws_iam_role" "lambda" {
  name = "${var.project_name}-${var.environment}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = { Name = "${var.project_name}-${var.environment}-lambda-role" }
}

resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "lambda_permissions" {
  name = "${var.project_name}-${var.environment}-lambda-permissions"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:CreateSecret",
          "secretsmanager:UpdateSecret",
          "secretsmanager:DeleteSecret",
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:genbi/*"
      },
      {
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = "arn:aws:bedrock:${var.aws_region}::foundation-model/${var.bedrock_model_id}"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:aws:logs:${var.aws_region}:*:*"
      },
    ]
  })
}

# Lambda Function
resource "aws_lambda_function" "api" {
  function_name = "${var.project_name}-${var.environment}-api"
  role          = aws_iam_role.lambda.arn
  handler       = "src.main.handler"
  runtime       = "python3.12"
  memory_size   = var.lambda_memory_size
  timeout       = var.lambda_timeout

  # Placeholder — actual deployment package built by CI/CD
  filename = "${path.module}/placeholder.zip"

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  environment {
    variables = {
      GENBI_ENVIRONMENT              = var.environment
      GENBI_METADATA_DB_HOST         = split(":", var.db_endpoint)[0]
      GENBI_METADATA_DB_PORT         = "5432"
      GENBI_METADATA_DB_NAME         = var.db_name
      GENBI_METADATA_DB_USERNAME     = var.db_username
      GENBI_METADATA_DB_SECRET_ARN   = var.db_password_secret_arn
      GENBI_AWS_REGION               = var.aws_region
      GENBI_BEDROCK_MODEL_ID         = var.bedrock_model_id
    }
  }

  tags = { Name = "${var.project_name}-${var.environment}-api" }
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${aws_lambda_function.api.function_name}"
  retention_in_days = var.environment == "prod" ? 30 : 7

  tags = { Name = "${var.project_name}-${var.environment}-lambda-logs" }
}

output "lambda_function_name" { value = aws_lambda_function.api.function_name }
output "lambda_invoke_arn" { value = aws_lambda_function.api.invoke_arn }
output "lambda_function_arn" { value = aws_lambda_function.api.arn }
