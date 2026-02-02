"""Extract text from uploaded database manuals (PDF, DOCX, TXT)."""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_MAX_CHARS = 20000


def extract_text(file_path: str | Path) -> str:
    """Extract plain text from a file. Supports PDF, DOCX, TXT."""
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        return _extract_pdf(path)
    elif suffix == ".docx":
        return _extract_docx(path)
    elif suffix == ".txt":
        return path.read_text(encoding="utf-8", errors="replace")
    else:
        raise ValueError(f"Unsupported file type: {suffix}")


def _extract_pdf(path: Path) -> str:
    """Extract text from PDF using pypdf."""
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    parts: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            parts.append(text)
    return "\n".join(parts)


def _extract_docx(path: Path) -> str:
    """Extract text from DOCX using python-docx."""
    from docx import Document

    doc = Document(str(path))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def find_relevant_sections(full_text: str, table_names: list[str]) -> str:
    """Find sections of the document relevant to given table names.

    Returns a truncated version of relevant content, max ~20K chars.
    """
    if not full_text:
        return ""

    # If short enough, return everything
    if len(full_text) <= _MAX_CHARS:
        return full_text

    # Split into paragraphs and score by table name mentions
    paragraphs = full_text.split("\n")
    scored: list[tuple[int, str]] = []
    table_names_lower = [t.lower().split(".")[-1] for t in table_names]

    for para in paragraphs:
        if not para.strip():
            continue
        para_lower = para.lower()
        score = sum(1 for tn in table_names_lower if tn in para_lower)
        scored.append((score, para))

    # Sort by relevance (highest score first), then take until budget
    scored.sort(key=lambda x: -x[0])
    result_parts: list[str] = []
    total = 0
    for _score, para in scored:
        if total + len(para) > _MAX_CHARS:
            break
        result_parts.append(para)
        total += len(para)

    if total < len(full_text):
        result_parts.append(
            f"\n[... document truncated, {len(full_text) - total} chars omitted ...]"
        )

    return "\n".join(result_parts)
