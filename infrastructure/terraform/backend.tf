terraform {
  backend "s3" {
    bucket         = "genbi-terraform-state-132934401449"
    key            = "staging/terraform.tfstate"
    region         = "eu-central-1"
    encrypt        = true
    dynamodb_table = "genbi-terraform-lock"
  }
}
