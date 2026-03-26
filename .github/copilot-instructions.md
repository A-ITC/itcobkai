# itcobkai — プロジェクトガイドライン

## 概要

2Dタイルベースのマップを備えた、グループ向けボイスチャットアプリです。マップ上の距離（近接性）によって、どのユーザー間でオーディオミックスを共有するかを決定します。セットアップとデプロイの詳細については `README.md` を参照してください。

## アーキテクチャ

```
SolidJS フロントエンド ──HTTP/JWT──▶  FastAPI バックエンド (Python 3.12+)
                     ──WebRTC────▶  LiveKit サーバー (Docker)
```

| エリア               | 主要ファイル            | 内容                                                                  |
| :------------------- | :---------------------- | :-------------------------------------------------------------------- |
| APIルート            | `api/api.py`            | `/api/init`, `/api/session`, `/api/token`                             |
| 認証                 | `api/auth.py`           | HMAC-SHA256 セッションCookie + JWT LiveKit トークン                   |
| RTC / 音声ミックス   | `api/rtc.py`            | LiveKit ボット、10ms オーディオフレーム、アイランド（島）グルーピング |
| リアルタイムコマンド | `api/master.py`         | MOVE / UPDATE / MUTE ハンドラー                                       |
| マップ解析           | `api/mapper.py`         | TMXレイヤーからのシードフィルによるアイランドのラベリング             |
| Discord OAuth2       | `api/discord.py`        | サーバーホワイトリスト、アバターのキャッシュ                          |
| UIエントリ           | `src/index.tsx`         | 4つのルート: `/`, `/login`, `/test`, `/master`                        |
| メインビュー         | `src/viewer/Viewer.tsx` | `ViewerManager.ts` と連携                                             |
| RTCクライアント      | `src/common/RTC.ts`     | LiveKit ルーム、データチャネル                                        |
| 共有型定義           | `src/common/Schema.ts`  | `User`, `Map`, `HostCommand`, `GuestCommand`                          |
| 設定                 | `api/config.py`         | すべての環境変数をここで集約管理                                      |

## ビルドと実行

```bash
# バックエンド
python3 main.py               # $API_PORT（デフォルト 41022）で FastAPI を起動

# フロントエンド
npm install
npm run start                 # $DEV_PORT で Vite 開発サーバーを起動

# LiveKit サーバー
docker-compose up             # RTC機能を利用するために必須

# マップ処理（Tiled の .tmx ファイルが必要）
python3 create_map.py /path/to/map.tmx
```

## コーディング規約

### フロントエンド — SolidJS (React ではない)

- `createSignal`, `createMemo`, `createEffect` を使用してください。React hooks は**使用不可**です。
- 反応性は細粒度です。シグナルを更新すると、その値を読み取っている DOM ノードのみが更新されます。
- コンポーネントファイルは PascalCase (`Viewer.tsx`)、マネージャー/ユーティリティファイルは JSX なしの PascalCase (`ViewerManager.ts`) を使用します。
- インデントはスペース2つ、末尾のカンマなし、ダブルクォートを使用、最大行幅 120 (`package.json` / Prettier 設定参照)。
- DOM を必要とする副作用には `onMount` を使用してください。

### バックエンド — Python 3.12+

- Async-first: すべてのハンドラーと I/O 呼び出しは `async`/`await` である必要があります。
- リクエスト/レスポンスのバリデーションには Pydantic モデルを使用 (`api/user.py`)。
- 関数名/変数名は `snake_case`、モジュールレベルの定数は `UPPER_CASE` を使用。
- すべての設定は `api/config.py` から読み取ります。環境変数名を他の場所にハードコードしないでください。
- LiveKit イベントハンドラーには `@on_message` / `@on_join` デコレータパターンを使用します。

### リアルタイムメッセージプロトコル

- サーバー → クライアント: `HostCommand` enum (`INIT`, `UPDATE`, `MOVE`, `JOIN`, `LEAVE`, `ALERT`, `NEWMAP`)
- クライアント → サーバー: `GuestCommand` enum (`UPDATE`, `MOVE`, `MUTE`)
- 両サイドとも `src/common/Schema.ts` で定義され、Python 側でもミラーリングされています。

### マップレイヤー (Tiled .tmx)

- 描画レイヤー: 接頭辞 `t_` / `top` / `上` (最前面)、`b_` / `bottom` / `下` (背面)
- 衝突判定レイヤー: `赤` / `red` — 移動不可エリア
- 接続性レイヤー: `黒` / `black` — 音声共有グループ（アイランド）の定義

## 環境変数

プロジェクトのルートに `.env` を作成してください。以下のシークレットが必須です。

| 変数名                    | 用途                                      |
| :------------------------ | :---------------------------------------- |
| `DOMAIN`                  | TLS/TURN 用の公開ドメイン                 |
| `SECRET_KEY`              | LiveKit API キー + JWT 署名用             |
| `VITE_DISCORD_CLIENT_ID`  | Discord OAuth アプリ ID (フロントエンド)  |
| `DISCORD_CLIENT_SECRET`   | Discord OAuth シークレット (バックエンド) |
| `DISCORD_ALLOWED_SERVERS` | `label:id,label:id` 形式のホワイトリスト  |
| `SESSION_PASSWORD`        | Cookie 署名キー (ランダムな文字列)        |
| `TOKEN_PASSWORD`          | JWT 署名キー (ランダムな文字列)           |
| `TOKEN_EXPIRATION`        | JWT の有効期限 (秒) (デフォルト `1800`)   |

オプション: `API_PORT`, `DEV_PORT`, `WS_PORT`, `TCP_PORT`, `UDP_PORT_RANGE_*`

## 静的データパス

| パス                 | 内容                              |
| :------------------- | :-------------------------------- |
| `data/itcobkai.json` | ユーザー + マップの設定構成       |
| `data/avatars/`      | キャッシュされた Discord アバター |
| `data/maps/`         | レンダリング済みマップ PNG        |
| `data/log/`          | 実行ログ                          |

---

次は、このガイドラインに沿って具体的にどこのファイルを修正・作成しますか？
