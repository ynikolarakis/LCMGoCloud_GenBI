"""SQL query validator — ensures generated SQL is safe to execute."""

from __future__ import annotations

import re

# Forbidden SQL patterns (case-insensitive).
# These catch DDL, DML mutations, admin commands.
_FORBIDDEN_PATTERNS: list[re.Pattern] = [
    re.compile(r"\b(INSERT\s+INTO)\b", re.IGNORECASE),
    re.compile(r"\b(UPDATE\s+\w+\s+SET)\b", re.IGNORECASE),
    re.compile(r"\b(DELETE\s+FROM)\b", re.IGNORECASE),
    re.compile(r"\b(DROP\s+(TABLE|DATABASE|INDEX|VIEW|SCHEMA|COLUMN|FUNCTION|PROCEDURE))\b", re.IGNORECASE),
    re.compile(r"\b(ALTER\s+(TABLE|DATABASE|INDEX|VIEW|SCHEMA|COLUMN))\b", re.IGNORECASE),
    re.compile(r"\b(TRUNCATE)\b", re.IGNORECASE),
    re.compile(r"\b(CREATE\s+(TABLE|DATABASE|INDEX|VIEW|SCHEMA|FUNCTION|PROCEDURE))\b", re.IGNORECASE),
    re.compile(r"\b(GRANT|REVOKE)\b", re.IGNORECASE),
    re.compile(r"\b(EXEC|EXECUTE)\b", re.IGNORECASE),
    re.compile(r"\b(xp_|sp_)\w+", re.IGNORECASE),  # MSSQL system procs
    re.compile(r"\bINTO\s+(OUTFILE|DUMPFILE)\b", re.IGNORECASE),  # MySQL file writes
    re.compile(r"\bLOAD\s+DATA\b", re.IGNORECASE),
    re.compile(r"\bCOPY\s+\w+\s+(FROM|TO)\b", re.IGNORECASE),  # PG COPY
    re.compile(r";\s*\S", re.IGNORECASE),  # Multiple statements (semicolon followed by non-whitespace)
]


class QueryValidationError(Exception):
    """Raised when generated SQL fails validation."""

    def __init__(self, message: str, matched_pattern: str = ""):
        self.message = message
        self.matched_pattern = matched_pattern
        super().__init__(message)


def validate_sql(sql: str) -> str:
    """Validate that SQL is a safe read-only query.

    Returns the cleaned SQL or raises QueryValidationError.
    """
    cleaned = sql.strip()

    if not cleaned:
        raise QueryValidationError("Empty SQL query")

    # Must start with SELECT or WITH (CTE)
    first_word = cleaned.split()[0].upper()
    if first_word not in ("SELECT", "WITH"):
        raise QueryValidationError(
            f"Only SELECT queries are allowed. Got: {first_word}",
            matched_pattern=first_word,
        )

    # Check forbidden patterns
    for pattern in _FORBIDDEN_PATTERNS:
        match = pattern.search(cleaned)
        if match:
            raise QueryValidationError(
                f"Forbidden SQL pattern detected: {match.group()}",
                matched_pattern=match.group(),
            )

    return cleaned
