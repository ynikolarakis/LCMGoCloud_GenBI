"""Tests for the query engine (mocked LLM + executor)."""

from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4

import pytest

from src.models.query import ConversationTurn, QueryRequest
from src.services.query.engine import QueryEngine


class TestQueryEngine:
    @patch("boto3.client")
    async def test_ask_returns_error_for_missing_connection(self, mock_boto):
        engine = QueryEngine()

        with patch("src.services.query.engine.get_db") as mock_db:
            mock_conn = AsyncMock()
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

            from src.repositories.connection_repository import ConnectionRepository
            with patch.object(ConnectionRepository, "get_by_id", return_value=None):
                result = await engine.ask(uuid4(), QueryRequest(question="How many orders?"))

        from src.models.query import QueryError
        assert isinstance(result, QueryError)
        assert result.error_type == "validation"


class TestConversationHistory:
    def test_prompt_includes_history(self):
        from src.services.query.prompts import (
            CONVERSATION_HISTORY_PREFIX,
            CONVERSATION_TURN_TEMPLATE,
        )

        turns = [
            ConversationTurn(role="user", question="Total orders?", sql="SELECT COUNT(*) FROM orders", answer="1500"),
        ]
        turn_text = "\n".join(
            CONVERSATION_TURN_TEMPLATE.format(
                question=t.question, sql=t.sql, answer=t.answer
            )
            for t in turns
        )
        history = CONVERSATION_HISTORY_PREFIX.format(turns=turn_text)
        assert "Total orders?" in history
        assert "Previous conversation" in history


class TestParseJson:
    @patch("boto3.client")
    def test_parse_plain_json(self, mock_boto):
        engine = QueryEngine()
        result = engine._parse_json_response('{"sql": "SELECT 1", "explanation": "test"}')
        assert result["sql"] == "SELECT 1"

    @patch("boto3.client")
    def test_parse_fenced_json(self, mock_boto):
        engine = QueryEngine()
        text = '```json\n{"sql": "SELECT 1", "explanation": "test"}\n```'
        result = engine._parse_json_response(text)
        assert result["sql"] == "SELECT 1"
