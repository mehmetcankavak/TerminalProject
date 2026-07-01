data "aws_ssm_parameter" "al2023_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

resource "aws_key_pair" "app" {
  key_name   = "cryptoterminal-key"
  public_key = file("${path.module}/cryptoterminal-key.pub")

  # AWS'in CLI ile ürettiği key pair'lerin fingerprint algoritması,
  # Terraform'un import edilen public key'ler için kullandığı algoritmadan
  # farklı — bu, gereksiz bir "replace" önerisine yol açar. Var olan key'e
  # dokunmuyoruz.
  lifecycle {
    ignore_changes = [public_key]
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.al2023_ami.value
  instance_type          = "t3.micro"
  key_name               = aws_key_pair.app.key_name
  subnet_id              = tolist(data.aws_subnets.default.ids)[0]
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  # Docker + docker compose kurulumu — ilk açılışta bir kere çalışır.
  user_data = file("${path.module}/user-data.sh")

  tags = {
    Name = "cryptoterminal-app"
  }

  lifecycle {
    ignore_changes = [ami, user_data]
  }
}
