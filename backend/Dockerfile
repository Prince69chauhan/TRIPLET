# ============================================================
#  Triplet Backend — Dockerfile
#  Base: Python 3.11 slim
# ============================================================

FROM python:3.11-slim

# System dependencies (tesseract for OCR, libpq for psycopg2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libpq-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy English model
RUN python -m spacy download en_core_web_sm

# Copy app source
COPY . .

# Create keys directory for RSA keys
RUN mkdir -p /app/keys

EXPOSE 8000

# Default command (overridden by docker-compose per service)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
