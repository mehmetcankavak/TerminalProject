# Stage 1: Frontend build
FROM node:20-alpine AS frontend
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install --legacy-peer-deps --silent
COPY web/src/ ./src/
COPY web/public/ ./public/
COPY web/index.html web/vite.config.js ./
ARG VITE_API_URL=
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

# Stage 2: Python runtime
FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc libssl-dev && rm -rf /var/lib/apt/lists/*

# Install core web server deps first (separate layer, always cached correctly)
RUN pip install --no-cache-dir \
    "uvicorn>=0.30" \
    "fastapi>=0.111" \
    "asyncpg>=0.29" \
    "redis>=5.0" \
    "pydantic>=2.5" \
    "pydantic-settings>=2.1" \
    "structlog>=24.0" \
    "slowapi>=0.1.9" \
    "passlib[bcrypt]>=1.7" \
    "bcrypt>=3.0,<4.0" \
    "python-jose[cryptography]>=3.3" \
    "python-multipart>=0.0.9" \
    "python-dotenv>=1.0" \
    "httpx[http2]>=0.27" \
    "websockets>=12.0" \
    "aiosqlite>=0.20" \
    "uvloop>=0.19"

COPY pyproject.toml ./
COPY src/ ./src/
COPY config/ ./config/
RUN pip install --no-cache-dir --no-deps .

COPY --from=frontend /app/web-dist ./web-dist

RUN mkdir -p data logs

EXPOSE 8000

CMD ["python", "-u", "-m", "cryptoterminal.web.runner"]
