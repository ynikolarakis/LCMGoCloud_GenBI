output "elastic_ip" {
  description = "Public Elastic IP address of the staging server"
  value       = aws_eip.staging.public_ip
}

output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.staging.id
}

output "ssh_command" {
  description = "SSH command to connect to the staging server"
  value       = "ssh cronos@${aws_eip.staging.public_ip}"
}

output "web_url" {
  description = "URL to access the staging frontend"
  value       = "http://${aws_eip.staging.public_ip}"
}
