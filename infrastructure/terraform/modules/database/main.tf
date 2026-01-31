variable "project_name" { type = string }
variable "environment" { type = string }
variable "db_name" { type = string }
variable "db_username" { type = string }
variable "db_instance_class" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "rds_security_group_id" { type = string }

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}"
  subnet_ids = var.private_subnet_ids

  tags = { Name = "${var.project_name}-${var.environment}-db-subnet" }
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${var.project_name}/${var.environment}/metadata-db"
  recovery_window_in_days = 7

  tags = { Name = "${var.project_name}-${var.environment}-metadata-db-password" }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db.result
}

resource "aws_db_instance" "metadata" {
  identifier     = "${var.project_name}-${var.environment}-metadata"
  engine         = "postgres"
  engine_version = "16.4"
  instance_class = var.db_instance_class

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.rds_security_group_id]

  multi_az            = var.environment == "prod"
  skip_final_snapshot = var.environment != "prod"

  backup_retention_period = var.environment == "prod" ? 7 : 1
  deletion_protection     = var.environment == "prod"

  tags = { Name = "${var.project_name}-${var.environment}-metadata" }
}

output "db_endpoint" { value = aws_db_instance.metadata.endpoint }
output "db_name" { value = aws_db_instance.metadata.db_name }
output "db_username" { value = aws_db_instance.metadata.username }
output "db_password_secret_arn" { value = aws_secretsmanager_secret.db_password.arn }
