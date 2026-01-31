terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
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

# --- Data sources ---

data "aws_caller_identity" "current" {}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# --- VPC ---

resource "aws_vpc" "staging" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.project_name}-${var.environment}-vpc" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.staging.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 1, 0) # 172.31.10.0/25
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true

  tags = { Name = "${var.project_name}-${var.environment}-public" }
}

resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.staging.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 1, 1) # 172.31.10.128/25
  availability_zone = "${var.aws_region}b"

  tags = { Name = "${var.project_name}-${var.environment}-private" }
}

resource "aws_internet_gateway" "staging" {
  vpc_id = aws_vpc.staging.id

  tags = { Name = "${var.project_name}-${var.environment}-igw" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.staging.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.staging.id
  }

  tags = { Name = "${var.project_name}-${var.environment}-public-rt" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# --- Security Group ---

resource "aws_security_group" "staging" {
  name_prefix = "${var.project_name}-${var.environment}-"
  description = "GenBI staging server"
  vpc_id      = aws_vpc.staging.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-${var.environment}-sg" }
}

# --- IAM Role (Bedrock access) ---

resource "aws_iam_role" "staging" {
  name = "${var.project_name}-${var.environment}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "bedrock" {
  name = "${var.project_name}-${var.environment}-bedrock"
  role = aws_iam_role.staging.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
      Resource = [
        "arn:aws:bedrock:${var.aws_region}::foundation-model/${var.bedrock_model_id}",
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-opus-4-5-20251101-v1:0",
        "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:inference-profile/eu.anthropic.claude-opus-4-5-20251101-v1:0"
      ]
    }]
  })
}

resource "aws_iam_role_policy" "secrets" {
  name = "${var.project_name}-${var.environment}-secrets"
  role = aws_iam_role.staging.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:CreateSecret",
        "secretsmanager:GetSecretValue",
        "secretsmanager:PutSecretValue",
        "secretsmanager:DeleteSecret",
        "secretsmanager:DescribeSecret",
      ]
      Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:${var.project_name}/connections/*"
    }]
  })
}

resource "aws_iam_instance_profile" "staging" {
  name = "${var.project_name}-${var.environment}-ec2-profile"
  role = aws_iam_role.staging.name
}

# --- EC2 Instance ---

resource "aws_instance" "staging" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.staging.id]
  iam_instance_profile   = aws_iam_instance_profile.staging.name

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/user_data.sh", {
    admin_password   = var.admin_password
    aws_region       = var.aws_region
    bedrock_model_id = var.bedrock_model_id
  })

  tags = { Name = "${var.project_name}-${var.environment}" }
}

# --- Elastic IP ---

resource "aws_eip" "staging" {
  domain = "vpc"

  tags = { Name = "${var.project_name}-${var.environment}-eip" }
}

resource "aws_eip_association" "staging" {
  instance_id   = aws_instance.staging.id
  allocation_id = aws_eip.staging.id
}

# --- Provisioners: upload config files ---

resource "null_resource" "upload_configs" {
  depends_on = [aws_eip_association.staging]

  triggers = {
    instance_id = aws_instance.staging.id
  }

  provisioner "file" {
    source      = "${path.module}/files/genbi-backend.service"
    destination = "/tmp/genbi-backend.service"

    connection {
      type     = "ssh"
      user     = "cronos"
      password = var.admin_password
      host     = aws_eip.staging.public_ip
    }
  }

  provisioner "file" {
    source      = "${path.module}/files/nginx-genbi.conf"
    destination = "/tmp/nginx-genbi.conf"

    connection {
      type     = "ssh"
      user     = "cronos"
      password = var.admin_password
      host     = aws_eip.staging.public_ip
    }
  }

  provisioner "remote-exec" {
    inline = [
      "echo 'Waiting for cloud-init to finish...'",
      "sudo cloud-init status --wait",
      "sudo cp /tmp/genbi-backend.service /etc/systemd/system/genbi-backend.service",
      "sudo systemctl daemon-reload",
      "sudo rm -f /etc/nginx/sites-enabled/default",
      "sudo cp /tmp/nginx-genbi.conf /etc/nginx/sites-available/genbi",
      "sudo ln -sf /etc/nginx/sites-available/genbi /etc/nginx/sites-enabled/genbi",
      "sudo nginx -t && sudo systemctl restart nginx",
    ]

    connection {
      type     = "ssh"
      user     = "cronos"
      password = var.admin_password
      host     = aws_eip.staging.public_ip
    }
  }
}
