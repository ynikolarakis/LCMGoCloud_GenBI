"""Application configuration using pydantic-settings."""

import logging
from functools import lru_cache

from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "GenBI Platform"
    environment: str = "development"
    debug: bool = False
    log_level: str = "INFO"

    # Metadata database (PostgreSQL)
    # Option A: full connection string (local dev)
    metadata_db_url: str = ""
    # Option B: individual fields + Secrets Manager (AWS deployment)
    metadata_db_host: str = ""
    metadata_db_port: str = "5432"
    metadata_db_name: str = ""
    metadata_db_username: str = ""
    metadata_db_secret_arn: str = ""

    # AWS
    aws_region: str = "eu-central-1"
    secrets_manager_prefix: str = "genbi/connections"

    # LLM (Bedrock)
    bedrock_model_id: str = "anthropic.claude-sonnet-4-5-20250929-v1:0"
    bedrock_max_tokens: int = 4096

    # Auth (Cognito)
    cognito_user_pool_id: str = ""
    cognito_client_id: str = ""
    cognito_region: str = ""  # defaults to aws_region if empty
    auth_enabled: bool = False

    # Query execution limits
    query_timeout_seconds: int = 30
    query_max_rows: int = 10000

    # Rate limiting
    rate_limit_rpm: int = 60

    # CORS
    cors_origins: str = "*"  # comma-separated origins, or "*" for dev

    # Deep Enrichment Agent
    deep_enrich_model_id: str = "eu.anthropic.claude-opus-4-5-20251101-v1:0"
    deep_enrich_max_iterations: int = 50
    deep_enrich_query_timeout: int = 10
    deep_enrich_max_rows: int = 100

    # Connection pool
    metadata_db_pool_min: int = 1
    metadata_db_pool_max: int = 5

    model_config = {"env_prefix": "GENBI_", "env_file": ".env", "extra": "ignore"}

    def get_metadata_db_url(self) -> str:
        """Build the metadata DB connection string.

        Uses metadata_db_url if set directly (local dev).
        Otherwise builds it from individual fields, fetching the password
        from Secrets Manager if metadata_db_secret_arn is provided.
        """
        if self.metadata_db_url:
            return self.metadata_db_url

        if not self.metadata_db_host:
            # Fallback for local dev with no config at all
            return "host=localhost port=5432 dbname=genbi user=genbi password=genbi"

        password = self._fetch_db_password()
        return (
            f"host={self.metadata_db_host} "
            f"port={self.metadata_db_port} "
            f"dbname={self.metadata_db_name} "
            f"user={self.metadata_db_username} "
            f"password={password}"
        )

    def _fetch_db_password(self) -> str:
        """Retrieve database password from AWS Secrets Manager."""
        if not self.metadata_db_secret_arn:
            return ""
        try:
            import boto3

            client = boto3.client("secretsmanager", region_name=self.aws_region)
            resp = client.get_secret_value(SecretId=self.metadata_db_secret_arn)
            return resp["SecretString"]
        except Exception:
            logger.exception("Failed to retrieve DB password from Secrets Manager")
            raise


@lru_cache
def get_settings() -> Settings:
    return Settings()
