"""
Triplet — FastAPI Dependencies
"""
from typing import AsyncGenerator
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import AsyncSessionLocal
from app.core.enums import UserRole
from app.models.models import User
from app.utils.auth import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_raw_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_raw_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if payload is None or payload.type != "access":
        raise credentials_exception

    result = await db.execute(
        select(User).where(User.id == UUID(payload.sub))
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )
    return user


async def require_candidate(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != UserRole.candidate:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Candidates only",
        )
    return current_user


async def require_employer(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != UserRole.employer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Employers only",
        )
    return current_user


async def get_rls_db(
    user: User = Depends(get_current_user),
) -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            async with session.begin():
                await session.execute(
                    text("SELECT set_config('app.current_user_id', :uid, true)"),
                    {"uid": str(user.id)},
                )
                await session.execute(
                    text("SELECT set_config('app.current_user_role', :role, true)"),
                    {"role": user.role.value},
                )
                yield session
        except Exception:
            await session.rollback()
            raise
