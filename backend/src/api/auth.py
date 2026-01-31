"""Cognito JWT authentication dependency for FastAPI."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import boto3
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.config import get_settings

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)

# Cache for JWKS keys — refreshed every 60 minutes.
_jwks_cache: dict[str, Any] = {}
_jwks_cache_ts: float = 0
_JWKS_TTL = 3600


def _get_jwks(region: str, user_pool_id: str) -> dict[str, Any]:
    """Fetch JWKS from Cognito (cached)."""
    global _jwks_cache, _jwks_cache_ts  # noqa: PLW0603

    now = time.monotonic()
    if _jwks_cache and (now - _jwks_cache_ts) < _JWKS_TTL:
        return _jwks_cache

    import urllib.request

    url = (
        f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}"
        "/.well-known/jwks.json"
    )
    with urllib.request.urlopen(url, timeout=5) as resp:
        _jwks_cache = json.loads(resp.read())
    _jwks_cache_ts = now
    return _jwks_cache


def _decode_jwt_unverified(token: str) -> tuple[dict, dict]:
    """Decode JWT header and payload without verification (for kid lookup)."""
    import base64

    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT format")

    def _b64decode(s: str) -> bytes:
        pad = 4 - len(s) % 4
        return base64.urlsafe_b64decode(s + "=" * pad)

    header = json.loads(_b64decode(parts[0]))
    payload = json.loads(_b64decode(parts[1]))
    return header, payload


def _verify_token(token: str) -> dict[str, Any]:
    """Verify a Cognito JWT token and return claims.

    Validates: expiration, issuer, token_use, audience (client_id).
    Uses RSA signature verification via `python-jose` if available,
    otherwise falls back to unverified decode (dev only).
    """
    settings = get_settings()
    region = settings.cognito_region or settings.aws_region
    user_pool_id = settings.cognito_user_pool_id
    client_id = settings.cognito_client_id
    issuer = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}"

    try:
        from jose import jwt as jose_jwt, JWTError

        jwks = _get_jwks(region, user_pool_id)
        claims = jose_jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            audience=client_id,
            issuer=issuer,
            options={"verify_at_hash": False},
        )
    except ImportError:
        # Fallback: decode without crypto verification (dev environments)
        logger.warning("python-jose not installed — skipping signature verification")
        _, claims = _decode_jwt_unverified(token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed: {exc}",
        ) from exc

    # Validate expiration
    if claims.get("exp", 0) < time.time():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )

    # Validate issuer
    if claims.get("iss") != issuer:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token issuer",
        )

    # Validate token_use (accept both id_token and access_token)
    token_use = claims.get("token_use")
    if token_use not in ("id", "access"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token_use",
        )

    return claims


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    """FastAPI dependency: extract and verify the current user from JWT.

    Returns the decoded token claims dict with at minimum:
    - sub: user ID
    - email: user email (from id_token)
    - token_use: "id" or "access"

    When auth is disabled (development), returns a placeholder user.
    """
    settings = get_settings()

    if not settings.auth_enabled:
        return {
            "sub": "dev-user",
            "email": "dev@localhost",
            "token_use": "id",
        }

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _verify_token(credentials.credentials)
