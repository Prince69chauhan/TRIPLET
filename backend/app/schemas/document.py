"""
Triplet — Candidate Document Schemas
"""
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class DocumentUploadResponse(BaseModel):
    id              : UUID
    original_name   : str
    display_name    : str
    file_size_bytes : Optional[int]
    mime_type       : Optional[str]
    created_at      : datetime
    download_url    : Optional[str] = None

    class Config:
        from_attributes = True


class DocumentRenameRequest(BaseModel):
    display_name: str


class DocumentBulkDeleteRequest(BaseModel):
    doc_ids: list[UUID]


class DocumentBulkDeleteResponse(BaseModel):
    message: str
    deleted_count: int


class DocumentListResponse(BaseModel):
    total     : int
    documents : list[DocumentUploadResponse]
