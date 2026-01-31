"""Tests for SchemaDiscoveryEngine."""

from uuid import UUID, uuid4

import pytest

from src.models.discovery import ColumnInfo, Relationship, TableInfo
from src.services.discovery.engine import SchemaDiscoveryEngine


class TestImplicitRelationshipDetection:
    """Test the static method for detecting implicit relationships."""

    def _make_table(self, name: str, columns: list[tuple[str, bool]]) -> TableInfo:
        """Helper: create a TableInfo with columns. columns = [(name, is_pk), ...]"""
        cols = [
            ColumnInfo(
                column_name=cname,
                data_type="integer",
                is_primary_key=is_pk,
                ordinal_position=i,
            )
            for i, (cname, is_pk) in enumerate(columns)
        ]
        return TableInfo(
            schema_name="public",
            table_name=name,
            columns=cols,
        )

    def test_detects_table_name_id_pattern(self):
        """customer_id in orders should link to customers.id"""
        customers = self._make_table("customers", [("id", True), ("name", False)])
        orders = self._make_table("orders", [
            ("id", True),
            ("customer_id", False),
            ("total", False),
        ])

        conn_id = uuid4()
        result = SchemaDiscoveryEngine._detect_implicit_relationships(
            [customers, orders], [], conn_id
        )

        assert len(result) == 1
        rel = result[0]
        assert rel.from_table == "orders"
        assert rel.from_column == "customer_id"
        assert rel.to_table == "customers"
        assert rel.to_column == "id"

    def test_skips_existing_fk(self):
        """Should not duplicate already-detected foreign keys."""
        customers = self._make_table("customers", [("id", True)])
        orders = self._make_table("orders", [("id", True), ("customer_id", False)])

        existing = [
            Relationship(
                from_schema="public",
                from_table="orders",
                from_column="customer_id",
                to_schema="public",
                to_table="customers",
                to_column="id",
            )
        ]

        result = SchemaDiscoveryEngine._detect_implicit_relationships(
            [customers, orders], existing, uuid4()
        )
        assert len(result) == 0

    def test_skips_pk_columns(self):
        """Primary key columns should not be treated as FK references."""
        customers = self._make_table("customers", [("id", True)])
        orders = self._make_table("orders", [("id", True)])

        result = SchemaDiscoveryEngine._detect_implicit_relationships(
            [customers, orders], [], uuid4()
        )
        assert len(result) == 0

    def test_handles_plural_table_names(self):
        """product_id should match 'products' table."""
        products = self._make_table("products", [("id", True), ("name", False)])
        order_items = self._make_table("order_items", [
            ("id", True),
            ("product_id", False),
        ])

        result = SchemaDiscoveryEngine._detect_implicit_relationships(
            [products, order_items], [], uuid4()
        )

        assert len(result) == 1
        assert result[0].to_table == "products"

    def test_no_self_reference(self):
        """A table should not create an implicit FK to itself from its own id-like columns."""
        users = self._make_table("users", [("id", True), ("user_id", False)])

        result = SchemaDiscoveryEngine._detect_implicit_relationships(
            [users], [], uuid4()
        )
        # user_id -> users would be self-reference; should be excluded
        assert len(result) == 0

    def test_no_match_returns_empty(self):
        """Columns that don't match any table should not produce relationships."""
        orders = self._make_table("orders", [
            ("id", True),
            ("foo_bar", False),
        ])

        result = SchemaDiscoveryEngine._detect_implicit_relationships(
            [orders], [], uuid4()
        )
        assert len(result) == 0
