#!/bin/bash
# ============================================================
#  Triplet — Generate RSA key pair for resume integrity signing
#  Run this ONCE before first docker-compose up
#  Keys go in backend/keys/ (gitignored)
# ============================================================

set -e

KEY_DIR="$(dirname "$0")/../backend/keys"
mkdir -p "$KEY_DIR"

echo "Generating RSA 2048-bit key pair..."

# Generate private key
openssl genrsa -out "$KEY_DIR/private_key.pem" 2048

# Extract public key
openssl rsa -in "$KEY_DIR/private_key.pem" -pubout -out "$KEY_DIR/public_key.pem"

# Restrict permissions
chmod 600 "$KEY_DIR/private_key.pem"
chmod 644 "$KEY_DIR/public_key.pem"

echo "Keys generated:"
echo "  Private: $KEY_DIR/private_key.pem"
echo "  Public : $KEY_DIR/public_key.pem"
echo ""
echo "IMPORTANT: Never commit these keys to git."
echo "Back them up securely."
