"""Tests for request logging and rate limiting middleware."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.middleware import RateLimitMiddleware, RequestLoggingMiddleware


def _make_app(rpm: int = 5) -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(RateLimitMiddleware, requests_per_minute=rpm)

    @app.get("/api/v1/health")
    async def health():
        return {"ok": True}

    @app.get("/test")
    async def test_route():
        return {"hello": "world"}

    return app


class TestRequestLogging:
    def test_adds_duration_header(self):
        client = TestClient(_make_app())
        resp = client.get("/test")
        assert resp.status_code == 200
        assert "X-Request-Duration-Ms" in resp.headers


class TestRateLimiting:
    def test_returns_rate_limit_headers(self):
        client = TestClient(_make_app(rpm=10))
        resp = client.get("/test")
        assert resp.status_code == 200
        assert resp.headers["X-RateLimit-Limit"] == "10"

    def test_blocks_after_limit_exceeded(self):
        client = TestClient(_make_app(rpm=3))
        for _ in range(3):
            resp = client.get("/test")
            assert resp.status_code == 200
        resp = client.get("/test")
        assert resp.status_code == 429
        assert "Retry-After" in resp.headers

    def test_health_exempt_from_rate_limit(self):
        client = TestClient(_make_app(rpm=2))
        # Exhaust limit
        for _ in range(2):
            client.get("/test")
        # Health should still work
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        # But /test should be blocked
        resp = client.get("/test")
        assert resp.status_code == 429
