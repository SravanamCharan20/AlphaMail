FROM node:20-bookworm-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PIP_NO_CACHE_DIR=1
ENV PATH="/opt/venv/bin:${PATH}"

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ca-certificates \
  && python3 -m venv /opt/venv \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY workers/requirements-embeddings.txt ./workers/requirements-embeddings.txt
RUN pip install --no-compile --retries 10 --timeout 120 -r workers/requirements-embeddings.txt \
  && find /opt/venv -type d -name "__pycache__" -prune -exec rm -rf {} +

COPY . .

EXPOSE 9000

CMD ["npm", "run", "start"]
