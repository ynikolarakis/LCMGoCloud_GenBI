"""Tests for SecretsManagerClient."""

import json
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError

from src.services.connection.secrets import SecretsManagerClient


class TestSecretsManagerClient:
    @patch("boto3.client")
    def setup_method(self, _method, mock_boto):
        self.mock_client = MagicMock()
        mock_boto.return_value = self.mock_client
        self.secrets = SecretsManagerClient()

    async def test_store_password_creates_secret(self):
        self.mock_client.create_secret.return_value = {"ARN": "arn:aws:secretsmanager:eu-west-1:123:secret:test"}
        arn = await self.secrets.store_password("conn-1", "mypass")
        assert arn == "arn:aws:secretsmanager:eu-west-1:123:secret:test"
        self.mock_client.create_secret.assert_called_once()
        call_args = self.mock_client.create_secret.call_args
        assert json.loads(call_args.kwargs["SecretString"])["password"] == "mypass"

    async def test_store_password_updates_existing(self):
        error_response = {"Error": {"Code": "ResourceExistsException", "Message": "exists"}}
        self.mock_client.create_secret.side_effect = ClientError(error_response, "CreateSecret")
        self.mock_client.describe_secret.return_value = {"ARN": "arn:existing"}
        arn = await self.secrets.store_password("conn-1", "newpass")
        assert arn == "arn:existing"
        self.mock_client.put_secret_value.assert_called_once()

    async def test_store_password_raises_on_other_error(self):
        error_response = {"Error": {"Code": "InternalServiceError", "Message": "fail"}}
        self.mock_client.create_secret.side_effect = ClientError(error_response, "CreateSecret")
        with pytest.raises(ClientError):
            await self.secrets.store_password("conn-1", "pass")

    async def test_get_password(self):
        self.mock_client.get_secret_value.return_value = {
            "SecretString": json.dumps({"password": "secret123"})
        }
        result = await self.secrets.get_password("conn-1")
        assert result == "secret123"

    async def test_delete_password(self):
        await self.secrets.delete_password("conn-1")
        self.mock_client.delete_secret.assert_called_once()
        call_args = self.mock_client.delete_secret.call_args
        assert call_args.kwargs["RecoveryWindowInDays"] == 7

    async def test_delete_password_ignores_not_found(self):
        error_response = {"Error": {"Code": "ResourceNotFoundException", "Message": "gone"}}
        self.mock_client.delete_secret.side_effect = ClientError(error_response, "DeleteSecret")
        # Should not raise
        await self.secrets.delete_password("conn-1")

    async def test_delete_password_raises_on_other_error(self):
        error_response = {"Error": {"Code": "InternalServiceError", "Message": "fail"}}
        self.mock_client.delete_secret.side_effect = ClientError(error_response, "DeleteSecret")
        with pytest.raises(ClientError):
            await self.secrets.delete_password("conn-1")

    def test_secret_name_format(self):
        name = self.secrets._secret_name("abc-123")
        assert "abc-123" in name
        assert name.startswith(self.secrets._prefix)
