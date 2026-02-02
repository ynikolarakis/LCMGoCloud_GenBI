"""Data models for the Query Engine."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    """User's natural language question."""
    question: str = Field(..., min_length=1, max_length=2000)
    conversation_id: Optional[UUID] = None  # For multi-turn
    model_id: Optional[str] = None  # "opus", "sonnet", or "haiku"


class ConversationTurn(BaseModel):
    """A single turn in a multi-turn conversation."""
    role: str  # "user" or "assistant"
    question: Optional[str] = None
    sql: Optional[str] = None
    answer: Optional[str] = None


class QueryResponse(BaseModel):
    """Full response to a user query."""
    id: UUID = Field(default_factory=uuid4)
    connection_id: UUID
    conversation_id: UUID
    question: str
    sql: str
    explanation: str
    columns: list[str] = []
    rows: list[list] = []
    row_count: int = 0
    execution_time_ms: int = 0
    follow_up_questions: list[str] = []
    column_labels: dict[str, str] = {}
    input_tokens: int = 0
    output_tokens: int = 0
    model_used: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class QueryError(BaseModel):
    """Error response when query fails."""
    error: str
    error_type: str  # "validation", "generation", "execution", "timeout"
    question: str
    sql: Optional[str] = None


class MultiModelRequest(BaseModel):
    """Request to run a question against all models simultaneously."""
    question: str = Field(..., min_length=1, max_length=2000)
    conversation_id: Optional[UUID] = None


class MultiModelResponse(BaseModel):
    """Results from all models for a single question."""
    question: str
    results: dict[str, QueryResponse | QueryError] = {}


class ModelScore(BaseModel):
    """Evaluation score for a single model's response."""
    model_key: str
    model_name: str
    sql_correctness: int = Field(ge=0, le=100)
    result_accuracy: int = Field(ge=0, le=100)
    explanation_quality: int = Field(ge=0, le=100)
    input_tokens: int = 0
    output_tokens: int = 0
    token_cost_usd: float = 0.0
    execution_time_ms: int = 0
    notes: str = ""


class CompareRequest(BaseModel):
    """Request to compare results from multiple models."""
    question: str
    results: dict[str, QueryResponse | QueryError]


class CompareResponse(BaseModel):
    """Opus evaluation of all model responses."""
    scores: list[ModelScore] = []
    summary: str = ""


class QueryHistoryItem(BaseModel):
    """A saved query in history."""
    id: UUID = Field(default_factory=uuid4)
    connection_id: UUID
    conversation_id: UUID
    question: str
    sql: str
    explanation: str
    row_count: int = 0
    is_favorite: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
