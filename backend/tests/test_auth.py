"""Tests for auth dependency."""

import base64
import json
import time
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

from src.api.auth import _decode_jwt_unverified, get_current_user
from src.main import app

client = TestClient(app, raise_server_exceptions=False)


def _make_jwt(payload: dict, header: dict | None = None) -> str:
    """Create a fake (unsigned) JWT for testing."""
    hdr = header or {"alg": "RS256", "kid": "test-kid"}

    def _b64(data: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    return f"{_b64(hdr)}.{_b64(payload)}.fakesig"


class TestDecodeJwtUnverified:
    def test_valid_jwt(self):
        payload = {"sub": "user1", "email": "a@b.com", "exp": int(time.time()) + 3600}
        token = _make_jwt(payload)
        header, decoded = _decode_jwt_unverified(token)
        assert decoded["sub"] == "user1"
        assert header["alg"] == "RS256"

    def test_invalid_format(self):
        with pytest.raises(ValueError, match="Invalid JWT"):
            _decode_jwt_unverified("not.a.jwt.token.too.many")


class TestGetCurrentUserAuthDisabled:
    def test_health_accessible(self):
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200

    def test_connections_accessible_without_token(self):
        """When auth_enabled=False (default), routes work without token."""
        from unittest.mock import AsyncMock
        with patch("src.api.connections.ConnectionManager") as MockMgr:
            from src.models.connection import ConnectionListResponse
            MockMgr.return_value.list_connections = AsyncMock(
                return_value=ConnectionListResponse(items=[], total=0)
            )
            resp = client.get("/api/v1/connections")
        assert resp.status_code == 200


class TestGetCurrentUserAuthEnabled:
    @patch("src.api.auth.get_settings")
    def test_missing_token_returns_401(self, mock_settings):
        s = MagicMock()
        s.auth_enabled = True
        s.cognito_user_pool_id = "us-east-1_test"
        s.cognito_client_id = "testclient"
        s.cognito_region = "us-east-1"
        s.aws_region = "us-east-1"
        mock_settings.return_value = s

        from fastapi import FastAPI
        from src.api.auth import get_current_user

        test_app = FastAPI()

        @test_app.get("/test")
        async def test_route(user=pytest.importorskip("fastapi").Depends(get_current_user)):
            return user

        from fastapi.testclient import TestClient as TC
        tc = TC(test_app, raise_server_exceptions=False)
        resp = tc.get("/test")
        assert resp.status_code == 401

    @patch("src.api.auth.get_settings")
    def test_expired_token_returns_401(self, mock_settings):
        s = MagicMock()
        s.auth_enabled = True
        s.cognito_user_pool_id = "us-east-1_test"
        s.cognito_client_id = "testclient"
        s.cognito_region = "us-east-1"
        s.aws_region = "us-east-1"
        mock_settings.return_value = s

        # Create expired token
        payload = {
            "sub": "user1",
            "email": "a@b.com",
            "exp": int(time.time()) - 3600,
            "iss": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test",
            "token_use": "id",
        }
        token = _make_jwt(payload)

        from fastapi import Depends, FastAPI
        test_app = FastAPI()

        @test_app.get("/test")
        async def test_route(user=Depends(get_current_user)):
            return user

        from fastapi.testclient import TestClient as TC
        tc = TC(test_app, raise_server_exceptions=False)
        resp = tc.get("/test", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401

    @patch("src.api.auth.get_settings")
    def test_valid_token_returns_claims(self, mock_settings):
        s = MagicMock()
        s.auth_enabled = True
        s.cognito_user_pool_id = "us-east-1_test"
        s.cognito_client_id = "testclient"
        s.cognito_region = "us-east-1"
        s.aws_region = "us-east-1"
        mock_settings.return_value = s

        payload = {
            "sub": "user1",
            "email": "a@b.com",
            "exp": int(time.time()) + 3600,
            "iss": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test",
            "token_use": "id",
        }
        token = _make_jwt(payload)

        from fastapi import Depends, FastAPI
        test_app = FastAPI()

        @test_app.get("/test")
        async def test_route(user=Depends(get_current_user)):
            return user

        from fastapi.testclient import TestClient as TC
        tc = TC(test_app, raise_server_exceptions=False)
        resp = tc.get("/test", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["sub"] == "user1"
