"""Tests for SampleDataExtractor type classification."""

from src.services.discovery.sample_extractor import _is_boolean, _is_date, _is_numeric


class TestTypeClassification:
    def test_numeric_types(self):
        for t in ["int", "integer", "bigint", "smallint", "decimal", "numeric", "float", "double", "real"]:
            assert _is_numeric(t), f"{t} should be numeric"

    def test_numeric_with_precision(self):
        assert _is_numeric("decimal(10,2)")
        assert _is_numeric("numeric(5)")

    def test_date_types(self):
        for t in ["date", "datetime", "datetime2", "timestamp", "timestamp without time zone"]:
            assert _is_date(t), f"{t} should be date"

    def test_boolean_types(self):
        assert _is_boolean("boolean")
        assert _is_boolean("bool")
        assert _is_boolean("bit")

    def test_text_is_not_numeric(self):
        assert not _is_numeric("varchar")
        assert not _is_numeric("text")

    def test_text_is_not_date(self):
        assert not _is_date("varchar")
        assert not _is_date("integer")

    def test_text_is_not_boolean(self):
        assert not _is_boolean("varchar")
        assert not _is_boolean("integer")
