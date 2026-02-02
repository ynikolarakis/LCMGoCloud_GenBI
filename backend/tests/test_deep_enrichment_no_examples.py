"""Tests that deep enrichment no longer saves AI-generated example queries."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4

from src.services.enrichment.deep_enrichment import DeepEnrichmentAgent, DeepEnrichOptions


class TestDeepEnrichmentNoExampleQueries:
    """Verify that _save_enrichment skips example_queries."""

    @pytest.mark.asyncio
    async def test_save_enrichment_skips_example_queries(self):
        """Even if LLM returns example_queries, they should not be saved."""
        agent = DeepEnrichmentAgent.__new__(DeepEnrichmentAgent)

        conn_id = uuid4()

        from src.models.discovery import TableInfo, ColumnInfo

        tables = [
            TableInfo(
                connection_id=conn_id,
                schema_name="public",
                table_name="orders",
                columns=[
                    ColumnInfo(column_name="id", data_type="int", is_primary_key=True),
                ],
            ),
        ]

        enrichment = {
            "database": {"display_name": "Test DB", "description": "A test database"},
            "tables": [],
            "columns": [],
            "value_descriptions": [],
            "glossary": [],
            "example_queries": [
                {
                    "question": "How many orders?",
                    "sql_query": "SELECT COUNT(*) FROM public.orders",
                    "description": "Count all orders",
                }
            ],
        }

        mock_repo = AsyncMock()

        with patch("src.services.enrichment.deep_enrichment.get_db") as mock_get_db:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=AsyncMock())
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_get_db.return_value = mock_ctx

            with patch("src.services.enrichment.deep_enrichment.EnrichmentRepository") as mock_repo_cls:
                mock_repo = AsyncMock()
                mock_repo_cls.return_value = mock_repo

                await agent._save_enrichment(conn_id, enrichment, tables)

        # create_example_query should NEVER be called
        mock_repo.create_example_query.assert_not_called()
        # But database enrichment should still be saved
        mock_repo.save_database_enrichment.assert_called_once()


class TestDeepEnrichmentPromptNoExamples:
    """Verify the prompt no longer asks for example queries."""

    def test_prompt_does_not_request_example_queries(self):
        from src.services.enrichment.deep_enrichment_prompts import build_deep_enrichment_prompt

        options = DeepEnrichOptions()
        prompt = build_deep_enrichment_prompt(
            schema_description="public.orders: id int PK, amount decimal",
            exploration_data='{"public.orders": {"columns": ["id", "amount"]}}',
            total_tables=1,
            total_columns=2,
            options=options,
        )

        # Should NOT contain the old instruction about generating example queries
        assert "write 5-10 practical business questions" not in prompt
        # Should contain the new instruction to NOT generate them
        assert "Do NOT generate" in prompt
        assert "example_queries" in prompt

    def test_prompt_example_queries_array_is_empty(self):
        from src.services.enrichment.deep_enrichment_prompts import build_deep_enrichment_prompt

        options = DeepEnrichOptions()
        prompt = build_deep_enrichment_prompt(
            schema_description="public.orders: id int PK",
            exploration_data="{}",
            total_tables=1,
            total_columns=1,
            options=options,
        )

        # The JSON template should have an empty example_queries array
        assert '"example_queries": []' in prompt
