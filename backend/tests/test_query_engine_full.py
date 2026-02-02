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
            mock_get.return_value = MagicMock(
                id=CONN_ID, name="test", host="localhost", port=5432,
                database="testdb", username="user", db_type="postgresql",
            )
            # Mock secrets
            engine._secrets = MagicMock()
            engine._secrets.get_password = AsyncMock(return_value="pass")

            # Mock context
            engine._context_gen = MagicMock()
            engine._context_gen.generate_relevant_context = AsyncMock(return_value="context")

            # Mock LLM
            llm_response = json.dumps({"sql": "SELECT COUNT(*) FROM orders", "explanation": "Counts orders"})
            engine._invoke_llm = AsyncMock(return_value=(llm_response, 100, 50))

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
            mock_get.return_value = MagicMock(
                id=CONN_ID, name="test", host="localhost", port=5432,
                database="testdb", username="user", db_type="postgresql",
            )
            engine._secrets = MagicMock()
            engine._secrets.get_password = AsyncMock(return_value="pass")
            engine._context_gen = MagicMock()
            engine._context_gen.generate_relevant_context = AsyncMock(return_value="ctx")
            engine._invoke_llm = AsyncMock(side_effect=RuntimeError("LLM down"))
            # Patch _can_expand to prevent retries in this test
            engine._can_expand = staticmethod(lambda *a: False)

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
            mock_get.return_value = MagicMock(
                id=CONN_ID, name="test", host="localhost", port=5432,
                database="testdb", username="user", db_type="postgresql",
            )
            engine._secrets = MagicMock()
            engine._secrets.get_password = AsyncMock(return_value="pass")
            engine._context_gen = MagicMock()
            engine._context_gen.generate_relevant_context = AsyncMock(return_value="ctx")
            engine._invoke_llm = AsyncMock(return_value=(json.dumps({"sql": "DROP TABLE x", "explanation": "bad"}), 100, 50))

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
            mock_get.return_value = MagicMock(
                id=CONN_ID, name="test", host="localhost", port=5432,
                database="testdb", username="user", db_type="postgresql",
            )
            engine._secrets = MagicMock()
            engine._secrets.get_password = AsyncMock(return_value="pass")
            engine._context_gen = MagicMock()
            engine._context_gen.generate_relevant_context = AsyncMock(return_value="ctx")
            engine._invoke_llm = AsyncMock(return_value=(json.dumps({"sql": "SELECT 1", "explanation": "ok"}), 100, 50))
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
            mock_get.return_value = MagicMock(
                id=CONN_ID, name="test", host="localhost", port=5432,
                database="testdb", username="user", db_type="postgresql",
            )
            engine._secrets = MagicMock()
            engine._secrets.get_password = AsyncMock(return_value="pass")
            engine._context_gen = MagicMock()
            engine._context_gen.generate_relevant_context = AsyncMock(return_value="ctx")
            engine._invoke_llm = AsyncMock(return_value=(json.dumps({"sql": "SELECT 1", "explanation": "ok"}), 100, 50))
            mock_validate.return_value = "SELECT 1"

            from src.services.query.executor import ExecutionResult
            mock_exec.return_value = ExecutionResult(columns=["c"], rows=[[1]], row_count=1, execution_time_ms=5)

            history = [ConversationTurn(role="user", question="Q1", sql="SELECT 1", answer="1")]
            request = QueryRequest(question="follow up?")
            result = await engine.ask(CONN_ID, request, conversation_history=history)

        from src.models.query import QueryResponse
        assert isinstance(result, QueryResponse)


class TestDynamicContextExpansion:
    """Tests for the context expansion retry logic."""

    @patch("src.services.query.engine.execute_query")
    @patch("src.services.query.engine.validate_sql")
    @patch("src.services.query.engine.get_db")
    async def test_execution_error_triggers_retry_with_expanded_context(
        self, mock_db, mock_validate, mock_exec
    ):
        engine = _make_engine()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        from src.repositories.connection_repository import ConnectionRepository
        with patch.object(ConnectionRepository, "get_by_id", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = MagicMock(
                id=CONN_ID, name="test", host="localhost", port=5432,
                database="testdb", username="user", db_type="postgresql",
            )
            engine._secrets = MagicMock()
            engine._secrets.get_password = AsyncMock(return_value="pass")
            engine._context_gen = MagicMock()
            engine._context_gen.generate_relevant_context = AsyncMock(return_value="ctx")

            sql_resp = json.dumps({"sql": "SELECT * FROM orders", "explanation": "ok"})
            engine._invoke_llm = AsyncMock(return_value=(sql_resp, 100, 50))
            mock_validate.return_value = "SELECT * FROM orders"

            from src.services.query.executor import QueryExecutionError, ExecutionResult
            # First call fails, second succeeds
            mock_exec.side_effect = [
                QueryExecutionError("relation 'orders' does not exist", is_timeout=False),
                ExecutionResult(columns=["id"], rows=[[1]], row_count=1, execution_time_ms=5),
            ]

            request = QueryRequest(question="Show orders")
            result = await engine.ask(CONN_ID, request)

        from src.models.query import QueryResponse
        assert isinstance(result, QueryResponse)
        # Context generator called twice (20K then 40K)
        calls = engine._context_gen.generate_relevant_context.call_args_list
        assert len(calls) == 2
        assert calls[0].kwargs["max_tokens"] == 20000
        assert calls[1].kwargs["max_tokens"] == 40000

    @patch("src.services.query.engine.execute_query")
    @patch("src.services.query.engine.validate_sql")
    @patch("src.services.query.engine.get_db")
    async def test_conversational_response_no_retry(self, mock_db, mock_validate, mock_exec):
        """Greetings/conversational responses should not trigger context expansion."""
        engine = _make_engine()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        from src.repositories.connection_repository import ConnectionRepository
        with patch.object(ConnectionRepository, "get_by_id", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = MagicMock(
                id=CONN_ID, name="test", host="localhost", port=5432,
                database="testdb", username="user", db_type="postgresql",
            )
            engine._secrets = MagicMock()
            engine._secrets.get_password = AsyncMock(return_value="pass")
            engine._context_gen = MagicMock()
            engine._context_gen.generate_relevant_context = AsyncMock(return_value="ctx")

            # LLM returns no SQL with a friendly explanation (not "can't find table")
            resp = json.dumps({"sql": None, "explanation": "Hello! How can I help you today?"})
            engine._invoke_llm = AsyncMock(return_value=(resp, 50, 30))

            request = QueryRequest(question="Hello")
            result = await engine.ask(CONN_ID, request)

        from src.models.query import QueryResponse
        assert isinstance(result, QueryResponse)
        assert result.sql == ""
        # Only one context call — no retry
        assert engine._context_gen.generate_relevant_context.call_count == 1

    @patch("src.services.query.engine.execute_query")
    @patch("src.services.query.engine.validate_sql")
    @patch("src.services.query.engine.get_db")
    async def test_null_sql_with_context_hint_triggers_retry(self, mock_db, mock_validate, mock_exec):
        """When LLM says 'could not find' a table, retry with more context."""
        engine = _make_engine()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        from src.repositories.connection_repository import ConnectionRepository
        with patch.object(ConnectionRepository, "get_by_id", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = MagicMock(
                id=CONN_ID, name="test", host="localhost", port=5432,
                database="testdb", username="user", db_type="postgresql",
            )
            engine._secrets = MagicMock()
            engine._secrets.get_password = AsyncMock(return_value="pass")
            engine._context_gen = MagicMock()
            engine._context_gen.generate_relevant_context = AsyncMock(return_value="ctx")

            # First: no SQL + "could not find", Second: returns SQL
            no_sql = json.dumps({"sql": None, "explanation": "Could not find a matching table in the schema."})
            with_sql = json.dumps({"sql": "SELECT * FROM orders", "explanation": "ok"})
            engine._invoke_llm = AsyncMock(side_effect=[(no_sql, 50, 30), (with_sql, 100, 50)])
            mock_validate.return_value = "SELECT * FROM orders"

            from src.services.query.executor import ExecutionResult
            mock_exec.return_value = ExecutionResult(columns=["id"], rows=[[1]], row_count=1, execution_time_ms=5)

            request = QueryRequest(question="Show orders")
            result = await engine.ask(CONN_ID, request)

        from src.models.query import QueryResponse
        assert isinstance(result, QueryResponse)
        assert result.sql == "SELECT * FROM orders"
        assert engine._context_gen.generate_relevant_context.call_count == 2

    def test_looks_like_needs_context(self):
        from src.services.query.engine import QueryEngine
        assert QueryEngine._looks_like_needs_context("Could not find the orders table") is True
        assert QueryEngine._looks_like_needs_context("Hello! How can I help?") is False
        assert QueryEngine._looks_like_needs_context("") is True

    def test_can_expand(self):
        from src.services.query.engine import QueryEngine, CONTEXT_MAX_TOKENS
        assert QueryEngine._can_expand(20000, 1, 3) is True
        assert QueryEngine._can_expand(20000, 3, 3) is False
        assert QueryEngine._can_expand(CONTEXT_MAX_TOKENS, 1, 3) is False


class TestParseJsonResponse:
    def test_plain_json(self):
        engine = _make_engine()
        result = engine._parse_json_response('{"sql": "SELECT 1"}')
        assert result["sql"] == "SELECT 1"

    def test_fenced_json(self):
        engine = _make_engine()
        result = engine._parse_json_response('```json\n{"sql": "SELECT 1"}\n```')
        assert result["sql"] == "SELECT 1"
