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

RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY src/ ./src/
COPY config/ ./config/
RUN pip install --no-cache-dir -e .

COPY --from=frontend /app/web-dist ./web-dist

RUN mkdir -p data logs

EXPOSE 8000

# Use $PORT when the platform assigns one (Railway/Heroku); fall back to 8000.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python3 -c "import os,urllib.request; urllib.request.urlopen('http://localhost:%s/' % os.environ.get('PORT','8000'))" || exit 1

CMD ["python", "-m", "cryptoterminal.web.runner"]
