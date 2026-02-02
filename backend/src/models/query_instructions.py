"""Data models for query instructions."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class QueryInstruction(BaseModel):
    """A single query instruction for a connection."""

    id: UUID = Field(default_factory=uuid4)
    connection_id: UUID
    instruction: str
    sort_order: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class QueryInstructionCreate(BaseModel):
    """Request to create/update an instruction."""

    instruction: str = Field(..., min_length=1)
    sort_order: int = 0


class QueryInstructionsBatchSave(BaseModel):
    """Batch save request — replaces all instructions for a connection."""

    instructions: list[QueryInstructionCreate]
