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
# 公開ドメイン（TLS/TURN 用）
DOMAIN="your.domain.example"

# LiveKit API キー + JWT 署名用
SECRET_KEY="[ランダムな文字列]"

# Discord OAuth2 関連
VITE_DISCORD_CLIENT_ID="[Discord の Client ID]"
DISCORD_CLIENT_SECRET="[Discord の Client Secret]"
DISCORD_ALLOWED_SERVERS="サーバ名1:サーバID1(数字18桁),サーバ名2:サーバID2,..."

# 認証関連
SESSION_PASSWORD="[任意のランダムな文字列]"
TOKEN_PASSWORD="[任意のランダムな文字列]"
TOKEN_EXPIRATION=1800
```

オプション: `API_PORT`（デフォルト 41022）、`DEV_PORT`、`WS_PORT`、`TCP_PORT`、`UDP_PORT_RANGE_*`、`VITE_APP_NAME`

### デプロイ

```sh
# LiveKit サーバーを起動
docker compose up -d

# マップを処理
uv run create_map.py /path/to/map.tmx

# バックエンドを起動
uv run main.py

# フロントエンドをビルド
npm install
npm run build
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
