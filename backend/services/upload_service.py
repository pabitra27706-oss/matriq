# backend/services/upload_service.py
"""
Upload service with:
- 100MB file limit
- Auto encoding detection (30+ encodings)
- Never returns 'ascii' — always upgrades to 'utf-8'
- Auto delimiter detection
- Content security validation
- No row limits — only file size limit
- Always returns valid Python encoding names
"""
import os
import re
import csv
import io
import codecs
from typing import Tuple, List, Dict, Any, Optional


MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", str(100 * 1024 * 1024)))


# ═══════════════════════════════════════════════════════════════
# ENCODING LISTS
# ═══════════════════════════════════════════════════════════════

ENCODINGS_TO_TRY = [
    "utf-8-sig",
    "utf-8",
    "latin-1",
    "cp1252",
    "iso-8859-1",
    "iso-8859-2",
    "iso-8859-15",
    "cp1250",
    "cp1251",
    "utf-16",
    "utf-16-le",
    "utf-16-be",
    "shift_jis",
    "euc-jp",
    "gb2312",
    "gbk",
    "euc-kr",
    "big5",
    "cp437",
    "mac_roman",
    "cp874",
    "iso-8859-9",
    "cp1256",
    "iso-8859-6",
    "cp1254",
    "iso-8859-7",
    "cp1253",
    "koi8-r",
    "koi8-u",
]

BOM_MAP = {
    codecs.BOM_UTF8: "utf-8-sig",
    codecs.BOM_UTF16_LE: "utf-16-le",
    codecs.BOM_UTF16_BE: "utf-16-be",
    b"\xff\xfe\x00\x00": "utf-32-le",
    b"\x00\x00\xfe\xff": "utf-32-be",
}

# Encodings that should always be upgraded to utf-8
ASCII_NAMES = {"ascii", "us-ascii", "us_ascii", "ansi_x3.4-1968", "646"}


# ═══════════════════════════════════════════════════════════════
# ENCODING HELPERS
# ═══════════════════════════════════════════════════════════════

def _is_valid_encoding(name: str) -> bool:
    """Check if Python recognizes this encoding name."""
    if not name:
        return False
    try:
        codecs.lookup(name)
        return True
    except LookupError:
        return False


def _clean_encoding_name(name: str) -> str:
    """
    Strip suffixes, validate, and upgrade ascii to utf-8.
    Always returns a valid Python encoding name that can handle real-world data.
    """
    if not name:
        return "utf-8"

    # Strip parenthetical suffixes like "(lossy)"
    clean = name.split("(")[0].strip().lower()

    # Remove quotes if present
    clean = clean.strip("'\"")

    # ASCII can only handle bytes 0-127
    # Real-world CSV files almost always have bytes > 127
    # UTF-8 is a strict superset of ASCII — handles everything ASCII does plus more
    if clean in ASCII_NAMES:
        return "utf-8"

    # Validate the encoding name
    if _is_valid_encoding(clean):
        return clean

    # Try the original case
    original = name.split("(")[0].strip()
    if _is_valid_encoding(original):
        if original.lower() in ASCII_NAMES:
            return "utf-8"
        return original

    # Unknown encoding — default to utf-8
    return "utf-8"


# ═══════════════════════════════════════════════════════════════
# ENCODING DETECTION
# ═══════════════════════════════════════════════════════════════

def detect_encoding(content: bytes) -> Tuple[str, float]:
    """
    Detect file encoding.
    Returns (encoding_name, confidence 0.0-1.0).
    Always returns a valid Python encoding name.
    Never returns 'ascii' — upgrades to 'utf-8'.
    """
    if not content:
        return "utf-8", 0.5

    # 1 — BOM check (highest confidence)
    for bom, enc in BOM_MAP.items():
        if content.startswith(bom):
            return enc, 1.0

    # 2 — charset-normalizer (best quality, pure python)
    try:
        from charset_normalizer import from_bytes
        result = from_bytes(content[:100000]).best()
        if result and result.encoding:
            enc_name = _clean_encoding_name(str(result.encoding))
            if _is_valid_encoding(enc_name):
                return enc_name, 0.95
    except ImportError:
        pass
    except Exception:
        pass

    # 3 — chardet fallback
    try:
        import chardet
        result = chardet.detect(content[:100000])
        if result and result.get("encoding"):
            enc_name = _clean_encoding_name(str(result["encoding"]))
            confidence = float(result.get("confidence", 0) or 0)
            if confidence > 0.6 and _is_valid_encoding(enc_name):
                return enc_name, confidence
    except ImportError:
        pass
    except Exception:
        pass

    # 4 — Manual brute force on first 10KB
    sample = content[:10240]
    for enc in ENCODINGS_TO_TRY:
        try:
            decoded = sample.decode(enc, errors="strict")
            printable_count = sum(
                1 for c in decoded[:2000]
                if c.isprintable() or c in "\n\r\t"
            )
            total_chars = max(len(decoded[:2000]), 1)
            ratio = printable_count / total_chars
            if ratio > 0.85:
                return enc, 0.7
        except (UnicodeDecodeError, LookupError):
            continue

    # 5 — latin-1 never fails (accepts any byte 0-255)
    return "latin-1", 0.3


def decode_content(content: bytes, encoding: Optional[str] = None) -> Tuple[str, str]:
    """
    Decode bytes to string.
    Returns (decoded_text, encoding_used).
    encoding_used is always a valid Python encoding name — never 'ascii'.
    """
    # If user specified encoding, try it first
    if encoding:
        clean_enc = _clean_encoding_name(encoding)
        try:
            text = content.decode(clean_enc, errors="strict")
            return text, clean_enc
        except (UnicodeDecodeError, LookupError):
            pass

    # Auto-detect
    detected_enc, confidence = detect_encoding(content)
    detected_enc = _clean_encoding_name(detected_enc)

    # Try strict decode with detected encoding
    try:
        text = content.decode(detected_enc, errors="strict")
        return text, detected_enc
    except UnicodeDecodeError:
        pass
    except LookupError:
        pass

    # Try utf-8 explicitly (most common encoding worldwide)
    if detected_enc != "utf-8":
        try:
            text = content.decode("utf-8", errors="strict")
            return text, "utf-8"
        except UnicodeDecodeError:
            pass

    # Try utf-8 with replacement (keeps most data, replaces bad bytes with ?)
    try:
        text = content.decode("utf-8", errors="replace")
        return text, "utf-8"
    except Exception:
        pass

    # Try detected encoding with replacement
    try:
        text = content.decode(detected_enc, errors="replace")
        return text, detected_enc
    except (UnicodeDecodeError, LookupError):
        pass

    # Absolute last resort — latin-1 accepts every byte value 0-255
    text = content.decode("latin-1", errors="replace")
    return text, "latin-1"


# ═══════════════════════════════════════════════════════════════
# DELIMITER DETECTION
# ═══════════════════════════════════════════════════════════════

def detect_delimiter(text: str) -> str:
    """Auto-detect CSV delimiter from first few lines."""
    if not text or not text.strip():
        return ","

    lines = text.split("\n")[:10]
    if not lines:
        return ","

    candidates = {",": 0, "\t": 0, ";": 0, "|": 0}

    for line in lines:
        for d in candidates:
            candidates[d] += line.count(d)

    best = max(candidates, key=candidates.get)  # type: ignore
    if candidates[best] == 0:
        return ","
    return best


# ═══════════════════════════════════════════════════════════════
# CONTENT VALIDATION
# ═══════════════════════════════════════════════════════════════

MALICIOUS_PATTERNS = [
    r"<script",
    r"javascript:",
    r"__import__",
    r"eval\s*\(",
    r"exec\s*\(",
    r"os\.system",
    r"subprocess\.",
    r";\s*DROP\s+TABLE",
    r";\s*DELETE\s+FROM",
    r";\s*INSERT\s+INTO",
    r";\s*UPDATE\s+",
    r"UNION\s+ALL\s+SELECT",
    r"<iframe",
    r"onclick\s*=",
    r"onerror\s*=",
]

_compiled_patterns = [re.compile(p, re.IGNORECASE) for p in MALICIOUS_PATTERNS]


def validate_csv_content(
    content: bytes,
    encoding: Optional[str] = None,
    max_size: int = MAX_UPLOAD_SIZE,
) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Validate CSV for safety and structure.
    Returns (is_valid, error_message, metadata_dict).
    metadata always has a valid encoding name.
    """
    metadata: Dict[str, Any] = {
        "encoding": "utf-8",
        "delimiter": ",",
        "estimated_rows": 0,
        "columns": 0,
        "file_size": len(content),
        "file_size_human": format_file_size(len(content)),
    }

    # ── size ──
    if len(content) > max_size:
        return (
            False,
            f"File too large ({format_file_size(len(content))}). "
            f"Maximum {format_file_size(max_size)}.",
            metadata,
        )

    if len(content) == 0:
        return False, "File is empty.", metadata

    # ── decode ──
    try:
        text, used_encoding = decode_content(content, encoding)
        metadata["encoding"] = _clean_encoding_name(used_encoding)
    except Exception as e:
        return False, f"Could not decode file: {e}", metadata

    # ── malicious content scan (first 20KB) ──
    scan_text = text[:20480]
    for pattern in _compiled_patterns:
        if pattern.search(scan_text):
            return False, "File contains potentially unsafe content.", metadata

    # ── delimiter ──
    delimiter = detect_delimiter(text)
    metadata["delimiter"] = delimiter

    # ── CSV structure check (header + first 10 rows) ──
    try:
        reader = csv.reader(io.StringIO(text[:200000]), delimiter=delimiter)
        header = next(reader, None)
        if not header:
            return False, "CSV appears empty (no header row).", metadata

        header = [h.strip() for h in header if h.strip()]

        if len(header) > 2000:
            return (
                False,
                f"Too many columns ({len(header)}). Maximum 2000.",
                metadata,
            )

        if len(header) < 1:
            return False, "CSV must have at least one column.", metadata

        metadata["columns"] = len(header)

        for col in header:
            if len(col) > 300:
                return (
                    False,
                    f"Column name too long: '{col[:60]}…' (max 300 chars)",
                    metadata,
                )

        row_count = 0
        for row in reader:
            row_count += 1
            if row_count > 10:
                break

    except csv.Error as e:
        return False, f"Invalid CSV format: {e}", metadata

    # ── estimate total rows ──
    try:
        first_chunk = text[:200000]
        newline_count = first_chunk.count("\n")
        if newline_count > 1:
            avg_bytes_per_line = (
                len(first_chunk.encode("utf-8", errors="replace")) / newline_count
            )
            metadata["estimated_rows"] = max(
                int(len(content) / avg_bytes_per_line) - 1,
                row_count,
            )
        else:
            metadata["estimated_rows"] = row_count
    except Exception:
        metadata["estimated_rows"] = row_count

    return True, "", metadata


# ═══════════════════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════════════════

def sanitize_table_name(name: str) -> str:
    """Create a safe SQL table name from filename."""
    name = re.sub(r"\.(csv|tsv|txt|xlsx|xls)$", "", name, flags=re.IGNORECASE)
    safe = re.sub(r"[^\w]", "_", name)
    safe = re.sub(r"_+", "_", safe).strip("_")
    if not safe or safe[0].isdigit():
        safe = "data_" + safe
    safe = safe.lower()
    return safe[:64]


def format_file_size(size_bytes: int) -> str:
    """Human-readable file size."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"