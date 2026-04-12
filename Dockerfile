# ---- Stage 1: フロントエンドビルド ----
FROM node:22-slim AS frontend

WORKDIR /build

# pnpm を有効化
RUN corepack enable pnpm

# 依存関係のインストール（キャッシュレイヤー活用）
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ソースをコピーしてビルド
COPY index.html tsconfig.json vite.config.mts ./
COPY src/ ./src/

# ビルド時に必要な環境変数
ARG DOMAIN
ARG VITE_DISCORD_CLIENT_ID
ARG VITE_APP_NAME
ENV DOMAIN=$DOMAIN
ENV VITE_DISCORD_CLIENT_ID=$VITE_DISCORD_CLIENT_ID
ENV VITE_APP_NAME=$VITE_APP_NAME

RUN pnpm build


# ---- Stage 2: Python バックエンド ----
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS app

WORKDIR /app

# 依存関係のインストール（キャッシュレイヤー活用）
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# アプリコードをコピー
COPY api/ ./api/
COPY main.py ./

# フロントエンドのビルド成果物をコピー
COPY --from=frontend /build/dist ./dist

CMD ["uv", "run", "main.py"]
