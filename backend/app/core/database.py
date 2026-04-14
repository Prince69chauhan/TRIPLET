"""
Triplet — Database Engine + Session
Async SQLAlchemy with per-request RLS context
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

from app.core.config import settings


# ── Engine ────────────────────────────────────────────────────
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


# ── RLS session — sets user context before every query ────────
async def get_db(user_id: str = None, user_role: str = None):
    """
    Dependency that yields an async DB session.
    Sets RLS session variables so PostgreSQL policies fire correctly.
    Usage:
        db = Depends(get_db_for_user)
    """
    async with AsyncSessionLocal() as session:
        if user_id and user_role:
            await session.execute(
                text("SELECT set_config('app.current_user_id', :uid, true)"),
                {"uid": str(user_id)},
            )
            await session.execute(
                text("SELECT set_config('app.current_user_role', :role, true)"),
                {"role": user_role},
            )
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
