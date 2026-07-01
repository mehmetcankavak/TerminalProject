#!/bin/bash
dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user
DOCKER_CONFIG_DIR=/usr/local/lib/docker/cli-plugins
mkdir -p $DOCKER_CONFIG_DIR
curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o $DOCKER_CONFIG_DIR/docker-compose
chmod +x $DOCKER_CONFIG_DIR/docker-compose
