"""Tests for query instructions API endpoints."""

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from src.main import app
from src.models.query_instructions import QueryInstruction

client = TestClient(app, raise_server_exceptions=False)


def _mock_db():
    mock_conn = AsyncMock()
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)
    return mock_ctx


def _make_instruction(conn_id, text="test instruction", idx=0):
    return QueryInstruction(
        id=uuid4(),
        connection_id=conn_id,
        instruction=text,
        sort_order=idx,
    )


class TestListInstructions:
    @patch("src.api.query_instructions.get_db")
    def test_list_empty(self, mock_get_db):
        conn_id = uuid4()
        mock_get_db.return_value = _mock_db()

        with patch("src.api.query_instructions.QueryInstructionsRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.get_by_connection.return_value = []
            mock_repo_cls.return_value = mock_repo

            response = client.get(f"/api/v1/connections/{conn_id}/instructions")

        assert response.status_code == 200
        assert response.json() == []

    @patch("src.api.query_instructions.get_db")
    def test_list_with_items(self, mock_get_db):
        conn_id = uuid4()
        mock_get_db.return_value = _mock_db()

        instructions = [
            _make_instruction(conn_id, "rule 1", 0),
            _make_instruction(conn_id, "rule 2", 1),
        ]

        with patch("src.api.query_instructions.QueryInstructionsRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.get_by_connection.return_value = instructions
            mock_repo_cls.return_value = mock_repo

            response = client.get(f"/api/v1/connections/{conn_id}/instructions")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["instruction"] == "rule 1"


class TestSaveInstructions:
    @patch("src.api.query_instructions.get_db")
    def test_save_batch(self, mock_get_db):
        conn_id = uuid4()
        mock_get_db.return_value = _mock_db()

        saved = [_make_instruction(conn_id, "new rule", 0)]

        with patch("src.api.query_instructions.QueryInstructionsRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.save_all.return_value = saved
            mock_repo_cls.return_value = mock_repo

            response = client.put(
                f"/api/v1/connections/{conn_id}/instructions",
                json={"instructions": [{"instruction": "new rule", "sort_order": 0}]},
            )

        assert response.status_code == 200
        assert len(response.json()) == 1


class TestGenerateInstructions:
    @patch("src.api.query_instructions.get_db")
    @patch("src.api.query_instructions._get_bedrock_client")
    @patch("src.api.query_instructions.LLMContextGenerator")
    def test_generate_instructions_only(self, mock_ctx_cls, mock_bedrock_fn, mock_get_db):
        """LLM returns old format (plain array) — backward compatible."""
        conn_id = uuid4()
        mock_get_db.return_value = _mock_db()

        # Context generator
        mock_ctx = AsyncMock()
        mock_ctx.generate_full_context.return_value = "schema context " * 20
        mock_ctx_cls.return_value = mock_ctx

        # Enrichment repo returns no example queries
        with patch("src.api.query_instructions.EnrichmentRepository") as mock_enrich_cls:
            mock_enrich = AsyncMock()
            mock_enrich.list_example_queries.return_value = []
            mock_enrich_cls.return_value = mock_enrich

            # Bedrock returns plain array
            llm_response = json.dumps(["Use UPPER case for brand", "Join on customer_id"])
            mock_body = MagicMock()
            mock_body.read.return_value = json.dumps({
                "content": [{"type": "text", "text": llm_response}]
            }).encode()
            mock_bedrock = MagicMock()
            mock_bedrock.invoke_model.return_value = {"body": mock_body}
            mock_bedrock_fn.return_value = mock_bedrock

            with patch("src.api.query_instructions.QueryInstructionsRepository") as mock_repo_cls:
                saved = [
                    _make_instruction(conn_id, "Use UPPER case for brand", 0),
                    _make_instruction(conn_id, "Join on customer_id", 1),
                ]
                mock_repo = AsyncMock()
                mock_repo.save_all.return_value = saved
                mock_repo_cls.return_value = mock_repo

                response = client.post(
                    f"/api/v1/connections/{conn_id}/instructions/generate"
                )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    @patch("src.api.query_instructions.get_db")
    @patch("src.api.query_instructions._get_bedrock_client")
    @patch("src.api.query_instructions.LLMContextGenerator")
    def test_generate_with_relationships(self, mock_ctx_cls, mock_bedrock_fn, mock_get_db):
        """LLM returns new format with instructions + relationships."""
        conn_id = uuid4()
        mock_get_db.return_value = _mock_db()

        mock_ctx = AsyncMock()
        mock_ctx.generate_full_context.return_value = "schema context " * 20
        mock_ctx_cls.return_value = mock_ctx

        with patch("src.api.query_instructions.EnrichmentRepository") as mock_enrich_cls:
            mock_enrich = AsyncMock()
            mock_enrich.list_example_queries.return_value = []
            mock_enrich_cls.return_value = mock_enrich

            llm_response = json.dumps({
                "instructions": ["rule 1"],
                "relationships": [
                    {
                        "from_table": "public.orders",
                        "from_column": "customer_id",
                        "to_table": "public.customers",
                        "to_column": "id",
                        "relationship_type": "many-to-one",
                        "description": "Order belongs to customer",
                    }
                ],
            })
            mock_body = MagicMock()
            mock_body.read.return_value = json.dumps({
                "content": [{"type": "text", "text": llm_response}]
            }).encode()
            mock_bedrock = MagicMock()
            mock_bedrock.invoke_model.return_value = {"body": mock_body}
            mock_bedrock_fn.return_value = mock_bedrock

            from src.models.discovery import TableInfo, ColumnInfo

            table_orders = TableInfo(
                connection_id=conn_id,
                schema_name="public",
                table_name="orders",
                columns=[ColumnInfo(column_name="customer_id", data_type="int")],
            )
            table_customers = TableInfo(
                connection_id=conn_id,
                schema_name="public",
                table_name="customers",
                columns=[ColumnInfo(column_name="id", data_type="int")],
            )

            with patch("src.api.query_instructions.QueryInstructionsRepository") as mock_qi_cls:
                saved = [_make_instruction(conn_id, "rule 1", 0)]
                mock_qi = AsyncMock()
                mock_qi.save_all.return_value = saved
                mock_qi_cls.return_value = mock_qi

                with patch("src.api.query_instructions.DiscoveryRepository") as mock_disc_cls:
                    mock_disc = AsyncMock()
                    mock_disc.get_tables.return_value = [table_orders, table_customers]
                    mock_disc.relationship_exists.return_value = False
                    mock_disc.create_relationship.return_value = {}
                    mock_disc_cls.return_value = mock_disc

                    response = client.post(
                        f"/api/v1/connections/{conn_id}/instructions/generate"
                    )

            assert response.status_code == 200
            # Verify relationship was created
            mock_disc.create_relationship.assert_called_once()

    @patch("src.api.query_instructions.get_db")
    @patch("src.api.query_instructions._get_bedrock_client")
    @patch("src.api.query_instructions.LLMContextGenerator")
    def test_generate_skips_existing_relationships(self, mock_ctx_cls, mock_bedrock_fn, mock_get_db):
        """Duplicate relationships are not created."""
        conn_id = uuid4()
        mock_get_db.return_value = _mock_db()

        mock_ctx = AsyncMock()
        mock_ctx.generate_full_context.return_value = "schema context " * 20
        mock_ctx_cls.return_value = mock_ctx

        with patch("src.api.query_instructions.EnrichmentRepository") as mock_enrich_cls:
            mock_enrich = AsyncMock()
            mock_enrich.list_example_queries.return_value = []
            mock_enrich_cls.return_value = mock_enrich

            llm_response = json.dumps({
                "instructions": ["rule 1"],
                "relationships": [
                    {
                        "from_table": "public.orders",
                        "from_column": "customer_id",
                        "to_table": "public.customers",
                        "to_column": "id",
                        "relationship_type": "many-to-one",
                    }
                ],
            })
            mock_body = MagicMock()
            mock_body.read.return_value = json.dumps({
                "content": [{"type": "text", "text": llm_response}]
            }).encode()
            mock_bedrock = MagicMock()
            mock_bedrock.invoke_model.return_value = {"body": mock_body}
            mock_bedrock_fn.return_value = mock_bedrock

            from src.models.discovery import TableInfo, ColumnInfo

            table_orders = TableInfo(
                connection_id=conn_id,
                schema_name="public",
                table_name="orders",
                columns=[ColumnInfo(column_name="customer_id", data_type="int")],
            )
            table_customers = TableInfo(
                connection_id=conn_id,
                schema_name="public",
                table_name="customers",
                columns=[ColumnInfo(column_name="id", data_type="int")],
            )

            with patch("src.api.query_instructions.QueryInstructionsRepository") as mock_qi_cls:
                mock_qi = AsyncMock()
                mock_qi.save_all.return_value = [_make_instruction(conn_id, "rule 1", 0)]
                mock_qi_cls.return_value = mock_qi

                with patch("src.api.query_instructions.DiscoveryRepository") as mock_disc_cls:
                    mock_disc = AsyncMock()
                    mock_disc.get_tables.return_value = [table_orders, table_customers]
                    mock_disc.relationship_exists.return_value = True  # already exists
                    mock_disc_cls.return_value = mock_disc

                    response = client.post(
                        f"/api/v1/connections/{conn_id}/instructions/generate"
                    )

            assert response.status_code == 200
            mock_disc.create_relationship.assert_not_called()

    @patch("src.api.query_instructions.get_db")
    @patch("src.api.query_instructions._get_bedrock_client")
    @patch("src.api.query_instructions.LLMContextGenerator")
    def test_generate_uses_example_queries(self, mock_ctx_cls, mock_bedrock_fn, mock_get_db):
        """Example queries are loaded and included in the prompt."""
        conn_id = uuid4()
        mock_get_db.return_value = _mock_db()

        mock_ctx = AsyncMock()
        mock_ctx.generate_full_context.return_value = "schema context " * 20
        mock_ctx_cls.return_value = mock_ctx

        from src.models.enrichment import ExampleQuery

        example = ExampleQuery(
            connection_id=conn_id,
            question="Total sales last month?",
            sql_query="SELECT SUM(amount) FROM orders",
            description="Monthly revenue",
        )

        with patch("src.api.query_instructions.EnrichmentRepository") as mock_enrich_cls:
            mock_enrich = AsyncMock()
            mock_enrich.list_example_queries.return_value = [example]
            mock_enrich_cls.return_value = mock_enrich

            llm_response = json.dumps(["rule from context"])
            mock_body = MagicMock()
            mock_body.read.return_value = json.dumps({
                "content": [{"type": "text", "text": llm_response}]
            }).encode()
            mock_bedrock = MagicMock()
            mock_bedrock.invoke_model.return_value = {"body": mock_body}
            mock_bedrock_fn.return_value = mock_bedrock

            with patch("src.api.query_instructions.QueryInstructionsRepository") as mock_qi_cls:
                mock_qi = AsyncMock()
                mock_qi.save_all.return_value = [_make_instruction(conn_id, "rule from context", 0)]
                mock_qi_cls.return_value = mock_qi

                response = client.post(
                    f"/api/v1/connections/{conn_id}/instructions/generate"
                )

        assert response.status_code == 200
        # Verify bedrock was called and prompt contains example query text
        call_args = mock_bedrock.invoke_model.call_args
        prompt_body = json.loads(call_args.kwargs["body"])
        prompt_text = prompt_body["messages"][0]["content"][0]["text"]
        assert "Total sales last month?" in prompt_text
        assert "SELECT SUM(amount) FROM orders" in prompt_text

    @patch("src.api.query_instructions.LLMContextGenerator")
    def test_generate_insufficient_context(self, mock_ctx_cls):
        conn_id = uuid4()

        mock_ctx = AsyncMock()
        mock_ctx.generate_full_context.return_value = "short"
        mock_ctx_cls.return_value = mock_ctx

        response = client.post(
            f"/api/v1/connections/{conn_id}/instructions/generate"
        )

        assert response.status_code == 400
        assert "Not enough enrichment" in response.json()["detail"]

    @patch("src.api.query_instructions.get_db")
    @patch("src.api.query_instructions._get_bedrock_client")
    @patch("src.api.query_instructions.LLMContextGenerator")
    def test_generate_llm_failure(self, mock_ctx_cls, mock_bedrock_fn, mock_get_db):
        conn_id = uuid4()
        mock_get_db.return_value = _mock_db()

        mock_ctx = AsyncMock()
        mock_ctx.generate_full_context.return_value = "schema context " * 20
        mock_ctx_cls.return_value = mock_ctx

        with patch("src.api.query_instructions.EnrichmentRepository") as mock_enrich_cls:
            mock_enrich = AsyncMock()
            mock_enrich.list_example_queries.return_value = []
            mock_enrich_cls.return_value = mock_enrich

            mock_bedrock = MagicMock()
            mock_bedrock.invoke_model.side_effect = RuntimeError("LLM down")
            mock_bedrock_fn.return_value = mock_bedrock

            response = client.post(
                f"/api/v1/connections/{conn_id}/instructions/generate"
            )

        assert response.status_code == 502

    @patch("src.api.query_instructions.get_db")
    @patch("src.api.query_instructions._get_bedrock_client")
    @patch("src.api.query_instructions.LLMContextGenerator")
    def test_generate_invalid_json(self, mock_ctx_cls, mock_bedrock_fn, mock_get_db):
        conn_id = uuid4()
        mock_get_db.return_value = _mock_db()

        mock_ctx = AsyncMock()
        mock_ctx.generate_full_context.return_value = "schema context " * 20
        mock_ctx_cls.return_value = mock_ctx

        with patch("src.api.query_instructions.EnrichmentRepository") as mock_enrich_cls:
            mock_enrich = AsyncMock()
            mock_enrich.list_example_queries.return_value = []
            mock_enrich_cls.return_value = mock_enrich

            mock_body = MagicMock()
            mock_body.read.return_value = json.dumps({
                "content": [{"type": "text", "text": "not valid json {{{"}]
            }).encode()
            mock_bedrock = MagicMock()
            mock_bedrock.invoke_model.return_value = {"body": mock_body}
            mock_bedrock_fn.return_value = mock_bedrock

            response = client.post(
                f"/api/v1/connections/{conn_id}/instructions/generate"
            )

        assert response.status_code == 502
        assert "invalid format" in response.json()["detail"]

    @patch("src.api.query_instructions.get_db")
    @patch("src.api.query_instructions._get_bedrock_client")
    @patch("src.api.query_instructions.LLMContextGenerator")
    def test_generate_handles_markdown_wrapped_json(self, mock_ctx_cls, mock_bedrock_fn, mock_get_db):
        """LLM sometimes wraps JSON in markdown code blocks."""
        conn_id = uuid4()
        mock_get_db.return_value = _mock_db()

        mock_ctx = AsyncMock()
        mock_ctx.generate_full_context.return_value = "schema context " * 20
        mock_ctx_cls.return_value = mock_ctx

        with patch("src.api.query_instructions.EnrichmentRepository") as mock_enrich_cls:
            mock_enrich = AsyncMock()
            mock_enrich.list_example_queries.return_value = []
            mock_enrich_cls.return_value = mock_enrich

            # Wrap in markdown
            llm_text = '```json\n{"instructions": ["rule 1"], "relationships": []}\n```'
            mock_body = MagicMock()
            mock_body.read.return_value = json.dumps({
                "content": [{"type": "text", "text": llm_text}]
            }).encode()
            mock_bedrock = MagicMock()
            mock_bedrock.invoke_model.return_value = {"body": mock_body}
            mock_bedrock_fn.return_value = mock_bedrock

            with patch("src.api.query_instructions.QueryInstructionsRepository") as mock_qi_cls:
                mock_qi = AsyncMock()
                mock_qi.save_all.return_value = [_make_instruction(conn_id, "rule 1", 0)]
                mock_qi_cls.return_value = mock_qi

                response = client.post(
                    f"/api/v1/connections/{conn_id}/instructions/generate"
                )

        assert response.status_code == 200
