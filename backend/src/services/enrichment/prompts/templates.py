"""Prompt templates for AI-assisted schema enrichment."""

TABLE_ENRICHMENT_PROMPT = """\
You are a data analyst helping to document a database schema for a Business Intelligence system.

Given the following table information, provide enrichment metadata.

Database context: {database_context}
Table: {schema_name}.{table_name}
Type: {table_type}
Row Count (estimated): {row_count}

Columns:
{columns_list}

{sample_data_section}

{related_tables_section}

Please provide the following in JSON format:
{{
    "display_name": "Human-readable name for the table",
    "description": "2-3 sentence description of what this table contains",
    "business_purpose": "Why this table exists and how it is used in the business",
    "typical_queries": ["Example natural language question 1", "Example question 2", "Example question 3"],
    "tags": ["relevant", "business", "tags"]
}}

Guidelines:
- Use {language} for display_name and descriptions
- Be specific and accurate based on column names and sample data
- Infer business purpose from naming conventions and data patterns
- Typical queries should be natural language questions a business user might ask
- Return ONLY valid JSON, no markdown or extra text
"""

COLUMN_ENRICHMENT_PROMPT = """\
You are a data analyst documenting database columns for a Business Intelligence system.

Table: {table_name} ({table_description})

Column: {column_name}
Data Type: {data_type}
Nullable: {is_nullable}
Is Primary Key: {is_pk}
Is Foreign Key: {is_fk}

{distinct_values_section}

{sample_values_section}

Please provide enrichment in JSON format:
{{
    "display_name": "Human-readable name",
    "description": "What this column represents",
    "business_meaning": "Business context and how this column is used",
    "synonyms": ["alternative", "names", "users", "might", "use"],
    "is_filterable": true,
    "is_aggregatable": true,
    "suggested_aggregations": ["COUNT", "SUM"]
}}

Guidelines:
- Use {language} for display_name and descriptions
- Synonyms should include terms a business user might use to refer to this column
- is_filterable: true if users would filter by this column (e.g., status, category)
- is_aggregatable: true if this column can be summed/averaged (numeric columns)
- Return ONLY valid JSON, no markdown or extra text
"""

VALUE_DESCRIPTIONS_PROMPT = """\
You are documenting the possible values for a categorical database column.

Column: {column_name} in table {table_name}
Column Description: {column_description}

Distinct values found:
{values_list}

For each value, provide a business-friendly description in JSON format:
{{
    "values": [
        {{"value": "actual_value", "display_name": "Friendly Name", "description": "What this value means in business terms"}}
    ]
}}

Guidelines:
- Use {language} for display names and descriptions
- Be concise but clear about what each value represents in business terms
- Maintain the exact original value strings
- Return ONLY valid JSON, no markdown or extra text
"""

GLOSSARY_SUGGESTION_PROMPT = """\
You are a business analyst creating a business glossary for a BI system.

Database context: {database_context}

Tables and their descriptions:
{tables_summary}

Key columns:
{columns_summary}

Suggest business glossary terms that would help users write natural language queries.
Focus on:
- KPIs and metrics (e.g., GMV, Conversion Rate)
- Business concepts (e.g., Active Customer, Churn)
- Common calculations (e.g., Year-over-Year Growth)

Provide suggestions in JSON format:
{{
    "terms": [
        {{
            "term": "Term Name",
            "definition": "Clear definition",
            "calculation": "SQL expression or formula if applicable",
            "related_tables": ["table1", "table2"],
            "related_columns": ["table.column1"]
        }}
    ]
}}

Guidelines:
- Suggest 5-10 relevant terms
- Use {language} for definitions
- Calculations should reference actual table/column names from the schema
- Return ONLY valid JSON, no markdown or extra text
"""

BULK_ENRICHMENT_SYSTEM_PROMPT = """\
You are an expert data analyst helping to document a database schema for a GenBI \
(Generative Business Intelligence) system. Your enrichment metadata will be used by \
an LLM to generate accurate SQL queries from natural language questions.

Quality guidelines:
- Descriptions must be specific, not generic
- Business meaning should explain HOW the data is used, not just WHAT it is
- Synonyms should include terms real business users would say
- Value descriptions should use business language, not technical terms
- Always use {language} for user-facing text
"""
