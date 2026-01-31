"""Data models for database connections."""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, SecretStr


class DatabaseType(str, Enum):
    MSSQL = "mssql"
    MYSQL = "mysql"
    POSTGRESQL = "postgresql"


class ConnectionStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"


# --- Request Models ---


class ConnectionCreate(BaseModel):
    """Request body for creating a new connection."""

    name: str = Field(..., min_length=1, max_length=255, description="Display name")
    db_type: DatabaseType = Field(..., description="Database type")
    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(..., gt=0, le=65535)
    database: str = Field(..., min_length=1, max_length=255)
    username: str = Field(..., min_length=1, max_length=255)
    password: SecretStr = Field(..., description="Database password (stored in Secrets Manager)")
    ssl_enabled: bool = Field(default=True, description="Enable SSL/TLS")
    connection_timeout: int = Field(default=30, ge=5, le=120, description="Timeout in seconds")


class ConnectionUpdate(BaseModel):
    """Request body for updating a connection."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    host: Optional[str] = Field(None, min_length=1, max_length=255)
    port: Optional[int] = Field(None, gt=0, le=65535)
    database: Optional[str] = Field(None, min_length=1, max_length=255)
    username: Optional[str] = Field(None, min_length=1, max_length=255)
    password: Optional[SecretStr] = None
    ssl_enabled: Optional[bool] = None
    connection_timeout: Optional[int] = Field(None, ge=5, le=120)


# --- Internal / Stored Models ---


class ConnectionConfig(BaseModel):
    """Stored connection configuration (password stored in Secrets Manager)."""

    id: UUID = Field(default_factory=uuid4)
    name: str
    db_type: DatabaseType
    host: str
    port: int
    database: str
    username: str
    credentials_secret_arn: Optional[str] = Field(
        None, description="ARN of the secret in AWS Secrets Manager"
    )
    ssl_enabled: bool = True
    connection_timeout: int = 30
    status: ConnectionStatus = ConnectionStatus.INACTIVE
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_tested_at: Optional[datetime] = None


# --- Response Models ---


class ConnectionResponse(BaseModel):
    """API response for a connection (no secrets exposed)."""

    id: UUID
    name: str
    db_type: DatabaseType
    host: str
    port: int
    database: str
    username: str
    ssl_enabled: bool
    connection_timeout: int
    status: ConnectionStatus
    created_at: datetime
    updated_at: datetime
    last_tested_at: Optional[datetime] = None


class ConnectionTestResult(BaseModel):
    """Result of testing a database connection."""

    success: bool
    message: str
    latency_ms: Optional[float] = None
    server_version: Optional[str] = None
    error_code: Optional[str] = None


class ConnectionListResponse(BaseModel):
    """Paginated list of connections."""

    items: list[ConnectionResponse]
    total: int


# --- Default Ports ---

DEFAULT_PORTS: dict[DatabaseType, int] = {
    DatabaseType.MSSQL: 1433,
    DatabaseType.MYSQL: 3306,
    DatabaseType.POSTGRESQL: 5432,
}
