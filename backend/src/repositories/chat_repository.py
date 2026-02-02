"""Repository for chat conversation persistence."""

from __future__ import annotations

import json
from typing import Optional
from uuid import UUID

import psycopg

from pydantic import BaseModel, Field
from datetime import datetime


class ChatConversationRow(BaseModel):
    id: UUID
    connection_id: UUID
    title: str = ""
    chat_type: str = "chat"
    model_id: str = "opus"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ChatMessageRow(BaseModel):
    id: UUID
    conversation_id: UUID
    role: str
    content: str = ""
    response_data: Optional[dict] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ChatRepository:
    """Persistence for chat conversations and messages."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    # ---- Conversations ----

    async def list_conversations(
        self, connection_id: UUID, chat_type: str = "chat", limit: int = 50
    ) -> list[ChatConversationRow]:
        cursor = await self.conn.execute(
            """
            SELECT * FROM chat_conversations
            WHERE connection_id = %s AND chat_type = %s
            ORDER BY updated_at DESC
            LIMIT %s
            """,
            (str(connection_id), chat_type, limit),
        )
        rows = await cursor.fetchall()
        return [self._row_to_conv(r) for r in rows]

    async def get_conversation(self, conv_id: UUID) -> Optional[ChatConversationRow]:
        cursor = await self.conn.execute(
            "SELECT * FROM chat_conversations WHERE id = %s",
            (str(conv_id),),
        )
        row = await cursor.fetchone()
        return self._row_to_conv(row) if row else None

    async def create_conversation(
        self,
        conv_id: UUID,
        connection_id: UUID,
        title: str,
        chat_type: str = "chat",
        model_id: str = "opus",
    ) -> ChatConversationRow:
        await self.conn.execute(
            """
            INSERT INTO chat_conversations (id, connection_id, title, chat_type, model_id)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (str(conv_id), str(connection_id), title[:200], chat_type, model_id),
        )
        return ChatConversationRow(
            id=conv_id,
            connection_id=connection_id,
            title=title[:200],
            chat_type=chat_type,
            model_id=model_id,
        )

    async def update_conversation_title(self, conv_id: UUID, title: str) -> None:
        await self.conn.execute(
            "UPDATE chat_conversations SET title = %s, updated_at = NOW() WHERE id = %s",
            (title[:200], str(conv_id)),
        )

    async def touch_conversation(self, conv_id: UUID) -> None:
        await self.conn.execute(
            "UPDATE chat_conversations SET updated_at = NOW() WHERE id = %s",
            (str(conv_id),),
        )

    async def delete_conversation(self, conv_id: UUID) -> bool:
        cursor = await self.conn.execute(
            "DELETE FROM chat_conversations WHERE id = %s", (str(conv_id),)
        )
        return cursor.rowcount > 0

    async def delete_all_conversations(
        self, connection_id: UUID, chat_type: str = "chat"
    ) -> int:
        cursor = await self.conn.execute(
            "DELETE FROM chat_conversations WHERE connection_id = %s AND chat_type = %s",
            (str(connection_id), chat_type),
        )
        return cursor.rowcount

    # ---- Messages ----

    async def list_messages(self, conv_id: UUID) -> list[ChatMessageRow]:
        cursor = await self.conn.execute(
            """
            SELECT * FROM chat_messages
            WHERE conversation_id = %s
            ORDER BY created_at ASC
            """,
            (str(conv_id),),
        )
        rows = await cursor.fetchall()
        return [self._row_to_msg(r) for r in rows]

    async def add_message(
        self,
        msg_id: UUID,
        conv_id: UUID,
        role: str,
        content: str = "",
        response_data: Optional[dict] = None,
        error: Optional[str] = None,
    ) -> ChatMessageRow:
        response_json = json.dumps(response_data) if response_data else None
        await self.conn.execute(
            """
            INSERT INTO chat_messages (id, conversation_id, role, content, response_data, error)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (str(msg_id), str(conv_id), role, content, response_json, error),
        )
        # Touch parent conversation
        await self.touch_conversation(conv_id)

        return ChatMessageRow(
            id=msg_id,
            conversation_id=conv_id,
            role=role,
            content=content,
            response_data=response_data,
            error=error,
        )

    # ---- Helpers ----

    @staticmethod
    def _row_to_conv(row: dict) -> ChatConversationRow:
        return ChatConversationRow(
            id=UUID(str(row["id"])),
            connection_id=UUID(str(row["connection_id"])),
            title=row.get("title", ""),
            chat_type=row.get("chat_type", "chat"),
            model_id=row.get("model_id", "opus"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _row_to_msg(row: dict) -> ChatMessageRow:
        resp = row.get("response_data")
        if isinstance(resp, str):
            resp = json.loads(resp)
        return ChatMessageRow(
            id=UUID(str(row["id"])),
            conversation_id=UUID(str(row["conversation_id"])),
            role=row["role"],
            content=row.get("content", ""),
            response_data=resp,
            error=row.get("error"),
            created_at=row["created_at"],
        )
