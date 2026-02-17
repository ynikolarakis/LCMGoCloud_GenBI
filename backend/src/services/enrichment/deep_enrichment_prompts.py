"""Prompts and schemas for the Deep Enrichment Agent."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.services.enrichment.deep_enrichment import DeepEnrichOptions

# Language code to display name mapping
_LANG_NAMES = {
    "el": "Greek",
    "en": "English",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "it": "Italian",
    "pt": "Portuguese",
    "nl": "Dutch",
    "tr": "Turkish",
    "ar": "Arabic",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "ru": "Russian",
    "pl": "Polish",
    "ro": "Romanian",
    "bg": "Bulgarian",
    "cs": "Czech",
    "sv": "Swedish",
    "da": "Danish",
}


def _get_lang_name(code: str) -> str:
    return _LANG_NAMES.get(code, code)


def _build_language_instructions(options: DeepEnrichOptions) -> str:
    primary = _get_lang_name(options.primary_language)
    if options.secondary_language:
        secondary = _get_lang_name(options.secondary_language)
        return (
            f"All descriptions MUST be bilingual: {primary} as primary, {secondary} as secondary.\n"
            f'Format: "{primary} text / {secondary} text"\n'
            f"This applies to ALL text fields including:\n"
            f"- Table display_name, description, business_purpose\n"
            f"- Column display_name, description, business_meaning\n"
            f"- Value description display_name AND description (e.g. display_name: \"Ενεργό / Active\", "
            f"description: \"Ενεργή εγγραφή / Currently active record\")\n"
            f"- Glossary term, definition\n"
            f"- Example query question, description\n"
            f"- Synonyms should include both {primary} and {secondary} terms."
        )
    return (
        f"All descriptions, display names, glossary terms, and example queries "
        f"MUST be written in {primary} ({options.primary_language})."
    )


def _build_context_section(options: DeepEnrichOptions) -> str:
    parts = []
    if options.company_name:
        parts.append(f"Company: {options.company_name}")
    if options.business_domain:
        parts.append(f"Business domain: {options.business_domain}")
    if parts:
        return "## Business Context\n\n" + "\n".join(parts) + "\n"
    return ""


def _build_generate_instructions(options: DeepEnrichOptions) -> str:
    sections = []
    if not options.generate_tables:
        sections.append('- Do NOT generate the "tables" array (omit it)')
    if not options.generate_columns:
        sections.append('- Do NOT generate the "columns" array (omit it)')
    if not options.generate_values:
        sections.append('- Do NOT generate the "value_descriptions" array (omit it)')
    if not options.generate_glossary:
        sections.append('- Do NOT generate the "glossary" array (omit it)')
    if not options.generate_examples:
        sections.append('- Do NOT generate the "example_queries" array (omit it)')
    if sections:
        return "\n## Generation Scope\n\n" + "\n".join(sections) + "\n"
    return ""


def build_deep_enrichment_prompt(
    *,
    schema_description: str,
    exploration_data: str,
    total_tables: int,
    total_columns: int,
    options: DeepEnrichOptions,
    manual_context: str = "",
    existing_tables: dict[str, bool] | None = None,
    existing_columns: set[str] | None = None,
    column_value_guidance: dict[str, str] | None = None,
    software_guidance: str = "",
    value_desc_columns: list[dict] | None = None,
) -> str:
    """Build the full prompt for deep enrichment with dynamic configuration."""
    language_instructions = _build_language_instructions(options)
    context_section = _build_context_section(options)
    generate_section = _build_generate_instructions(options)

    # Manual documentation section
    manual_section = ""
    if manual_context:
        manual_section = (
            "\n## Database Documentation (provided by user)\n\n"
            f"{manual_context}\n\n"
            "Use this documentation to improve the accuracy and detail of your enrichment. "
            "The documentation may contain table descriptions, column meanings, business rules, "
            "and other context that should be reflected in your output.\n"
        )

    # Software guidance section
    software_section = ""
    if software_guidance:
        software_section = (
            "\n## Known Software Documentation\n\n"
            "This database belongs to a known software product. Use the following "
            "documentation to provide accurate, software-specific enrichment:\n\n"
            f"{software_guidance}\n"
        )

    # Additional instructions
    additional = ""
    if options.additional_instructions:
        additional = (
            "\n## Additional Instructions from User\n\n"
            f"{options.additional_instructions}\n"
        )

    # Per-column value description guidance
    value_guidance_section = ""
    if column_value_guidance:
        guidance_lines = []
        for col_key, guidance in column_value_guidance.items():
            guidance_lines.append(f"- **{col_key}**: {guidance}")
        value_guidance_section = (
            "\n## Value Description Guidance (per-column, from user)\n\n"
            "IMPORTANT: Follow these specific instructions when generating value descriptions "
            "for the columns listed below. The user has provided guidance on how their values "
            "should be named or described:\n\n"
            + "\n".join(guidance_lines) + "\n"
        )

    # Existing enrichment note
    existing_note = ""
    if existing_tables or existing_columns:
        existing_note = (
            "\n## Existing Enrichment\n\n"
            "The following already have enrichment. You MUST still include them in your output "
            "to ensure completeness, but you can use simpler descriptions if needed.\n"
        )

    # Build explicit value descriptions checklist
    value_desc_checklist = ""
    if value_desc_columns:
        checklist_lines = [
            f"\n## MANDATORY Value Descriptions ({len(value_desc_columns)} columns)\n",
            "You MUST generate a value_descriptions entry for EVERY column listed below — "
            "no exceptions, no skipping. Each column here has a limited number of distinct "
            "values and business users need display_name and description for EVERY value. "
            "This includes country names, city names, category names, titles, statuses, "
            "codes, flags, regions — ALL of them, even if the values seem obvious.\n",
        ]
        for vdc in value_desc_columns:
            vals_preview = ", ".join(str(v) for v in vdc["values"][:15])
            if vdc["count"] > 15:
                vals_preview += f", ... ({vdc['count']} total)"
            checklist_lines.append(
                f"- [ ] **{vdc['table']}.{vdc['column']}** ({vdc['count']} values): {vals_preview}"
            )
        checklist_lines.append(
            f"\nYour value_descriptions array MUST have exactly {len(value_desc_columns)} entries.\n"
        )
        value_desc_checklist = "\n".join(checklist_lines)

    # Build bilingual or monolingual JSON examples
    if options.secondary_language:
        primary = _get_lang_name(options.primary_language)
        secondary = _get_lang_name(options.secondary_language)
        value_example = (
            f'{{"value": "A", "display_name": "Ενεργό / Active", '
            f'"description": "Ενεργή εγγραφή στο σύστημα / Currently active record"}}'
        )
        table_example = (
            f'"display_name": "Ανθρώπινο Όνομα / Human Name",\n'
            f'      "description": "{primary} description / {secondary} description"'
        )
        col_example = (
            f'"display_name": "Ανθρώπινο Όνομα / Human Name",\n'
            f'      "description": "{primary} meaning / {secondary} meaning",\n'
            f'      "business_meaning": "{primary} context / {secondary} context"'
        )
        glossary_example = (
            f'"term": "Έσοδα / Revenue",\n'
            f'      "definition": "Συνολικό εισόδημα από πωλήσεις / Total income from sales"'
        )
    else:
        value_example = '{"value": "A", "display_name": "Active", "description": "Currently active record"}'
        table_example = '"display_name": "Human Name",\n      "description": "What this table stores"'
        col_example = (
            '"display_name": "Human Name",\n'
            '      "description": "What this column means",\n'
            '      "business_meaning": "Business context and how this column is used"'
        )
        glossary_example = '"term": "Revenue",\n      "definition": "Total income from sales"'
    return f"""\
You are a database analyst. You have been given a database schema and sample data \
from every table. Your job is to produce comprehensive enrichment metadata that will \
help business users understand this data through natural language.

## Language Requirements

{language_instructions}

{context_section}\
## Database Schema

{schema_description}

## Exploration Data (sample rows and distinct values for each table)

{exploration_data}
{manual_section}{software_section}{additional}{value_guidance_section}{generate_section}{existing_note}\
{value_desc_checklist}\
## Your Task

Produce a single JSON object with the following structure. Your response must be \
ONLY valid JSON — no other text, no markdown, no explanation.

CRITICAL: The "columns" array MUST include an entry for EVERY column in EVERY table \
({total_columns} columns across {total_tables} tables). Not just interesting ones — ALL of them. \
Even simple columns like IDs and timestamps need a description and business_meaning.

The "tables" array MUST include an entry for EVERY table ({total_tables} total).

{{
  "database": {{
    "display_name": "Human-readable name for this database",
    "description": "2-3 sentence description of what this database contains and its purpose",
    "business_domain": "e.g. E-commerce, Healthcare, Finance, HR"
  }},
  "tables": [
    {{
      "table_name": "schema.table_name",
      {table_example},
      "business_purpose": "Why this table exists in the business context",
      "tags": ["relevant", "tags"]
    }}
  ],
  "columns": [
    {{
      "table_name": "schema.table_name",
      "column_name": "col",
      {col_example},
      "synonyms": ["alternative names"]
    }}
  ],
  "value_descriptions": [
    {{
      "table_name": "schema.table_name",
      "column_name": "status_column",
      "values": [
        {value_example}
      ]
    }}
  ],
  "glossary": [
    {{
      {glossary_example},
      "calculation": "SUM(order_total) FROM orders WHERE status = 'completed'",
      "related_tables": ["schema.orders"]
    }}
  ],
  "example_queries": []
}}

Guidelines:
- Use the sample data to infer business meaning, not just technical definitions.
- CRITICAL for value_descriptions: See the "MANDATORY Value Descriptions" section above. \
You MUST generate a value_descriptions entry for EVERY column listed there — ALL of them, \
no exceptions. For each column, describe EVERY distinct value with a display_name and description. \
Do NOT skip columns because values seem self-explanatory — country names, city names, category \
names, titles ALL need value descriptions. Your value_descriptions array must match the count \
specified in the checklist.
- For glossary, define key business metrics and concepts you can infer from the data.
- Do NOT generate the "example_queries" array — example queries are managed by the user.
- Use the exact table names as shown in the schema (schema.table_name format).
- Respond with ONLY the JSON object. No other text.
"""
