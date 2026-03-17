# backend/services/gemini_service.py
"""
Gemini AI service with:
- Multiple API key support (round-robin + failover)
- Set keys in .env: GEMINI_API_KEY=key1,key2,key3
- Automatic key rotation on rate limit / failure
- Key cooldown after failure (60 seconds)
- Health tracking per key
"""
import json
import re
import time
import threading
from typing import List, Optional, Dict, Any

import google.generativeai as genai

from config import settings
from services.logger import logger


# ═══════════════════════════════════════════════════════════════
# API KEY MANAGER
# ═══════════════════════════════════════════════════════════════

class APIKeyManager:
    """
    Manages multiple Gemini API keys with:
    - Round-robin rotation for even distribution
    - Automatic failover when a key hits rate limit
    - Cooldown period for failed keys
    - Thread-safe operation
    """

    def __init__(self, raw_keys: str, cooldown_seconds: int = 60):
        self._lock = threading.Lock()
        self._keys: List[str] = []
        self._current_index: int = 0
        self._key_status: Dict[str, Dict[str, Any]] = {}
        self._cooldown_seconds = cooldown_seconds

        # Parse comma-separated keys
        if not raw_keys:
            raise ValueError(
                "No API keys found. Set GEMINI_API_KEY in .env\n"
                "Single key:   GEMINI_API_KEY=your_key\n"
                "Multiple keys: GEMINI_API_KEY=key1,key2,key3"
            )

        keys = [k.strip() for k in raw_keys.split(",") if k.strip()]
        if not keys:
            raise ValueError("No valid API keys found in GEMINI_API_KEY")

        self._keys = keys

        # Initialize status tracking for each key
        for key in self._keys:
            masked = key[:8] + "…" + key[-4:] if len(key) > 12 else "***"
            self._key_status[key] = {
                "masked": masked,
                "total_requests": 0,
                "total_failures": 0,
                "consecutive_failures": 0,
                "last_failure_time": 0.0,
                "last_failure_reason": "",
                "is_cooling_down": False,
                "cooldown_until": 0.0,
            }

        logger.info(f"Loaded {len(self._keys)} Gemini API key(s)")
        for key in self._keys:
            logger.info(f"  • {self._key_status[key]['masked']}")

    def _is_key_available(self, key: str) -> bool:
        """Check if key is not in cooldown."""
        status = self._key_status[key]
        now = time.time()
        if status["cooldown_until"] > now:
            return False
        # Cooldown expired — reset
        if status["is_cooling_down"]:
            status["is_cooling_down"] = False
            status["consecutive_failures"] = 0
        return True

    def get_next_key(self) -> Optional[str]:
        """
        Get next available key using round-robin.
        Skips keys in cooldown.
        If ALL keys are cooling down, waits for the soonest one.
        """
        with self._lock:
            total = len(self._keys)

            # Try each key starting from current index
            for i in range(total):
                idx = (self._current_index + i) % total
                key = self._keys[idx]
                if self._is_key_available(key):
                    self._current_index = (idx + 1) % total
                    self._key_status[key]["total_requests"] += 1
                    return key

            # All keys cooling down — wait for soonest
            soonest_key = None
            soonest_time = float("inf")
            for key in self._keys:
                until = self._key_status[key]["cooldown_until"]
                if until < soonest_time:
                    soonest_time = until
                    soonest_key = key

            if soonest_key:
                wait = max(0, soonest_time - time.time())
                if 0 < wait < 120:
                    masked = self._key_status[soonest_key]["masked"]
                    logger.warning(
                        f"All keys cooling down. "
                        f"Waiting {wait:.0f}s for {masked}…"
                    )
                    time.sleep(wait + 0.5)

                # Reset and return
                self._key_status[soonest_key]["is_cooling_down"] = False
                self._key_status[soonest_key]["consecutive_failures"] = 0
                self._key_status[soonest_key]["total_requests"] += 1
                return soonest_key

            return None

    def get_all_available(self) -> List[str]:
        """Get all keys not in cooldown, in round-robin order."""
        with self._lock:
            available = []
            total = len(self._keys)
            for i in range(total):
                idx = (self._current_index + i) % total
                key = self._keys[idx]
                if self._is_key_available(key):
                    available.append(key)
            return available

    def report_success(self, key: str):
        """Mark key as healthy — reset consecutive failures."""
        with self._lock:
            if key in self._key_status:
                self._key_status[key]["consecutive_failures"] = 0
                self._key_status[key]["is_cooling_down"] = False

    def report_failure(self, key: str, reason: str = ""):
        """
        Mark key as failed.
        Rate limit errors → immediate cooldown.
        Other errors → cooldown after 2 consecutive failures.
        """
        with self._lock:
            if key not in self._key_status:
                return

            status = self._key_status[key]
            status["total_failures"] += 1
            status["consecutive_failures"] += 1
            status["last_failure_time"] = time.time()
            status["last_failure_reason"] = reason[:200]

            reason_lower = reason.lower()
            is_rate_limit = any(
                s in reason_lower
                for s in [
                    "429", "quota", "rate", "resource exhausted",
                    "too many requests", "limit exceeded",
                ]
            )

            # Decide cooldown
            should_cooldown = is_rate_limit or status["consecutive_failures"] >= 2

            if should_cooldown:
                if is_rate_limit:
                    cooldown = self._cooldown_seconds * status["consecutive_failures"]
                else:
                    cooldown = self._cooldown_seconds

                cooldown = min(cooldown, 300)  # Max 5 minutes
                status["is_cooling_down"] = True
                status["cooldown_until"] = time.time() + cooldown

                logger.warning(
                    f"Key {status['masked']} → cooldown {cooldown}s "
                    f"(failures: {status['consecutive_failures']}, "
                    f"reason: {reason[:80]})"
                )

    @property
    def total_keys(self) -> int:
        return len(self._keys)

    @property
    def available_count(self) -> int:
        with self._lock:
            return sum(1 for k in self._keys if self._is_key_available(k))

    @property
    def stats(self) -> Dict[str, Any]:
        """Status of all keys for health/monitoring."""
        with self._lock:
            keys_info = []
            for key in self._keys:
                s = self._key_status[key]
                keys_info.append({
                    "key": s["masked"],
                    "requests": s["total_requests"],
                    "failures": s["total_failures"],
                    "consecutive_failures": s["consecutive_failures"],
                    "cooling_down": s["is_cooling_down"],
                    "cooldown_remaining": max(
                        0, round(s["cooldown_until"] - time.time(), 1)
                    ),
                    "last_failure": (
                        s["last_failure_reason"][:50]
                        if s["last_failure_reason"]
                        else ""
                    ),
                })
            return {
                "total_keys": len(self._keys),
                "available_keys": sum(
                    1 for k in self._keys if self._is_key_available(k)
                ),
                "keys": keys_info,
            }


# ═══════════════════════════════════════════════════════════════
# GLOBAL KEY MANAGER SINGLETON
# ═══════════════════════════════════════════════════════════════

_key_manager: Optional[APIKeyManager] = None


def _get_key_manager() -> APIKeyManager:
    global _key_manager
    if _key_manager is None:
        cooldown = int(getattr(settings, "KEY_COOLDOWN_SECONDS", 60))
        _key_manager = APIKeyManager(
            raw_keys=settings.GEMINI_API_KEY,
            cooldown_seconds=cooldown,
        )
    return _key_manager


# ═══════════════════════════════════════════════════════════════
# JSON EXTRACTION (your existing code, unchanged)
# ═══════════════════════════════════════════════════════════════

def extract_json(text: str) -> dict:
    text = text.strip()

    if text.startswith("{"):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    start = text.find("{")
    end = text.rfind("}") + 1
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass

    raise ValueError(
        f"Could not extract JSON from Gemini response:\n{text[:300]}"
    )


# ═══════════════════════════════════════════════════════════════
# QUERY GEMINI — WITH MULTI-KEY ROTATION
# ═══════════════════════════════════════════════════════════════

def query_gemini(prompt: str, max_retries: int = 3) -> dict:
    """
    Send prompt to Gemini with automatic key rotation.

    With 1 key:  works exactly like before — retries on failure
    With 3 keys: round-robin, auto-failover on rate limit

    Flow:
    1. Get next available key (round-robin)
    2. Try the request
    3. On success → mark key healthy, return result
    4. On rate limit → mark key failed, try NEXT key immediately
    5. On other error → brief pause, try next key
    6. If all keys fail in one round → wait, retry all
    7. If all retries exhausted → raise last error
    """
    if not settings.GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured. Set it in backend/.env"
        )

    km = _get_key_manager()
    last_error: Optional[Exception] = None
    total_attempts = 0
    max_total = max_retries * km.total_keys

    for retry_round in range(max_retries):
        # Get all available keys for this round
        available = km.get_all_available()

        if not available:
            # All cooling down — get_next_key will wait for soonest
            key = km.get_next_key()
            if key:
                available = [key]
            else:
                raise ValueError(
                    "All API keys exhausted. Please try again in a minute."
                )

        for key in available:
            total_attempts += 1
            if total_attempts > max_total:
                break

            masked = km._key_status[key]["masked"]

            try:
                # Configure genai with THIS key
                genai.configure(api_key=key)

                model = genai.GenerativeModel(
                    settings.GEMINI_MODEL,
                    generation_config={
                        "temperature": 0.1,
                        "max_output_tokens": 4096,
                    },
                )

                response = model.generate_content(prompt)

                if not response.text:
                    raise ValueError("Gemini returned empty response")

                result = extract_json(response.text)

                # Success — mark key healthy
                km.report_success(key)
                return result

            except Exception as e:
                last_error = e
                error_msg = str(e).lower()

                is_rate_limit = any(
                    s in error_msg
                    for s in [
                        "429", "quota", "rate", "resource exhausted",
                        "too many requests",
                    ]
                )

                is_auth_error = any(
                    s in error_msg
                    for s in [
                        "401", "403", "invalid", "api key not valid",
                        "permission", "unauthorized",
                    ]
                )

                if is_rate_limit:
                    logger.warning(
                        f"Key {masked} rate limited — rotating to next key"
                    )
                    km.report_failure(key, str(e))
                    # Try next key immediately — no sleep
                    continue

                elif is_auth_error:
                    logger.error(
                        f"Key {masked} auth error — disabling: {str(e)[:100]}"
                    )
                    km.report_failure(key, str(e))
                    continue

                else:
                    logger.warning(
                        f"Key {masked} error (attempt {total_attempts}): "
                        f"{str(e)[:100]}"
                    )
                    km.report_failure(key, str(e))
                    time.sleep(1)
                    continue

        # All keys failed this round — pause before next round
        if retry_round < max_retries - 1:
            wait = 3 * (retry_round + 1)
            logger.warning(
                f"All keys failed round {retry_round + 1}. "
                f"Retrying in {wait}s…"
            )
            time.sleep(wait)

    # All retries exhausted
    if last_error:
        raise last_error
    raise ValueError("All API keys failed. Please try again later.")


# ═══════════════════════════════════════════════════════════════
# HEALTH / STATS
# ═══════════════════════════════════════════════════════════════

def get_key_stats() -> Dict[str, Any]:
    """Get API key health stats for monitoring/health endpoint."""
    try:
        km = _get_key_manager()
        return km.stats
    except Exception as e:
        return {"error": str(e)}