import os
from datetime import datetime
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from config import settings, limiter
from services.logger import logger
from routes.query import router
from middleware.request_id import RequestIDMiddleware

app = FastAPI(title="MATRIQ BI Dashboard API", version="2.0.0")

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    logger.warning(f"Rate limit exceeded for {request.client.host}: {exc.detail}")
    return JSONResponse(
        status_code=429,
        content={
            "success": False,
            "error": f"Rate limit exceeded: {exc.detail}. Please wait.",
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    rid = getattr(request.state, "request_id", "unknown")
    logger.error(f"[{rid}] Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error. Please try again.",
            "request_id": rid,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.on_event("startup")
async def startup_event():
    logger.info("Starting MATRIQ API ...")
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY.strip() == "":
        logger.error("GEMINI_API_KEY is missing! Set it in backend/.env")
    else:
        n = len([k for k in settings.GEMINI_API_KEY.split(",") if k.strip()])
        logger.info(f"GEMINI_API_KEY configured ({n} key(s)).")
    if not os.path.exists(settings.DB_PATH):
        logger.warning(f"Database not found at {settings.DB_PATH}. Run data/load_db.py")
    else:
        logger.info(f"Database found at {settings.DB_PATH}")
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    logger.info(f"CORS origins: {settings.CORS_ORIGINS}")
    logger.info(f"Model: {settings.GEMINI_MODEL}")
    logger.info("MATRIQ API ready.")


@app.get("/")
async def root():
    return {"status": "ok", "service": "MATRIQ API", "version": "2.0.0"}


@app.get("/health")
async def health_check():
    from services.gemini_service import get_key_stats
    db_ok = "connected" if os.path.exists(settings.DB_PATH) else "missing"
    resp = {
        "status": "healthy",
        "database": db_ok,
        "api_keys": get_key_stats(),
        "model": settings.GEMINI_MODEL,
        "timestamp": datetime.utcnow().isoformat(),
    }
    try:
        from cache.redis_client import get_cache_stats
        resp["cache"] = get_cache_stats()
    except Exception:
        pass
    return resp