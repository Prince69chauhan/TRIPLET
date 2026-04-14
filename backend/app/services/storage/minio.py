"""
Triplet — MinIO Storage Service
Upload resume, generate signed download URL, delete object
"""
import uuid
from datetime import timedelta
from typing import Optional

from minio import Minio
from minio.error import S3Error

from app.core.config import settings


def get_minio_client() -> Minio:
    return Minio(
        endpoint   = settings.MINIO_ENDPOINT,
        access_key = settings.MINIO_ROOT_USER,
        secret_key = settings.MINIO_ROOT_PASSWORD,
        secure     = settings.MINIO_SECURE,
    )


def upload_resume(
    file_bytes : bytes,
    file_name  : str,
    candidate_id: str,
    mime_type  : str,
) -> str:
    """
    Uploads resume bytes to MinIO.
    Returns the object_key (path inside bucket).
    """
    client = get_minio_client()
    bucket = settings.MINIO_BUCKET

    # Ensure bucket exists
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)

    # Unique object key
    ext        = file_name.rsplit(".", 1)[-1] if "." in file_name else "pdf"
    object_key = f"{candidate_id}/{uuid.uuid4()}.{ext}"

    import io
    client.put_object(
        bucket_name  = bucket,
        object_name  = object_key,
        data         = io.BytesIO(file_bytes),
        length       = len(file_bytes),
        content_type = mime_type,
    )

    return object_key


def get_signed_url(object_key: str, expires_hours: int = 1) -> Optional[str]:
    """
    Generates a pre-signed download URL valid for `expires_hours`.
    """
    try:
        client = get_minio_client()
        url = client.presigned_get_object(
            bucket_name = settings.MINIO_BUCKET,
            object_name = object_key,
            expires     = timedelta(hours=expires_hours),
        )
        return url
    except S3Error:
        return None


def delete_resume(object_key: str) -> bool:
    """
    Deletes a resume object from MinIO.
    Returns True on success, False on failure.
    """
    try:
        client = get_minio_client()
        client.remove_object(settings.MINIO_BUCKET, object_key)
        return True
    except S3Error:
        return False


def get_resume_bytes(object_key: str) -> Optional[bytes]:
    """
    Downloads resume bytes from MinIO.
    Used by integrity verifier to recompute hash.
    """
    try:
        client = get_minio_client()
        response = client.get_object(settings.MINIO_BUCKET, object_key)
        return response.read()
    except S3Error:
        return None