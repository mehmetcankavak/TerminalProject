resource "aws_ecr_repository" "cryptoterminal" {
  name = "cryptoterminal"

  image_scanning_configuration {
    scan_on_push = true
  }
}
