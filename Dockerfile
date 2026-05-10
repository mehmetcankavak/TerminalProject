# Stage 1: Frontend build
FROM node:20-alpine AS frontend
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci --silent
COPY web/src/ ./src/
COPY web/public/ ./public/
COPY web/index.html web/vite.config.js ./
ARG VITE_API_URL=https://cryptoterminal-production.up.railway.app
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

CMD ["python", "-m", "cryptoterminal.web.runner"]
