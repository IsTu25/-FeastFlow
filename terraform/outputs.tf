output "public_ip" {
  value = aws_instance.app_server.public_ip
}

output "ecr_repository_urls" {
  value = {
    identity_provider = aws_ecr_repository.identity_provider.repository_url
    order_gateway     = aws_ecr_repository.order_gateway.repository_url
    stock_service     = aws_ecr_repository.stock_service.repository_url
    kitchen_queue     = aws_ecr_repository.kitchen_queue.repository_url
    notification_hub  = aws_ecr_repository.notification_hub.repository_url
  }
}
