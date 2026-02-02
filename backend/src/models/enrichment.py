"""Data models for schema enrichment."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


# ============================================================
# Database-Level Enrichment
# ============================================================


class DatabaseEnrichmentCreate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    business_domain: Optional[str] = None
    primary_language: str = "en"
    default_currency: Optional[str] = None
    default_timezone: Optional[str] = None
    tags: list[str] = []


class DatabaseEnrichment(DatabaseEnrichmentCreate):
    id: UUID = Field(default_factory=uuid4)
    connection_id: UUID
    enriched_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================
# Table-Level Enrichment
# ============================================================


class TableEnrichmentCreate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    business_purpose: Optional[str] = None
    update_frequency: Optional[str] = None
    data_owner: Optional[str] = None
    typical_queries: list[str] = []
    tags: list[str] = []
    is_sensitive: bool = False


class TableEnrichment(TableEnrichmentCreate):
    id: UUID = Field(default_factory=uuid4)
    table_id: UUID
    enrichment_score: float = 0.0
    enriched_by: Optional[str] = None
    enriched_at: datetime = Field(default_factory=datetime.utcnow)


class TableEnrichmentResponse(TableEnrichment):
    """Response includes table name for context."""
    schema_name: Optional[str] = None
    table_name: Optional[str] = None


# ============================================================
# Column-Level Enrichment
# ============================================================


class ColumnEnrichmentCreate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    business_meaning: Optional[str] = None
    synonyms: list[str] = []
    is_filterable: bool = True
    is_aggregatable: bool = True
    is_groupable: bool = True
    aggregation_functions: list[str] = ["COUNT", "SUM", "AVG"]
    format_pattern: Optional[str] = None
    pii_classification: Optional[str] = None
    value_guidance: Optional[str] = None


class ColumnEnrichment(ColumnEnrichmentCreate):
    id: UUID = Field(default_factory=uuid4)
    column_id: UUID
    enriched_at: datetime = Field(default_factory=datetime.utcnow)


class ColumnEnrichmentResponse(ColumnEnrichment):
    """Response includes column name for context."""
    column_name: Optional[str] = None
    data_type: Optional[str] = None


# ============================================================
# Column Value Descriptions (Categorical)
# ============================================================


class ColumnValueDescriptionCreate(BaseModel):
    value: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: bool = True


class ColumnValueDescription(ColumnValueDescriptionCreate):
    id: UUID = Field(default_factory=uuid4)
    column_id: UUID


class ColumnValuesUpdate(BaseModel):
    """Bulk update for column value descriptions."""
    values: list[ColumnValueDescriptionCreate]


# ============================================================
# Relationship Enrichment
# ============================================================


class RelationshipEnrichmentCreate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    join_hint: Optional[str] = None


class RelationshipEnrichment(RelationshipEnrichmentCreate):
    id: UUID = Field(default_factory=uuid4)
    relationship_id: UUID


# ============================================================
# Business Glossary
# ============================================================


class GlossaryTermCreate(BaseModel):
    term: str = Field(..., min_length=1, max_length=255)
    definition: Optional[str] = None
    calculation: Optional[str] = None
    related_tables: list[str] = []
    related_columns: list[str] = []
    synonyms: list[str] = []
    examples: list[str] = []


class GlossaryTerm(GlossaryTermCreate):
    id: UUID = Field(default_factory=uuid4)
    connection_id: UUID
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class GlossaryTermUpdate(BaseModel):
    term: Optional[str] = Field(None, min_length=1, max_length=255)
    definition: Optional[str] = None
    calculation: Optional[str] = None
    related_tables: Optional[list[str]] = None
    related_columns: Optional[list[str]] = None
    synonyms: Optional[list[str]] = None
    examples: Optional[list[str]] = None


# ============================================================
# Enrichment Score & Recommendations
# ============================================================


class TableScoreDetail(BaseModel):
    table_id: UUID
    schema_name: str
    table_name: str
    table_score: float
    column_scores_avg: float
    overall_score: float
    columns_enriched: int
    columns_total: int


class EnrichmentScoreReport(BaseModel):
    connection_id: UUID
    overall_score: float
    database_enriched: bool
    tables_enriched: int
    tables_total: int
    columns_enriched: int
    columns_total: int
    glossary_terms: int
    table_details: list[TableScoreDetail] = []


class EnrichmentRecommendation(BaseModel):
    priority: int  # 1 = highest
    category: str  # "table", "column", "value", "relationship", "glossary"
    target_type: str  # "table", "column", etc.
    target_id: Optional[UUID] = None
    target_name: str
    message: str
    action: str  # "add_description", "add_values", "add_glossary", etc.


# ============================================================
# AI Suggestion Models
# ============================================================


class TableEnrichmentSuggestion(BaseModel):
    """AI-generated suggestion for table enrichment."""
    display_name: Optional[str] = None
    description: Optional[str] = None
    business_purpose: Optional[str] = None
    typical_queries: list[str] = []
    tags: list[str] = []
    confidence: float = 0.0


class ColumnEnrichmentSuggestion(BaseModel):
    """AI-generated suggestion for column enrichment."""
    display_name: Optional[str] = None
    description: Optional[str] = None
    business_meaning: Optional[str] = None
    synonyms: list[str] = []
    is_filterable: Optional[bool] = None
    is_aggregatable: Optional[bool] = None
    suggested_aggregations: list[str] = []
    confidence: float = 0.0


class ValueDescriptionSuggestion(BaseModel):
    """AI-generated suggestion for a single value description."""
    value: str
    display_name: Optional[str] = None
    description: Optional[str] = None


class GlossaryTermSuggestion(BaseModel):
    """AI-generated suggestion for a glossary term."""
    term: str
    definition: Optional[str] = None
    calculation: Optional[str] = None
    related_tables: list[str] = []
    related_columns: list[str] = []
    confidence: float = 0.0


# ============================================================
# Example Queries (Golden Queries)
# ============================================================


class ExampleQueryCreate(BaseModel):
    question: str = Field(..., min_length=1)
    sql_query: str = Field(..., min_length=1)
    description: Optional[str] = None


class ExampleQuery(ExampleQueryCreate):
    id: UUID = Field(default_factory=uuid4)
    connection_id: UUID
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ExampleQueryUpdate(BaseModel):
    question: Optional[str] = Field(None, min_length=1)
    sql_query: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None


# ============================================================
# Software Detection & Guidance
# ============================================================


class SoftwareDetectionResult(BaseModel):
    """Result of detecting known software from table names."""
    software_name: str
    confidence: str  # "high", "medium", "low"
    reasoning: str
    doc_urls: list[str] = []
    guidance_text: str = ""


class SoftwareGuidance(BaseModel):
    """Persisted software guidance for a connection."""
    id: UUID = Field(default_factory=uuid4)
    connection_id: UUID
    software_name: str
    guidance_text: str = ""
    doc_urls: list[str] = []
    confirmed: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SoftwareGuidanceCreate(BaseModel):
    """Request body for confirming software guidance."""
    software_name: str
    guidance_text: str = ""
    doc_urls: list[str] = []


# ============================================================
# Bulk Enrichment
# ============================================================


class BulkEnrichmentOptions(BaseModel):
    """Options for bulk AI enrichment."""
    language: str = "en"
    include_tables: bool = True
    include_columns: bool = True
    include_values: bool = True
    include_glossary: bool = False
    overwrite_existing: bool = False


class BulkEnrichmentResult(BaseModel):
    """Result of a bulk AI enrichment operation."""
    connection_id: UUID
    tables_enriched: int = 0
    columns_enriched: int = 0
    values_enriched: int = 0
    glossary_terms_suggested: int = 0
    errors: list[str] = []
