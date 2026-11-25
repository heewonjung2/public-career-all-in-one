# 공기업 올인원 — 단일 컨테이너(React 빌드 + FastAPI)
FROM node:22-slim AS web
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/app backend/app
COPY data/ data/
COPY --from=web /app/frontend/dist frontend/dist
ENV PORT=8000 PUBLIC_DEMO=1
# OPENAI_API_KEY 는 배포 플랫폼의 환경변수로만 설정(이미지에 포함하지 않음)
CMD ["sh", "-c", "uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT}"]
