# backend/routes/query.py
import os
import time
import hashlib
import traceback
from datetime import datetime
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, UploadFile, File, Form, Request, HTTPException

from models.schemas import (
    QueryRequest, QueryResponse, ChartConfig, KPI,
    SchemaResponse, SuggestionResponse, Annotation,
    TablesResponse, TableInfo, ActiveTableRequest,
    UploadResponse, UploadPreviewResponse,
)
from services.prompt_builder import (
    build_prompt, build_modification_prompt, build_fix_prompt,
)
from services.gemini_service import query_gemini
from services.db_service import (
    execute_query, execute_kpi_sql, get_schema, load_csv_to_db,
    validate_sql, table_exists, drop_table, preview_csv,
    validate_sql_columns, profile_table, generate_starter_questions,
)
from services.conversation_handler import (
    is_conversational, get_conversational_response,
    is_modification_request, get_chart_type_from_modification,
)
from config import settings, limiter
from services.logger import logger

router = APIRouter(prefix="/api")

_active_table: str = settings.DEFAULT_TABLE
_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = settings.CACHE_TTL

MAX_SELF_CORRECT_RETRIES = 2


# ═══════════════════════════════════════════════════════════════
# CACHE HELPERS (unchanged)
# ═══════════════════════════════════════════════════════════════

def _cache_key(query_text: str, active_tbl: str) -> str:
    raw = f"{query_text.strip().lower()}|{active_tbl}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _should_skip_cache(query_text: str) -> bool:
    q = query_text.lower()
    return "random" in q or "sample" in q


def _get_cached(key: str) -> Optional[QueryResponse]:
    if key not in _cache:
        return None
    entry = _cache[key]
    if time.time() - entry["ts"] > CACHE_TTL:
        del _cache[key]
        return None
    return entry["resp"]


def _put_cache(key: str, resp: QueryResponse) -> None:
    if len(_cache) > 200:
        oldest = sorted(_cache, key=lambda k: _cache[k]["ts"])
        for old_key in oldest[:50]:
            del _cache[old_key]
    _cache[key] = {"resp": resp, "ts": time.time()}


# ═══════════════════════════════════════════════════════════════
# RESPONSE BUILDER HELPERS (unchanged)
# ═══════════════════════════════════════════════════════════════

def _parse_chart_config(cc: Any) -> ChartConfig:
    if not isinstance(cc, dict):
        cc = {}
    y_raw = cc.get("y_axis", [])
    if isinstance(y_raw, str):
        y_raw = [y_raw]
    if not isinstance(y_raw, list):
        y_raw = []
    return ChartConfig(
        chart_type=str(cc.get("chart_type", "bar")),
        title=str(cc.get("title", "Query Results")),
        x_axis=str(cc.get("x_axis", "")),
        x_label=str(cc.get("x_label", "")),
        y_axis=y_raw,
        y_label=str(cc.get("y_label", "")),
        group_by=cc.get("group_by"),
        colors=cc.get("colors", ["#6366F1", "#8B5CF6", "#EC4899", "#F43F5E"]),
        annotations=[
            Annotation(**a)
            for a in cc.get("annotations", [])
            if isinstance(a, dict)
        ],
    )


def _parse_additional_charts(raw: list, fallback_x: str) -> List[ChartConfig]:
    charts = []
    for ac in raw:
        if not isinstance(ac, dict):
            continue
        ac_y = ac.get("y_axis", [])
        if isinstance(ac_y, str):
            ac_y = [ac_y]
        if not isinstance(ac_y, list):
            ac_y = []
        charts.append(
            ChartConfig(
                chart_type=str(ac.get("chart_type", "bar")),
                title=str(ac.get("title", "")),
                x_axis=str(ac.get("x_axis", fallback_x)),
                x_label=str(ac.get("x_label", "")),
                y_axis=ac_y,
                y_label=str(ac.get("y_label", "")),
                group_by=ac.get("group_by"),
                colors=ac.get(
                    "colors", ["#6366F1", "#8B5CF6", "#EC4899"]
                ),
                annotations=[
                    Annotation(**a)
                    for a in ac.get("annotations", [])
                    if isinstance(a, dict)
                ],
            )
        )
    return charts


def _parse_kpis(raw: list) -> List[KPI]:
    kpis = []
    for k in raw:
        if not isinstance(k, dict):
            continue
        try:
            kpi_sql = k.get("sql", "")
            if kpi_sql and isinstance(kpi_sql, str):
                val = execute_kpi_sql(kpi_sql)
            else:
                val = k.get("value", "N/A")
            kpis.append(
                KPI(
                    label=str(k.get("label", "Metric") or "Metric"),
                    value=str(val) if val else "N/A",
                    icon=str(k.get("icon", "bar-chart") or "bar-chart"),
                    trend=str(k["trend"]) if k.get("trend") else None,
                    trend_direction=str(
                        k.get("trend_direction") or "neutral"
                    ),
                )
            )
        except Exception as e:
            logger.warning(f"KPI parse error: {e}")
    return kpis


def _build_response_from_gemini(
    gemini_result: dict,
    sql: str,
    data: List[Dict[str, Any]],
    exec_time: float,
    query_text: str,
    total_time: float,
    is_mod: bool = False,
) -> QueryResponse:
    chart_config = _parse_chart_config(
        gemini_result.get("chart_config", {})
    )

    if data and not chart_config.x_axis:
        keys = list(data[0].keys())
        chart_config.x_axis = keys[0]
        chart_config.y_axis = keys[1:]

    additional = _parse_additional_charts(
        gemini_result.get("additional_charts", []), chart_config.x_axis
    )
    kpis = _parse_kpis(gemini_result.get("kpis", []))

    follow_ups = gemini_result.get("follow_up_questions", [])
    if not isinstance(follow_ups, list):
        follow_ups = []

    assumptions = gemini_result.get("assumptions", [])
    if not isinstance(assumptions, list):
        assumptions = []

    confidence = gemini_result.get("confidence")
    if confidence and confidence not in ("high", "medium", "low"):
        confidence = None

    return QueryResponse(
        success=True,
        query=query_text,
        sql=sql,
        data=data,
        chart_config=chart_config,
        additional_charts=additional,
        insight=str(gemini_result.get("insight", "")),
        kpis=kpis,
        follow_up_questions=follow_ups,
        execution_time=round(total_time, 3),
        cache_hit=False,
        confidence=confidence,
        assumptions=assumptions,
        is_modification=is_mod,
    )


# ═══════════════════════════════════════════════════════════════
# SELF-CORRECTION (unchanged)
# ═══════════════════════════════════════════════════════════════

def _execute_with_self_correction(
    sql: str,
    user_query: str,
    active: str,
    gemini_result: dict,
    t0: float,
) -> QueryResponse:
    last_error = ""

    for attempt in range(MAX_SELF_CORRECT_RETRIES + 1):
        try:
            col_ok, col_err, valid_cols = validate_sql_columns(sql, active)
            if not col_ok:
                raise ValueError(col_err)

            data, exec_time = execute_query(sql)
            return _build_response_from_gemini(
                gemini_result, sql, data, exec_time, user_query,
                time.perf_counter() - t0,
            )

        except Exception as e:
            last_error = str(e)
            if attempt < MAX_SELF_CORRECT_RETRIES:
                logger.warning(
                    f"SQL failed (attempt {attempt + 1}): {last_error}. "
                    "Asking Gemini to fix..."
                )
                try:
                    fix_prompt = build_fix_prompt(
                        user_query, sql, last_error, active_table=active
                    )
                    fixed = query_gemini(fix_prompt)
                    new_sql = fixed.get("sql", "")
                    if new_sql and new_sql != sql:
                        valid, verr = validate_sql(new_sql)
                        if valid:
                            sql = new_sql
                            gemini_result = fixed
                            logger.info(
                                f"Self-corrected SQL (attempt {attempt + 1})"
                            )
                            continue
                except Exception as fix_err:
                    logger.warning(
                        f"Self-correction call failed: {fix_err}"
                    )
            break

    return QueryResponse(
        success=False,
        query=user_query,
        sql=sql,
        error=(
            f"Query failed after {MAX_SELF_CORRECT_RETRIES + 1} "
            f"attempts: {last_error}"
        ),
        execution_time=round(time.perf_counter() - t0, 3),
    )


# ═══════════════════════════════════════════════════════════════
# QUERY ENDPOINT (unchanged)
# ═══════════════════════════════════════════════════════════════

@router.post("/query", response_model=QueryResponse)
@limiter.limit(settings.QUERY_RATE_LIMIT)
def process_query(req: QueryRequest, request: Request):
    global _active_table
    t0 = time.perf_counter()
    active = req.active_table or _active_table or settings.DEFAULT_TABLE
    logger.info(f"Query: '{req.query[:80]}' | table={active}")

    # 1. conversational
    if is_conversational(req.query):
        conv = get_conversational_response(req.query)
        if conv:
            logger.info("Conversational response (no Gemini call)")
            return QueryResponse(
                success=True, query=req.query, sql="", data=[],
                chart_config=None, additional_charts=[],
                insight=conv["insight"], kpis=[],
                follow_up_questions=conv.get("follow_up_questions", []),
                execution_time=round(time.perf_counter() - t0, 3),
                cache_hit=False,
            )

    # 2. modification
    is_mod = False
    if req.conversation_history and is_modification_request(req.query):
        is_mod = True
        prev = (
            req.conversation_history[-1] if req.conversation_history else {}
        )
        prev_sql = prev.get("sql", "")
        prev_chart = prev.get("chart_config")

        if prev_sql:
            logger.info("Detected modification request")
            try:
                prompt = build_modification_prompt(
                    req.query, prev_sql, prev_chart, active_table=active
                )
                gemini_result = query_gemini(prompt)
                sql = gemini_result.get("sql", "")
                if sql:
                    valid, err = validate_sql(sql)
                    if not valid:
                        return QueryResponse(
                            success=False, query=req.query, sql=sql,
                            error=f"Invalid SQL: {err}",
                            execution_time=round(
                                time.perf_counter() - t0, 3
                            ),
                        )
                    resp = _execute_with_self_correction(
                        sql, req.query, active, gemini_result, t0
                    )
                    resp.is_modification = True
                    return resp
            except Exception as e:
                logger.warning(
                    f"Modification prompt failed, falling through: {e}"
                )
                is_mod = False

    # 3. cache
    skip_cache = _should_skip_cache(req.query)
    cache_key = _cache_key(req.query, active)
    if not skip_cache:
        cached = _get_cached(cache_key)
        if cached is not None:
            logger.info("Cache HIT")
            copy = cached.model_copy()
            copy.cache_hit = True
            copy.timestamp = datetime.utcnow().isoformat()
            return copy

    # 4. normal flow
    try:
        prompt = build_prompt(
            req.query, req.conversation_history, active_table=active
        )
        gemini_result = query_gemini(prompt)
        sql = gemini_result.get("sql", "")

        if not sql:
            return QueryResponse(
                success=True, query=req.query, sql="",
                data=[], chart_config=None, additional_charts=[],
                insight=str(
                    gemini_result.get(
                        "insight",
                        "I could not generate a query. Try rephrasing.",
                    )
                ),
                kpis=[],
                follow_up_questions=gemini_result.get(
                    "follow_up_questions", []
                ),
                execution_time=round(time.perf_counter() - t0, 3),
                confidence=gemini_result.get("confidence"),
                assumptions=gemini_result.get("assumptions", []),
            )

        valid, err = validate_sql(sql)
        if not valid:
            return QueryResponse(
                success=False, query=req.query, sql=sql,
                error=f"Invalid SQL: {err}",
                execution_time=round(time.perf_counter() - t0, 3),
            )

        resp = _execute_with_self_correction(
            sql, req.query, active, gemini_result, t0
        )

        if resp.success and not skip_cache:
            _put_cache(cache_key, resp)

        elapsed = round(time.perf_counter() - t0, 3)
        logger.info(f"Query done in {elapsed}s — {len(resp.data)} rows")
        return resp

    except Exception as e:
        traceback.print_exc()
        logger.error(f"Query failed: {e}")
        return QueryResponse(
            success=False, query=req.query, error=str(e),
            execution_time=round(time.perf_counter() - t0, 3),
        )


# ═══════════════════════════════════════════════════════════════
# SCHEMA / SUGGESTIONS (unchanged)
# ═══════════════════════════════════════════════════════════════

@router.get("/schema", response_model=SchemaResponse)
def schema_info():
    info = get_schema()
    return SchemaResponse(tables=info["tables"], row_count=info["row_count"])


@router.get("/suggestions", response_model=SuggestionResponse)
def suggestions():
    items = [
        {
            "query": "Show me the total views by category",
            "difficulty": "Simple",
            "description": "Bar chart of aggregated views per category",
        },
        {
            "query": (
                "Compare average likes, comments, and shares for "
                "monetized vs non-monetized videos across regions"
            ),
            "difficulty": "Medium",
            "description": "Grouped bar chart with multiple engagement metrics",
        },
        {
            "query": (
                "Show me the monthly trend of average sentiment score "
                "for the top 3 categories by views in 2025"
            ),
            "difficulty": "Complex",
            "description": "Multi-line time series chart with annotations",
        },
        {
            "query": "What is the distribution of videos across languages?",
            "difficulty": "Simple",
            "description": "Pie chart of video count by language",
        },
        {
            "query": "Which region has the highest engagement rate?",
            "difficulty": "Medium",
            "description": "Engagement = (likes+comments+shares)/views",
        },
        {
            "query": "Show monthly video publish trends by category for 2024",
            "difficulty": "Medium",
            "description": "Multi-line time series chart",
        },
    ]
    return SuggestionResponse(suggestions=items)


# ═══════════════════════════════════════════════════════════════
# TABLE MANAGEMENT (unchanged)
# ═══════════════════════════════════════════════════════════════

@router.get("/tables", response_model=TablesResponse)
def list_tables():
    global _active_table
    info = get_schema()
    tables = [
        TableInfo(
            name=t["name"],
            row_count=t["row_count"],
            column_count=len(t["columns"]),
            columns=t["columns"],
            is_active=(t["name"] == _active_table),
        )
        for t in info["tables"]
    ]
    return TablesResponse(tables=tables, active_table=_active_table)


@router.post("/active-table")
def set_active_table(body: ActiveTableRequest):
    global _active_table
    if not table_exists(body.table_name):
        raise HTTPException(404, f"Table '{body.table_name}' does not exist")
    _active_table = body.table_name
    logger.info(f"Active table → {_active_table}")
    return {
        "success": True,
        "active_table": _active_table,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.delete("/tables/{table_name}")
def delete_table_endpoint(table_name: str):
    global _active_table
    if table_name == "youtube_data":
        raise HTTPException(
            400, "Cannot delete the default youtube_data table"
        )
    if not table_exists(table_name):
        raise HTTPException(404, f"Table '{table_name}' does not exist")
    drop_table(table_name)
    if _active_table == table_name:
        _active_table = settings.DEFAULT_TABLE
    info = get_schema()
    tables = [
        TableInfo(
            name=t["name"],
            row_count=t["row_count"],
            column_count=len(t["columns"]),
            columns=t["columns"],
            is_active=(t["name"] == _active_table),
        )
        for t in info["tables"]
    ]
    return TablesResponse(tables=tables, active_table=_active_table)


# ═══════════════════════════════════════════════════════════════
# UPLOAD — 100MB, AUTO ENCODING, AUTO DELIMITER, NO ROW LIMIT
# ═══════════════════════════════════════════════════════════════

@router.post("/upload", response_model=UploadResponse)
@limiter.limit(settings.UPLOAD_RATE_LIMIT)
async def upload_csv_endpoint(
    request: Request,
    file: UploadFile = File(...),
    table_name: str = Form("custom_data"),
    encoding: Optional[str] = Form(None),
    delimiter: Optional[str] = Form(None),
):
    """
    Upload CSV/TSV/TXT file.
    - Max 100MB
    - Auto-detects encoding (UTF-8, Latin-1, CP1252, Shift_JIS, etc.)
    - Auto-detects delimiter (, ; TAB |)
    - User can override encoding and delimiter via form fields
    - No row limit — loads all rows in chunks
    - Handles 1M+ row files
    """
    global _active_table
    filename = file.filename or "unknown.csv"

    # ── Validate extension ──
    allowed = {".csv", ".tsv", ".txt"}
    ext = os.path.splitext(filename)[1].lower()
    if ext not in allowed:
        return UploadResponse(
            success=False,
            error=(
                f"Invalid file type '{ext}'. "
                f"Allowed: {', '.join(sorted(allowed))}"
            ),
        )

    # ── Read all content ──
    content = await file.read()

    # ── Size check — 100MB ──
    max_size = int(os.getenv("MAX_UPLOAD_SIZE", str(100 * 1024 * 1024)))
    if len(content) > max_size:
        size_mb = len(content) / (1024 * 1024)
        max_mb = max_size / (1024 * 1024)
        return UploadResponse(
            success=False,
            error=f"File too large ({size_mb:.1f}MB). Maximum {max_mb:.0f}MB.",
        )

    if len(content) == 0:
        return UploadResponse(success=False, error="File is empty.")

    # ── Content validation ──
    try:
        from services.upload_service import (
            validate_csv_content,
            sanitize_table_name,
            detect_encoding as _detect_enc,
            detect_delimiter as _detect_delim,
            decode_content,
        )

        is_valid, error_msg, metadata = validate_csv_content(
            content, encoding, max_size
        )
        if not is_valid:
            return UploadResponse(success=False, error=error_msg)

        detected_encoding = encoding or metadata.get("encoding", "utf-8")
        detected_delimiter = delimiter or metadata.get("delimiter", ",")
        safe_table = sanitize_table_name(table_name)

    except ImportError:
        # Fallback if upload_service not available
        detected_encoding = encoding or "utf-8"
        detected_delimiter = delimiter or ","
        safe_table = table_name.replace(".csv", "").replace(" ", "_")[:64]
        metadata = {}

    # Handle TSV
    if ext == ".tsv" and delimiter is None:
        detected_delimiter = "\t"

    # ── Save temp file ──
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    tmp_name = f"{safe_table}_{os.urandom(4).hex()}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, tmp_name)

    with open(filepath, "wb") as f:
        f.write(content)

    try:
        # ── Load into database — no row limit ──
        schema = load_csv_to_db(
            filepath,
            safe_table,
            encoding=detected_encoding,
            delimiter=detected_delimiter,
        )
        _active_table = safe_table

        # ── Auto-profiling for suggested questions ──
        try:
            prof = profile_table(safe_table)
            starter_qs = generate_starter_questions(prof)
        except Exception:
            starter_qs = []

        file_size_mb = len(content) / (1024 * 1024)
        logger.info(
            f"Upload OK: '{filename}' → '{safe_table}' "
            f"({file_size_mb:.1f}MB, enc={detected_encoding}, "
            f"delim={'TAB' if detected_delimiter == chr(9) else repr(detected_delimiter)})"
        )

        return UploadResponse(
            success=True,
            table_name=safe_table,
            schema_info=schema,
            suggested_questions=starter_qs,
        )

    except Exception as e:
        logger.error(f"Upload failed: {e}")
        traceback.print_exc()
        return UploadResponse(success=False, error=str(e))

    finally:
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
        except Exception:
            pass


# ═══════════════════════════════════════════════════════════════
# UPLOAD PREVIEW
# ═══════════════════════════════════════════════════════════════

@router.post("/upload/preview", response_model=UploadPreviewResponse)
@limiter.limit(settings.UPLOAD_RATE_LIMIT)
async def upload_preview_endpoint(
    request: Request,
    file: UploadFile = File(...),
    encoding: Optional[str] = Form(None),
    delimiter: Optional[str] = Form(None),
):
    """
    Preview uploaded file before confirming.
    Shows first 5 rows, column types, total row count, detected encoding.
    """
    filename = file.filename or "unknown.csv"

    # ── Validate extension ──
    allowed = {".csv", ".tsv", ".txt"}
    ext = os.path.splitext(filename)[1].lower()
    if ext not in allowed:
        return UploadPreviewResponse(
            success=False,
            error=(
                f"Invalid file type '{ext}'. "
                f"Allowed: {', '.join(sorted(allowed))}"
            ),
        )

    # ── Read content ──
    content = await file.read()
    max_size = int(os.getenv("MAX_UPLOAD_SIZE", str(100 * 1024 * 1024)))
    if len(content) > max_size:
        return UploadPreviewResponse(
            success=False,
            error=(
                f"File too large ({len(content) / (1024 * 1024):.1f}MB). "
                f"Maximum {max_size / (1024 * 1024):.0f}MB."
            ),
        )

    if len(content) == 0:
        return UploadPreviewResponse(
            success=False, error="File is empty."
        )

    # ── Auto-detect encoding ──
    detected_encoding = encoding
    if detected_encoding is None:
        try:
            from services.upload_service import detect_encoding as _det
            detected_encoding, _ = _det(content[:100000])
        except Exception:
            detected_encoding = "utf-8"

    # ── Auto-detect delimiter ──
    detected_delimiter = delimiter
    if detected_delimiter is None:
        if ext == ".tsv":
            detected_delimiter = "\t"
        else:
            try:
                from services.upload_service import detect_delimiter as _dd
                text_sample = content[:20000].decode(
                    detected_encoding, errors="replace"
                )
                detected_delimiter = _dd(text_sample)
            except Exception:
                detected_delimiter = ","

    # ── Save temp file ──
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    tmp_path = os.path.join(
        settings.UPLOAD_DIR, f"_preview_{os.urandom(4).hex()}{ext}"
    )

    with open(tmp_path, "wb") as f:
        f.write(content)

    try:
        info = preview_csv(
            tmp_path,
            encoding=detected_encoding,
            delimiter=detected_delimiter,
        )

        return UploadPreviewResponse(
            success=True,
            file_name=filename,
            file_size=len(content),
            row_count=info["row_count"],
            columns=info["columns"],
            sample_rows=info["sample_rows"],
        )
    except Exception as e:
        logger.error(f"Preview failed: {e}")
        return UploadPreviewResponse(success=False, error=str(e))
    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass