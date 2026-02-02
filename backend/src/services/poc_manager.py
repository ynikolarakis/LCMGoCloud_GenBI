"""POC sharing manager — orchestrates deep copy of connections and enrichment."""

from __future__ import annotations

import logging
import os
import shutil
from datetime import datetime
from uuid import UUID, uuid4

import bcrypt
import psycopg

from src.config import get_settings
from src.models.poc import PocInstance
from src.repositories.poc_repository import PocRepository

logger = logging.getLogger(__name__)


class PocManager:
    """Creates and manages POC instances with deep-copied enrichment data."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn
        self.repo = PocRepository(conn)

    async def create_poc(
        self,
        source_connection_id: UUID,
        customer_name: str,
        password: str,
        model_id: str,
        logo_data: bytes | None = None,
        logo_filename: str | None = None,
    ) -> PocInstance:
        """Create a POC instance with deep-copied connection and enrichment."""
        poc_id = uuid4()

        # Deep copy connection
        poc_connection_id = await self._deep_copy_connection(
            source_connection_id, customer_name
        )

        # Deep copy all enrichment data
        await self._deep_copy_enrichment(source_connection_id, poc_connection_id)

        # Save logo if provided
        logo_path = None
        if logo_data and logo_filename:
            logo_path = self._save_logo(poc_id, logo_data, logo_filename)

        # Hash password
        password_hash = bcrypt.hashpw(
            password.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")

        # Create POC instance
        poc = PocInstance(
            id=poc_id,
            source_connection_id=source_connection_id,
            poc_connection_id=poc_connection_id,
            customer_name=customer_name,
            logo_path=logo_path,
            password_hash=password_hash,
            model_id=model_id,
            created_at=datetime.utcnow(),
        )
        return await self.repo.create(poc)

    async def _deep_copy_connection(
        self, source_id: UUID, customer_name: str
    ) -> UUID:
        """Copy the connections row with a new UUID."""
        new_id = uuid4()
        now = datetime.utcnow()

        await self.conn.execute(
            """
            INSERT INTO connections (
                id, name, db_type, host, port, database_name,
                username, credentials_secret_arn, ssl_enabled,
                connection_timeout, status, created_at, updated_at
            )
            SELECT
                %s, '[POC] ' || %s || ' - ' || name, db_type, host, port, database_name,
                username, credentials_secret_arn, ssl_enabled,
                connection_timeout, status, %s, %s
            FROM connections WHERE id = %s
            """,
            (str(new_id), customer_name, now, now, str(source_id)),
        )
        return new_id

    async def _deep_copy_enrichment(
        self, source_conn_id: UUID, target_conn_id: UUID
    ) -> None:
        """Deep copy all enrichment tables, mapping old IDs to new IDs."""
        src = str(source_conn_id)
        tgt = str(target_conn_id)

        # 1. database_enrichment (connection-level, 1:1)
        await self.conn.execute(
            """
            INSERT INTO database_enrichment (
                id, connection_id, display_name, description,
                business_domain, primary_language, default_currency,
                default_timezone, tags, enriched_at
            )
            SELECT gen_random_uuid(), %s, display_name, description,
                business_domain, primary_language, default_currency,
                default_timezone, tags, enriched_at
            FROM database_enrichment WHERE connection_id = %s
            """,
            (tgt, src),
        )

        # 2. discovered_tables — need ID mapping
        # Create temp mapping table
        await self.conn.execute(
            """
            CREATE TEMP TABLE _poc_table_map (
                old_id UUID, new_id UUID
            ) ON COMMIT DROP
            """
        )

        # Insert new tables and capture mapping
        await self.conn.execute(
            """
            INSERT INTO _poc_table_map (old_id, new_id)
            SELECT id, gen_random_uuid() FROM discovered_tables
            WHERE connection_id = %s
            """,
            (src,),
        )

        await self.conn.execute(
            """
            INSERT INTO discovered_tables (
                id, connection_id, schema_name, table_name,
                table_type, row_count_estimate, discovered_at
            )
            SELECT m.new_id, %s, t.schema_name, t.table_name,
                t.table_type, t.row_count_estimate, t.discovered_at
            FROM discovered_tables t
            JOIN _poc_table_map m ON m.old_id = t.id
            WHERE t.connection_id = %s
            """,
            (tgt, src),
        )

        # 3. discovered_columns — need ID mapping
        await self.conn.execute(
            """
            CREATE TEMP TABLE _poc_col_map (
                old_id UUID, new_id UUID
            ) ON COMMIT DROP
            """
        )

        await self.conn.execute(
            """
            INSERT INTO _poc_col_map (old_id, new_id)
            SELECT c.id, gen_random_uuid()
            FROM discovered_columns c
            JOIN _poc_table_map m ON m.old_id = c.table_id
            """,
        )

        await self.conn.execute(
            """
            INSERT INTO discovered_columns (
                id, table_id, column_name, data_type,
                is_nullable, is_primary_key, is_foreign_key,
                column_default, ordinal_position, discovered_at
            )
            SELECT cm.new_id, tm.new_id, c.column_name, c.data_type,
                c.is_nullable, c.is_primary_key, c.is_foreign_key,
                c.column_default, c.ordinal_position, c.discovered_at
            FROM discovered_columns c
            JOIN _poc_table_map tm ON tm.old_id = c.table_id
            JOIN _poc_col_map cm ON cm.old_id = c.id
            """,
        )

        # 4. table_enrichment
        await self.conn.execute(
            """
            INSERT INTO table_enrichment (
                id, table_id, display_name, description,
                business_purpose, update_frequency, data_owner,
                typical_queries, tags, is_sensitive,
                enrichment_score, enriched_by, enriched_at
            )
            SELECT gen_random_uuid(), tm.new_id, te.display_name, te.description,
                te.business_purpose, te.update_frequency, te.data_owner,
                te.typical_queries, te.tags, te.is_sensitive,
                te.enrichment_score, te.enriched_by, te.enriched_at
            FROM table_enrichment te
            JOIN _poc_table_map tm ON tm.old_id = te.table_id
            """,
        )

        # 5. column_enrichment
        await self.conn.execute(
            """
            INSERT INTO column_enrichment (
                id, column_id, display_name, description,
                business_meaning, synonyms, is_filterable,
                is_aggregatable, is_groupable, aggregation_functions,
                format_pattern, pii_classification, value_guidance, enriched_at
            )
            SELECT gen_random_uuid(), cm.new_id, ce.display_name, ce.description,
                ce.business_meaning, ce.synonyms, ce.is_filterable,
                ce.is_aggregatable, ce.is_groupable, ce.aggregation_functions,
                ce.format_pattern, ce.pii_classification, ce.value_guidance, ce.enriched_at
            FROM column_enrichment ce
            JOIN _poc_col_map cm ON cm.old_id = ce.column_id
            """,
        )

        # 6. column_value_descriptions
        await self.conn.execute(
            """
            INSERT INTO column_value_descriptions (
                id, column_id, value, display_name,
                description, sort_order, is_active
            )
            SELECT gen_random_uuid(), cm.new_id, cv.value, cv.display_name,
                cv.description, cv.sort_order, cv.is_active
            FROM column_value_descriptions cv
            JOIN _poc_col_map cm ON cm.old_id = cv.column_id
            """,
        )

        # 7. column_sample_data
        await self.conn.execute(
            """
            INSERT INTO column_sample_data (
                id, column_id, distinct_values, distinct_count,
                min_value, max_value, null_percentage, sampled_at
            )
            SELECT gen_random_uuid(), cm.new_id, cs.distinct_values, cs.distinct_count,
                cs.min_value, cs.max_value, cs.null_percentage, cs.sampled_at
            FROM column_sample_data cs
            JOIN _poc_col_map cm ON cm.old_id = cs.column_id
            """,
        )

        # 8. table_relationships
        await self.conn.execute(
            """
            INSERT INTO table_relationships (
                id, connection_id, from_table_id, from_column_id,
                to_table_id, to_column_id, relationship_type,
                is_auto_detected, description, join_hint
            )
            SELECT gen_random_uuid(), %s,
                ftm.new_id, fcm.new_id,
                ttm.new_id, tcm.new_id,
                tr.relationship_type, tr.is_auto_detected,
                tr.description, tr.join_hint
            FROM table_relationships tr
            JOIN _poc_table_map ftm ON ftm.old_id = tr.from_table_id
            JOIN _poc_col_map fcm ON fcm.old_id = tr.from_column_id
            JOIN _poc_table_map ttm ON ttm.old_id = tr.to_table_id
            JOIN _poc_col_map tcm ON tcm.old_id = tr.to_column_id
            WHERE tr.connection_id = %s
            """,
            (tgt, src),
        )

        # 9. business_glossary
        await self.conn.execute(
            """
            INSERT INTO business_glossary (
                id, connection_id, term, definition,
                calculation, related_tables, related_columns,
                synonyms, examples, created_at, updated_at
            )
            SELECT gen_random_uuid(), %s, term, definition,
                calculation, related_tables, related_columns,
                synonyms, examples, created_at, updated_at
            FROM business_glossary WHERE connection_id = %s
            """,
            (tgt, src),
        )

        # 10. query_instructions
        await self.conn.execute(
            """
            INSERT INTO query_instructions (
                id, connection_id, instruction, sort_order,
                created_at, updated_at
            )
            SELECT gen_random_uuid(), %s, instruction, sort_order,
                created_at, updated_at
            FROM query_instructions WHERE connection_id = %s
            """,
            (tgt, src),
        )

        # 11. software_guidance
        await self.conn.execute(
            """
            INSERT INTO software_guidance (
                id, connection_id, software_name, guidance_text,
                doc_urls, confirmed, created_at
            )
            SELECT gen_random_uuid(), %s, software_name, guidance_text,
                doc_urls, confirmed, created_at
            FROM software_guidance WHERE connection_id = %s
            """,
            (tgt, src),
        )

        # 12. example_queries
        await self.conn.execute(
            """
            INSERT INTO example_queries (
                id, connection_id, question, sql_query,
                description, created_at, updated_at
            )
            SELECT gen_random_uuid(), %s, question, sql_query,
                description, created_at, updated_at
            FROM example_queries WHERE connection_id = %s
            """,
            (tgt, src),
        )

        logger.info(
            "Deep copied enrichment from %s to %s", source_conn_id, target_conn_id
        )

    @staticmethod
    def _save_logo(poc_id: UUID, data: bytes, filename: str) -> str:
        """Save logo file and return relative path."""
        settings = get_settings()
        logo_dir = settings.poc_logo_dir
        os.makedirs(logo_dir, exist_ok=True)

        ext = os.path.splitext(filename)[1] or ".png"
        rel_path = f"/poc-logos/{poc_id}{ext}"
        full_path = os.path.join(logo_dir, f"{poc_id}{ext}")

        with open(full_path, "wb") as f:
            f.write(data)

        return rel_path

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify a password against a bcrypt hash."""
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )

    async def delete_poc(self, poc_id: UUID) -> bool:
        """Delete a POC and its copied connection (CASCADE handles enrichment)."""
        poc = await self.repo.get_by_id(poc_id)
        if not poc:
            return False

        # Delete the copied connection (CASCADE will clean enrichment)
        await self.conn.execute(
            "DELETE FROM connections WHERE id = %s",
            (str(poc.poc_connection_id),),
        )

        # Delete logo file if exists
        if poc.logo_path:
            settings = get_settings()
            full_path = os.path.join(
                os.path.dirname(settings.poc_logo_dir),
                poc.logo_path.lstrip("/"),
            )
            if os.path.exists(full_path):
                os.remove(full_path)

        # poc_instances row deleted by CASCADE from connections
        return True
