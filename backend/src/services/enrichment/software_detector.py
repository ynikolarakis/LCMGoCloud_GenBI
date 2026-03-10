"""Detect known software products from database table names.

Uses Bedrock Converse API with a web_search tool (Tavily) so the LLM
can search the internet when its training knowledge is insufficient.
Falls back to LLM-only detection when no Tavily API key is configured.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

import boto3

from src.config import get_settings
from src.models.enrichment import SoftwareDetectionResult

logger = logging.getLogger(__name__)

MAX_TOOL_ITERATIONS = 5
MAX_SEARCHES_PER_CALL = 3

WEB_SEARCH_TOOL = {
    "toolSpec": {
        "name": "web_search",
        "description": (
            "Search the web for information about database schemas, "
            "software products, and table naming conventions. "
            "Use this to identify what software a database belongs to."
        ),
        "inputSchema": {
            "json": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query",
                    }
                },
                "required": ["query"],
            }
        },
    }
}

DETECTION_PROMPT = """\
You are a database expert. Given the following list of table names from a database, \
determine if they belong to a well-known software product.

You have a web_search tool available. USE IT to search the internet for these table \
name patterns. Try searching for distinctive table names or prefixes to identify the \
software. You may search up to {max_searches} times.

Table names:
{table_names}

After researching, respond in JSON:
{{
    "detected": true,
    "software_name": "Name of the software",
    "confidence": "high" | "medium" | "low",
    "reasoning": "Brief explanation of why you identified this software",
    "doc_urls": ["URLs of relevant documentation you found"]
}}

If you cannot identify any specific software product, but found useful information \
about the table naming patterns or domain, respond:
{{
    "detected": false,
    "software_name": "Unknown (web research)",
    "confidence": "low",
    "reasoning": "Description of what you found about these table patterns",
    "doc_urls": ["URLs of any relevant pages you found"]
}}

If you found absolutely nothing useful, respond:
{{
    "detected": false,
    "software_name": "",
    "confidence": "",
    "reasoning": "No information found",
    "doc_urls": []
}}

Return ONLY valid JSON, no markdown or extra text.
"""

GUIDANCE_PROMPT = """\
You are a database documentation expert. Based on your research, the database \
belongs to {software_name}.

You have a web_search tool available. Search for documentation, schema references, \
or technical guides for {software_name} to generate accurate guidance. You may search \
up to {max_searches} times.

Provide a concise documentation summary that would help an AI understand the tables, \
columns, and their business meaning. Focus on:

1. Key tables and what they store
2. Important column naming conventions
3. Common value patterns (status codes, types, flags)
4. Key relationships between tables
5. Business concepts specific to this software

Keep the summary under 3000 characters. Be specific and factual. Base your response \
on what you found through web search, not just your training knowledge.
"""

FALLBACK_GUIDANCE_PROMPT = """\
You are a database documentation expert. The following table names could not be \
matched to a specific software product, but you found some information about them.

You have a web_search tool available. Search for any documentation, forums, or \
technical references related to these table naming patterns. You may search up to \
{max_searches} times.

Table names:
{table_names}

Previous research findings: {reasoning}

Generate a guidance summary that would help an AI understand these tables and their \
likely business meaning. Focus on:

1. What the table prefixes/naming convention suggest (modules, domains)
2. Likely purpose of the most important tables
3. Probable relationships between tables
4. Business domain these tables likely serve

Keep the summary under 3000 characters. Be specific based on your research.
"""


def _get_tavily_client():
    """Lazily import and create Tavily client."""
    settings = get_settings()
    if not settings.tavily_api_key:
        return None
    try:
        from tavily import TavilyClient
        return TavilyClient(api_key=settings.tavily_api_key)
    except ImportError:
        logger.warning("tavily-python not installed, web search disabled")
        return None


class SoftwareDetector:
    """Detect known software products from database table names."""

    def __init__(self):
        settings = get_settings()
        self._client = boto3.client("bedrock-runtime", region_name=settings.aws_region)
        self._model_id = settings.bedrock_model_id
        self._max_tokens = settings.bedrock_max_tokens
        self._tavily = _get_tavily_client()

    def _execute_web_search(self, query: str) -> str:
        """Execute a web search via Tavily and return formatted results."""
        if not self._tavily:
            return "Web search unavailable (no API key configured)."
        try:
            results = self._tavily.search(
                query=query,
                max_results=5,
                include_answer=True,
            )
            formatted = []
            if results.get("answer"):
                formatted.append(f"Summary: {results['answer']}\n")
            for r in results.get("results", []):
                formatted.append(
                    f"Title: {r['title']}\n"
                    f"URL: {r['url']}\n"
                    f"Content: {r['content']}\n"
                )
            return "\n---\n".join(formatted) if formatted else "No results found."
        except Exception as exc:
            logger.warning("Tavily search failed: %s", exc)
            return f"Search error: {exc}"

    def _converse_with_tools(
        self, system_prompt: str, user_prompt: str
    ) -> str:
        """Call Bedrock Converse API with optional web_search tool use loop."""
        messages = [{"role": "user", "content": [{"text": user_prompt}]}]

        tool_config = None
        if self._tavily:
            tool_config = {"tools": [WEB_SEARCH_TOOL]}

        search_count = 0

        for _ in range(MAX_TOOL_ITERATIONS):
            kwargs = {
                "modelId": self._model_id,
                "messages": messages,
                "system": [{"text": system_prompt}],
                "inferenceConfig": {"maxTokens": self._max_tokens},
            }
            if tool_config:
                kwargs["toolConfig"] = tool_config

            response = self._client.converse(**kwargs)
            output_message = response["output"]["message"]
            messages.append(output_message)

            if response["stopReason"] == "end_turn":
                # Extract final text
                for block in output_message["content"]:
                    if "text" in block:
                        return block["text"]
                return ""

            if response["stopReason"] == "tool_use":
                tool_results = []
                for block in output_message["content"]:
                    if "toolUse" in block:
                        tool_use = block["toolUse"]
                        tool_id = tool_use["toolUseId"]

                        if tool_use["name"] == "web_search" and search_count < MAX_SEARCHES_PER_CALL:
                            query = tool_use["input"].get("query", "")
                            logger.info("Web search [%d/%d]: %s", search_count + 1, MAX_SEARCHES_PER_CALL, query)
                            result_text = self._execute_web_search(query)
                            search_count += 1
                        elif tool_use["name"] == "web_search":
                            result_text = f"Search limit reached ({MAX_SEARCHES_PER_CALL} max). Please provide your answer now."
                        else:
                            result_text = f"Unknown tool: {tool_use['name']}"

                        tool_results.append({
                            "toolResult": {
                                "toolUseId": tool_id,
                                "content": [{"text": result_text}],
                            }
                        })

                messages.append({"role": "user", "content": tool_results})
            else:
                # Unexpected stop reason
                break

        # Fallback: extract whatever text we have
        for msg in reversed(messages):
            if msg.get("role") == "assistant":
                for block in msg.get("content", []):
                    if "text" in block:
                        return block["text"]
        return ""

    async def _invoke_converse(self, system_prompt: str, user_prompt: str) -> str:
        """Async wrapper around the synchronous Converse + tool use loop."""
        return await asyncio.to_thread(self._converse_with_tools, system_prompt, user_prompt)

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
        """Send table names to LLM (with web search) to identify known software."""
        if not table_names:
            return None

        sample = table_names[:100]
        names_text = "\n".join(f"- {name}" for name in sample)
        if len(table_names) > 100:
            names_text += f"\n... and {len(table_names) - 100} more tables"

        prompt = DETECTION_PROMPT.format(
            table_names=names_text,
            max_searches=MAX_SEARCHES_PER_CALL,
        )

        try:
            response_text = await self._invoke_converse(
                system_prompt="You are a database software identification expert.",
                user_prompt=prompt,
            )
            data = self._parse_json_response(response_text)

            software_name = data.get("software_name", "")
            detected = data.get("detected", False)
            doc_urls = data.get("doc_urls", [])
            reasoning = data.get("reasoning", "")
            confidence = data.get("confidence", "")

            # Case 1: Known software detected
            if detected and software_name and software_name != "Unknown (web research)":
                guidance_text = await self._generate_guidance_with_search(software_name)
                return SoftwareDetectionResult(
                    software_name=software_name,
                    confidence=confidence or "medium",
                    reasoning=reasoning,
                    doc_urls=doc_urls,
                    guidance_text=guidance_text,
                )

            # Case 2: Not detected but fallback guidance available
            if software_name == "Unknown (web research)" and reasoning and reasoning != "No information found":
                guidance_text = await self._generate_fallback_guidance(
                    table_names=sample, reasoning=reasoning,
                )
                return SoftwareDetectionResult(
                    software_name="Unknown (web research)",
                    confidence=confidence or "low",
                    reasoning=reasoning,
                    doc_urls=doc_urls,
                    guidance_text=guidance_text,
                )

            # Case 3: Nothing found
            return None

        except Exception as exc:
            logger.warning("Software detection failed: %s", exc)
            return None

    async def _generate_guidance_with_search(self, software_name: str) -> str:
        """Generate guidance for detected software, using web search for docs."""
        prompt = GUIDANCE_PROMPT.format(
            software_name=software_name,
            max_searches=MAX_SEARCHES_PER_CALL,
        )
        try:
            return await self._invoke_converse(
                system_prompt=f"You are a {software_name} database documentation expert.",
                user_prompt=prompt,
            )
        except Exception as exc:
            logger.warning("Guidance generation failed for %s: %s", software_name, exc)
            return ""

    async def _generate_fallback_guidance(
        self, table_names: list[str], reasoning: str
    ) -> str:
        """Generate guidance even when no specific software was identified."""
        names_text = "\n".join(f"- {name}" for name in table_names[:50])
        prompt = FALLBACK_GUIDANCE_PROMPT.format(
            table_names=names_text,
            reasoning=reasoning,
            max_searches=MAX_SEARCHES_PER_CALL,
        )
        try:
            return await self._invoke_converse(
                system_prompt="You are a database schema analysis expert.",
                user_prompt=prompt,
            )
        except Exception as exc:
            logger.warning("Fallback guidance generation failed: %s", exc)
            return ""

    # Keep backward-compatible method name
    async def generate_guidance(self, software_name: str) -> str:
        """Generate guidance (backward-compatible wrapper)."""
        return await self._generate_guidance_with_search(software_name)
