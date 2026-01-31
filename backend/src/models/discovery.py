"""Data models for schema discovery."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


# --- Core Discovery Models ---


class ForeignKeyRef(BaseModel):
    """Reference to a foreign key target."""

    constraint_name: Optional[str] = None
    target_schema: str
    target_table: str
    target_column: str


class ColumnInfo(BaseModel):
    """Discovered column metadata."""

    id: UUID = Field(default_factory=uuid4)
    table_id: Optional[UUID] = None
    column_name: str
    data_type: str
    is_nullable: bool = True
    is_primary_key: bool = False
    is_foreign_key: bool = False
    foreign_key_ref: Optional[ForeignKeyRef] = None
    column_default: Optional[str] = None
    ordinal_position: int = 0


class TableInfo(BaseModel):
    """Discovered table metadata."""

    id: UUID = Field(default_factory=uuid4)
    connection_id: Optional[UUID] = None
    schema_name: str
    table_name: str
    table_type: str = "BASE TABLE"  # BASE TABLE or VIEW
    row_count_estimate: Optional[int] = None
    columns: list[ColumnInfo] = []
    discovered_at: datetime = Field(default_factory=datetime.utcnow)


class Relationship(BaseModel):
    """Discovered or inferred relationship between tables."""

    id: UUID = Field(default_factory=uuid4)
    connection_id: Optional[UUID] = None
    constraint_name: Optional[str] = None
    from_schema: str
    from_table: str
    from_column: str
    to_schema: str
    to_table: str
    to_column: str
    relationship_type: str = "many-to-one"  # many-to-one, one-to-one, many-to-many
    is_auto_detected: bool = True
    description: Optional[str] = None


class DiscoveredSchema(BaseModel):
    """Complete discovered schema for a connection."""

    connection_id: UUID
    tables: list[TableInfo] = []
    relationships: list[Relationship] = []
    discovered_at: datetime = Field(default_factory=datetime.utcnow)
    table_count: int = 0
    column_count: int = 0


# --- Sample Data Models ---


class NumericStats(BaseModel):
    """Statistics for a numeric column."""

    min_value: Optional[float] = None
    max_value: Optional[float] = None
    avg_value: Optional[float] = None
    stddev_value: Optional[float] = None


class DateRange(BaseModel):
    """Date range for a date/datetime column."""

    min_date: Optional[str] = None
    max_date: Optional[str] = None


class ColumnSampleData(BaseModel):
    """Sample data and statistics for a column."""

    column_id: UUID
    column_name: str
    data_type: str
    distinct_values: Optional[list[str]] = None
    distinct_count: Optional[int] = None
    null_percentage: Optional[float] = None
    min_value: Optional[str] = None
    max_value: Optional[str] = None
    numeric_stats: Optional[NumericStats] = None
    date_range: Optional[DateRange] = None
    sampled_at: datetime = Field(default_factory=datetime.utcnow)


class TableSampleData(BaseModel):
    """Sample data for a table: sample rows + per-column stats."""

    table_id: UUID
    table_name: str
    sample_rows: list[dict] = []
    column_samples: list[ColumnSampleData] = []
    row_count_estimate: Optional[int] = None


# --- API Response Models ---


class DiscoveryStatusResponse(BaseModel):
    """Status of a discovery operation."""

    connection_id: UUID
    status: str  # running, completed, failed
    tables_found: int = 0
    columns_found: int = 0
    relationships_found: int = 0
    message: Optional[str] = None


class SchemaResponse(BaseModel):
    """API response for discovered schema."""

    connection_id: UUID
    tables: list[TableInfo]
    relationships: list[Relationship]
    table_count: int
    column_count: int
    discovered_at: Optional[datetime] = None


class TableDetailResponse(BaseModel):
    """Detailed table info including columns."""

    table: TableInfo
    sample_data: Optional[TableSampleData] = None
