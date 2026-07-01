resource "aws_db_instance" "cryptoterminal" {
  identifier     = "cryptoterminal-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t3.micro"

  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = "cryptoterminal"
  username = "ctadmin"
  # Şifre state dosyasına düz metin yazılmasın diye burada yönetmiyoruz —
  # kaynak zaten manuel oluşturuldu, import sonrası Terraform şifreyi
  # kontrol etmez (ignore_changes).
  password = "REPLACED_ON_IMPORT"

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = 1
  multi_az                = false
  publicly_accessible     = false
  skip_final_snapshot     = true

  lifecycle {
    ignore_changes = [password, engine_version]
  }
}

resource "aws_elasticache_cluster" "cryptoterminal" {
  cluster_id         = "cryptoterminal-redis"
  engine             = "redis"
  node_type          = "cache.t3.micro"
  num_cache_nodes    = 1
  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  lifecycle {
    ignore_changes = [engine_version]
  }
}
