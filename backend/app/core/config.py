"""
Triplet — Application Configuration
Reads from .env via pydantic-settings
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Triplet"
    APP_ENV: str = "development"
    DEBUG: bool = True
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # Database
    DATABASE_URL: str
    SYNC_DATABASE_URL: str

    # Redis
    REDIS_URL: str

    # MinIO
    MINIO_ENDPOINT: str
    MINIO_ROOT_USER: str
    MINIO_ROOT_PASSWORD: str
    MINIO_BUCKET: str = "resumes"
    MINIO_SECURE: bool = False

    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # RSA
    RSA_PRIVATE_KEY_PATH: str = "/app/keys/private_key.pem"
    RSA_PUBLIC_KEY_PATH: str = "/app/keys/public_key.pem"

    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str
    SMTP_PASSWORD: str
    EMAIL_FROM: str
    EMAIL_FROM_NAME: str = "Triplet"

    # SBERT
    SBERT_MODEL: str = "all-MiniLM-L6-v2"
    SBERT_MODEL_VERSION: str = "sbert-v1"

    # Celery
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str
    INTEGRITY_CHECK_INTERVAL_HOURS: int = 6

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
