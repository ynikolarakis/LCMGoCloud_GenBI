"""Tests for SQL query validator."""

import pytest

from src.services.query.validator import QueryValidationError, validate_sql


class TestValidateSQL:
    def test_valid_select(self):
        sql = "SELECT id, name FROM customers WHERE active = true"
        assert validate_sql(sql) == sql

    def test_valid_with_cte(self):
        sql = "WITH totals AS (SELECT customer_id, SUM(total) as s FROM orders GROUP BY customer_id) SELECT * FROM totals"
        assert validate_sql(sql) == sql

    def test_empty_rejected(self):
        with pytest.raises(QueryValidationError, match="Empty"):
            validate_sql("")

    def test_insert_rejected(self):
        with pytest.raises(QueryValidationError, match="Only SELECT"):
            validate_sql("INSERT INTO users (name) VALUES ('test')")

    def test_update_rejected(self):
        with pytest.raises(QueryValidationError, match="Only SELECT"):
            validate_sql("UPDATE users SET name = 'x' WHERE id = 1")

    def test_delete_rejected(self):
        with pytest.raises(QueryValidationError, match="Only SELECT"):
            validate_sql("DELETE FROM users WHERE id = 1")

    def test_drop_rejected(self):
        with pytest.raises(QueryValidationError, match="Only SELECT"):
            validate_sql("DROP TABLE users")

    def test_alter_rejected(self):
        with pytest.raises(QueryValidationError, match="Only SELECT"):
            validate_sql("ALTER TABLE users ADD COLUMN email VARCHAR(255)")

    def test_truncate_rejected(self):
        with pytest.raises(QueryValidationError, match="Only SELECT"):
            validate_sql("TRUNCATE TABLE users")

    def test_grant_rejected(self):
        with pytest.raises(QueryValidationError, match="Only SELECT"):
            validate_sql("GRANT ALL ON users TO public")

    def test_exec_rejected(self):
        with pytest.raises(QueryValidationError, match="Only SELECT"):
            validate_sql("EXEC sp_help")

    def test_multi_statement_rejected(self):
        with pytest.raises(QueryValidationError, match="Forbidden"):
            validate_sql("SELECT 1; DROP TABLE users")

    def test_mssql_system_proc_in_select(self):
        with pytest.raises(QueryValidationError, match="Forbidden"):
            validate_sql("SELECT xp_cmdshell('dir')")

    def test_non_select_rejected(self):
        with pytest.raises(QueryValidationError, match="Only SELECT"):
            validate_sql("EXPLAIN SELECT 1")

    def test_create_rejected(self):
        with pytest.raises(QueryValidationError, match="Only SELECT"):
            validate_sql("CREATE TABLE test (id INT)")

    def test_into_outfile_rejected(self):
        with pytest.raises(QueryValidationError, match="Forbidden"):
            validate_sql("SELECT * FROM users INTO OUTFILE '/tmp/x'")

    def test_copy_rejected(self):
        with pytest.raises(QueryValidationError, match="Only SELECT"):
            validate_sql("COPY users FROM '/tmp/data.csv'")

    def test_whitespace_trimmed(self):
        assert validate_sql("  SELECT 1  ") == "SELECT 1"

    # Extra: ensure forbidden patterns caught inside SELECT
    def test_select_with_subquery_insert_rejected(self):
        with pytest.raises(QueryValidationError, match="Forbidden"):
            validate_sql("SELECT * FROM users; INSERT INTO log VALUES(1)")

    def test_select_with_delete_subquery(self):
        with pytest.raises(QueryValidationError, match="Forbidden"):
            validate_sql("SELECT * FROM users; DELETE FROM users")
