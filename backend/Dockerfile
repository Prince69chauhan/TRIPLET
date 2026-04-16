# ============================================================
#  Triplet Backend — Dockerfile (multi-stage)
#  Stage 1 (builder): compile deps with gcc/libpq-dev
#  Stage 2 (runtime): lean image — only tesseract stays
# ============================================================

# ── Stage 1: build dependencies ──────────────────────────────
FROM python:3.11-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Use a venv so we can copy it cleanly into the runtime stage
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy model into the venv
RUN python -m spacy download en_core_web_sm


# ── Stage 2: runtime image ───────────────────────────────────
FROM python:3.11-slim AS runtime

# Only runtime system dep: tesseract for OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Copy the pre-built venv from builder (no gcc / libpq-dev in this layer)
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Create keys directory for RSA keys
RUN mkdir -p /app/keys

# Copy app source last to maximise layer cache reuse
COPY . .

EXPOSE 8000

# Default command (overridden by docker-compose per service)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
