"""Detect known software products from database table names."""

from __future__ import annotations

import json
import logging
from typing import Optional

import boto3

from src.config import get_settings
from src.models.enrichment import SoftwareDetectionResult

logger = logging.getLogger(__name__)

DETECTION_PROMPT = """\
You are a database expert. Given the following list of table names from a database, \
determine if they belong to a well-known software product (e.g., OTRS, WordPress, \
Magento, SAP, Odoo, PrestaShop, Joomla, Drupal, SugarCRM, Moodle, MediaWiki, \
osCommerce, OpenCart, WHMCS, Redmine, GitLab, Nextcloud, etc.).

Table names:
{table_names}

If you can identify the software, respond in JSON:
{{
    "detected": true,
    "software_name": "Name of the software",
    "confidence": "high" | "medium" | "low",
    "reasoning": "Brief explanation of why you identified this software"
}}

If you cannot identify any known software, respond:
{{
    "detected": false,
    "software_name": "",
    "confidence": "",
    "reasoning": "These table names do not match any known software product"
}}

Return ONLY valid JSON, no markdown or extra text.
"""

GUIDANCE_PROMPT = """\
You are a database documentation expert. The database belongs to {software_name}.

Based on your knowledge of {software_name}'s database schema, provide a concise \
documentation summary that would help an AI understand the tables, columns, and \
their business meaning. Focus on:

1. Key tables and what they store
2. Important column naming conventions
3. Common value patterns (status codes, types, flags)
4. Key relationships between tables
5. Business concepts specific to {software_name}

Keep the summary under 3000 characters. Be specific and factual.
"""


class SoftwareDetector:
    """Detect known software products from database table names."""

    def __init__(self):
        settings = get_settings()
        self._client = boto3.client("bedrock-runtime", region_name=settings.aws_region)
        self._model_id = settings.bedrock_model_id
        self._max_tokens = settings.bedrock_max_tokens

    async def _invoke_llm(self, prompt: str, system: str = "") -> str:
        import asyncio

        messages = [{"role": "user", "content": [{"type": "text", "text": prompt}]}]
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": self._max_tokens,
            "messages": messages,
        }
        if system:
            body["system"] = system

        def _call() -> str:
            response = self._client.invoke_model(
                modelId=self._model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body),
            )
            result = json.loads(response["body"].read())
            return result["content"][0]["text"]

        return await asyncio.to_thread(_call)

    def _parse_json_response(self, text: str) -> dict:
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [line for line in lines if not line.strip().startswith("```")]
            text = "\n".join(lines)
        return json.loads(text)

    async def detect_software(
        self, table_names: list[str]
    ) -> Optional[SoftwareDetectionResult]:
        """Send table names to LLM to identify known software."""
        if not table_names:
            return None

        # Send a representative sample (up to 100 table names)
        sample = table_names[:100]
        names_text = "\n".join(f"- {name}" for name in sample)
        if len(table_names) > 100:
            names_text += f"\n... and {len(table_names) - 100} more tables"

        prompt = DETECTION_PROMPT.format(table_names=names_text)

        try:
            response_text = await self._invoke_llm(prompt)
            data = self._parse_json_response(response_text)

            if not data.get("detected"):
                return None

            return SoftwareDetectionResult(
                software_name=data["software_name"],
                confidence=data.get("confidence", "medium"),
                reasoning=data.get("reasoning", ""),
            )
        except Exception as exc:
            logger.warning("Software detection failed: %s", exc)
            return None

    async def generate_guidance(self, software_name: str) -> str:
        """Generate schema documentation guidance from LLM knowledge."""
        prompt = GUIDANCE_PROMPT.format(software_name=software_name)

        try:
            return await self._invoke_llm(prompt)
        except Exception as exc:
            logger.warning("Guidance generation failed for %s: %s", software_name, exc)
            return ""
