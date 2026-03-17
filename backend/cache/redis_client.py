import hashlib
import json
import os
import threading
import time
from collections import OrderedDict
from typing import Any, Dict, Optional
from services.logger import logger

REDIS_URL = os.getenv("REDIS_URL", "")
CACHE_TTL = int(os.getenv("CACHE_TTL", "300"))
MAX_ENTRIES = 500


class InMemoryCache:
    def __init__(self, max_size: int = MAX_ENTRIES, default_ttl: int = CACHE_TTL):
        self._lock = threading.Lock()
        self._cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self._max_size = max_size
        self._default_ttl = default_ttl
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                self._misses += 1
                return None
            if time.time() > entry["expires"]:
                del self._cache[key]
                self._misses += 1
                return None
            self._cache.move_to_end(key)
            self._hits += 1
            return entry["value"]

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        with self._lock:
            ttl = ttl or self._default_ttl
            if key in self._cache:
                del self._cache[key]
            while len(self._cache) >= self._max_size:
                self._cache.popitem(last=False)
            self._cache[key] = {"value": value, "expires": time.time() + ttl, "created": time.time()}

    def delete(self, key: str) -> bool:
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def invalidate_table(self, table_name: str) -> int:
        with self._lock:
            keys_to_remove = [k for k in self._cache if table_name in k]
            for k in keys_to_remove:
                del self._cache[k]
            return len(keys_to_remove)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()
            self._hits = 0
            self._misses = 0

    @property
    def stats(self) -> Dict[str, Any]:
        with self._lock:
            total = self._hits + self._misses
            return {
                "type": "in-memory", "entries": len(self._cache),
                "max_entries": self._max_size, "hits": self._hits,
                "misses": self._misses,
                "hit_rate": round(self._hits / max(total, 1) * 100, 1),
                "ttl": self._default_ttl,
            }


class RedisCache:
    def __init__(self, url: str, default_ttl: int = CACHE_TTL):
        self._default_ttl = default_ttl
        self._client = None
        self._hits = 0
        self._misses = 0
        self._fallback = InMemoryCache()
        try:
            import redis
            self._client = redis.from_url(url, decode_responses=True)
            self._client.ping()
            logger.info(f"Redis connected: {url[:30]}...")
        except Exception as e:
            logger.warning(f"Redis unavailable ({e}), using in-memory cache.")
            self._client = None

    def _ok(self) -> bool:
        if self._client is None:
            return False
        try:
            self._client.ping()
            return True
        except Exception:
            return False

    def get(self, key: str) -> Optional[Any]:
        if not self._ok():
            return self._fallback.get(key)
        try:
            raw = self._client.get(f"matriq:{key}")
            if raw is None:
                self._misses += 1
                return None
            self._hits += 1
            return json.loads(raw)
        except Exception:
            return self._fallback.get(key)

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        ttl = ttl or self._default_ttl
        if not self._ok():
            self._fallback.set(key, value, ttl)
            return
        try:
            self._client.setex(f"matriq:{key}", ttl, json.dumps(value, default=str))
        except Exception:
            self._fallback.set(key, value, ttl)

    def delete(self, key: str) -> bool:
        if not self._ok():
            return self._fallback.delete(key)
        try:
            return bool(self._client.delete(f"matriq:{key}"))
        except Exception:
            return self._fallback.delete(key)

    def invalidate_table(self, table_name: str) -> int:
        if not self._ok():
            return self._fallback.invalidate_table(table_name)
        try:
            keys = self._client.keys(f"matriq:*{table_name}*")
            if keys:
                return self._client.delete(*keys)
            return 0
        except Exception:
            return self._fallback.invalidate_table(table_name)

    def clear(self) -> None:
        if self._ok():
            try:
                keys = self._client.keys("matriq:*")
                if keys:
                    self._client.delete(*keys)
            except Exception:
                pass
        self._fallback.clear()
        self._hits = 0
        self._misses = 0

    @property
    def stats(self) -> Dict[str, Any]:
        if self._ok():
            total = self._hits + self._misses
            return {
                "type": "redis", "hits": self._hits, "misses": self._misses,
                "hit_rate": round(self._hits / max(total, 1) * 100, 1), "ttl": self._default_ttl,
            }
        return self._fallback.stats


_cache_instance: Optional[Any] = None


def get_cache():
    global _cache_instance
    if _cache_instance is None:
        if REDIS_URL:
            _cache_instance = RedisCache(REDIS_URL, CACHE_TTL)
        else:
            _cache_instance = InMemoryCache(MAX_ENTRIES, CACHE_TTL)
            logger.info("Using in-memory cache (set REDIS_URL for Redis)")
    return _cache_instance


def make_cache_key(query: str, table_name: str = "") -> str:
    raw = f"{query.strip().lower()}|{table_name.strip().lower()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def cache_get(query: str, table_name: str = "") -> Optional[Any]:
    return get_cache().get(make_cache_key(query, table_name))


def cache_set(query: str, table_name: str, value: Any, ttl: Optional[int] = None) -> None:
    get_cache().set(make_cache_key(query, table_name), value, ttl)


def cache_invalidate_table(table_name: str) -> int:
    return get_cache().invalidate_table(table_name)


def cache_clear() -> None:
    get_cache().clear()


def get_cache_stats() -> Dict[str, Any]:
    return get_cache().stats