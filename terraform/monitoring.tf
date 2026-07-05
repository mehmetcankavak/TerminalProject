# ── Bildirim kanalı ──────────────────────────────────────────────────
resource "aws_sns_topic" "alerts" {
  name = "cryptoterminal-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = "mckavak10@gmail.com"
}

# ── EC2 alarmları ────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "ec2_cpu_high" {
  alarm_name          = "cryptoterminal-ec2-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "EC2 CPU kullanimi 15 dakikadir %80'in uzerinde"
  dimensions = {
    InstanceId = aws_instance.app.id
  }
  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "ec2_status_check_failed" {
  alarm_name          = "cryptoterminal-ec2-status-check-failed"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "EC2 instance/system status check hatasi"
  dimensions = {
    InstanceId = aws_instance.app.id
  }
  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# ── RDS alarmları ────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  alarm_name          = "cryptoterminal-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "RDS CPU kullanimi 15 dakikadir %80'in uzerinde"
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.cryptoterminal.identifier
  }
  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_storage_low" {
  alarm_name          = "cryptoterminal-rds-storage-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 2 * 1024 * 1024 * 1024 # 2 GB
  alarm_description   = "RDS bos disk alani 2GB'in altinda"
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.cryptoterminal.identifier
  }
  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ── Uygulama logları ─────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "app" {
  name              = "/cryptoterminal/app"
  retention_in_days = 14
}

resource "aws_iam_role_policy" "ec2_cloudwatch_logs" {
  name = "cloudwatch-logs-cryptoterminal"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
        ]
        Resource = "${aws_cloudwatch_log_group.app.arn}:*"
      },
    ]
  })
}

# structlog "level":"error" satırlarını sayan bir metrik üretir — uygulama
# içindeki hatalar da (altyapı sorunu olmasa bile) alarm tetikler.
resource "aws_cloudwatch_log_metric_filter" "app_errors" {
  name           = "cryptoterminal-app-errors"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "\"\\\"level\\\": \\\"error\\\"\""

  metric_transformation {
    name      = "AppErrorCount"
    namespace = "CryptoTerminal"
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "app_errors_high" {
  alarm_name          = "cryptoterminal-app-error-rate-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "AppErrorCount"
  namespace           = "CryptoTerminal"
  period              = 300
  statistic           = "Sum"
  threshold           = 20
  alarm_description   = "5 dakikada 20'den fazla uygulama hatasi loglandi"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
