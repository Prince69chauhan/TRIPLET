"""
Triplet - OTP Service
Generates, stores, and verifies OTPs and password reset tokens using Redis.

Security notes:
- OTPs and reset tokens are hashed at rest so a Redis dump cannot be used
  to impersonate users.
- Password-reset tokens are single-use. We delete them atomically on the
  first successful verification using GETDEL (Redis 6.2+) with a fallback
  to a Lua CAS for older servers.
- Reset tokens live for 15 minutes, long enough for a user to check
  email, short enough to limit the blast radius of a leaked link.
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
SIGNUP_OTP_EXPIRY_SECONDS = 240
CHANGE_PASSWORD_OTP_EXPIRY_SECONDS = 240
RESET_EXPIRY = 900

OTP_PREFIX = "otp:"
SIGNUP_OTP_PREFIX = "signup_otp:"
CHANGE_PASSWORD_OTP_PREFIX = "change_password_otp:"
RESET_PREFIX = "reset:"

_GETDEL_LUA = "local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]) end; return v"


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _getdel(r: redis.Redis, key: str) -> Optional[str]:
    try:
        return r.execute_command("GETDEL", key)
    except redis.ResponseError:
        return r.eval(_GETDEL_LUA, 1, key)


def generate_otp() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(6))


def store_otp(email: str, otp: str) -> None:
    r = get_redis()
    r.setex(f"{OTP_PREFIX}{email}", OTP_EXPIRY_SECONDS, _hash_secret(otp))


def verify_otp(email: str, otp: str) -> bool:
    r = get_redis()
    key = f"{OTP_PREFIX}{email}"
    stored = r.get(key)
    candidate = _hash_secret(otp)
    if stored and hmac.compare_digest(stored, candidate):
        r.delete(key)
        return True
    return False


def get_otp_ttl(email: str) -> int:
    r = get_redis()
    ttl = r.ttl(f"{OTP_PREFIX}{email}")
    return max(0, ttl)


def store_signup_otp(email: str, otp: str) -> None:
    r = get_redis()
    r.setex(
        f"{SIGNUP_OTP_PREFIX}{email}",
        SIGNUP_OTP_EXPIRY_SECONDS,
        _hash_secret(otp),
    )


def verify_signup_otp(email: str, otp: str) -> bool:
    r = get_redis()
    key = f"{SIGNUP_OTP_PREFIX}{email}"
    stored = r.get(key)
    candidate = _hash_secret(otp)
    if stored and hmac.compare_digest(stored, candidate):
        r.delete(key)
        return True
    return False


def get_signup_otp_ttl(email: str) -> int:
    r = get_redis()
    ttl = r.ttl(f"{SIGNUP_OTP_PREFIX}{email}")
    return max(0, ttl)


def store_change_password_otp(email: str, otp: str) -> None:
    r = get_redis()
    r.setex(
        f"{CHANGE_PASSWORD_OTP_PREFIX}{email}",
        CHANGE_PASSWORD_OTP_EXPIRY_SECONDS,
        _hash_secret(otp),
    )


def verify_change_password_otp(email: str, otp: str) -> bool:
    r = get_redis()
    key = f"{CHANGE_PASSWORD_OTP_PREFIX}{email}"
    stored = r.get(key)
    candidate = _hash_secret(otp)
    if stored and hmac.compare_digest(stored, candidate):
        r.delete(key)
        return True
    return False


def get_change_password_otp_ttl(email: str) -> int:
    r = get_redis()
    ttl = r.ttl(f"{CHANGE_PASSWORD_OTP_PREFIX}{email}")
    return max(0, ttl)


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


def store_reset_token(email: str, token: str) -> None:
    """Store the hash of the token, not the token itself."""
    r = get_redis()
    r.setex(
        f"{RESET_PREFIX}{_hash_secret(token)}",
        RESET_EXPIRY,
        email,
    )


def consume_reset_token(token: str) -> Optional[str]:
    """Atomically verify the token and invalidate it."""
    r = get_redis()
    return _getdel(r, f"{RESET_PREFIX}{_hash_secret(token)}")


def verify_reset_token(token: str) -> Optional[str]:
    r = get_redis()
    return r.get(f"{RESET_PREFIX}{_hash_secret(token)}")


def delete_reset_token(token: str) -> None:
    r = get_redis()
    r.delete(f"{RESET_PREFIX}{_hash_secret(token)}")
