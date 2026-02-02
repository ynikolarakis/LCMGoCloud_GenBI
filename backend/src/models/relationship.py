"""Request/response models for relationship CRUD."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class RelationshipCreate(BaseModel):
    from_table_id: str
    from_column_id: str
    to_table_id: str
    to_column_id: str
    relationship_type: str = "many-to-one"
    description: Optional[str] = None


class RelationshipUpdate(BaseModel):
    relationship_type: Optional[str] = None
    description: Optional[str] = None
