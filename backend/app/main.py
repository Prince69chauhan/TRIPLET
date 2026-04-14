"""
Triplet - FastAPI Application Entry Point
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, candidates, employers, jobs, applications, scores, documents, profile, messages
from app.core.config import settings
from app.core.rate_limit import limiter, RATE_LIMITING_ENABLED
from app.core.schema_bootstrap import ensure_messaging_schema
from app.core.websocket_manager import manager

# slowapi is optional — if the backend image hasn't been rebuilt with the
# new requirements.txt yet, we boot anyway and skip rate limiting.
try:
    from slowapi import _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware
except ImportError:
    _rate_limit_exceeded_handler = None
    RateLimitExceeded = None
    SlowAPIMiddleware = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting {settings.APP_NAME} - {settings.APP_ENV}")
    # Idempotent safety net: guarantees messaging tables exist even if
    # `alembic upgrade head` wasn't run. Executes once per process, not
    # per request.
    try:
        await ensure_messaging_schema()
    except Exception as exc:
        print(f"[startup] messaging schema bootstrap skipped: {exc}")
    yield
    print("Shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="AI-powered resume ranking platform",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# Rate limiting (Redis-backed, shared across workers). No-op if slowapi
# is not installed in the current environment.
if RATE_LIMITING_ENABLED and SlowAPIMiddleware is not None:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(candidates.router, prefix="/api/candidates", tags=["Candidates"])
app.include_router(employers.router, prefix="/api/employers", tags=["Employers"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])
app.include_router(applications.router, prefix="/api/applications", tags=["Applications"])
app.include_router(scores.router, prefix="/api/scores", tags=["Scores"])
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(profile.router, prefix="/api/profile", tags=["Profile"])
app.include_router(messages.router, prefix="/api/messages", tags=["Messages"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}

@app.websocket("/ws/jobs")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except Exception:
        manager.disconnect(websocket)
