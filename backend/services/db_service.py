# backend/services/db_service.py
import sqlite3
import os
import re
import time
from typing import Optional, Tuple, List, Dict, Any

import pandas as pd

DB_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "database.db"
)


# ═══════════════════════════════════════════════════════════════
# CONNECTION
# ═══════════════════════════════════════════════════════════════

def get_connection(readonly=True):
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    if readonly:
        try:
            conn.execute("PRAGMA query_only = ON;")   # 2nd safety net
        except Exception:
            pass
    return conn


# ═══════════════════════════════════════════════════════════════
# SQL CLEANING HELPERS
# ═══════════════════════════════════════════════════════════════

def _strip_markdown_sql(sql: str) -> str:
    """
    Remove markdown code-block wrappers that LLMs add.
       ```sql\nSELECT …\n```   →   SELECT …
       ```\nSELECT …\n```      →   SELECT …
    """
    s = sql.strip()
    if s.startswith("```"):
        lines = s.split("\n")
        # drop opening ``` or ```sql
        if lines[0].strip().startswith("```"):
            lines = lines[1:]
        # drop closing ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        s = "\n".join(lines).strip()
    return s


def _strip_sql_comments(sql: str) -> str:
    """Remove -- single-line and /* block */ comments for keyword analysis."""
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    sql = re.sub(r"--[^\n]*", " ", sql)
    return sql.strip()


def _neutralize_string_literals(sql: str) -> str:
    """
    Replace 'string literals' with placeholders so keywords
    INSIDE strings don't trigger false positives.
        WHERE note = 'DROP TABLE' → WHERE note = '__LIT__'
    """
    return re.sub(r"'[^']*'", "'__LIT__'", sql)


# ═══════════════════════════════════════════════════════════════
# DANGEROUS-STATEMENT PATTERN  (context-aware)
#
#   ✅  REPLACE(col,'a','b')         — string function, SAFE
#   ✅  last_updated, create_date    — column names,    SAFE
#   ✅  'DROP TABLE' inside strings  — literal text,    SAFE
#   ❌  DROP TABLE videos            — DDL statement,   BLOCKED
#   ❌  DELETE FROM videos           — DML statement,   BLOCKED
#   ❌  INSERT INTO videos           — DML statement,   BLOCKED
#   ❌  UPDATE videos SET …          — DML statement,   BLOCKED
#   ❌  REPLACE INTO videos          — upsert,          BLOCKED
#   ❌  ATTACH DATABASE …            — DB escape,       BLOCKED
# ═══════════════════════════════════════════════════════════════

DANGEROUS_PATTERN = re.compile(
    r"""
    \b(
        DROP      \s+ (TABLE|INDEX|VIEW|TRIGGER|DATABASE)
      | DELETE    \s+ FROM
      | UPDATE    \s+ \w+ \s+ SET \b
      | INSERT    \s+ (INTO|OR\s)
      | REPLACE   \s+ INTO
      | ALTER     \s+ (TABLE|INDEX|VIEW)
      | CREATE    \s+ (TABLE|INDEX|VIEW|TRIGGER|TEMP|TEMPORARY|VIRTUAL|DATABASE)
      | ATTACH    \b
      | DETACH    \b
      | PRAGMA    \b
      | VACUUM    \b
      | REINDEX   \b
      | \.load    \b
      | \.import  \b
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)


# ═══════════════════════════════════════════════════════════════
# SQL VALIDATION  — secure BUT flexible
#
#  ALLOWED (read-only analytics):
#    SELECT …
#    WITH cte AS (…) SELECT …
#    (SELECT …) — subquery wrapper
#    SELECT REPLACE(col,'a','b') …
#    SELECT … FROM t WHERE col = 'DROP TABLE'
#    -- comment\n SELECT …
#
#  BLOCKED (writes / side-effects):
#    DROP / DELETE / UPDATE / INSERT / ALTER / CREATE
#    ATTACH / DETACH / PRAGMA / VACUUM
#    Multiple statements (;)
# ═══════════════════════════════════════════════════════════════

def validate_sql(sql: str) -> Tuple[bool, str]:
    # ── 1. Strip markdown fences ──
    cleaned = _strip_markdown_sql(sql)
    cleaned = cleaned.strip().rstrip(";")

    if not cleaned:
        return False, "Empty SQL query."

    # ── 2. First real keyword (skip comments + whitespace) ──
    bare = _strip_sql_comments(cleaned).strip()
    if not bare:
        return False, "Empty SQL query after removing comments."

    first_word = bare.split()[0].upper()

    # ── 3. Must begin with SELECT | WITH (CTE) | ( (sub-query) ──
    if first_word not in ("SELECT", "WITH", "EXPLAIN") and not bare.startswith("("):
        return False, "Only SELECT statements are allowed."

    # ── 4. WITH must contain a SELECT somewhere ──
    if first_word == "WITH":
        if not re.search(r"\bSELECT\b", bare, re.IGNORECASE):
            return False, "WITH clause must contain a SELECT statement."

    # ── 5. EXPLAIN is only allowed before SELECT/WITH ──
    if first_word == "EXPLAIN":
        rest = bare[len("EXPLAIN"):].strip()
        rest_word = rest.split()[0].upper() if rest else ""
        if rest_word not in ("SELECT", "WITH", "QUERY"):
            return False, "EXPLAIN is only allowed with SELECT queries."

    # ── 6. Neutralize string literals, then check for danger ──
    safe_to_scan = _neutralize_string_literals(_strip_sql_comments(cleaned))
    match = DANGEROUS_PATTERN.search(safe_to_scan)
    if match:
        return False, f"Query contains forbidden operation: {match.group().strip()}"

    # ── 7. No multiple statements ──
    # Count semicolons OUTSIDE of string literals
    outside_strings = _neutralize_string_literals(cleaned)
    if outside_strings.count(";") > 0:
        return False, "Multiple statements are not allowed."

    return True, ""


def add_limit(sql: str, limit: int = 10000) -> str:
    if "LIMIT" not in sql.upper():
        sql = sql.rstrip().rstrip(";")
        sql += f" LIMIT {limit}"
    return sql


# ═══════════════════════════════════════════════════════════════
# QUERY EXECUTION
# ═══════════════════════════════════════════════════════════════

def execute_query(sql: str):
    # ── Clean LLM output ──
    sql = _strip_markdown_sql(sql).strip().rstrip(";")

    valid, err = validate_sql(sql)
    if not valid:
        raise ValueError(err)

    sql = add_limit(sql)
    conn = get_connection(readonly=True)       # query_only = ON
    try:
        start = time.perf_counter()
        cursor = conn.execute(sql)
        rows = [dict(row) for row in cursor.fetchall()]
        elapsed = round(time.perf_counter() - start, 4)
        return rows, elapsed
    finally:
        conn.close()


def execute_kpi_sql(sql: str):
    # ── Clean LLM output ──
    sql = _strip_markdown_sql(sql).strip().rstrip(";")

    valid, _ = validate_sql(sql)
    if not valid:
        return None

    conn = get_connection(readonly=True)
    try:
        cursor = conn.execute(sql)
        row = cursor.fetchone()
        if row:
            val = row[0]
            if isinstance(val, float):
                if abs(val) >= 1_000_000_000:
                    return f"{val / 1_000_000_000:.1f}B"
                elif abs(val) >= 1_000_000:
                    return f"{val / 1_000_000:.1f}M"
                elif abs(val) >= 1_000:
                    return f"{val / 1_000:.1f}K"
                else:
                    return f"{val:.2f}"
            elif isinstance(val, int):
                if abs(val) >= 1_000_000_000:
                    return f"{val / 1_000_000_000:.1f}B"
                elif abs(val) >= 1_000_000:
                    return f"{val / 1_000_000:.1f}M"
                elif abs(val) >= 1_000:
                    return f"{val / 1_000:.1f}K"
                return str(val)
            return str(val)
        return None
    except Exception:
        return None
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════
# SCHEMA
# ═══════════════════════════════════════════════════════════════

def get_schema():
    conn = sqlite3.connect(DB_PATH)
    try:
        tables = []
        cursor = conn.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%';"
        )
        for (table_name,) in cursor.fetchall():
            cols_raw = conn.execute(
                f"PRAGMA table_info('{table_name}');"
            ).fetchall()
            columns = [{"name": c[1], "type": c[2]} for c in cols_raw]
            count = conn.execute(
                f"SELECT COUNT(*) FROM '{table_name}'"
            ).fetchone()[0]
            col_names = [c[1] for c in cols_raw]
            sample_raw = conn.execute(
                f"SELECT * FROM '{table_name}' LIMIT 3"
            ).fetchall()
            sample = [dict(zip(col_names, row)) for row in sample_raw]
            tables.append({
                "name": table_name,
                "columns": columns,
                "row_count": count,
                "sample": sample,
            })
        total = sum(t["row_count"] for t in tables)
        return {"tables": tables, "row_count": total}
    finally:
        conn.close()


def table_exists(table_name: str) -> bool:
    conn = get_connection(readonly=True)
    try:
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table_name,),
        )
        return cursor.fetchone() is not None
    finally:
        conn.close()


def get_table_columns(table_name: str) -> List[str]:
    conn = get_connection(readonly=True)
    try:
        cols = conn.execute(
            f"PRAGMA table_info('{table_name}');"
        ).fetchall()
        return [c[1] for c in cols]
    finally:
        conn.close()


def validate_sql_columns(
    sql: str, table_name: str
) -> Tuple[bool, str, List[str]]:
    valid_columns = set(get_table_columns(table_name))
    if not valid_columns:
        return True, "", []
    conn = get_connection(readonly=True)
    try:
        conn.execute(f"EXPLAIN {sql}")
        return True, "", sorted(valid_columns)
    except Exception as e:
        err_str = str(e)
        if "no such column" in err_str.lower():
            match = re.search(
                r"no such column:\s*(\S+)", err_str, re.IGNORECASE
            )
            bad_col = match.group(1) if match else "unknown"
            return (
                False,
                f"Column '{bad_col}' does not exist in table '{table_name}'.",
                sorted(valid_columns),
            )
        return False, f"SQL validation failed: {e}", sorted(valid_columns)
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════
# ENCODING / DELIMITER HELPERS FOR CSV
# ═══════════════════════════════════════════════════════════════

def _safe_clean_encoding(enc: str) -> str:
    if not enc:
        return "utf-8"
    clean = enc.split("(")[0].strip().lower()
    if clean in ("ascii", "us-ascii", "us_ascii", "ansi_x3.4-1968", "646"):
        return "utf-8"
    import codecs
    try:
        codecs.lookup(clean)
        return clean
    except LookupError:
        pass
    original = enc.split("(")[0].strip()
    try:
        codecs.lookup(original)
        return original
    except LookupError:
        pass
    return "utf-8"


def _safe_detect_encoding(filepath: str) -> str:
    try:
        from services.upload_service import detect_encoding, _clean_encoding_name
        with open(filepath, "rb") as f:
            raw_sample = f.read(100000)
        enc, _conf = detect_encoding(raw_sample)
        return _clean_encoding_name(enc)
    except ImportError:
        try:
            with open(filepath, "rb") as f:
                raw = f.read(10000)
            raw.decode("utf-8", errors="strict")
            return "utf-8"
        except UnicodeDecodeError:
            return "latin-1"
    except Exception:
        return "utf-8"


def _safe_detect_delimiter(filepath: str, encoding: str) -> str:
    try:
        from services.upload_service import detect_delimiter
        with open(filepath, "r", encoding=encoding, errors="replace") as f:
            text_sample = f.read(20000)
        return detect_delimiter(text_sample)
    except ImportError:
        try:
            with open(filepath, "r", encoding=encoding, errors="replace") as f:
                sample = f.read(5000)
            counts = {",": sample.count(","), "\t": sample.count("\t"),
                      ";": sample.count(";"), "|": sample.count("|")}
            best = max(counts, key=counts.get)
            return best if counts[best] > 0 else ","
        except Exception:
            return ","
    except Exception:
        return ","


def _try_read_csv(filepath, encoding, delimiter, chunk_size):
    encodings_to_try = [encoding]
    for fb in ["utf-8", "utf-8-sig", "latin-1", "cp1252", "iso-8859-1"]:
        if fb not in encodings_to_try:
            encodings_to_try.append(fb)
    last_error = None
    for enc in encodings_to_try:
        try:
            reader = pd.read_csv(
                filepath, encoding=enc, sep=delimiter,
                chunksize=chunk_size, on_bad_lines="skip",
                engine="python", dtype=str,
            )
            if enc != encoding:
                print(f"  Encoding fallback: {encoding} → {enc}")
            return reader, enc
        except Exception as e:
            last_error = e
            continue
    raise ValueError(
        f"Could not read file. Tried: {', '.join(encodings_to_try)}. "
        f"Last error: {last_error}"
    )


def _try_read_csv_preview(filepath, encoding, delimiter, nrows=100):
    encodings_to_try = [encoding]
    for fb in ["utf-8", "utf-8-sig", "latin-1", "cp1252", "iso-8859-1"]:
        if fb not in encodings_to_try:
            encodings_to_try.append(fb)
    errors_list = []
    for enc in encodings_to_try:
        try:
            df = pd.read_csv(
                filepath, encoding=enc, sep=delimiter,
                nrows=nrows, on_bad_lines="skip", engine="python",
            )
            if df is not None and not df.empty:
                return df, enc
        except Exception as e:
            errors_list.append(f"{enc}: {e}")
            continue
    raise ValueError(f"Could not read CSV. Tried: {'; '.join(errors_list)}")


# ═══════════════════════════════════════════════════════════════
# CSV LOADING
# ═══════════════════════════════════════════════════════════════

def load_csv_to_db(
    filepath: str,
    table_name: str = "custom_data",
    encoding: Optional[str] = None,
    delimiter: Optional[str] = None,
) -> Dict[str, Any]:
    safe_name = re.sub(r"[^\w]", "_", table_name)
    if encoding is None:
        encoding = _safe_detect_encoding(filepath)
    else:
        encoding = _safe_clean_encoding(encoding)
    if delimiter is None:
        delimiter = _safe_detect_delimiter(filepath, encoding)

    CHUNK = 50000
    conn = sqlite3.connect(DB_PATH, timeout=60)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA cache_size=-128000;")

    try:
        total_rows = 0
        chunk_num = 0
        reader, actual_encoding = _try_read_csv(
            filepath, encoding, delimiter, CHUNK
        )
        for chunk in reader:
            chunk_num += 1
            clean_cols = []
            seen_cols: set = set()
            for col in chunk.columns:
                c = re.sub(r"[^\w]", "_", str(col)).strip("_")
                if not c:
                    c = f"col_{len(clean_cols)}"
                original_c = c
                counter = 1
                while c.lower() in seen_cols:
                    c = f"{original_c}_{counter}"
                    counter += 1
                seen_cols.add(c.lower())
                clean_cols.append(c)
            chunk.columns = clean_cols
            chunk = chunk.dropna(how="all")
            if chunk.empty:
                continue
            for col in chunk.columns:
                try:
                    numeric = pd.to_numeric(chunk[col], errors="coerce")
                    non_null_original = chunk[col].notna().sum()
                    non_null_numeric = numeric.notna().sum()
                    if non_null_original > 0:
                        ratio = non_null_numeric / non_null_original
                        if ratio > 0.75:
                            chunk[col] = numeric
                except Exception:
                    pass
            mode = "replace" if chunk_num == 1 else "append"
            chunk.to_sql(safe_name, conn, if_exists=mode, index=False)
            total_rows += len(chunk)
            if chunk_num % 20 == 0:
                conn.commit()
                print(f"  … loaded {total_rows:,} rows ({chunk_num} chunks)")

        if total_rows == 0:
            raise ValueError("No data rows found in file after parsing")

        conn.commit()

        try:
            cols_info = conn.execute(
                f"PRAGMA table_info('{safe_name}')"
            ).fetchall()
            for ci in cols_info:
                col_name = ci[1]
                col_type = (ci[2] or "").upper()
                if "TEXT" in col_type or col_type == "":
                    idx_name = re.sub(r"[^\w]", "_", col_name)
                    try:
                        conn.execute(
                            f'CREATE INDEX IF NOT EXISTS '
                            f'idx_{safe_name}_{idx_name} '
                            f'ON "{safe_name}"("{col_name}");'
                        )
                    except Exception:
                        pass
            conn.commit()
        except Exception:
            pass

        delim_display = "TAB" if delimiter == "\t" else repr(delimiter)
        print(
            f"  ✓ Loaded {total_rows:,} rows into '{safe_name}' "
            f"({chunk_num} chunks, encoding={actual_encoding}, "
            f"delimiter={delim_display})"
        )
        return get_schema()
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════
# CSV PREVIEW
# ═══════════════════════════════════════════════════════════════

def preview_csv(
    filepath: str,
    encoding: Optional[str] = None,
    delimiter: Optional[str] = None,
) -> Dict[str, Any]:
    if encoding is None:
        encoding = _safe_detect_encoding(filepath)
    else:
        encoding = _safe_clean_encoding(encoding)
    if delimiter is None:
        delimiter = _safe_detect_delimiter(filepath, encoding)

    df, actual_encoding = _try_read_csv_preview(
        filepath, encoding, delimiter, nrows=100
    )
    try:
        total_lines = 0
        with open(filepath, "rb") as f:
            while True:
                buf = f.read(1024 * 1024)
                if not buf:
                    break
                total_lines += buf.count(b"\n")
        total_lines = max(total_lines - 1, len(df))
    except Exception:
        total_lines = len(df)

    columns = []
    for col in df.columns:
        dtype = str(df[col].dtype)
        if "int" in dtype:
            col_type = "INTEGER"
        elif "float" in dtype:
            col_type = "REAL"
        elif "datetime" in dtype or "date" in str(col).lower():
            col_type = "DATE"
        elif "bool" in dtype:
            col_type = "BOOLEAN"
        else:
            col_type = "TEXT"
        columns.append({"name": str(col), "type": col_type})

    sample = df.head(5).fillna("").to_dict(orient="records")
    return {
        "row_count": total_lines,
        "columns": columns,
        "sample_rows": sample,
        "encoding": actual_encoding,
        "delimiter": "TAB" if delimiter == "\t" else delimiter,
    }


# ═══════════════════════════════════════════════════════════════
# DROP TABLE
# ═══════════════════════════════════════════════════════════════

def drop_table(table_name: str) -> None:
    safe_name = re.sub(r"[^\w]", "_", table_name)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(f'DROP TABLE IF EXISTS "{safe_name}"')
        conn.commit()
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════
# TABLE PROFILING
# ═══════════════════════════════════════════════════════════════

def profile_table(table_name: str) -> Dict[str, Any]:
    conn = get_connection(readonly=True)
    safe = re.sub(r"[^\w]", "_", table_name)
    profile: Dict[str, Any] = {
        "table_name": safe,
        "numeric_columns": [],
        "categorical_columns": [],
        "date_columns": [],
        "row_count": 0,
    }
    try:
        profile["row_count"] = conn.execute(
            f'SELECT COUNT(*) FROM "{safe}"'
        ).fetchone()[0]
        cols_raw = conn.execute(
            f"PRAGMA table_info('{safe}')"
        ).fetchall()
        for ci in cols_raw:
            name, dtype = ci[1], ci[2].upper()
            if name in {"row_id", "index"}:
                continue
            if any(
                d in name.lower()
                for d in {"date", "time", "created", "updated", "published"}
            ):
                profile["date_columns"].append(name)
                continue
            if any(t in dtype for t in {"INT", "REAL", "FLOAT", "NUM"}):
                try:
                    row = conn.execute(
                        f'SELECT MIN("{name}"), MAX("{name}"), '
                        f'AVG("{name}"), COUNT(DISTINCT "{name}") '
                        f'FROM "{safe}" WHERE "{name}" IS NOT NULL'
                    ).fetchone()
                    profile["numeric_columns"].append({
                        "name": name,
                        "min": row[0], "max": row[1],
                        "avg": round(row[2], 2) if row[2] else None,
                        "distinct": row[3],
                    })
                except Exception:
                    profile["numeric_columns"].append({"name": name})
            else:
                try:
                    top = conn.execute(
                        f'SELECT "{name}", COUNT(*) AS cnt '
                        f'FROM "{safe}" WHERE "{name}" IS NOT NULL '
                        f'GROUP BY "{name}" ORDER BY cnt DESC LIMIT 10'
                    ).fetchall()
                    dist = conn.execute(
                        f'SELECT COUNT(DISTINCT "{name}") FROM "{safe}"'
                    ).fetchone()[0]
                    profile["categorical_columns"].append({
                        "name": name, "distinct": dist,
                        "top_values": [
                            {"value": str(r[0]), "count": r[1]} for r in top
                        ],
                    })
                except Exception:
                    profile["categorical_columns"].append({"name": name})
    except Exception as e:
        print(f"Profiling failed for {safe}: {e}")
    finally:
        conn.close()
    return profile


def generate_starter_questions(profile: Dict[str, Any]) -> List[str]:
    qs: List[str] = []
    cats = profile.get("categorical_columns", [])
    nums = profile.get("numeric_columns", [])
    dates = profile.get("date_columns", [])
    if cats:
        qs.append(f"Show the distribution of records by {cats[0]['name']}")
    if nums and cats:
        qs.append(f"What is the average {nums[0]['name']} by {cats[0]['name']}?")
    if dates and nums:
        qs.append(f"Show the trend of {nums[0]['name']} over time")
    if len(nums) >= 2:
        qs.append(f"Compare {nums[0]['name']} vs {nums[1]['name']}")
    if nums:
        qs.append(f"What are the top 10 records by {nums[0]['name']}?")
    return qs[:5]