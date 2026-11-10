FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
COPY frontend/index.html frontend/index.html
COPY frontend/css frontend/css
COPY frontend/js frontend/js
COPY shared shared
ENV KYIVAIR_DB=/app/data/kyivair.db
WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
