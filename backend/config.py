import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    DB_PATH: str = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "database.db"
    )
    MAX_UPLOAD_SIZE: int = int(os.getenv("MAX_UPLOAD_SIZE", str(100 * 1024 * 1024)))
    MAX_ROWS: int = 1_000_000
    UPLOAD_DIR: str = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "data", "uploads"
    )
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    CORS_ORIGINS: list = os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://localhost:3001"
    ).split(",")
    QUERY_RATE_LIMIT: str = os.getenv("QUERY_RATE_LIMIT", "30/minute")
    UPLOAD_RATE_LIMIT: str = os.getenv("UPLOAD_RATE_LIMIT", "10/minute")
    MAX_QUERY_ROWS: int = 10_000
    QUERY_TIMEOUT: int = 30
    CACHE_TTL: int = int(os.getenv("CACHE_TTL", "300"))
    DEFAULT_TABLE: str = os.getenv("DEFAULT_TABLE", "youtube_data")


settings = Settings()

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
KEY_COOLDOWN_SECONDS: int = int(os.getenv("KEY_COOLDOWN_SECONDS", "60"))