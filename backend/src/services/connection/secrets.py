"""AWS Secrets Manager integration for secure credential storage."""

from __future__ import annotations

import json
import logging

import boto3
from botocore.exceptions import ClientError

from src.config import get_settings

logger = logging.getLogger(__name__)


class SecretsManagerClient:
    """Manages database credentials in AWS Secrets Manager."""

    def __init__(self) -> None:
        settings = get_settings()
        self._client = boto3.client("secretsmanager", region_name=settings.aws_region)
        self._prefix = settings.secrets_manager_prefix

    def _secret_name(self, connection_id: str) -> str:
        return f"{self._prefix}/{connection_id}"

    async def store_password(self, connection_id: str, password: str) -> str:
        """Store a password and return the secret ARN."""
        import asyncio

        secret_name = self._secret_name(connection_id)
        secret_value = json.dumps({"password": password})

        def _create() -> str:
            try:
                response = self._client.create_secret(
                    Name=secret_name,
                    SecretString=secret_value,
                    Description=f"GenBI database credentials for connection {connection_id}",
                )
                return response["ARN"]
            except ClientError as e:
                if e.response["Error"]["Code"] == "ResourceExistsException":
                    # Update existing secret
                    self._client.put_secret_value(
                        SecretId=secret_name,
                        SecretString=secret_value,
                    )
                    response = self._client.describe_secret(SecretId=secret_name)
                    return response["ARN"]
                raise

        return await asyncio.to_thread(_create)

    async def get_password(self, connection_id: str) -> str:
        """Retrieve a password from Secrets Manager."""
        import asyncio

        secret_name = self._secret_name(connection_id)

        def _get() -> str:
            response = self._client.get_secret_value(SecretId=secret_name)
            secret = json.loads(response["SecretString"])
            return secret["password"]

        return await asyncio.to_thread(_get)

    async def delete_password(self, connection_id: str) -> None:
        """Delete a secret (with recovery window)."""
        import asyncio

        secret_name = self._secret_name(connection_id)

        def _delete() -> None:
            try:
                self._client.delete_secret(
                    SecretId=secret_name,
                    RecoveryWindowInDays=7,
                )
            except ClientError as e:
                if e.response["Error"]["Code"] != "ResourceNotFoundException":
                    raise
                logger.warning("Secret %s not found during deletion", secret_name)

        await asyncio.to_thread(_delete)
