FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    COMMENT_HOST=0.0.0.0 \
    COMMENT_PORT=8766 \
    COMMENT_DATA_DIR=/var/lib/comment-studio

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system studio \
    && useradd --system --gid studio --home-dir /home/studio --create-home studio \
    && install -d -o studio -g studio /var/lib/comment-studio

WORKDIR /app
COPY requirements-oss.txt ./
RUN pip install --no-cache-dir -r requirements-oss.txt
COPY *.py ./
COPY resources/ ./resources/
COPY web/ ./web/
COPY deploy/ ./deploy/

USER studio
EXPOSE 8766
CMD ["python", "server.py"]
