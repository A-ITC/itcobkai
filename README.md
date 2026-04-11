# 概要
サークルのOB会を大人数で行うために作成したボイスチャットです。

2Dタイルベースのマップ上の位置（近接性）によって、ユーザー間のボイスチャットグループを自動的に決定します。

## アーキテクチャ

```
SolidJS フロントエンド ──HTTP/JWT──▶  FastAPI バックエンド (Python 3.12+)
                     ──WebRTC────▶  LiveKit サーバー (Docker)
```

## 構築手順

### 事前準備

- **Discord**: Developer Portal で新規アプリケーションを作成し、OAuth2 の Client ID と Client Secret を取得
- **Tiled**: Tiled でマップ (.tmx) を作成
- **独自ドメイン**: WebRTC に必要な TLS 化のために必要
- **Docker**: LiveKit サーバーの起動に必要

### 環境変数

プロジェクト直下に `.env` を作成してください。

```sh
# Discord OAuth2 関連
VITE_DISCORD_CLIENT_ID="[Discord の Client ID]"
DISCORD_CLIENT_SECRET="[Discord の Client Secret]"
DISCORD_ALLOWED_SERVERS="サーバ名1:サーバID1(数字18桁),サーバ名2:サーバID2,..."

# アプリケーション関連
SECRET_KEY="[ランダムな任意の文字列 (UUID推奨)]"
TOKEN_EXPIRATION=1800
DEV_PORT=41021
API_PORT=41022

# LiveKit関連
DOMAIN=your.domain.example
WS_PORT=7880
TCP_PORT=7881
UDP_PORT_RANGE_START=50000
UDP_PORT_RANGE_END=60000
UDP_PORT=3478
```

### デプロイ

```sh
# LiveKit サーバーを起動
docker compose up -d

# マップを処理
uv run tools/create_map.py /path/to/map.tmx

# バックエンドを起動
uv run main.py

# フロントエンドをビルド
pnpm install
pnpm build
```

### 開発
```sh
# フロントエンド開発サーバー（ホットリロード）
pnpm start
```

### nginxの設定(例)
```
server {
    listen 443 ssl;
    server_name your.domain.com;

    proxy_http_version 1.1;

    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location / {
        proxy_pass http://127.0.0.1:7880;
        proxy_read_timeout 86400;
    }
    location /dev {
        proxy_pass http://localhost:41021/dev;
    }
    location /api {
        proxy_pass http://localhost:41022/api;
    }
    location /dist {
        proxy_pass http://localhost:41022/dist;
    }

    ssl_certificate /etc/letsencrypt/live/your.domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your.domain.com/privkey.pem;
}
```

### マップの仕様

レイヤーの命名規則:

| 種別         | 命名例                   | 用途               |
| :----------- | :----------------------- | :----------------- |
| 前景レイヤー | `t_`、`top`、`上`        | キャラの前面に描画 |
| 背景レイヤー | `b_`、`bottom`、`下`     | キャラの背面に描画 |
| 黒レイヤー   | `黒`、`black`            | 移動不可エリア     |
| 赤レイヤー   | `赤`、`red`              | 音声グループの定義 |

# その他
マップの素材は[ドット絵世界](http://yms.main.jp)さんからお借りしています。