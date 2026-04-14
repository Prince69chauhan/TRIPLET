"""
Triplet - OTP Service
Generates, stores, and verifies OTPs and password reset tokens using Redis.
"""
import hashlib
import hmac
import secrets
from typing import Optional

import redis

from app.core.config import settings

_redis_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )
    return _redis_client


OTP_EXPIRY_SECONDS = 240
OTP_PREFIX = "otp:"
RESET_PREFIX = "reset:"
RESET_EXPIRY = 3600


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def generate_otp() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(6))


def store_otp(email: str, otp: str) -> None:
    r = get_redis()
    r.setex(f"{OTP_PREFIX}{email}", OTP_EXPIRY_SECONDS, _hash_secret(otp))


def verify_otp(email: str, otp: str) -> bool:
    r = get_redis()
    stored = r.get(f"{OTP_PREFIX}{email}")
    candidate = _hash_secret(otp)
    if stored and hmac.compare_digest(stored, candidate):
        r.delete(f"{OTP_PREFIX}{email}")
        return True
    return False


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


def store_reset_token(email: str, token: str) -> None:
    r = get_redis()
    r.setex(f"{RESET_PREFIX}{token}", RESET_EXPIRY, email)


def verify_reset_token(token: str) -> Optional[str]:
    r = get_redis()
    return r.get(f"{RESET_PREFIX}{token}")


def delete_reset_token(token: str) -> None:
    r = get_redis()
    r.delete(f"{RESET_PREFIX}{token}")


def get_otp_ttl(email: str) -> int:
    r = get_redis()
    ttl = r.ttl(f"{OTP_PREFIX}{email}")
    return max(0, ttl)
