# 概要
サークルのOB会を行うために作成したボイスチャットアプリ

## 構築手順

### 事前準備

- Developer Portal で新規アプリケーションを作成し、OAuth2 の Client ID と Client Secret を取得しておくこと
- WebRTCは TLS 化が必須のため独自ドメインを用意しておくこと
- nginx等でリバースプロキシの設定を済ませておくこと(後述)
```
// nginxの設定例
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

- 下記ポートを開放しておくこと

| 用途 | 変数 | デフォルト | プロトコル | 備考 |
| :--- | :--- | :--- | :--- | :--- |
| HTTPS / WSS | - | 443 | TCP | Livekitのシグナリングと本アプリのAPI |
| LiveKit RTC over TCP | `TCP_PORT` | 7881 | TCP | UDP が使えない環境向けフォールバック |
| TURN | `UDP_PORT` | 3478 | UDP | NAT 越え用 |
| WebRTC メディア | `UDP_PORT_RANGE_START`-`UDP_PORT_RANGE_END` | 50000-60000 | UDP | LiveKit が利用するメディアポート範囲 |

### 環境変数

プロジェクト直下に `.env` を作成してください。

```sh
# Discord OAuth2 関連
DISCORD_CLIENT_ID="[Discord の Client ID]"
DISCORD_CLIENT_SECRET="[Discord の Client Secret]"
DISCORD_ALLOWED_SERVERS="接続を許可するサーバID1(数字18桁),サーバID2,..."

# アプリケーション関連
SECRET_KEY="[ランダムな任意の文字列 (UUID推奨)]"
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
```

### 開発
```sh
# livekitサーバを起動
docker compose up -d livekit

# パッケージのインストール
pnpm install
uv sync

# APIサーバを起動
uv run main.py

# 開発サーバーを起動
pnpm start
```

### マップ
- Tiled形式のマップからマップ情報を抽出できます

```sh
uv run tools/create_map.py /path/to/map.tmx
```

- マップデータは以下に格納しています  
https://drive.google.com/drive/folders/1Gu6mpUerVU6U6J5HJUpVo9DYQb_lPtKN?usp=sharing

- レイヤーの命名規則

| 種別         | 命名例                   | 用途               |
| :----------- | :----------------------- | :----------------- |
| 前景レイヤー | `t_`、`top`、`上`        | キャラの前面に描画 |
| 背景レイヤー | `b_`、`bottom`、`下`     | キャラの背面に描画 |
| 黒レイヤー   | `黒`、`black`            | 移動不可エリア     |
| 赤レイヤー   | `赤`、`red`              | 音声グループの定義 |

# その他
マップの素材は[ドット絵世界](http://yms.main.jp)さんからお借りしています。
