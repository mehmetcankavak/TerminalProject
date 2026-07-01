# Yeni bir VPC kurmuyoruz — hesabın varsayılan VPC'sini ve subnet'lerini
# olduğu gibi kullanıyoruz (EC2/RDS/ElastiCache zaten bunların üzerinde).
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_security_group" "app" {
  name        = "cryptoterminal-sg"
  description = "CryptoTerminal web app SG"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH - admin IP only"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["31.223.61.106/32"]
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
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "rds" {
  name        = "cryptoterminal-rds-sg"
  description = "RDS access from EC2 only"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "Postgres - from app SG only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "redis" {
  name        = "cryptoterminal-redis-sg"
  description = "ElastiCache access from EC2 only"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "Redis - from app SG only"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_subnet_group" "main" {
  name        = "cryptoterminal-db-subnets"
  description = "CryptoTerminal RDS subnet group"
  subnet_ids  = data.aws_subnets.default.ids
}

resource "aws_elasticache_subnet_group" "main" {
  name        = "cryptoterminal-cache-subnets"
  description = "CryptoTerminal ElastiCache subnet group"
  subnet_ids  = data.aws_subnets.default.ids
}
