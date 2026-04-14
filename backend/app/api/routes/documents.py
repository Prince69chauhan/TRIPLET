"""
Triplet — Candidate Documents Routes
POST   /api/documents/upload
GET    /api/documents
GET    /api/documents/{doc_id}/download
PATCH  /api/documents/{doc_id}/rename
DELETE /api/documents/{doc_id}
"""
import uuid
import io
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.dependencies.auth import require_candidate, get_rls_db
from app.models.models import User, CandidateProfile, CandidateDocument
from app.schemas.document import (
    DocumentBulkDeleteRequest,
    DocumentBulkDeleteResponse,
    DocumentUploadResponse,
    DocumentRenameRequest,
    DocumentListResponse,
)
from app.services.integrity.hasher import compute_sha256
from app.services.storage.minio import get_minio_client, get_signed_url
from app.core.config import settings

router = APIRouter()

ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/jpg",
}
MAX_SIZE    = 10 * 1024 * 1024  # 10MB for documents
DOC_BUCKET  = "documents"


async def _get_profile(user: User, db: AsyncSession) -> CandidateProfile:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Candidate profile not found")
    return profile


async def _get_document_for_candidate(
    doc_id: uuid.UUID,
    profile: CandidateProfile,
    db: AsyncSession,
) -> CandidateDocument:
    result = await db.execute(
        select(CandidateDocument).where(
            CandidateDocument.id == doc_id,
            CandidateDocument.candidate_id == profile.id,
        )
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")
    return document


def _ensure_bucket():
    client = get_minio_client()
    if not client.bucket_exists(DOC_BUCKET):
        client.make_bucket(DOC_BUCKET)


# ── Upload document ───────────────────────────────────────────
@router.post("/upload", response_model=DocumentUploadResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    # Validate type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, DOCX, JPG, and PNG files are allowed.",
        )

    file_bytes = await file.read()

    # Validate size
    if len(file_bytes) > MAX_SIZE:
        raise HTTPException(
            status_code=400,
            detail="File size must be under 10MB.",
        )

    profile = await _get_profile(current_user, db)

    # Compute hash for duplicate detection
    file_hash = compute_sha256(file_bytes)

    # Check duplicate — same hash for this candidate
    existing = await db.execute(
        select(CandidateDocument).where(
            CandidateDocument.candidate_id == profile.id,
            CandidateDocument.file_hash    == file_hash,
        )
    )
    duplicate = existing.scalar_one_or_none()
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail=f"Document already uploaded as '{duplicate.display_name}'.",
        )

    # Upload to MinIO
    _ensure_bucket()
    client    = get_minio_client()
    ext        = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "pdf"
    object_key = f"{profile.id}/{uuid.uuid4()}.{ext}"

    client.put_object(
        bucket_name  = DOC_BUCKET,
        object_name  = object_key,
        data         = io.BytesIO(file_bytes),
        length       = len(file_bytes),
        content_type = file.content_type,
    )

    # Save to DB
    doc = CandidateDocument(
        candidate_id    = profile.id,
        bucket_name     = DOC_BUCKET,
        object_key      = object_key,
        original_name   = file.filename,
        display_name    = file.filename,
        file_size_bytes = len(file_bytes),
        mime_type       = file.content_type,
        file_hash       = file_hash,
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)
    await db.commit()

    download_url = get_signed_url_for_doc(object_key)

    return DocumentUploadResponse(
        id              = doc.id,
        original_name   = doc.original_name,
        display_name    = doc.display_name,
        file_size_bytes = doc.file_size_bytes,
        mime_type       = doc.mime_type,
        created_at      = doc.created_at,
        download_url    = download_url,
    )


# ── List documents ────────────────────────────────────────────
@router.get("", response_model=DocumentListResponse)
async def list_documents(
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    profile = await _get_profile(current_user, db)

    result = await db.execute(
        select(CandidateDocument)
        .where(CandidateDocument.candidate_id == profile.id)
        .order_by(CandidateDocument.created_at.desc())
    )
    docs = result.scalars().all()

    return DocumentListResponse(
        total=len(docs),
        documents=[
            DocumentUploadResponse(
                id              = d.id,
                original_name   = d.original_name,
                display_name    = d.display_name,
                file_size_bytes = d.file_size_bytes,
                mime_type       = d.mime_type,
                created_at      = d.created_at,
                download_url    = get_signed_url_for_doc(d.object_key),
            )
            for d in docs
        ],
    )


# ── Download document ─────────────────────────────────────────
@router.get("/{doc_id}/download")
async def download_document(
    doc_id: uuid.UUID,
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    profile = await _get_profile(current_user, db)
    document = await _get_document_for_candidate(doc_id, profile, db)

    try:
        client = get_minio_client()
        response = client.get_object(document.bucket_name, document.object_key)
        file_bytes = response.read()
        response.close()
        response.release_conn()
    except Exception:
        raise HTTPException(status_code=404, detail="Could not download this document right now.")

    filename = (document.display_name or document.original_name or "document").strip() or "document"
    encoded_filename = quote(filename)

    return Response(
        content=file_bytes,
        media_type=document.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
            "Content-Length": str(len(file_bytes)),
            "Cache-Control": "no-store",
        },
    )


# ── Rename document ───────────────────────────────────────────
@router.patch("/{doc_id}/rename")
async def rename_document(
    doc_id: uuid.UUID,
    payload: DocumentRenameRequest,
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    if not payload.display_name.strip():
        raise HTTPException(status_code=400, detail="Name cannot be empty.")

    profile = await _get_profile(current_user, db)
    doc = await _get_document_for_candidate(doc_id, profile, db)

    new_name = payload.display_name.strip()
    duplicate_result = await db.execute(
        select(CandidateDocument).where(
            CandidateDocument.candidate_id == profile.id,
            CandidateDocument.id != doc_id,
            func.lower(CandidateDocument.display_name) == new_name.lower(),
        )
    )
    duplicate = duplicate_result.scalar_one_or_none()
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail=f"A document named '{duplicate.display_name}' already exists.",
        )

    doc.display_name = new_name
    doc.updated_at   = datetime.utcnow()
    await db.commit()

    return {"message": "Document renamed successfully.", "display_name": doc.display_name}


@router.post("/bulk-delete", response_model=DocumentBulkDeleteResponse)
async def bulk_delete_documents(
    payload: DocumentBulkDeleteRequest,
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    if not payload.doc_ids:
        raise HTTPException(status_code=400, detail="Select at least one document to delete.")

    profile = await _get_profile(current_user, db)

    result = await db.execute(
        select(CandidateDocument).where(
            CandidateDocument.candidate_id == profile.id,
            CandidateDocument.id.in_(payload.doc_ids),
        )
    )
    docs = result.scalars().all()
    if not docs:
        raise HTTPException(status_code=404, detail="No matching documents found.")

    client = None
    try:
        client = get_minio_client()
    except Exception:
        client = None

    for doc in docs:
        if client is not None:
            try:
                client.remove_object(doc.bucket_name, doc.object_key)
            except Exception:
                pass
        await db.delete(doc)

    await db.commit()
    return {
        "message": "Documents deleted successfully.",
        "deleted_count": len(docs),
    }


# ── Delete document ───────────────────────────────────────────
@router.delete("/{doc_id}", status_code=204)
async def delete_document(
    doc_id: uuid.UUID,
    current_user: User = Depends(require_candidate),
    db: AsyncSession = Depends(get_rls_db),
):
    profile = await _get_profile(current_user, db)
    doc = await _get_document_for_candidate(doc_id, profile, db)

    # Delete from MinIO
    try:
        client = get_minio_client()
        client.remove_object(doc.bucket_name, doc.object_key)
    except Exception:
        pass  # Don't block DB deletion if MinIO fails

    await db.delete(doc)
    await db.commit()


# ── Helper ────────────────────────────────────────────────────
def get_signed_url_for_doc(object_key: str) -> str:
    try:
        from minio import Minio
        from datetime import timedelta
        client = get_minio_client()
        return client.presigned_get_object(
            bucket_name = DOC_BUCKET,
            object_name = object_key,
            expires     = timedelta(hours=1),
        )
    except Exception:
        return ""
