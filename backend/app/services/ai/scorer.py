"""
Triplet — SBERT Scorer
Computes cosine similarity between JD and resume embeddings.
Base score M = cosine_sim * 100 (0-100 scale)
"""
from typing import List, Optional
import numpy as np
from sentence_transformers import SentenceTransformer

from app.core.config import settings

# Load model once at module level (heavy operation)
_model: Optional[SentenceTransformer] = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(settings.SBERT_MODEL)
    return _model


def embed_text(text: str) -> List[float]:
    """
    Generates a 384-dim SBERT embedding for the given text.
    Returns as a plain Python list (for JSON/DB storage).
    """
    model = get_model()
    embedding = model.encode(text, normalize_embeddings=True)
    return embedding.tolist()


def compute_cosine_similarity(
    embedding_a: List[float],
    embedding_b: List[float],
) -> float:
    """
    Computes cosine similarity between two embeddings.
    Both must be normalized (norm=1) — SBERT normalize_embeddings=True
    handles this, so this reduces to a dot product.
    Returns value between 0 and 1.
    """
    a = np.array(embedding_a)
    b = np.array(embedding_b)
    return float(np.dot(a, b))


def compute_base_score(
    jd_embedding      : List[float],
    resume_embedding  : List[float],
) -> float:
    """
    Converts cosine similarity to a 0-100 score.
    cosine_sim is already 0-1 (normalized embeddings).
    We scale it to 0-100 and clamp.
    """
    sim = compute_cosine_similarity(jd_embedding, resume_embedding)

    # Shift from [-1,1] range to [0,100]
    # In practice with normalized positive text embeddings,
    # sim is usually 0.1–0.9
    # We rescale: 0.0 sim → 0, 1.0 sim → 100
    score = sim * 100
    return round(max(0.0, min(100.0, score)), 2)


def build_jd_text(jd) -> str:
    """
    Builds a single text string from JD fields for embedding.
    Combines title, description, and required skills.
    """
    parts = []
    if jd.title:
        parts.append(jd.title)
    if jd.description:
        parts.append(jd.description)
    if jd.required_skills:
        parts.append("Required skills: " + ", ".join(jd.required_skills))
    return " ".join(parts)