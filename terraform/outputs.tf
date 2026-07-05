output "ec2_public_ip" {
  value = aws_instance.app.public_ip
}

output "rds_endpoint" {
  value = aws_db_instance.cryptoterminal.address
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.cryptoterminal.cache_nodes[0].address
}

output "ecr_repository_url" {
  value = aws_ecr_repository.cryptoterminal.repository_url
}
