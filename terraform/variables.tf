variable "aws_region" {
  description = "AWS region to deploy resources"
  default     = "us-east-1"
}

variable "admin_cidr" {
  description = "CIDR block allowed to SSH into the instance. Restrict to your IP in production e.g. 203.0.113.0/32"
  default     = "0.0.0.0/0"
}
