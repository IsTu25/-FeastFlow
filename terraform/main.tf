provider "aws" {
  region = var.aws_region
}

# ── Networking ───────────────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "feastflow-vpc" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  map_public_ip_on_launch = true
  availability_zone       = "us-east-1a"

  tags = { Name = "feastflow-public-subnet" }
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "feastflow-igw" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.gw.id
  }

  tags = { Name = "feastflow-public-rt" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# ── Security ──────────────────────────────────────────────────────────────────

resource "aws_security_group" "cafeteria_sg" {
  name        = "iut_cafeteria_sg"
  description = "Security group for IUT Cafeteria Microservices"
  vpc_id      = aws_vpc.main.id

  # HTTP for the load balancer / dashboard
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SSH - Restricted to Admin IP
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "feastflow-sg" }
}

# ── Compute ───────────────────────────────────────────────────────────────────

resource "aws_instance" "app_server" {
  ami                    = "ami-0c55b159cbfafe1f0" # Amazon Linux 2
  instance_type          = "t3.medium"
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.cafeteria_sg.id]

  user_data = <<-EOF
              #!/bin/bash
              yum update -y
              amazon-linux-extras install docker -y
              service docker start
              usermod -a -G docker ec2-user
              curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
              chmod +x /usr/local/bin/docker-compose
              EOF

  tags = {
    Name = "IUTCafeteria-Resilience-Node"
  }
}

# ── Containers (ECR) ────────────────────────────────────────────────────────

resource "aws_ecr_repository" "identity_provider" {
  name = "identity-provider"
  force_delete = true
}

resource "aws_ecr_repository" "order_gateway" {
  name = "order-gateway"
  force_delete = true
}

resource "aws_ecr_repository" "stock_service" {
  name = "stock-service"
  force_delete = true
}

resource "aws_ecr_repository" "kitchen_queue" {
  name = "kitchen-queue"
  force_delete = true
}

resource "aws_ecr_repository" "notification_hub" {
  name = "notification-hub"
  force_delete = true
}
