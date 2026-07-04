FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

# Install deps first for layer caching.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

COPY backend ./backend

ENV PATH="/app/.venv/bin:$PATH"

# 4 workers: keeps serving under bursts (~100 concurrent browsers). The DB
# pool in db.py is sized to match.
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
