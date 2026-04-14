"""
Triplet — Integrity Service
SHA-256 hashing + RSA signing/verification of resume files
"""
import hashlib
import base64
from typing import Tuple

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend

from app.core.config import settings


def compute_sha256(file_bytes: bytes) -> str:
    """Returns hex SHA-256 hash of file bytes."""
    return hashlib.sha256(file_bytes).hexdigest()


def _load_private_key():
    with open(settings.RSA_PRIVATE_KEY_PATH, "rb") as f:
        return serialization.load_pem_private_key(
            f.read(),
            password=None,
            backend=default_backend(),
        )


def _load_public_key():
    with open(settings.RSA_PUBLIC_KEY_PATH, "rb") as f:
        return serialization.load_pem_public_key(
            f.read(),
            backend=default_backend(),
        )


def sign_hash(sha256_hash: str) -> str:
    """
    Signs the SHA-256 hash with RSA private key.
    Returns base64-encoded signature string.
    """
    private_key = _load_private_key()
    signature = private_key.sign(
        sha256_hash.encode(),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode()


def verify_signature(sha256_hash: str, rsa_signature: str) -> bool:
    """
    Verifies RSA signature against the hash.
    Returns True if valid, False if tampered.
    """
    try:
        public_key = _load_public_key()
        public_key.verify(
            base64.b64decode(rsa_signature),
            sha256_hash.encode(),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except Exception:
        return False


def hash_and_sign(file_bytes: bytes) -> Tuple[str, str]:
    """
    Computes SHA-256 hash and RSA signature in one call.
    Returns (sha256_hash, rsa_signature).
    Used at resume upload time.
    """
    sha256_hash = compute_sha256(file_bytes)
    rsa_signature = sign_hash(sha256_hash)
    return sha256_hash, rsa_signature


def verify_file_integrity(
    file_bytes    : bytes,
    stored_hash   : str,
    rsa_signature : str,
) -> Tuple[bool, str, str]:
    """
    Full integrity check:
    1. Recompute hash from current file bytes
    2. Compare with stored hash
    3. Verify RSA signature

    Returns (is_ok, stored_hash, computed_hash)
    """
    computed_hash = compute_sha256(file_bytes)
    hash_matches  = computed_hash == stored_hash
    sig_valid     = verify_signature(stored_hash, rsa_signature)
    is_ok         = hash_matches and sig_valid
    return is_ok, stored_hash, computed_hash