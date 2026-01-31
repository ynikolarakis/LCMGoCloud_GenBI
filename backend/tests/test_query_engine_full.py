"""Tests for QueryEngine.ask() pipeline with mocked dependencies."""

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from src.models.query import ConversationTurn, QueryRequest


CONN_ID = uuid4()


def _mock_settings():
    s = MagicMock()
    s.aws_region = "us-east-1"
    s.bedrock_model_id = "anthropic.claude-3"
    s.bedrock_max_tokens = 4096
    s.query_max_rows = 1000
    s.query_timeout_seconds = 30
    return s


def _make_engine():
    """Create QueryEngine with mocked boto3 and settings."""
    with patch("src.services.query.engine.get_settings", return_value=_mock_settings()):
        with patch("src.services.query.engine.boto3") as mock_boto:
            mock_boto.client.return_value = MagicMock()
            from src.services.query.engine import QueryEngine
            engine = QueryEngine()
    return engine


class TestAsk:
    @patch("src.services.query.engine.execute_query")
    @patch("src.services.query.engine.validate_sql")
    @patch("src.services.query.engine.get_db")
    async def test_success_pipeline(self, mock_db, mock_validate, mock_exec):
        engine = _make_engine()

        # Mock DB — connection lookup
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)
        from src.repositories.connection_repository import ConnectionRepository
        with patch.object(ConnectionRepository, "get_by_id", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {
                "id": str(CONN_ID), "name": "test", "host": "localhost", "port": 5432,
                "database": "testdb", "username": "user", "db_type": "postgresql",
            }
            # Mock secrets
            engine._secrets = MagicMock()
            engine._secrets.get_password = MagicMock(return_value="pass")

            # Mock context
            engine._context_gen = MagicMock()
            engine._context_gen.generate_relevant_context = AsyncMock(return_value="context")

            # Mock LLM
            llm_response = json.dumps({"sql": "SELECT COUNT(*) FROM orders", "explanation": "Counts orders"})
            engine._invoke_llm = AsyncMock(return_value=llm_response)

            mock_validate.return_value = "SELECT COUNT(*) FROM orders"

            from src.services.query.executor import ExecutionResult
            mock_exec.return_value = ExecutionResult(
                columns=["count"], rows=[[42]], row_count=1, execution_time_ms=10,
            )

            request = QueryRequest(question="How many orders?")
            result = await engine.ask(CONN_ID, request)

        from src.models.query import QueryResponse
        assert isinstance(result, QueryResponse)
        assert result.sql == "SELECT COUNT(*) FROM orders"
        assert result.rows == [[42]]

    @patch("src.services.query.engine.get_db")
    async def test_connection_not_found(self, mock_db):
        engine = _make_engine()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        from src.repositories.connection_repository import ConnectionRepository
        with patch.object(ConnectionRepository, "get_by_id", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = None
            engine._secrets = MagicMock()

            request = QueryRequest(question="test?")
            result = await engine.ask(CONN_ID, request)

        from src.models.query import QueryError
        assert isinstance(result, QueryError)
        assert "not found" in result.error

    @patch("src.services.query.engine.get_db")
    async def test_llm_failure_returns_error(self, mock_db):
        engine = _make_engine()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        from src.repositories.connection_repository import ConnectionRepository
        with patch.object(ConnectionRepository, "get_by_id", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {
                "id": str(CONN_ID), "name": "test", "host": "localhost", "port": 5432,
                "database": "testdb", "username": "user", "db_type": "postgresql",
            }
            engine._secrets = MagicMock()
            engine._secrets.get_password = MagicMock(return_value="pass")
            engine._context_gen = MagicMock()
            engine._context_gen.generate_relevant_context = AsyncMock(return_value="ctx")
            engine._invoke_llm = AsyncMock(side_effect=RuntimeError("LLM down"))

            request = QueryRequest(question="test?")
            result = await engine.ask(CONN_ID, request)

        from src.models.query import QueryError
        assert isinstance(result, QueryError)
        assert result.error_type == "generation"

    @patch("src.services.query.engine.execute_query")
    @patch("src.services.query.engine.validate_sql")
    @patch("src.services.query.engine.get_db")
    async def test_validation_failure(self, mock_db, mock_validate, mock_exec):
        engine = _make_engine()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        from src.repositories.connection_repository import ConnectionRepository
        with patch.object(ConnectionRepository, "get_by_id", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {
                "id": str(CONN_ID), "name": "test", "host": "localhost", "port": 5432,
                "database": "testdb", "username": "user", "db_type": "postgresql",
            }
            engine._secrets = MagicMock()
            engine._secrets.get_password = MagicMock(return_value="pass")
            engine._context_gen = MagicMock()
            engine._context_gen.generate_relevant_context = AsyncMock(return_value="ctx")
            engine._invoke_llm = AsyncMock(return_value=json.dumps({"sql": "DROP TABLE x", "explanation": "bad"}))

            from src.services.query.validator import QueryValidationError
            mock_validate.side_effect = QueryValidationError("Only SELECT")

            request = QueryRequest(question="test?")
            result = await engine.ask(CONN_ID, request)

        from src.models.query import QueryError
        assert isinstance(result, QueryError)
        assert result.error_type == "validation"

    @patch("src.services.query.engine.execute_query")
    @patch("src.services.query.engine.validate_sql")
    @patch("src.services.query.engine.get_db")
    async def test_execution_timeout(self, mock_db, mock_validate, mock_exec):
        engine = _make_engine()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        from src.repositories.connection_repository import ConnectionRepository
        with patch.object(ConnectionRepository, "get_by_id", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {
                "id": str(CONN_ID), "name": "test", "host": "localhost", "port": 5432,
                "database": "testdb", "username": "user", "db_type": "postgresql",
            }
            engine._secrets = MagicMock()
            engine._secrets.get_password = MagicMock(return_value="pass")
            engine._context_gen = MagicMock()
            engine._context_gen.generate_relevant_context = AsyncMock(return_value="ctx")
            engine._invoke_llm = AsyncMock(return_value=json.dumps({"sql": "SELECT 1", "explanation": "ok"}))
            mock_validate.return_value = "SELECT 1"

            from src.services.query.executor import QueryExecutionError
            mock_exec.side_effect = QueryExecutionError("Timed out", is_timeout=True)

            request = QueryRequest(question="test?")
            result = await engine.ask(CONN_ID, request)

        from src.models.query import QueryError
        assert isinstance(result, QueryError)
        assert result.error_type == "timeout"

    @patch("src.services.query.engine.execute_query")
    @patch("src.services.query.engine.validate_sql")
    @patch("src.services.query.engine.get_db")
    async def test_with_conversation_history(self, mock_db, mock_validate, mock_exec):
        engine = _make_engine()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        from src.repositories.connection_repository import ConnectionRepository
        with patch.object(ConnectionRepository, "get_by_id", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {
                "id": str(CONN_ID), "name": "test", "host": "localhost", "port": 5432,
                "database": "testdb", "username": "user", "db_type": "postgresql",
            }
            engine._secrets = MagicMock()
            engine._secrets.get_password = MagicMock(return_value="pass")
            engine._context_gen = MagicMock()
            engine._context_gen.generate_relevant_context = AsyncMock(return_value="ctx")
            engine._invoke_llm = AsyncMock(return_value=json.dumps({"sql": "SELECT 1", "explanation": "ok"}))
            mock_validate.return_value = "SELECT 1"

            from src.services.query.executor import ExecutionResult
            mock_exec.return_value = ExecutionResult(columns=["c"], rows=[[1]], row_count=1, execution_time_ms=5)

            history = [ConversationTurn(role="user", question="Q1", sql="SELECT 1", answer="1")]
            request = QueryRequest(question="follow up?")
            result = await engine.ask(CONN_ID, request, conversation_history=history)

        from src.models.query import QueryResponse
        assert isinstance(result, QueryResponse)


class TestParseJsonResponse:
    def test_plain_json(self):
        engine = _make_engine()
        result = engine._parse_json_response('{"sql": "SELECT 1"}')
        assert result["sql"] == "SELECT 1"

    def test_fenced_json(self):
        engine = _make_engine()
        result = engine._parse_json_response('```json\n{"sql": "SELECT 1"}\n```')
        assert result["sql"] == "SELECT 1"
