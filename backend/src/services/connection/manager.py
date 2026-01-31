"""Connection Manager service — business logic for database connections."""

from __future__ import annotations

import logging
from uuid import UUID

from src.connectors.base import ConnectorFactory
from src.db.session import get_db
from src.models.connection import (
    ConnectionConfig,
    ConnectionCreate,
    ConnectionListResponse,
    ConnectionResponse,
    ConnectionStatus,
    ConnectionTestResult,
    ConnectionUpdate,
)
from src.repositories.connection_repository import ConnectionRepository
from src.services.connection.secrets import SecretsManagerClient

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages database connections: CRUD, testing, credential storage."""

    def __init__(self, secrets_client: SecretsManagerClient | None = None):
        self._secrets = secrets_client or SecretsManagerClient()

    async def create_connection(self, request: ConnectionCreate) -> ConnectionResponse:
        """Create a new database connection configuration."""
        config = ConnectionConfig(
            name=request.name,
            db_type=request.db_type,
            host=request.host,
            port=request.port,
            database=request.database,
            username=request.username,
            ssl_enabled=request.ssl_enabled,
            connection_timeout=request.connection_timeout,
        )

        # Store password in Secrets Manager
        arn = await self._secrets.store_password(
            str(config.id), request.password.get_secret_value()
        )
        config.credentials_secret_arn = arn

        # Persist connection config
        async with get_db() as conn:
            repo = ConnectionRepository(conn)
            await repo.create(config)

        logger.info("Created connection %s (%s)", config.name, config.id)
        return self._to_response(config)

    async def get_connection(self, connection_id: UUID) -> ConnectionResponse | None:
        """Get a connection by ID."""
        async with get_db() as conn:
            repo = ConnectionRepository(conn)
            config = await repo.get_by_id(connection_id)
        if config is None:
            return None
        return self._to_response(config)

    async def list_connections(self) -> ConnectionListResponse:
        """List all connections."""
        async with get_db() as conn:
            repo = ConnectionRepository(conn)
            configs = await repo.list_all()
        items = [self._to_response(c) for c in configs]
        return ConnectionListResponse(items=items, total=len(items))

    async def update_connection(
        self, connection_id: UUID, request: ConnectionUpdate
    ) -> ConnectionResponse | None:
        """Update an existing connection."""
        async with get_db() as conn:
            repo = ConnectionRepository(conn)
            existing = await repo.get_by_id(connection_id)
            if existing is None:
                return None

            # Update password if provided
            if request.password is not None:
                await self._secrets.store_password(
                    str(connection_id), request.password.get_secret_value()
                )

            # Build update fields (exclude None values and password)
            update_fields = request.model_dump(exclude_none=True, exclude={"password"})
            if update_fields:
                updated = await repo.update(connection_id, **update_fields)
            else:
                updated = existing

        if updated is None:
            return None
        return self._to_response(updated)

    async def delete_connection(self, connection_id: UUID) -> bool:
        """Delete a connection and its stored credentials."""
        async with get_db() as conn:
            repo = ConnectionRepository(conn)
            deleted = await repo.delete(connection_id)

        if deleted:
            await self._secrets.delete_password(str(connection_id))
            logger.info("Deleted connection %s", connection_id)

        return deleted

    async def test_connection(self, connection_id: UUID) -> ConnectionTestResult:
        """Test a stored connection."""
        async with get_db() as conn:
            repo = ConnectionRepository(conn)
            config = await repo.get_by_id(connection_id)

        if config is None:
            return ConnectionTestResult(
                success=False,
                message="Connection not found",
                error_code="NOT_FOUND",
            )

        # Retrieve password
        try:
            password = await self._secrets.get_password(str(connection_id))
        except Exception as exc:
            return ConnectionTestResult(
                success=False,
                message=f"Failed to retrieve credentials: {exc}",
                error_code="SECRETS_ERROR",
            )

        # Test using connector
        connector = ConnectorFactory.create(config, password)
        result = await connector.test_connection()

        # Update status based on result
        new_status = ConnectionStatus.ACTIVE if result.success else ConnectionStatus.ERROR
        async with get_db() as conn:
            repo = ConnectionRepository(conn)
            await repo.update_status(connection_id, new_status)

        return result

    @staticmethod
    def _to_response(config: ConnectionConfig) -> ConnectionResponse:
        return ConnectionResponse(
            id=config.id,
            name=config.name,
            db_type=config.db_type,
            host=config.host,
            port=config.port,
            database=config.database,
            username=config.username,
            ssl_enabled=config.ssl_enabled,
            connection_timeout=config.connection_timeout,
            status=config.status,
            created_at=config.created_at,
            updated_at=config.updated_at,
            last_tested_at=config.last_tested_at,
        )
