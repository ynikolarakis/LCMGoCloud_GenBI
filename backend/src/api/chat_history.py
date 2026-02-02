"""API routes for chat conversation history persistence."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from src.db.session import get_db
from src.repositories.chat_repository import ChatRepository

router = APIRouter(tags=["chat-history"])


# ---- Request / Response models ----

class ConversationCreate(BaseModel):
    id: UUID
    title: str = ""
    chat_type: str = "chat"
    model_id: str = "opus"


class MessageCreate(BaseModel):
    id: UUID
    role: str
    content: str = ""
    response_data: Optional[dict] = None
    error: Optional[str] = None


class ConversationOut(BaseModel):
    id: UUID
    connection_id: UUID
    title: str
    chat_type: str
    model_id: str
    created_at: str
    updated_at: str


class MessageOut(BaseModel):
    id: UUID
    conversation_id: UUID
    role: str
    content: str
    response_data: Optional[dict] = None
    error: Optional[str] = None
    created_at: str


class ConversationWithMessages(BaseModel):
    conversation: ConversationOut
    messages: list[MessageOut]


# ---- Endpoints ----

@router.get(
    "/api/v1/connections/{connection_id}/conversations",
    response_model=list[ConversationOut],
    summary="List chat conversations for a connection",
)
async def list_conversations(connection_id: UUID, chat_type: str = "chat", limit: int = 50):
    async with get_db() as conn:
        repo = ChatRepository(conn)
        convs = await repo.list_conversations(connection_id, chat_type, limit)
    return [
        ConversationOut(
            id=c.id,
            connection_id=c.connection_id,
            title=c.title,
            chat_type=c.chat_type,
            model_id=c.model_id,
            created_at=c.created_at.isoformat(),
            updated_at=c.updated_at.isoformat(),
        )
        for c in convs
    ]


@router.post(
    "/api/v1/connections/{connection_id}/conversations",
    response_model=ConversationOut,
    status_code=201,
    summary="Create a new conversation",
)
async def create_conversation(connection_id: UUID, body: ConversationCreate):
    async with get_db() as conn:
        repo = ChatRepository(conn)
        c = await repo.create_conversation(
            conv_id=body.id,
            connection_id=connection_id,
            title=body.title,
            chat_type=body.chat_type,
            model_id=body.model_id,
        )
    return ConversationOut(
        id=c.id,
        connection_id=c.connection_id,
        title=c.title,
        chat_type=c.chat_type,
        model_id=c.model_id,
        created_at=c.created_at.isoformat(),
        updated_at=c.updated_at.isoformat(),
    )


@router.get(
    "/api/v1/conversations/{conversation_id}",
    response_model=ConversationWithMessages,
    summary="Get conversation with all messages",
)
async def get_conversation(conversation_id: UUID):
    async with get_db() as conn:
        repo = ChatRepository(conn)
        c = await repo.get_conversation(conversation_id)
        if not c:
            raise HTTPException(status_code=404, detail="Conversation not found")
        msgs = await repo.list_messages(conversation_id)
    return ConversationWithMessages(
        conversation=ConversationOut(
            id=c.id,
            connection_id=c.connection_id,
            title=c.title,
            chat_type=c.chat_type,
            model_id=c.model_id,
            created_at=c.created_at.isoformat(),
            updated_at=c.updated_at.isoformat(),
        ),
        messages=[
            MessageOut(
                id=m.id,
                conversation_id=m.conversation_id,
                role=m.role,
                content=m.content,
                response_data=m.response_data,
                error=m.error,
                created_at=m.created_at.isoformat(),
            )
            for m in msgs
        ],
    )


@router.post(
    "/api/v1/conversations/{conversation_id}/messages",
    response_model=MessageOut,
    status_code=201,
    summary="Add a message to a conversation",
)
async def add_message(conversation_id: UUID, body: MessageCreate):
    async with get_db() as conn:
        repo = ChatRepository(conn)
        m = await repo.add_message(
            msg_id=body.id,
            conv_id=conversation_id,
            role=body.role,
            content=body.content,
            response_data=body.response_data,
            error=body.error,
        )
    return MessageOut(
        id=m.id,
        conversation_id=m.conversation_id,
        role=m.role,
        content=m.content,
        response_data=m.response_data,
        error=m.error,
        created_at=m.created_at.isoformat(),
    )


@router.delete(
    "/api/v1/conversations/{conversation_id}",
    status_code=204,
    summary="Delete a conversation and its messages",
)
async def delete_conversation(conversation_id: UUID):
    async with get_db() as conn:
        repo = ChatRepository(conn)
        deleted = await repo.delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")


@router.delete(
    "/api/v1/connections/{connection_id}/conversations",
    status_code=204,
    summary="Delete all conversations for a connection",
)
async def delete_all_conversations(connection_id: UUID, chat_type: str = "chat"):
    async with get_db() as conn:
        repo = ChatRepository(conn)
        await repo.delete_all_conversations(connection_id, chat_type)
