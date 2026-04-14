"""
Triplet — Redis-backed rate limiting
Uses slowapi (FastAPI-native) with Redis storage so limits are
shared across all workers and survive restarts.

Usage in a route:
    from app.core.rate_limit import limiter

    @router.post("/something")
    @limiter.limit("30/minute")
    async def handler(request: Request, ...):
        ...

The decorated handler MUST accept `request: Request` as a parameter.

Safe fallback: if slowapi is not installed in the running env (e.g. the
Docker image hasn't been rebuilt after the requirements.txt bump), this
module exports a no-op limiter so the app still boots. Rate limiting is
simply disabled until the dependency is available.
"""
import logging

logger = logging.getLogger(__name__)

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    from starlette.requests import Request

    from app.core.config import settings

    def _rate_key(request: "Request") -> str:
        user = getattr(request.state, "user", None)
        if user is not None:
            uid = getattr(user, "id", None)
            if uid is not None:
                return f"user:{uid}"
        return get_remote_address(request)

    limiter = Limiter(
        key_func=_rate_key,
        storage_uri=settings.REDIS_URL,
        strategy="fixed-window",
        headers_enabled=True,
    )
    RATE_LIMITING_ENABLED = True

except ImportError:
    logger.warning(
        "slowapi not installed — rate limiting disabled. "
        "Run `pip install -r requirements.txt` (or rebuild the backend Docker image) to enable it."
    )

    class _NoopLimiter:
        """Drop-in stand-in for slowapi's Limiter when the package is missing."""

        def limit(self, *_args, **_kwargs):
            def decorator(func):
                return func
            return decorator

    limiter = _NoopLimiter()
    RATE_LIMITING_ENABLED = False
